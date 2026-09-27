-- =============================================================================
-- Row visibility for time tracking
-- =============================================================================
-- time_tracking_entries, _timesheets and _hourly_rates carried each person's
-- cost and billable rates to the whole tenant, while the matrix restricts the
-- same values on `employees` (default_hourly_rate_pvt,
-- default_billable_rate_pvt). Now: your own rows, or a grant — time approvers,
-- payroll/HR (reads_all_compensation), and the finance function.
--
-- Two computations read the WHOLE table and used to run under the writer's
-- own policy (L106). Narrowing the table would have made them wrong without an
-- error, so both move into SECURITY DEFINER functions first:
--   - the task/project hours recompute (a plain employee's log would otherwise
--     total only their own entries), and
--   - the next TE-nnn number (a max over only your own entries collides with
--     a colleague's, refusing every entry after the first).
-- Both are pinned to the caller's tenant and do nothing on a bad claim.
-- =============================================================================

-- time_entries.approve holders, mirroring @kaaj/authz: owner, firm_admin and
-- project_manager. row-visibility.test.ts asserts it agrees with can().
CREATE OR REPLACE FUNCTION app.approves_time_entries() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ? 'project_manager',
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.approves_time_entries() TO app_user;


-- L58's recompute, run where it can see every entry. Rejected entries are
-- excluded: refused effort did not happen.
CREATE OR REPLACE FUNCTION app.refresh_time_hours(p_project UUID, p_task UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE tenant UUID := app.current_tenant_id();
BEGIN
    IF tenant IS NULL THEN
        RETURN;
    END IF;
    IF p_task IS NOT NULL THEN
        UPDATE public.tasks t SET
            actual_hours = coalesce((SELECT sum(te.hours) FROM public.time_tracking_entries te
                                      WHERE te.tenant_id = tenant AND te.task_id = t.id
                                        AND te.status <> 'rejected'), 0),
            billable_hours = coalesce((SELECT sum(te.hours) FROM public.time_tracking_entries te
                                        WHERE te.tenant_id = tenant AND te.task_id = t.id
                                          AND te.status <> 'rejected' AND te.is_billable), 0),
            non_billable_hours = coalesce((SELECT sum(te.hours) FROM public.time_tracking_entries te
                                            WHERE te.tenant_id = tenant AND te.task_id = t.id
                                              AND te.status <> 'rejected' AND NOT te.is_billable), 0)
         WHERE t.id = p_task AND t.tenant_id = tenant;
    END IF;
    IF p_project IS NOT NULL THEN
        UPDATE public.projects p SET
            actual_hours = coalesce((SELECT sum(te.hours) FROM public.time_tracking_entries te
                                      WHERE te.tenant_id = tenant AND te.project_id = p.id
                                        AND te.status <> 'rejected'), 0),
            last_activity_at = now()
         WHERE p.id = p_project AND p.tenant_id = tenant;
    END IF;
END $$;

REVOKE ALL ON FUNCTION app.refresh_time_hours(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_time_hours(UUID, UUID) TO app_user;


-- The next TE-nnn, over every entry in the tenant. Returns a number only.
CREATE OR REPLACE FUNCTION app.next_time_entry_number() RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT coalesce(max(nullif(substring(entry_id FROM '[0-9]+$'), '')::int), 0) + 1
      FROM public.time_tracking_entries
     WHERE tenant_id = app.current_tenant_id()
$$;

REVOKE ALL ON FUNCTION app.next_time_entry_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_time_entry_number() TO app_user;


-- Your own, or a grant. hourly_rates rows with no employee_id are defaults
-- for everyone, and read by grant holders only.
CREATE POLICY time_visibility ON time_tracking_entries AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.approves_time_entries())
    OR (SELECT app.reads_all_compensation())
    OR (SELECT app.reads_all_accounting())
    OR employee_id = (SELECT app.current_employee_id())
);

CREATE POLICY time_visibility ON time_tracking_timesheets AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.approves_time_entries())
    OR (SELECT app.reads_all_compensation())
    OR (SELECT app.reads_all_accounting())
    OR employee_id = (SELECT app.current_employee_id())
);

CREATE POLICY time_visibility ON time_tracking_hourly_rates AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.approves_time_entries())
    OR (SELECT app.reads_all_compensation())
    OR (SELECT app.reads_all_accounting())
    OR employee_id = (SELECT app.current_employee_id())
);

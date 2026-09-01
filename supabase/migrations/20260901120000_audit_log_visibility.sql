-- =============================================================================
-- Kaaj — row-level visibility for the audit trail
-- =============================================================================
-- docs/15-row-level-visibility.md.
--
-- WHY THIS EXISTS
--
-- `audit_log` carried tenant isolation and nothing else, so every employee
-- could read every entry in the firm. That was tolerable while the trail held
-- leave approvals. It stopped being tolerable the moment pay changes were
-- audited: the entry records
--
--     {"amount": {"from": "139000.00", "to": "148000.00"}}
--
-- and a plain employee could read it for anyone. This is exactly the
-- disclosure L47 describes — a protected value reachable through an
-- unprotected path — arriving by a route nobody had looked at, because the
-- trail was designed as a write and never as a read.
--
-- The lesson generalises: AUDITING A VALUE COPIES IT. Whatever protects the
-- original has to protect the copy, or the trail becomes the leak.
--
-- WHO MAY READ IT
--
--   * Those whose job is to ask the question — HR, payroll, an auditor, and
--     the owner or firm administrator.
--   * The subject themselves: entries ABOUT you, and entries recording what
--     YOU did. GDPR Art. 15 is an access right, and a trail of decisions
--     affecting someone that they may never see is a worse answer than one
--     they can.
--
-- Everyone else sees nothing, which for a table nobody may delete from is the
-- safe default.
--
-- RESTRICTIVE, so it AND-s with tenant isolation rather than widening it.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.reads_all_audit() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'hr_admin', 'payroll_admin', 'auditor'
           ],
        false);
END;
$$;

GRANT EXECUTE ON FUNCTION app.reads_all_audit() TO app_user;

CREATE POLICY audit_visibility ON audit_log AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_audit())
    -- Entries about you, and entries recording what you did. `entity_id` holds
    -- the employee id for person-scoped entries; for a location or a policy it
    -- holds that row's id, which no employee id will match, so those simply do
    -- not appear.
    OR entity_id = (SELECT app.current_employee_id())
    OR actor_employee_id = (SELECT app.current_employee_id())
);

COMMENT ON POLICY audit_visibility ON audit_log IS
    'Row-level visibility. Auditing a value copies it, so the copy needs the '
    'same protection as the original. See docs/15-row-level-visibility.md.';

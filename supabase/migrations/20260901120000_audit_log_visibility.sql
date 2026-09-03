-- =============================================================================
-- Kaaj — row-level visibility for the audit trail
-- =============================================================================
-- docs/15-row-level-visibility.md. audit_log carried only tenant isolation, so
-- any employee could read every entry — including pay changes, once those
-- started being audited (L47: auditing a value copies it, and the copy needs
-- the same protection as the original).
--
-- Readable by HR/payroll/auditor/owner/firm_admin, plus the subject of an
-- entry and its actor (GDPR Art. 15). Everyone else sees nothing.
-- RESTRICTIVE, so it narrows tenant isolation rather than widening it.
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
    -- entity_id holds the employee id for person-scoped entries; for other
    -- entities it holds that row's id, which simply won't match.
    OR entity_id = (SELECT app.current_employee_id())
    OR actor_employee_id = (SELECT app.current_employee_id())
);

COMMENT ON POLICY audit_visibility ON audit_log IS
    'Row-level visibility. Auditing a value copies it, so the copy needs the '
    'same protection as the original. See docs/15-row-level-visibility.md.';

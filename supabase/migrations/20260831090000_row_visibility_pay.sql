-- =============================================================================
-- Kaaj — row-level visibility for the employee record and base pay
-- =============================================================================
-- docs/15-row-level-visibility.md. Tenant isolation already covers all 103
-- tables. This is the narrower question: among people who legitimately belong
-- to the same tenant, who may see WHICH rows.
--
-- Two tables to start, one vertical slice:
--   employees          the record itself
--   compensation_base  what people are paid
--
-- RESTRICTIVE, not permissive. A permissive policy is OR-ed with the existing
-- tenant_isolation and would WIDEN access; a restrictive one is AND-ed and can
-- only narrow. That direction is the safe one to be wrong in.
--
-- EVERY FUNCTION CALL IS WRAPPED IN A SCALAR SUBQUERY. Written the obvious way,
-- Postgres inlines a SQL function into the predicate and re-parses the JWT
-- claim once PER ROW — measured at 35-40ms on a 20,000-row scan against 0.93ms
-- for tenant-only. `(SELECT f())` is not correlated, so it becomes an InitPlan
-- evaluated once: 6.4ms. At SMB scale the whole difference is 70 microseconds.
-- This is not a style preference; the obvious version is the slow one.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Who is asking, and what may they see
-- -----------------------------------------------------------------------------
-- PL/pgSQL rather than SQL so the bodies are not inlined, and STABLE so a
-- single call is valid for the whole statement. Both matter: see the header.

-- Which PERSON is asking, as distinct from which tenant. NULL for a tenant
-- member who is not an employee — a bookkeeper with a login and no record.
CREATE OR REPLACE FUNCTION app.current_employee_id() RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN nullif(claims #>> '{app_metadata,employee_id}', '')::uuid;
EXCEPTION WHEN OTHERS THEN
    -- A malformed claim means "no employee", never "every employee".
    RETURN NULL;
END $$;

-- Holds a grant that reads every person's record. Mirrors employee.read.all in
-- @kaaj/authz — the two are asserted to agree by a conformance test rather than
-- sharing an implementation, for the same reason the two test suites do not.
CREATE OR REPLACE FUNCTION app.reads_all_employees() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'hr_admin', 'payroll_admin', 'it_admin', 'legal_admin', 'auditor'
           ],
        false);
END $$;

-- Reads every person's PAY. A narrower set than the above: it_admin and
-- legal_admin administer systems and contracts, not salaries.
CREATE OR REPLACE FUNCTION app.reads_all_compensation() RETURNS BOOLEAN
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
END $$;

GRANT EXECUTE ON FUNCTION
    app.current_employee_id(),
    app.reads_all_employees(),
    app.reads_all_compensation()
  TO app_user;


-- -----------------------------------------------------------------------------
-- 2. The policies
-- -----------------------------------------------------------------------------

-- The staff directory is not a secret: colleagues need to find each other, and
-- the sensitive fields on a record are gated by their own permissions
-- (pii.read / pii.reveal) rather than by hiding the row. What this policy stops
-- is a page that forgets to scope returning rows to someone with no grant at
-- all — an integration, a contractor, a token minted before a role changed.
CREATE POLICY employee_visibility ON employees AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_employees())
    OR id = (SELECT app.current_employee_id())
    -- A contractor has no directory; everyone else does. Kept as a positive
    -- test so a NULL or unrecognised role falls through to "own record only".
    OR (SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
               #>> '{app_metadata,role}') IN ('employee', 'firm_admin', 'owner')
);

-- Pay is different: there is no directory equivalent. You see your own, or you
-- hold a grant. A manager seeing their reports' pay is `can()`'s job, because
-- walking the manager_id chain per row in a policy is the shape that makes RLS
-- expensive — and the application already answers it.
CREATE POLICY compensation_visibility ON compensation_base AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_compensation())
    OR employee_id = (SELECT app.current_employee_id())
);

COMMENT ON POLICY employee_visibility ON employees IS
    'Row-level visibility. See docs/15-row-level-visibility.md.';
COMMENT ON POLICY compensation_visibility ON compensation_base IS
    'Row-level visibility. See docs/15-row-level-visibility.md.';

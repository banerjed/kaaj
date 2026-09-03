-- =============================================================================
-- Kaaj — row-level visibility for the employee record and base pay
-- =============================================================================
-- docs/15-row-level-visibility.md. Tenant isolation covers every table; this
-- is the narrower question of who, within a tenant, may see which rows —
-- starting with employees and compensation_base.
--
-- RESTRICTIVE, not permissive: permissive policies OR together and would
-- widen access; restrictive AND-s and can only narrow.
--
-- Every function call is wrapped in a scalar subquery — `(SELECT f())` runs
-- once as an InitPlan; called unwrapped, Postgres inlines and re-evaluates it
-- per row.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Who is asking, and what may they see
-- -----------------------------------------------------------------------------
-- PL/pgSQL (not SQL) so the bodies aren't inlined; STABLE so one call covers
-- the whole statement — see header.

-- NULL for a tenant member with no employee record (e.g. a bookkeeper).
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

-- Mirrors employee.read.all in @kaaj/authz; a conformance test asserts they
-- agree, deliberately without sharing an implementation.
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

-- Narrower than reads_all_employees: it_admin/legal_admin don't see pay.
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

-- The staff directory isn't secret — sensitive fields are gated separately by
-- pii.read/pii.reveal. This stops rows reaching someone with no grant at all
-- (an integration, a contractor, a stale token).
CREATE POLICY employee_visibility ON employees AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_employees())
    OR id = (SELECT app.current_employee_id())
    -- Positive test (not a NOT contractor) so an unrecognised role falls
    -- through to "own record only".
    OR (SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
               #>> '{app_metadata,role}') IN ('employee', 'firm_admin', 'owner')
);

-- No directory equivalent for pay: own record, or a grant. A manager seeing
-- reports' pay is can()'s job — walking manager_id per row here is expensive.
CREATE POLICY compensation_visibility ON compensation_base AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_compensation())
    OR employee_id = (SELECT app.current_employee_id())
);

COMMENT ON POLICY employee_visibility ON employees IS
    'Row-level visibility. See docs/15-row-level-visibility.md.';
COMMENT ON POLICY compensation_visibility ON compensation_base IS
    'Row-level visibility. See docs/15-row-level-visibility.md.';

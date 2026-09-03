-- A malformed JWT claim must return "no", never raise (L62). Three claim
-- parsers were missing the EXCEPTION handler their siblings already had:
-- reads_all_employees(), reads_all_compensation(), reads_all_audit(). Without
-- it, a corrupted token turns "no rows" into a 500 — intermittently, since it
-- depends on whether the planner evaluates that arm of the policy.
--
-- Same lesson as L54: a rule applied by hand is applied unevenly.
-- verify-invariants.sql now calls every claim parser with a malformed claim
-- and fails if any raises.

CREATE OR REPLACE FUNCTION app.reads_all_employees()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'hr_admin', 'payroll_admin', 'it_admin', 'legal_admin', 'auditor'
           ],
        false);
EXCEPTION WHEN OTHERS THEN
    -- A malformed claim means "reads nobody", never "reads everybody".
    RETURN false;
END $function$;

CREATE OR REPLACE FUNCTION app.reads_all_compensation()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'hr_admin', 'payroll_admin', 'auditor'
           ],
        false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $function$;

CREATE OR REPLACE FUNCTION app.reads_all_audit()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'hr_admin', 'payroll_admin', 'auditor'
           ],
        false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $function$;

-- The same cast also appeared INLINE in employee_visibility's policy
-- expression, where a function-level handler can't reach it — a policy
-- expression cannot carry an EXCEPTION handler at all. app.claim_role() moves
-- the parsing into a function that can, and becomes the one place a role
-- claim is read.
CREATE OR REPLACE FUNCTION app.claim_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN nullif(claims #>> '{app_metadata,role}', '');
EXCEPTION WHEN OTHERS THEN
    -- A malformed claim carries no role, which is the floor, never an
    -- escalation. Same rule the application applies in contextFrom().
    RETURN NULL;
END $function$;

COMMENT ON FUNCTION app.claim_role() IS
    'The role from the JWT claim, or NULL if the claim is absent or malformed. '
    'Row policies MUST use this rather than casting request.jwt.claims inline: '
    'a policy expression cannot carry an EXCEPTION handler, so an inline cast '
    'turns a corrupted token into a 500 instead of an empty page.';

-- AS RESTRICTIVE must be restated (L63): Postgres defaults to PERMISSIVE, and
-- permissive policies OR together, so omitting it here would make
-- employee_visibility an alternative to tenant_isolation rather than an AND.
DROP POLICY IF EXISTS employee_visibility ON employees;
CREATE POLICY employee_visibility ON employees AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_employees())
    OR id = (SELECT app.current_employee_id())
    -- A contractor has no directory; everyone else does. Kept as a positive
    -- test so a NULL or unrecognised role falls through to "own record only".
    OR (SELECT app.claim_role()) IN ('employee', 'firm_admin', 'owner')
);

COMMENT ON POLICY employee_visibility ON employees IS
    'Row-level visibility. See docs/15-row-level-visibility.md.';

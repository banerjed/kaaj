-- A malformed JWT claim must return "no", never raise.
--
-- `app.current_tenant_id()` and `app.current_employee_id()` both wrap their
-- claim parsing in an EXCEPTION handler, the second with the comment "a
-- malformed claim means 'no employee', never 'every employee'". Three of their
-- siblings from 20260831090000 and 20260901120000 do not:
--
--   app.reads_all_employees()
--   app.reads_all_compensation()
--   app.reads_all_audit()
--
-- `claims := nullif(current_setting(...), '')::jsonb` raises
-- `invalid input syntax for type json` on any claim that is not JSON. Inside a
-- row policy that is an ERROR rather than an empty result, so a request with a
-- corrupted token gets a 500 instead of a page with nothing on it — and which
-- of the two happens depends on whether the planner evaluates this arm of the
-- policy at all, so it appears and disappears with the query plan. It sat
-- latent in `./check` and then began failing without the function changing.
--
-- The safety property was never lost: no rows leak either way. What was lost
-- is fail-CLOSED-quietly, which is the behaviour the harness asserts and the
-- one an application can render.
--
-- This is the same lesson as L54: a rule applied by hand is applied unevenly.
-- Four of seven claim parsers had the guard. `verify-invariants.sql` now calls
-- every one of them with a malformed claim and fails if any raises, so the
-- eighth cannot be written without it.

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

-- The same cast, written INLINE into a row policy, where no function-level
-- handler can reach it.
--
-- `employees.employee_visibility` ends with
--
--     (nullif(current_setting('request.jwt.claims', true), '')::jsonb
--        #>> '{app_metadata,role}') = ANY (ARRAY['employee','firm_admin','owner'])
--
-- so guarding the three functions above fixed nothing: the policy raises
-- before any of them is consulted. This is the more dangerous shape of the
-- same bug, because a policy expression cannot carry an EXCEPTION handler at
-- all — the only fix is to move the parsing into a function that can.
--
-- `app.claim_role()` is that function. It is the single place a role claim is
-- read, so the next policy that needs one cannot reintroduce the cast by
-- copying this line.
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

-- **AS RESTRICTIVE, and that word is the whole policy.**
--
-- Postgres defaults a policy to PERMISSIVE, and permissive policies on the
-- same command are OR-ed together. `employees` also carries
-- `tenant_isolation`, so recreating this one without RESTRICTIVE makes the two
-- alternatives instead of both: any row satisfying `employee_visibility` comes
-- back regardless of its tenant. Dropping and recreating the policy without
-- re-stating the word did exactly that, and `verify-rls.sql` reported
-- "LEAK: 12 foreign rows visible" on the next run — which is the entire reason
-- phase C exists.
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

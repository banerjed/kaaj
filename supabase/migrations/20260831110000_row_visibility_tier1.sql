-- =============================================================================
-- Kaaj — row-level visibility for the remaining Tier 1 tables
-- =============================================================================
-- docs/15-row-level-visibility.md. 20260831090000 did `employees` and
-- `compensation_base` and, more importantly, made `withTenant` carry the whole
-- actor. This finishes the tier.
--
-- Every predicate wraps its calls in `(SELECT f())`. Not style: written the
-- obvious way Postgres inlines the function and re-parses the JWT claim per
-- row — 35-40ms on a 20,000-row scan against 0.93ms. `(SELECT f())` is not
-- correlated, so it becomes an InitPlan evaluated once.
--
-- RESTRICTIVE throughout: AND-ed with tenant_isolation, so a policy can only
-- ever narrow. The safe direction to be wrong in.
--
-- WHAT THESE POLICIES ARE FOR, AND WHAT THEY ARE NOT.
-- They are the backstop for ROW visibility — whether a row exists for you at
-- all. They deliberately do NOT reimplement the finer rules the application
-- already enforces on FIELDS: a manager's draft assessment withheld from its
-- subject, an anonymous note's author, a masked bank number. RLS cannot express
-- field-level redaction, and a policy that tried would diverge from `can()`.
-- Two layers, two questions — docs/14-access-control.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Two more grant predicates, mirroring @kaaj/authz
-- -----------------------------------------------------------------------------
-- The holders are copied from the bundles rather than derived, and a
-- conformance test asserts the two agree. Not shared, asserted — the same
-- answer used for the two test suites.

-- pii.read holders. auditor is included: they read a MASKED value (pii.reveal
-- is hr_admin only), and verifying that payments reached the right accounts is
-- what an audit is.
CREATE OR REPLACE FUNCTION app.reads_all_pii() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'hr_admin', 'payroll_admin', 'auditor'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- performance.read.all holders. Narrower than PII: payroll has no business in
-- someone's review.
CREATE OR REPLACE FUNCTION app.reads_all_performance() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY[
              'hr_admin', 'auditor'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.reads_all_pii(), app.reads_all_performance()
   TO app_user;


-- -----------------------------------------------------------------------------
-- Pay, and the history of it
-- -----------------------------------------------------------------------------
-- Same shape as compensation_base: your own, or a grant. A manager seeing their
-- reports' pay stays `can()`'s job — walking the manager_id chain per row in a
-- policy is exactly the shape that makes RLS expensive, and the application
-- already answers it.

CREATE POLICY compensation_visibility ON compensation_allowances AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY compensation_visibility ON compensation_variable AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY compensation_visibility ON compensation_equity AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

-- No fixture rows today, so its tests would pass vacuously. The policy goes in
-- anyway: adding it with the table is cheaper than remembering later, and
-- verify-rls.sql already fails a table with no fixture rather than passing it.
CREATE POLICY compensation_visibility ON compensation_premiums AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY compensation_visibility ON employment_terms AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

-- Employment history carries past salaries and reasons for leaving.
CREATE POLICY compensation_visibility ON hr_employment_history AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));


-- -----------------------------------------------------------------------------
-- Payroll
-- -----------------------------------------------------------------------------
-- Built before Phase 6 uses them, deliberately: a policy added with the table
-- costs nothing, and retrofitting one under live payslip data is the situation
-- this repository has already decided to avoid once, for PII encryption.

CREATE POLICY payroll_visibility ON payroll_run_employees AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY payroll_visibility ON payroll_employee_deductions AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY payroll_visibility ON payroll_india_salary_structure AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

-- A tax declaration names dependants and investments — more revealing than the
-- salary it supports.
CREATE POLICY payroll_visibility ON payroll_india_tax_declarations AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY payroll_visibility ON payroll_tax_withholding_certificates AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));


-- -----------------------------------------------------------------------------
-- PII-bearing
-- -----------------------------------------------------------------------------
-- The values are encrypted, but the ROW's existence still says something: that
-- someone holds three bank accounts, or has an emergency contact of a given
-- relationship. Encryption protects the value; this protects the fact.

CREATE POLICY pii_visibility ON employee_bank_accounts AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_pii()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY pii_visibility ON hr_emergency_contacts AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_pii()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY pii_visibility ON hr_employee_documents AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_pii()) OR employee_id = (SELECT app.current_employee_id()));


-- -----------------------------------------------------------------------------
-- Reviews, feedback, survey responses
-- -----------------------------------------------------------------------------

-- Subject, reviewer, or a grant. The application ALSO withholds the manager's
-- half from its subject while the review is a draft — that is field-level and
-- stays in hr_reviews.repo.ts, because RLS cannot redact a column.
CREATE POLICY performance_visibility ON hr_reviews AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_performance())
    OR employee_id = (SELECT app.current_employee_id())
    OR reviewer_id = (SELECT app.current_employee_id())
);

-- Recipient, author, public, or a grant. The application ALSO hides an
-- anonymous note's author and withholds `manager_only` from its subject; both
-- are field- and rule-level, and stay in hr_feedback.repo.ts.
--
-- The author is included so someone can see what they wrote — including their
-- own anonymous notes, which is the one place the author of an anonymous note
-- is legitimately known, because it is them.
CREATE POLICY feedback_visibility ON hr_feedback AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_performance())
    OR visibility = 'public'
    OR to_employee_id = (SELECT app.current_employee_id())
    OR from_employee_id = (SELECT app.current_employee_id())
);

-- Survey responses. Anonymity here comes from `respondent_id` being NULL on an
-- anonymous survey's rows, not from this policy — so HR still reads every row
-- to aggregate, and learns nothing about who wrote the anonymous ones because
-- there is nothing recorded to learn.
CREATE POLICY survey_visibility ON hr_survey_responses AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_performance())
    OR respondent_id = (SELECT app.current_employee_id())
);

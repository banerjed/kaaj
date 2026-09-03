-- =============================================================================
-- Kaaj — row-level visibility for the remaining Tier 1 tables
-- =============================================================================
-- docs/15-row-level-visibility.md, continuing 20260831090000. RESTRICTIVE
-- throughout (AND-ed with tenant_isolation, can only narrow); every predicate
-- wraps calls in `(SELECT f())` so Postgres evaluates it once as an InitPlan
-- rather than per row.
--
-- These policies are the backstop for whether a ROW exists for you at all.
-- They deliberately do not reimplement field-level redaction the application
-- already does (a draft assessment, an anonymous author, a masked number) —
-- RLS can't express that; see docs/14-access-control.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Two more grant predicates, mirroring @kaaj/authz
-- -----------------------------------------------------------------------------
-- Copied from the bundles, not derived; a conformance test asserts agreement.

-- pii.read holders. auditor included: they read a masked value only
-- (pii.reveal is hr_admin only).
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

-- performance.read.all holders. Narrower than PII: payroll doesn't see reviews.
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
-- Same shape as compensation_base: own record, or a grant.

CREATE POLICY compensation_visibility ON compensation_allowances AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY compensation_visibility ON compensation_variable AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY compensation_visibility ON compensation_equity AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_compensation()) OR employee_id = (SELECT app.current_employee_id()));

-- No fixture rows today; added anyway since retrofitting later is costlier.
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
-- Added before these tables have live data — cheaper than retrofitting later.

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
-- Values are encrypted, but a row's existence still says something (e.g. that
-- someone holds three bank accounts). Encryption protects the value; this
-- protects the fact.

CREATE POLICY pii_visibility ON employee_bank_accounts AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_pii()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY pii_visibility ON hr_emergency_contacts AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_pii()) OR employee_id = (SELECT app.current_employee_id()));

CREATE POLICY pii_visibility ON hr_employee_documents AS RESTRICTIVE FOR SELECT
USING ((SELECT app.reads_all_pii()) OR employee_id = (SELECT app.current_employee_id()));


-- -----------------------------------------------------------------------------
-- Reviews, feedback, survey responses
-- -----------------------------------------------------------------------------

-- Subject, reviewer, or a grant. Draft-withholding from the subject is
-- field-level and stays in hr_reviews.repo.ts.
CREATE POLICY performance_visibility ON hr_reviews AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_performance())
    OR employee_id = (SELECT app.current_employee_id())
    OR reviewer_id = (SELECT app.current_employee_id())
);

-- Recipient, author, public, or a grant. Anonymity/manager_only redaction is
-- field-level and stays in hr_feedback.repo.ts. Author included so someone
-- can see their own notes, anonymous or not.
CREATE POLICY feedback_visibility ON hr_feedback AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_performance())
    OR visibility = 'public'
    OR to_employee_id = (SELECT app.current_employee_id())
    OR from_employee_id = (SELECT app.current_employee_id())
);

-- Anonymity comes from respondent_id being NULL on anonymous rows, not from
-- this policy — HR still reads every row to aggregate.
CREATE POLICY survey_visibility ON hr_survey_responses AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_performance())
    OR respondent_id = (SELECT app.current_employee_id())
);

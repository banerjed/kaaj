-- Tier 1 tables (docs/15-row-level-visibility.md) carry a row-visibility
-- policy on SELECT only. Nothing at the database layer restricts INSERT,
-- UPDATE or DELETE beyond tenant_isolation, which is tenant-wide, not
-- role-aware — so a missed requireCan() on any write action touching one of
-- these tables would let any tenant member write pay, PII or review data
-- with nothing at the database layer to stop it. Same shape as the
-- accounting gap 20260903045821 closed, on the write side instead of read.
--
-- Most of these tables have no write path in application code today; the
-- predicates below match the ONE permission each domain's writes already use
-- (or would use, per its read-side grouping and the FORBIDDEN_COMBINATIONS
-- rule that auditor never writes), not an invented one. hr_reviews is the
-- exception: `acknowledge` lets any employee update their OWN review
-- (packages/authz has no permission for this — the repo refuses per-row), so
-- its UPDATE policy carries a self clause the others don't.
--
-- DELETE is already blocked for app_user by 20260830120000_append_only.sql;
-- these policies are included anyway, for the same reason accounting's are —
-- explicit rather than relying on a GRANT a reader has to go find.

-- -----------------------------------------------------------------------------
-- Write predicates. Each fails closed on a malformed claim (L62).
-- -----------------------------------------------------------------------------

-- employee.write / employee.create / employee.archive — hr_admin only, not
-- it_admin or legal_admin, which read but do not write the directory.
CREATE OR REPLACE FUNCTION app.writes_employees() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['hr_admin'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- compensation.write — hr_admin only. payroll_admin reads compensation but
-- does not set it (packages/authz: "No compensation.write").
CREATE OR REPLACE FUNCTION app.writes_compensation() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['hr_admin'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- payroll.run / payroll.approve — payroll_admin, not hr_admin (which lacks
-- both). Named _tier1 because a payroll_runs write predicate, if that header
-- table ever gets row visibility, would want this same shape.
CREATE OR REPLACE FUNCTION app.writes_payroll_tier1() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['payroll_admin'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- Bank accounts, emergency contacts, documents — HR onboards these, not
-- payroll (which reads app.reads_all_pii() but has no write role here today).
CREATE OR REPLACE FUNCTION app.writes_pii() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['hr_admin'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- performance.write — hr_admin only. Covers hr_reviews' admin side (submit),
-- hr_feedback and hr_survey_responses (both dormant today).
CREATE OR REPLACE FUNCTION app.writes_performance() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['hr_admin'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION
    app.writes_employees(), app.writes_compensation(), app.writes_payroll_tier1(),
    app.writes_pii(), app.writes_performance()
  TO app_user;

-- -----------------------------------------------------------------------------
-- The policies — one predicate per domain, applied to every table in it.
-- Policy names must be unique PER TABLE, so each verb gets its own suffix.
-- -----------------------------------------------------------------------------

CREATE POLICY employees_insert ON employees AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK ((SELECT app.writes_employees()));
CREATE POLICY employees_update ON employees AS RESTRICTIVE
  FOR UPDATE TO public USING ((SELECT app.writes_employees()))
  WITH CHECK ((SELECT app.writes_employees()));
CREATE POLICY employees_delete ON employees AS RESTRICTIVE
  FOR DELETE TO public USING ((SELECT app.writes_employees()));

DO $$
DECLARE
    t text;
    compensation_tables text[] := ARRAY[
        'compensation_base', 'compensation_allowances', 'compensation_variable',
        'compensation_equity', 'compensation_premiums', 'employment_terms',
        'hr_employment_history'
    ];
BEGIN
    FOREACH t IN ARRAY compensation_tables LOOP
        EXECUTE format(
            'CREATE POLICY compensation_insert ON public.%I AS RESTRICTIVE '
            'FOR INSERT TO public WITH CHECK ((SELECT app.writes_compensation()))', t);
        EXECUTE format(
            'CREATE POLICY compensation_update ON public.%I AS RESTRICTIVE '
            'FOR UPDATE TO public USING ((SELECT app.writes_compensation())) '
            'WITH CHECK ((SELECT app.writes_compensation()))', t);
        EXECUTE format(
            'CREATE POLICY compensation_delete ON public.%I AS RESTRICTIVE '
            'FOR DELETE TO public USING ((SELECT app.writes_compensation()))', t);
    END LOOP;
END $$;

DO $$
DECLARE
    t text;
    payroll_tables text[] := ARRAY[
        'payroll_run_employees', 'payroll_employee_deductions',
        'payroll_india_salary_structure', 'payroll_india_tax_declarations',
        'payroll_tax_withholding_certificates'
    ];
BEGIN
    FOREACH t IN ARRAY payroll_tables LOOP
        EXECUTE format(
            'CREATE POLICY payroll_insert ON public.%I AS RESTRICTIVE '
            'FOR INSERT TO public WITH CHECK ((SELECT app.writes_payroll_tier1()))', t);
        EXECUTE format(
            'CREATE POLICY payroll_update ON public.%I AS RESTRICTIVE '
            'FOR UPDATE TO public USING ((SELECT app.writes_payroll_tier1())) '
            'WITH CHECK ((SELECT app.writes_payroll_tier1()))', t);
        EXECUTE format(
            'CREATE POLICY payroll_delete ON public.%I AS RESTRICTIVE '
            'FOR DELETE TO public USING ((SELECT app.writes_payroll_tier1()))', t);
    END LOOP;
END $$;

DO $$
DECLARE
    t text;
    pii_tables text[] := ARRAY[
        'employee_bank_accounts', 'hr_emergency_contacts', 'hr_employee_documents'
    ];
BEGIN
    FOREACH t IN ARRAY pii_tables LOOP
        EXECUTE format(
            'CREATE POLICY pii_insert ON public.%I AS RESTRICTIVE '
            'FOR INSERT TO public WITH CHECK ((SELECT app.writes_pii()))', t);
        EXECUTE format(
            'CREATE POLICY pii_update ON public.%I AS RESTRICTIVE '
            'FOR UPDATE TO public USING ((SELECT app.writes_pii())) '
            'WITH CHECK ((SELECT app.writes_pii()))', t);
        EXECUTE format(
            'CREATE POLICY pii_delete ON public.%I AS RESTRICTIVE '
            'FOR DELETE TO public USING ((SELECT app.writes_pii()))', t);
    END LOOP;
END $$;

-- hr_survey_responses: admin only, no self clause. respondent_id is NULL on
-- an anonymous row by design, so "respondent_id = self" would never match an
-- anonymous submission anyway — get the real self-submit shape right when
-- that feature is built rather than guess it here.
CREATE POLICY survey_insert ON hr_survey_responses AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK ((SELECT app.writes_performance()));
CREATE POLICY survey_update ON hr_survey_responses AS RESTRICTIVE
  FOR UPDATE TO public USING ((SELECT app.writes_performance()))
  WITH CHECK ((SELECT app.writes_performance()));
CREATE POLICY survey_delete ON hr_survey_responses AS RESTRICTIVE
  FOR DELETE TO public USING ((SELECT app.writes_performance()));

-- hr_feedback: admin only, no self clause. Authoring a note is not yet a
-- write path in application code; get its real shape right when it exists.
CREATE POLICY feedback_insert ON hr_feedback AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK ((SELECT app.writes_performance()));
CREATE POLICY feedback_update ON hr_feedback AS RESTRICTIVE
  FOR UPDATE TO public USING ((SELECT app.writes_performance()))
  WITH CHECK ((SELECT app.writes_performance()));
CREATE POLICY feedback_delete ON hr_feedback AS RESTRICTIVE
  FOR DELETE TO public USING ((SELECT app.writes_performance()));

-- hr_reviews: INSERT/DELETE admin only. UPDATE also allows the subject —
-- `acknowledge` (performance/+page.server.ts) requires only
-- performance.read.self, which every employee holds, and the repository
-- refuses per-row if the review is not theirs (ReviewRefused). RLS must allow
-- the row-level write that check depends on, or acknowledging your own review
-- breaks for everyone who isn't hr_admin.
CREATE POLICY reviews_insert ON hr_reviews AS RESTRICTIVE
  FOR INSERT TO public WITH CHECK ((SELECT app.writes_performance()));
CREATE POLICY reviews_update ON hr_reviews AS RESTRICTIVE
  FOR UPDATE TO public
  USING (
    (SELECT app.writes_performance())
    OR employee_id = (SELECT app.current_employee_id())
  )
  WITH CHECK (
    (SELECT app.writes_performance())
    OR employee_id = (SELECT app.current_employee_id())
  );
CREATE POLICY reviews_delete ON hr_reviews AS RESTRICTIVE
  FOR DELETE TO public USING ((SELECT app.writes_performance()));

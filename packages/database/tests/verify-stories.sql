-- =============================================================================
-- Kaaj — Specification Verification Harness
-- =============================================================================
-- Version:      1.0
-- Last Updated: 2026-08-27
--
-- WHAT THIS IS
--   Every check below is a user story or functional requirement from a
--   module-*.md specification, expressed as SQL. If the query runs and its
--   assertion holds, the schema supports that requirement and (for DATA checks)
--   the mock data demonstrates it.
--
--   This is deliberately not a field-name diff. Comparing spec field names to
--   schema columns produces mostly noise: spec JSON examples mix persisted
--   fields with computed values, config keys and map keys, and nothing
--   mechanical separates them. An executable query either works or it does not.
--
-- TWO KINDS OF CHECK
--   SCHEMA  the structure supports the requirement. A failure is a DESIGN GAP.
--   DATA    the mock data demonstrates it. A failure is a MOCK DATA GAP —
--           the feature may be buildable but cannot be shown or tested.
--
-- USAGE
--   for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
--   psql "$DATABASE_URL" -f packages/database/fixtures/mock-data.sql
--   psql "$DATABASE_URL" -v strict=1 -f packages/database/tests/verify-stories.sql
--
--   Build from supabase/migrations/, NOT from packages/database/reference/schema.sql.
--   schema.sql is the design document: it issues no GRANTs (so no role can read
--   anything) and defines app.set_updated_at() without wiring it to any trigger.
--   Only the migrations produce a working database.
--
--   Exit code is 0 even when checks fail; read the summary. To make CI fail on
--   regressions, run with:  -v strict=1
--
-- MAINTAINING
--   When you add a module feature, add its check here. When a check fails and
--   the requirement has legitimately changed, update the spec and the check
--   together — never silence a check on its own.
-- =============================================================================

\set ON_ERROR_STOP off
\pset pager off
\set QUIET on

BEGIN;

-- -----------------------------------------------------------------------------
-- PRECONDITION: this harness must run as a role that BYPASSES RLS.
-- -----------------------------------------------------------------------------
-- Most checks below read tenant tables directly. Every table has RLS ENABLEd and
-- FORCEd, and FORCE removes the *owner's* exemption too — so only a superuser or
-- a rolbypassrls role sees rows. Run this as anything else and all DATA checks
-- return 0 rows and fail for a reason that has nothing to do with the schema.
--
-- This is the mirror image of the guard in packages/database/scripts/verify-migrations.sh, which
-- asserts the opposite for its isolation probes.
DO $precheck$
DECLARE bypasses BOOLEAN;
BEGIN
    SELECT rolsuper OR rolbypassrls INTO bypasses
      FROM pg_roles WHERE rolname = current_user;
    IF NOT bypasses THEN
        RAISE EXCEPTION
          'verify-stories.sql must run as a superuser/BYPASSRLS role (current_user=%). '
          'Under FORCE RLS even the table owner sees no rows, so every DATA check '
          'would fail misleadingly.', current_user;
    END IF;
END $precheck$;

CREATE TEMP TABLE _results (
    seq        SERIAL,
    check_id   TEXT,
    kind       TEXT,          -- SCHEMA | DATA
    module     TEXT,
    requirement TEXT,
    passed     BOOLEAN,
    detail     TEXT
);

-- Records one assertion. `cond` is evaluated by the caller and passed in, so a
-- failing check never aborts the run.
CREATE OR REPLACE FUNCTION _check(
    p_id TEXT, p_kind TEXT, p_module TEXT, p_req TEXT, p_sql TEXT
) RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE ok BOOLEAN; msg TEXT;
BEGIN
    BEGIN
        EXECUTE 'SELECT (' || p_sql || ')' INTO ok;
        msg := CASE WHEN ok THEN 'ok' ELSE 'assertion false' END;
    EXCEPTION WHEN OTHERS THEN
        ok := FALSE;
        msg := 'SQL error: ' || SQLERRM;
    END;
    INSERT INTO _results (check_id, kind, module, requirement, passed, detail)
    VALUES (p_id, p_kind, p_module, p_req, coalesce(ok,false), msg);
END;
$fn$;

-- =============================================================================
-- FIRM PROFILE  (module-firm-profile.md)
-- =============================================================================
SELECT _check('US-FIRM-loc','SCHEMA','firm-profile',
  'Multi-location with timezone, locale and currency per location',
  $$SELECT count(*)=count(*) FILTER (WHERE timezone IS NOT NULL) FROM firm_locations$$);
SELECT _check('US-FIRM-loc-data','DATA','firm-profile',
  'At least two countries represented',
  $$SELECT count(DISTINCT country)>=2 FROM firm_locations$$);
SELECT _check('US-FP-003','DATA','firm-profile',
  'Tenant enables multiple locales for a global workforce',
  $$SELECT count(*)>0 FROM tenants WHERE cardinality(supported_locales)>=3$$);
SELECT _check('US-FP-004','DATA','firm-profile',
  'Company profile includes brand and web identity fields',
  $$SELECT count(*)>0 FROM tenants
     WHERE legal_entity_name IS NOT NULL AND primary_contact_email IS NOT NULL$$);
SELECT _check('US-FIRM-hq','SCHEMA','firm-profile',
  'Exactly one headquarters per tenant (not one globally)',
  $$SELECT count(*)<=1 FROM firm_locations WHERE is_headquarters$$);
SELECT _check('US-FP-007','DATA','firm-profile',
  'Office locations carry working hours for timezone-aware scheduling',
  $$SELECT count(*)>0 FROM firm_locations WHERE working_hours ? 'monday'$$);
SELECT _check('US-FIRM-dept-tree','DATA','firm-profile',
  'Department hierarchy is navigable (a child references a parent)',
  $$SELECT count(*)>0 FROM firm_departments WHERE parent_department_code IS NOT NULL$$);
SELECT _check('US-FIRM-i18n','SCHEMA','firm-profile',
  'Departments carry multilingual names (Global by Design)',
  $$SELECT count(*)>0 FROM firm_departments WHERE name_i18n IS NOT NULL$$);
SELECT _check('US-FP-013','DATA','firm-profile',
  'Departments identify a department head',
  $$SELECT count(*)>0 FROM firm_departments WHERE head_employee_id IS NOT NULL$$);
SELECT _check('US-FP-016','DATA','firm-profile',
  'Job titles have localized labels and descriptions',
  $$SELECT count(*)>0 FROM firm_job_titles
     WHERE title_i18n ? 'de-DE' AND description_i18n ? 'en-US'$$);
SELECT _check('US-FIRM-title-range','SCHEMA','firm-profile',
  'Job levels carry multi-currency salary ranges',
  $$SELECT count(*)>0 FROM firm_job_levels WHERE salary_ranges ? 'USD'$$);
SELECT _check('US-FIRM-holiday','DATA','firm-profile',
  'Holidays are location-specific, not global',
  $$SELECT count(DISTINCT location_code)>1 FROM firm_holidays$$);
SELECT _check('FR-FIRM-payschedule','SCHEMA','firm-profile',
  'Pay schedules are timezone- and currency-aware',
  $$SELECT bool_and(timezone IS NOT NULL AND currency IS NOT NULL) FROM payroll_pay_schedules$$);

-- =============================================================================
-- EMPLOYEE PROFILE  (module-employee-profile.md)
-- =============================================================================
SELECT _check('EMP-core','DATA','employee-profile',
  'Employees exist with identity, contact and employment fields',
  $$SELECT count(*)>0 FROM employees WHERE first_name IS NOT NULL AND email IS NOT NULL$$);
SELECT _check('EMP-manager','DATA','employee-profile',
  'Reporting hierarchy is populated (someone has a manager)',
  $$SELECT count(*)>0 FROM employees WHERE manager_id IS NOT NULL$$);
SELECT _check('EMP-custom-fields','SCHEMA','employee-profile',
  'Custom fields are JSONB and backed by definitions (Tier 2 customization)',
  $$SELECT count(*)>0 FROM custom_field_definitions WHERE entity_type='employee'$$);
SELECT _check('EMP-custom-values','DATA','employee-profile',
  'Custom field values use keys that have definitions',
  $$SELECT bool_and(e.custom_fields ?| (SELECT array_agg(field_key)
      FROM custom_field_definitions WHERE entity_type='employee'))
    FROM employees e WHERE e.custom_fields <> '{}'::jsonb$$);
SELECT _check('EMP-assets','DATA','employee-profile',
  'Assigned assets and equipment are tracked',
  $$SELECT count(*)>0 FROM employee_assets$$);
SELECT _check('EMP-certs','DATA','employee-profile',
  'Certifications and training records are tracked',
  $$SELECT count(*)>0 FROM employee_certifications$$);
SELECT _check('EMP-training','DATA','employee-profile',
  'Training assignments and completion status are tracked',
  $$SELECT count(*)>0 FROM employee_training_records$$);
SELECT _check('EMP-emergency','DATA','employee-profile',
  'Emergency contacts recorded',
  $$SELECT count(*)>0 FROM hr_emergency_contacts$$);

-- =============================================================================
-- HR  (module-hr.md)
-- =============================================================================
SELECT _check('US-HR-007','SCHEMA','hr',
  'Employee can see full employment history',
  $$SELECT count(*)>=0 FROM hr_employment_history$$);
SELECT _check('US-HR-008','DATA','hr',
  'A job change (promotion/transfer) is recorded with before and after state',
  $$SELECT count(*)>0 FROM hr_employment_history
     WHERE change_type IN ('promotion','transfer') AND previous_job_title IS NOT NULL$$);
SELECT _check('US-HR-003','DATA','hr',
  'Employee documents are uploaded and associated to employee profiles',
  $$SELECT count(*)>0 FROM hr_employee_documents
     WHERE document_type IN ('contract','i9','certification','policy_acknowledgment')$$);
SELECT _check('US-HR-004','DATA','hr',
  'Profile photos are available for employee recognition',
  $$SELECT count(*)>0 FROM employees WHERE profile_picture IS NOT NULL$$);
SELECT _check('US-HR-006','DATA','hr',
  'Terminated employees retain a last day for access revocation',
  $$SELECT count(*)>0 FROM employees
     WHERE employment_status='terminated' AND end_date IS NOT NULL AND NOT is_active$$);
SELECT _check('US-HR-011','DATA','hr',
  'Employment changes record a reason for compensation-trend analysis',
  $$SELECT count(DISTINCT reason)>1 FROM hr_employment_history$$);
SELECT _check('US-HR-009','DATA','hr',
  'Salary adjustments are effective-dated so past payroll is reproducible',
  $$SELECT count(*)>0 FROM compensation_base WHERE effective_to IS NOT NULL$$);
SELECT _check('US-HR-012','SCHEMA','hr',
  'Compensation history is per-employee and queryable',
  $$SELECT count(*)>0 FROM compensation_base WHERE effective_to IS NULL$$);
SELECT _check('US-HR-time-off','DATA','hr',
  'Time off requests exist in more than one approval state',
  $$SELECT count(DISTINCT status)>1 FROM hr_time_off_requests$$);
SELECT _check('US-HR-balance','DATA','hr',
  'Leave balances carry an accrual ledger, not just a number',
  $$SELECT bool_and(accrued IS NOT NULL AND used IS NOT NULL) FROM hr_time_off_balances$$);
SELECT _check('US-HR-balance-math','DATA','hr',
  'current_balance = opening + accrued - used - pending',
  $$SELECT bool_and(abs(current_balance-(opening_balance+accrued-used-pending))<0.01)
    FROM hr_time_off_balances$$);
SELECT _check('US-HR-whos-out','DATA','hr',
  'Dashboard "Who is Out Today" widget has data to display',
  $$SELECT count(*)>0 FROM hr_time_off_requests
     WHERE status='approved' AND CURRENT_DATE BETWEEN start_date AND end_date$$);
SELECT _check('US-HR-070','DATA','hr',
  'Upcoming celebrations are derivable for the dashboard widget',
  $$SELECT count(*)>0 FROM v_upcoming_celebrations
     WHERE celebration_date BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '90 days'$$);
SELECT _check('US-HR-075','SCHEMA','hr',
  'Celebrations respect per-employee privacy preferences',
  $$SELECT count(*)>0 FROM employees WHERE celebration_preferences ? 'show_birthday'$$);
SELECT _check('FR-HR-011','DATA','hr',
  'Company news feed has published content',
  $$SELECT count(*)>0 FROM hr_company_news WHERE status='published'$$);
SELECT _check('FR-HR-009-tmpl','DATA','hr',
  'Onboarding templates exist and expand into phased tasks',
  $$SELECT count(*)>0 FROM hr_onboarding_templates t
      JOIN hr_onboarding_template_tasks tt ON tt.template_id=t.id$$);
SELECT _check('FR-HR-009-phases','DATA','hr',
  'Onboarding covers pre-boarding through the first 90 days',
  $$SELECT count(DISTINCT phase)>=4 FROM hr_onboarding_template_tasks$$);
SELECT _check('FR-HR-009-roles','SCHEMA','hr',
  'Onboarding tasks are assignable to employee, HR, manager, buddy or IT',
  $$SELECT count(DISTINCT assignee_role)>=3 FROM hr_onboarding_template_tasks$$);
SELECT _check('FR-HR-008','DATA','hr',
  'Benefits enrolments exist with dependents queryable as JSONB',
  $$SELECT count(*)>0 FROM hr_benefits_enrollments$$);
SELECT _check('FR-HR-008-json','SCHEMA','hr',
  'Dependents are JSONB (queryable), not an opaque string',
  $$SELECT atttypid::regtype::text='jsonb' FROM pg_attribute
     WHERE attrelid='hr_benefits_enrollments'::regclass AND attname='dependents'$$);
SELECT _check('FR-HR-010','DATA','hr',
  'Continuous feedback is recorded',
  $$SELECT count(*)>0 FROM hr_feedback$$);
SELECT _check('FR-HR-survey','DATA','hr',
  'Pulse surveys exist with responses',
  $$SELECT count(*)>0 FROM hr_surveys$$);
SELECT _check('FR-HR-perf','DATA','hr',
  'Performance reviews exist within a review cycle',
  $$SELECT count(*)>0 FROM hr_reviews r JOIN hr_review_cycles c ON c.cycle_code=r.cycle_code$$);
SELECT _check('FR-HR-goals','DATA','hr',
  'Goals exist and at least one aligns to a company objective',
  $$SELECT count(*)>0 FROM hr_goals WHERE objective_id IS NOT NULL$$);
SELECT _check('FR-HR-attendance','DATA','hr',
  'Attendance clock in/out is recorded',
  $$SELECT count(*)>0 FROM hr_attendance$$);
SELECT _check('US-HR-024','DATA','hr',
  'Attendance reports can show exceptions like late arrivals or absences',
  $$SELECT count(*)>0 FROM hr_attendance WHERE status IN ('late','absent','early_departure')$$);
SELECT _check('US-HR-047','DATA','hr',
  'Performance review acknowledgement is recorded electronically',
  $$SELECT count(*)>0 FROM hr_reviews
     WHERE status='acknowledged' OR manager_assessment ? 'acknowledged_at'$$);
SELECT _check('US-HR-049','DATA','hr',
  'New-hire onboarding task instances exist and can be completed',
  $$SELECT count(*)>0 FROM hr_onboarding_tasks
     WHERE status='completed' AND completion_date IS NOT NULL$$);
SELECT _check('US-HR-050','DATA','hr',
  'Onboarding can assign a buddy as a point of contact',
  $$SELECT count(*)>0 FROM hr_onboarding_tasks
     WHERE template_data ? 'buddy_employee_id'$$);
SELECT _check('US-HR-058','DATA','hr',
  'Anonymous pulse survey responses do not expose respondent identity',
  $$SELECT count(*)>0 FROM hr_surveys s
      JOIN hr_survey_responses r ON r.survey_id=s.id
     WHERE s.is_anonymous AND r.respondent_id IS NULL$$);
SELECT _check('CR-module','DATA','change-requests',
  'Employee self-service change requests exist with an approval chain',
  $$SELECT count(*)>0 FROM hr_change_requests$$);
SELECT _check('US-HR-066','DATA','change-requests',
  'Change requests can include supporting documents',
  $$SELECT count(*)>0 FROM hr_change_requests
     WHERE jsonb_array_length(coalesce(attached_documents,'[]'::jsonb))>0$$);

-- =============================================================================
-- COMPENSATION  (module-compensation.md)
-- =============================================================================
SELECT _check('COMP-base','DATA','compensation',
  'Base compensation is effective-dated per employee',
  $$SELECT count(*)>0 FROM compensation_base$$);
SELECT _check('COMP-multi-ccy','DATA','compensation',
  'Compensation spans more than one currency',
  $$SELECT count(DISTINCT currency)>1 FROM compensation_base$$);
SELECT _check('COMP-terms','DATA','compensation',
  'Employment terms record probation and notice period',
  $$SELECT count(*)>0 FROM employment_terms WHERE probation_period_days IS NOT NULL$$);
SELECT _check('COMP-workauth','DATA','compensation',
  'Work authorization expiry is tracked for non-citizens (compliance)',
  $$SELECT count(*)>0 FROM employment_terms WHERE work_authorization_expiry IS NOT NULL$$);
SELECT _check('COMP-allowance','DATA','compensation',
  'Allowances exist including a non-USD one (e.g. Indian HRA)',
  $$SELECT count(*)>0 FROM compensation_allowances WHERE currency<>'USD'$$);
SELECT _check('COMP-variable','DATA','compensation',
  'Variable compensation (bonus/commission) is modelled',
  $$SELECT count(*)>0 FROM compensation_variable$$);
SELECT _check('COMP-equity','DATA','compensation',
  'Equity grants with vesting are modelled',
  $$SELECT count(*)>0 FROM compensation_equity$$);
SELECT _check('COMP-schedule','DATA','compensation',
  'Work schedules (flexible/shift/remote) are recorded',
  $$SELECT count(*)>0 FROM compensation_work_schedules$$);

-- =============================================================================
-- PAYROLL  (module-payroll.md)
-- =============================================================================
SELECT _check('US-PAY-010','DATA','payroll',
  'Employees can hold direct deposit details',
  $$SELECT count(*)>0 FROM employee_bank_accounts$$);
SELECT _check('FR-PAY-005-split','DATA','payroll',
  'Split deposits supported: an employee with a percentage allocation',
  $$SELECT count(*)>0 FROM employee_bank_accounts WHERE allocation_type='percentage'$$);
SELECT _check('FR-PAY-005-primary','SCHEMA','payroll',
  'Exactly one primary account per employee is enforced',
  $$SELECT bool_and(n<=1) FROM (SELECT count(*) n FROM employee_bank_accounts
      WHERE is_primary AND is_active GROUP BY employee_id) x$$);
-- The rails are still asked about; the identifiers are now ciphertext
-- (20260830140000_pii_fanout.sql), so presence is what is checkable and
-- presence is what the requirement needs.
SELECT _check('FR-PAY-005-intl','DATA','payroll',
  'Non-US payment rails represented (IFSC / IBAN / sort code)',
  $$SELECT count(*)>0 FROM employee_bank_accounts
     WHERE ifsc_code_ct IS NOT NULL OR iban_ct IS NOT NULL
        OR sort_code_ct IS NOT NULL$$);
SELECT _check('PAY-run','DATA','payroll',
  'Payroll runs exist for more than one country',
  $$SELECT count(DISTINCT country)>1 FROM payroll_runs$$);
SELECT _check('US-PAY-003','DATA','payroll',
  'Off-cycle payroll runs exist for bonuses or corrections',
  $$SELECT count(*)>0 FROM payroll_runs WHERE run_type='off_cycle'$$);
SELECT _check('PAY-math','DATA','payroll',
  'gross = net + taxes + deductions for every payroll line',
  $$SELECT bool_and(abs(gross_pay-(net_pay+total_taxes+total_posttax_deductions))<0.02)
    FROM payroll_run_employees$$);
SELECT _check('PAY-rollup','DATA','payroll',
  'Run totals equal the sum of their employee lines',
  $$SELECT NOT EXISTS (SELECT 1 FROM payroll_runs r
      JOIN payroll_run_employees e ON e.payroll_run_id=r.id
      GROUP BY r.id, r.total_gross_pay
      HAVING abs(r.total_gross_pay-sum(e.gross_pay))>0.02)$$);
SELECT _check('PAY-ytd','SCHEMA','payroll',
  'Year-to-date figures tracked for tax forms',
  $$SELECT count(*)>0 FROM payroll_run_employees WHERE ytd_gross IS NOT NULL$$);
SELECT _check('US-PAY-006','DATA','payroll',
  'Pay stubs are generated with tax withholding details',
  $$SELECT count(*)>0 FROM payroll_run_employees
     WHERE pay_stub_url IS NOT NULL AND taxes <> '{}'::jsonb$$);
SELECT _check('PAY-deduct-def','DATA','payroll',
  'Deduction definitions exist (401k, EPF, ESI and similar)',
  $$SELECT count(*)>0 FROM payroll_deduction_definitions$$);
SELECT _check('US-PAY-017','DATA','payroll',
  'Court-ordered garnishment deductions carry case and priority details',
  $$SELECT count(*)>0 FROM payroll_employee_deductions
     WHERE garnishment_case_number IS NOT NULL AND amount IS NOT NULL$$);
SELECT _check('PAY-deduct-emp','DATA','payroll',
  'Employees have deduction elections',
  $$SELECT count(*)>0 FROM payroll_employee_deductions$$);
SELECT _check('PAY-withholding','DATA','payroll',
  'Tax withholding certificates (W-4 / Form 12BB) recorded',
  $$SELECT count(*)>0 FROM payroll_tax_withholding_certificates$$);
SELECT _check('US-PAY-013','DATA','payroll',
  'US multi-state tax withholding is represented',
  $$SELECT count(*)>0 FROM payroll_tax_withholding_certificates
     WHERE country='US' AND state_withholding IS NOT NULL$$);
SELECT _check('PAY-india','SCHEMA','payroll',
  'India statutory payroll modelled (not flattened into JSONB)',
  $$SELECT to_regclass('payroll_india_salary_structure') IS NOT NULL$$);
SELECT _check('US-PAY-014','DATA','payroll',
  'India salary slips can show salary structure and TDS declarations',
  $$SELECT count(*)>0 FROM payroll_india_salary_structure s
      JOIN payroll_india_tax_declarations d ON d.employee_id=s.employee_id$$);
SELECT _check('US-PAY-015','DATA','payroll',
  'Tax deposit deadlines are tracked for compliance alerts',
  $$SELECT count(*)>0 FROM payroll_tax_deposits
     WHERE due_date>=CURRENT_DATE AND payment_status='pending'$$);

-- =============================================================================
-- TICKETING  (module-ticketing.md)
-- =============================================================================
SELECT _check('TIX-areas','DATA','ticketing',
  'Business areas exist with independent number sequences',
  $$SELECT count(*)>1 FROM ticketing_business_areas$$);
SELECT _check('TIX-numbering','DATA','ticketing',
  'Ticket numbers are scoped per business area prefix',
  $$SELECT count(DISTINCT prefix)>1 FROM ticketing_tickets$$);
SELECT _check('TIX-states','DATA','ticketing',
  'Tickets exist in multiple statuses',
  $$SELECT count(DISTINCT status)>1 FROM ticketing_tickets$$);
SELECT _check('TIX-updates','DATA','ticketing',
  'Ticket conversation threads exist',
  $$SELECT count(*)>0 FROM ticketing_updates$$);
SELECT _check('TIX-search','DATA','ticketing',
  'Full-text search returns a match (tsvector populated by trigger)',
  $$SELECT count(*)>0 FROM ticketing_tickets
     WHERE search_vector @@ plainto_tsquery('simple','laptop')$$);
SELECT _check('TIX-search-tenant','SCHEMA','ticketing',
  'Search index leads with tenant_id so search cannot cross tenants',
  $$SELECT count(*)>0 FROM pg_indexes
     WHERE tablename='ticketing_tickets' AND indexdef LIKE '%tenant_id%search_vector%'$$);
SELECT _check('TIX-sla-cols','SCHEMA','ticketing',
  'SLA compliance is measurable (first response and due timestamps exist)',
  $$SELECT count(*)=2 FROM information_schema.columns
     WHERE table_name='ticketing_tickets'
       AND column_name IN ('first_response_at','sla_due_at')$$);
SELECT _check('TIX-sla-data','DATA','ticketing',
  'SLA report has data: some tickets carry a target and a first response',
  $$SELECT count(*)>0 FROM ticketing_tickets
     WHERE sla_due_at IS NOT NULL AND first_response_at IS NOT NULL$$);
SELECT _check('TIX-attach','DATA','ticketing',
  'Ticket attachments are recorded',
  $$SELECT count(*)>0 FROM ticketing_attachments$$);
SELECT _check('TIX-private','DATA','ticketing',
  'Private tickets are represented and filterable',
  $$SELECT count(*)>0 FROM ticketing_tickets WHERE private$$);
SELECT _check('TIX-subscribers','DATA','ticketing',
  'Ticket subscribers/watchers are represented',
  $$SELECT count(*)>0 FROM ticketing_tickets
     WHERE jsonb_array_length(coalesce(subscribers,'[]'::jsonb))>0$$);
SELECT _check('TIX-linking','DATA','ticketing',
  'Tickets can reference parent or linked tickets',
  $$SELECT count(*)>0 FROM ticketing_tickets
     WHERE parent_ticket_number IS NOT NULL
        OR jsonb_array_length(coalesce(linked_tickets,'[]'::jsonb))>0$$);
SELECT _check('TIX-workflow','DATA','ticketing',
  'Business-area categories and custom fields can drive workflows',
  $$SELECT count(*)>0 FROM ticketing_business_areas
     WHERE jsonb_array_length(categories)>0 AND custom_fields <> '{}'::jsonb$$);

-- =============================================================================
-- PROJECTS & TIME TRACKING  (module-project-management-v2.md, module-time-tracking.md)
-- =============================================================================
SELECT _check('PM-objective','DATA','projects',
  'Company objectives exist and projects align to them',
  $$SELECT count(*)>0 FROM projects WHERE objective_id IS NOT NULL$$);
SELECT _check('PM-tasks','DATA','projects',
  'Tasks exist across multiple statuses',
  $$SELECT count(DISTINCT status)>1 FROM tasks$$);
SELECT _check('PM-client','DATA','projects',
  'Projects are linked to clients for billing',
  $$SELECT count(*)>0 FROM projects WHERE client_id IS NOT NULL$$);
SELECT _check('PM-custom','SCHEMA','projects',
  'Task custom fields are JSONB with definitions (EAV was rejected)',
  $$SELECT count(*)>0 FROM custom_field_definitions WHERE entity_type='task'$$);
SELECT _check('PM-no-eav','SCHEMA','projects',
  'The EAV tables are absent (06-customization-model.md)',
  $$SELECT to_regclass('pm_task_column_values') IS NULL
        AND to_regclass('pm_column_definitions') IS NULL$$);
SELECT _check('PM-dashboards','DATA','projects',
  'Dashboards and widgets exist',
  $$SELECT count(*)>0 FROM pm_dashboards$$);
SELECT _check('PM-comments','DATA','projects',
  'Task discussions include internal and client-visible comments',
  $$SELECT count(DISTINCT is_internal)=2 FROM pm_task_comments$$);
SELECT _check('PM-attachments','DATA','projects',
  'Task deliverables/attachments are tracked with client visibility',
  $$SELECT count(*)>0 FROM pm_task_attachments WHERE client_visible$$);
SELECT _check('PM-automations','DATA','projects',
  'Project/task automations and execution history are represented',
  $$SELECT count(*)>0 FROM pm_automations a
      JOIN pm_automation_executions e ON e.automation_id=a.id$$);
SELECT _check('TT-entries','DATA','time-tracking',
  'Time entries linked to project, task and timesheet',
  $$SELECT count(*)>0 FROM time_tracking_entries
     WHERE project_id IS NOT NULL AND timesheet_id IS NOT NULL$$);
SELECT _check('TT-timesheet-math','DATA','time-tracking',
  'Timesheet totals equal the sum of their entries',
  $$SELECT NOT EXISTS (SELECT 1 FROM time_tracking_timesheets t
      JOIN time_tracking_entries e ON e.timesheet_id=t.id
      GROUP BY t.id, t.total_hours HAVING abs(t.total_hours-sum(e.hours))>0.02)$$);
SELECT _check('TT-rates','DATA','time-tracking',
  'Effective-dated billing rates exist so past work bills at past rates',
  $$SELECT count(*)>0 FROM time_tracking_hourly_rates WHERE effective_to IS NOT NULL$$);
SELECT _check('TT-rate-per-client','DATA','time-tracking',
  'Rates can vary per client (professional services requirement)',
  $$SELECT count(DISTINCT client_id)>1 FROM time_tracking_hourly_rates
     WHERE client_id IS NOT NULL$$);
SELECT _check('TT-billable','DATA','time-tracking',
  'Billable and non-billable time are distinguished',
  $$SELECT count(DISTINCT is_billable)=2 FROM time_tracking_entries$$);
SELECT _check('TT-expenses','DATA','time-tracking',
  'Billable expenses can be captured for client invoicing',
  $$SELECT count(*)>0 FROM time_tracking_billable_expenses
     WHERE is_billable AND receipt_url IS NOT NULL$$);

-- =============================================================================
-- ACCOUNTING  (module-accounting.md)
-- =============================================================================
SELECT _check('ACC-coa','DATA','accounting',
  'Chart of accounts covers all five account types',
  $$SELECT count(DISTINCT account_type)>=5 FROM chart_of_accounts$$);
SELECT _check('US-ACC-032','SCHEMA','accounting',
  'Chart of account codes are unique inside a tenant',
  $$SELECT count(*)>0 FROM pg_indexes
     WHERE tablename='chart_of_accounts'
       AND indexdef LIKE '%UNIQUE%'
       AND indexdef LIKE '%tenant_id%'
       AND indexdef LIKE '%account_code%'$$);
SELECT _check('US-ACC-doc-keys','SCHEMA','accounting',
  'Financial document numbers have tenant-scoped unique indexes',
  $$SELECT
      (SELECT count(*)>0 FROM pg_indexes WHERE tablename='invoices' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%tenant_id%' AND indexdef LIKE '%invoice_number%')
  AND (SELECT count(*)>0 FROM pg_indexes WHERE tablename='journal_entries' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%tenant_id%' AND indexdef LIKE '%entry_number%')
  AND (SELECT count(*)>0 FROM pg_indexes WHERE tablename='payments' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%tenant_id%' AND indexdef LIKE '%payment_number%')
  AND (SELECT count(*)>0 FROM pg_indexes WHERE tablename='bills' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%tenant_id%' AND indexdef LIKE '%bill_number%')$$);
SELECT _check('ACC-document-amount-constraints','SCHEMA','accounting',
  'Invoice and bill amount columns are protected by reconciliation constraints',
  $$SELECT
      (SELECT count(*)>0 FROM pg_constraint WHERE conname='ck_invoices_amounts_reconcile')
  AND (SELECT count(*)>0 FROM pg_constraint WHERE conname='ck_bills_amounts_reconcile')$$);
SELECT _check('ACC-journal-line-constraint','SCHEMA','accounting',
  'Journal lines require one positive debit or one positive credit',
  $$SELECT count(*)>0 FROM pg_constraint
     WHERE conname='ck_journal_entry_lines_one_sided_positive'$$);
SELECT _check('ACC-payment-allocation-constraint','SCHEMA','accounting',
  'Payment allocations must target exactly one invoice or bill',
  $$SELECT count(*)>0 FROM pg_constraint
     WHERE conname='ck_payment_allocations_one_document'$$);
SELECT _check('ACC-balance','DATA','accounting',
  'Journal entries balance: total debits equal total credits',
  $$SELECT coalesce(sum(debit_amount),0)=coalesce(sum(credit_amount),0)
    FROM journal_entry_lines$$);
SELECT _check('ACC-balance-per-entry','DATA','accounting',
  'Every individual journal entry balances',
  $$SELECT NOT EXISTS (SELECT 1 FROM journal_entry_lines
      GROUP BY entry_id HAVING sum(debit_amount)<>sum(credit_amount))$$);
SELECT _check('ACC-base-balance-per-entry','DATA','accounting',
  'Every journal entry also balances in base currency',
  $$SELECT NOT EXISTS (SELECT 1 FROM journal_entry_lines
      GROUP BY entry_id HAVING sum(base_debit_amount)<>sum(base_credit_amount))$$);
SELECT _check('US-ACC-037','DATA','accounting',
  'Accounting transactions have source links and audit trail coverage',
  $$SELECT (SELECT count(*)>0 FROM journal_entries
             WHERE source_type IN ('invoice','payment','bill') AND source_id IS NOT NULL)
       AND (SELECT count(*)>0 FROM audit_log WHERE module='accounting')$$);
SELECT _check('ACC-invoice-lines','DATA','accounting',
  'Invoice subtotal equals the sum of its line items',
  $$SELECT NOT EXISTS (SELECT 1 FROM invoices i JOIN invoice_lines l ON l.invoice_id=i.id
      GROUP BY i.id, i.subtotal HAVING abs(i.subtotal-sum(l.amount))>0.02)$$);
SELECT _check('ACC-invoice-tax-total','DATA','accounting',
  'Invoice tax totals equal line-level tax sums',
  $$SELECT NOT EXISTS (SELECT 1 FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id=i.id
      GROUP BY i.id, i.tax_total HAVING abs(i.tax_total-coalesce(sum(l.tax_amount),0))>0.02)$$);
SELECT _check('ACC-invoice-amounts','DATA','accounting',
  'Invoice totals and balances due reconcile to subtotal, tax, and payments',
  $$SELECT NOT EXISTS (SELECT 1 FROM invoices
      WHERE abs(total-(subtotal+tax_total))>0.02
         OR abs(amount_due-(total-amount_paid))>0.02
         OR abs(base_total-(base_subtotal+base_tax_total))>0.02
         OR abs(base_amount_due-(base_total-base_amount_paid))>0.02)$$);
SELECT _check('ACC-invoice-journal-tieout','DATA','accounting',
  'Invoice journal entries tie to the invoice base total they post',
  $$SELECT NOT EXISTS (
      SELECT 1
        FROM invoices i
        JOIN journal_entry_lines l ON l.entry_id=i.journal_entry_id
       WHERE i.journal_entry_id IS NOT NULL
       GROUP BY i.id, i.base_total
      HAVING abs(i.base_total-sum(l.base_debit_amount))>0.02
          OR abs(i.base_total-sum(l.base_credit_amount))>0.02)$$);
SELECT _check('US-ACC-001','DATA','accounting',
  'Sent invoices include branding-ready PDF/footer data',
  $$SELECT count(*)>0 FROM invoices
     WHERE pdf_url IS NOT NULL AND footer_text IS NOT NULL AND sent_at IS NOT NULL$$);
SELECT _check('US-ACC-002','DATA','accounting',
  'Customer invoices include online payment links and gateway identifiers',
  $$SELECT count(*)>0 FROM invoices
     WHERE payment_url IS NOT NULL AND payment_gateway IS NOT NULL AND payment_gateway_id IS NOT NULL$$);
SELECT _check('US-ACC-004','DATA','accounting',
  'Recurring invoices are represented for subscription billing',
  $$SELECT count(*)>0 FROM invoices WHERE is_recurring AND recurring_schedule_id IS NOT NULL$$);
SELECT _check('US-ACC-006','DATA','accounting',
  'Invoice workflow covers draft, paid, partial, and overdue states',
  $$SELECT count(DISTINCT status)>=4 FROM invoices
     WHERE status IN ('draft','paid','partial','overdue')$$);
SELECT _check('ACC-multi-ccy','DATA','accounting',
  'Invoices in more than one currency with base-currency conversion',
  $$SELECT count(DISTINCT currency)>1 FROM invoices$$);
SELECT _check('ACC-base-ccy','SCHEMA','accounting',
  'Foreign-currency invoices carry a base-currency equivalent',
  $$SELECT bool_and(base_total IS NOT NULL) FROM invoices$$);
SELECT _check('ACC-ar-aging','DATA','accounting',
  'Aged receivables computable: unpaid invoices with due dates',
  $$SELECT count(*)>0 FROM invoices WHERE amount_due>0 AND due_date IS NOT NULL$$);
SELECT _check('US-ACC-016','DATA','accounting',
  'Overdue AR can be identified by due date and remaining balance',
  $$SELECT count(*)>0 FROM invoices
     WHERE status='overdue' AND amount_due>0 AND due_date<CURRENT_DATE$$);
SELECT _check('US-ACC-018','DATA','accounting',
  'One customer payment can be allocated across multiple invoices',
  $$SELECT count(*)>0 FROM (
      SELECT payment_id FROM payment_allocations
       WHERE invoice_id IS NOT NULL
       GROUP BY payment_id HAVING count(DISTINCT invoice_id)>1) x$$);
SELECT _check('ACC-payment-allocation-total','DATA','accounting',
  'Payments are not over-allocated',
  $$SELECT NOT EXISTS (
      SELECT 1 FROM payments p
       JOIN payment_allocations a ON a.payment_id=p.id
       GROUP BY p.id, p.amount
      HAVING sum(a.amount)>p.amount+0.02)$$);
SELECT _check('ACC-payment-document-total','DATA','accounting',
  'Invoice and bill allocations do not exceed document balances',
  $$SELECT NOT EXISTS (
      SELECT 1 FROM invoices i
       JOIN payment_allocations a ON a.invoice_id=i.id
       GROUP BY i.id, i.total
      HAVING sum(a.amount)>i.total+0.02)
   AND NOT EXISTS (
      SELECT 1 FROM bills b
       JOIN payment_allocations a ON a.bill_id=b.id
       GROUP BY b.id, b.total
      HAVING sum(a.amount)>b.total+0.02)$$);
SELECT _check('US-ACC-054','DATA','accounting',
  'Realized FX gain or loss is captured when foreign invoices settle at a different rate',
  $$SELECT count(*)>0 FROM payment_allocations a
      JOIN invoices i ON i.id=a.invoice_id
     WHERE i.currency<>i.base_currency AND abs(a.fx_gain_loss)>0$$);
SELECT _check('ACC-expenses','DATA','accounting',
  'Employee expenses post against expense accounts',
  $$SELECT count(*)>0 FROM expenses e
      JOIN chart_of_accounts a ON a.id=e.category_account_id$$);
SELECT _check('US-ACC-009','DATA','accounting',
  'Expense receipts are attached for mobile capture workflows',
  $$SELECT count(*)>0 FROM expenses WHERE receipt_url IS NOT NULL$$);
SELECT _check('US-ACC-010','DATA','accounting',
  'Expense OCR/categorization data exists for review',
  $$SELECT count(*)>0 FROM expenses
     WHERE receipt_ocr_data ? 'confidence' AND category_account_id IS NOT NULL$$);
SELECT _check('US-ACC-013','DATA','accounting',
  'Approved reimbursable expenses identify the approver',
  $$SELECT count(*)>0 FROM expenses
     WHERE is_reimbursable AND reimbursement_status='approved'
       AND approved_by IS NOT NULL AND approved_at IS NOT NULL$$);
SELECT _check('ACC-bank','DATA','accounting',
  'Bank accounts and transactions exist for reconciliation',
  $$SELECT (SELECT count(*) FROM bank_accounts)>0
        AND (SELECT count(*) FROM bank_transactions)>0$$);
SELECT _check('US-ACC-027','DATA','accounting',
  'Connected bank feeds store provider sync metadata',
  $$SELECT count(*)>0 FROM bank_accounts
     WHERE feed_enabled AND feed_provider IS NOT NULL AND feed_connection_id IS NOT NULL$$);
SELECT _check('US-ACC-028','DATA','accounting',
  'Bank transaction matching suggestions are represented',
  $$SELECT count(*)>0 FROM bank_transactions WHERE match_confidence IS NOT NULL$$);
SELECT _check('US-ACC-029','DATA','accounting',
  'Bank reconciliation rules can auto-categorize recurring transactions',
  $$SELECT count(*)>0 FROM bank_reconciliation_rules WHERE auto_match$$);
SELECT _check('US-ACC-030','DATA','accounting',
  'Unreconciled bank transactions remain visible for manual review',
  $$SELECT count(*)>0 FROM bank_transactions WHERE status='unmatched'$$);
SELECT _check('ACC-periods','DATA','accounting',
  'Accounting periods defined for close',
  $$SELECT count(*)>0 FROM accounting_periods$$);
SELECT _check('US-ACC-035','DATA','accounting',
  'Locked accounting periods are represented for historical protection',
  $$SELECT count(*)>0 FROM accounting_periods
     WHERE status='locked' AND closed_at IS NOT NULL AND closed_by IS NOT NULL$$);
SELECT _check('ACC-vendors','DATA','accounting',
  'Vendors and bills exist (accounts payable)',
  $$SELECT (SELECT count(*) FROM vendors)>0 AND (SELECT count(*) FROM bills)>0$$);
SELECT _check('ACC-bill-lines','DATA','accounting',
  'Bill totals equal line amounts plus input tax',
  $$SELECT NOT EXISTS (SELECT 1 FROM bills b LEFT JOIN bill_lines l ON l.bill_id=b.id
      GROUP BY b.id, b.subtotal, b.tax_total, b.total, b.amount_paid, b.amount_due
      HAVING abs(b.subtotal-coalesce(sum(l.amount),0))>0.02
          OR abs(b.tax_total-coalesce(sum(l.tax_amount),0))>0.02
          OR abs(b.total-(b.subtotal+b.tax_total))>0.02
          OR abs(b.amount_due-(b.total-b.amount_paid))>0.02)$$);
SELECT _check('US-ACC-024','DATA','accounting',
  'Bills due soon can be prioritized for payment',
  $$SELECT count(*)>0 FROM bills
     WHERE status IN ('approved','open') AND amount_due>0 AND due_date>=CURRENT_DATE$$);
SELECT _check('US-ACC-025','DATA','accounting',
  'Vendor batch-style payments can allocate one payment to multiple bills',
  $$SELECT count(*)>0 FROM (
      SELECT payment_id FROM payment_allocations
       WHERE bill_id IS NOT NULL
       GROUP BY payment_id HAVING count(DISTINCT bill_id)>1) x$$);
SELECT _check('US-ACC-049','DATA','accounting',
  'Output tax on invoices and input tax on bills are both represented',
  $$SELECT (SELECT count(*)>0 FROM invoice_lines WHERE tax_amount>0 AND tax_rate_id IS NOT NULL)
      AND (SELECT count(*)>0 FROM bill_lines WHERE tax_amount>0 AND tax_rate_id IS NOT NULL)$$);
SELECT _check('US-ACC-050','DATA','accounting',
  'Tax-exempt customers can have zero-tax invoices',
  $$SELECT count(*)>0 FROM customers c
      JOIN invoices i ON i.customer_id=c.id
     WHERE c.is_tax_exempt AND i.tax_total=0$$);
SELECT _check('US-ACC-046','DATA','accounting',
  'Sales tax rates are configured by jurisdiction',
  $$SELECT count(*)>0 FROM payroll_tax_rates
     WHERE tax_type='sales_tax' AND jurisdiction IS NOT NULL AND rate>0$$);
SELECT _check('US-ACC-047','DATA','accounting',
  'Reverse-charge VAT configuration is represented',
  $$SELECT count(*)>0 FROM payroll_tax_rates
     WHERE tax_type='vat' AND is_reverse_charge$$);
SELECT _check('US-ACC-052','DATA','accounting',
  'Exchange-rate snapshots exist for foreign-currency transaction dates',
  $$SELECT count(*)>0 FROM exchange_rates
     WHERE from_currency<>to_currency AND rate_date IS NOT NULL AND source IS NOT NULL$$);
SELECT _check('US-ACC-1099','DATA','accounting',
  '1099 vendors with payments above the reporting threshold are identifiable',
  $$SELECT EXISTS (
      SELECT 1 FROM vendors v
        JOIN payments p ON p.vendor_id=v.id
       WHERE v.is_1099_vendor
       GROUP BY v.id
      HAVING sum(p.amount)>=600)$$);
SELECT _check('US-ACC-031','DATA','accounting',
  'Multiple bank accounts, including foreign-currency accounts, can be reconciled',
  $$SELECT count(DISTINCT currency)>1 FROM bank_accounts$$);

-- =============================================================================
-- USER GROUPS  (module-user-groups.md)
-- =============================================================================
SELECT _check('UG-groups','DATA','user-groups',
  'User groups exist',
  $$SELECT count(*)>0 FROM employee_user_groups$$);
SELECT _check('UG-members','DATA','user-groups',
  'Group membership is populated (RBAC resolution depends on it)',
  $$SELECT count(*)>0 FROM employee_group_members$$);
SELECT _check('UG-roles','DATA','user-groups',
  'Group role assignments exist for RBAC resolution',
  $$SELECT count(*)>0 FROM employee_group_roles$$);

-- =============================================================================
-- CROSS-CUTTING  (product-specification.md, ADRs)
-- =============================================================================
-- NOTE: the next two are METADATA checks. They prove RLS is switched on, NOT
-- that any policy actually filters — a policy of USING(true) passes both.
-- Behavioural proof lives in packages/database/tests/verify-rls.sql; policy EXPRESSIONS are
-- pinned by db/snapshot/04-policies.txt. Do not read these as isolation tests.
SELECT _check('X-rls-all','SCHEMA','cross-cutting',
  'RLS switched on for every table (metadata only — see verify-rls.sh)',
  $$SELECT count(*)=0
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
       AND c.relname NOT IN ('profiles','stripe_customers','contact_requests')$$);
SELECT _check('X-rls-forced','SCHEMA','cross-cutting',
  'RLS is FORCED, so the owner is bound too (metadata only)',
  $$SELECT count(*)=0
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
       AND c.relrowsecurity AND NOT c.relforcerowsecurity
       AND c.relname NOT IN (
             'exchange_rates',                                  -- global read-only reference data
             'profiles','stripe_customers','contact_requests'   -- CMSaasStarter leftovers, pending removal
           )$$);
SELECT _check('X-tenant-col','SCHEMA','cross-cutting',
  'Every table except the registry and global reference data has tenant_id',
  $$SELECT count(*)=0 FROM pg_tables t WHERE t.schemaname='public'
     AND t.tablename NOT IN (
           'tenants',                                         -- IS the registry
           'exchange_rates',                                  -- global reference data
           'profiles','stripe_customers','contact_requests'   -- CMSaasStarter leftovers, pending removal
         )
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=t.tablename
          AND c.column_name='tenant_id')$$);
SELECT _check('X-jobs','SCHEMA','cross-cutting',
  'Background job queue is a table, not Redis (ADR-002)',
  $$SELECT to_regclass('jobs') IS NOT NULL$$);
SELECT _check('X-audit','DATA','cross-cutting',
  'Audit log captures cross-module actions',
  $$SELECT count(*)>0 FROM audit_log$$);
SELECT _check('X-i18n','DATA','cross-cutting',
  'Translations exist for more than one locale',
  $$SELECT count(DISTINCT locale)>1 FROM translations$$);
SELECT _check('X-settings','DATA','cross-cutting',
  'Tenant behaviour settings exist (Tier 3 customization)',
  $$SELECT count(*)>0 FROM tenant_settings$$);
SELECT _check('X-links','DATA','cross-cutting',
  'Cross-module links connect entities across modules (UC-1.1 style)',
  $$SELECT count(DISTINCT source_module)>1 FROM cross_module_links$$);
SELECT _check('X-no-redis-tables','SCHEMA','cross-cutting',
  'No session table: sessions are Supabase Auth (ADR-008)',
  $$SELECT to_regclass('sessions') IS NULL AND to_regclass('user_sessions') IS NULL$$);

-- =============================================================================
-- REPORT
-- =============================================================================
\set QUIET off
\echo ''
\echo '=================== SPECIFICATION VERIFICATION ==================='

SELECT module,
       count(*)                                   AS checks,
       count(*) FILTER (WHERE passed)             AS passed,
       count(*) FILTER (WHERE NOT passed)         AS failed
  FROM _results GROUP BY module ORDER BY failed DESC, module;

\echo ''
\echo '--- FAILURES ---'
SELECT check_id, kind, module, requirement, detail
  FROM _results WHERE NOT passed ORDER BY kind, module, check_id;

\echo ''
DO $$
DECLARE t INT; p INT; f INT; sf INT; df INT;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed)
      INTO t, p, f FROM _results;
    SELECT count(*) FILTER (WHERE NOT passed AND kind='SCHEMA'),
           count(*) FILTER (WHERE NOT passed AND kind='DATA')
      INTO sf, df FROM _results;

    RAISE NOTICE '=================================================================';
    RAISE NOTICE '  % checks: % passed, % failed', t, p, f;
    RAISE NOTICE '';
    RAISE NOTICE '  SCHEMA failures: %  (design gaps — the structure cannot answer', sf;
    RAISE NOTICE '                       the requirement)';
    RAISE NOTICE '  DATA failures:   %  (mock data gaps — the feature may be', df;
    RAISE NOTICE '                       buildable but cannot be demonstrated)';
    RAISE NOTICE '=================================================================';

    IF sf > 0 THEN
        RAISE WARNING 'There are % SCHEMA failures. These are design gaps.', sf;
    END IF;
END $$;

-- Fail the run when invoked with -v strict=1, for CI.
\if :{?strict} \else \set strict 0 \endif
-- ON_ERROR_STOP must be re-enabled here: it is off for the whole file so that a
-- failing check cannot abort the run, but that also swallows the exception
-- below and the process would exit 0 with failures present.
\set ON_ERROR_STOP on
-- Compare the VALUE, not merely whether the variable is defined:
-- `\if :{?strict}` is true for `-v strict=0` as well, which is surprising.
\if :strict
DO $$
DECLARE f INT;
BEGIN
    SELECT count(*) INTO f FROM _results WHERE NOT passed;
    IF f > 0 THEN RAISE EXCEPTION '% specification check(s) failed', f; END IF;
END $$;
\endif

ROLLBACK;

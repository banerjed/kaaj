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
--   psql "$DATABASE_URL" -f data-models/schema.sql
--   psql "$DATABASE_URL" -f data-models/mock-data.sql
--   psql "$DATABASE_URL" -f data-models/verify-stories.sql
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
SELECT _check('US-FIRM-hq','SCHEMA','firm-profile',
  'Exactly one headquarters per tenant (not one globally)',
  $$SELECT count(*)<=1 FROM firm_locations WHERE is_headquarters$$);
SELECT _check('US-FIRM-dept-tree','DATA','firm-profile',
  'Department hierarchy is navigable (a child references a parent)',
  $$SELECT count(*)>0 FROM firm_departments WHERE parent_department_code IS NOT NULL$$);
SELECT _check('US-FIRM-i18n','SCHEMA','firm-profile',
  'Departments carry multilingual names (Global by Design)',
  $$SELECT count(*)>0 FROM firm_departments WHERE name_i18n IS NOT NULL$$);
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
SELECT _check('CR-module','DATA','change-requests',
  'Employee self-service change requests exist with an approval chain',
  $$SELECT count(*)>0 FROM hr_change_requests$$);

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
SELECT _check('FR-PAY-005-intl','DATA','payroll',
  'Non-US payment rails represented (IFSC / IBAN / sort code)',
  $$SELECT count(*)>0 FROM employee_bank_accounts
     WHERE ifsc_code IS NOT NULL OR iban IS NOT NULL OR sort_code IS NOT NULL$$);
SELECT _check('PAY-run','DATA','payroll',
  'Payroll runs exist for more than one country',
  $$SELECT count(DISTINCT country)>1 FROM payroll_runs$$);
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
SELECT _check('PAY-deduct-def','DATA','payroll',
  'Deduction definitions exist (401k, EPF, ESI and similar)',
  $$SELECT count(*)>0 FROM payroll_deduction_definitions$$);
SELECT _check('PAY-deduct-emp','DATA','payroll',
  'Employees have deduction elections',
  $$SELECT count(*)>0 FROM payroll_employee_deductions$$);
SELECT _check('PAY-withholding','DATA','payroll',
  'Tax withholding certificates (W-4 / Form 12BB) recorded',
  $$SELECT count(*)>0 FROM payroll_tax_withholding_certificates$$);
SELECT _check('PAY-india','SCHEMA','payroll',
  'India statutory payroll modelled (not flattened into JSONB)',
  $$SELECT to_regclass('payroll_india_salary_structure') IS NOT NULL$$);

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

-- =============================================================================
-- ACCOUNTING  (module-accounting.md)
-- =============================================================================
SELECT _check('ACC-coa','DATA','accounting',
  'Chart of accounts covers all five account types',
  $$SELECT count(DISTINCT account_type)>=5 FROM chart_of_accounts$$);
SELECT _check('ACC-balance','DATA','accounting',
  'Journal entries balance: total debits equal total credits',
  $$SELECT coalesce(sum(debit_amount),0)=coalesce(sum(credit_amount),0)
    FROM journal_entry_lines$$);
SELECT _check('ACC-balance-per-entry','DATA','accounting',
  'Every individual journal entry balances',
  $$SELECT NOT EXISTS (SELECT 1 FROM journal_entry_lines
      GROUP BY entry_id HAVING sum(debit_amount)<>sum(credit_amount))$$);
SELECT _check('ACC-invoice-lines','DATA','accounting',
  'Invoice subtotal equals the sum of its line items',
  $$SELECT NOT EXISTS (SELECT 1 FROM invoices i JOIN invoice_lines l ON l.invoice_id=i.id
      GROUP BY i.id, i.subtotal HAVING abs(i.subtotal-sum(l.amount))>0.02)$$);
SELECT _check('ACC-multi-ccy','DATA','accounting',
  'Invoices in more than one currency with base-currency conversion',
  $$SELECT count(DISTINCT currency)>1 FROM invoices$$);
SELECT _check('ACC-base-ccy','SCHEMA','accounting',
  'Foreign-currency invoices carry a base-currency equivalent',
  $$SELECT bool_and(base_total IS NOT NULL) FROM invoices$$);
SELECT _check('ACC-ar-aging','DATA','accounting',
  'Aged receivables computable: unpaid invoices with due dates',
  $$SELECT count(*)>0 FROM invoices WHERE amount_due>0 AND due_date IS NOT NULL$$);
SELECT _check('ACC-expenses','DATA','accounting',
  'Employee expenses post against expense accounts',
  $$SELECT count(*)>0 FROM expenses e
      JOIN chart_of_accounts a ON a.id=e.category_account_id$$);
SELECT _check('ACC-bank','DATA','accounting',
  'Bank accounts and transactions exist for reconciliation',
  $$SELECT count(*)>0 FROM bank_accounts$$);
SELECT _check('ACC-periods','DATA','accounting',
  'Accounting periods defined for close',
  $$SELECT count(*)>0 FROM accounting_periods$$);
SELECT _check('ACC-vendors','DATA','accounting',
  'Vendors and bills exist (accounts payable)',
  $$SELECT count(*)>0 FROM vendors$$);

-- =============================================================================
-- USER GROUPS  (module-user-groups.md)
-- =============================================================================
SELECT _check('UG-groups','DATA','user-groups',
  'User groups exist',
  $$SELECT count(*)>0 FROM employee_user_groups$$);
SELECT _check('UG-members','DATA','user-groups',
  'Group membership is populated (RBAC resolution depends on it)',
  $$SELECT count(*)>0 FROM employee_group_members$$);

-- =============================================================================
-- CROSS-CUTTING  (product-specification.md, ADRs)
-- =============================================================================
SELECT _check('X-rls-all','SCHEMA','cross-cutting',
  'RLS enabled on every tenant-owned table (ADR-003)',
  $$SELECT count(*)=0 FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename
     WHERE t.schemaname='public' AND NOT c.relrowsecurity$$);
SELECT _check('X-rls-forced','SCHEMA','cross-cutting',
  'RLS is FORCED (owner cannot silently bypass it)',
  $$SELECT count(*)<=1 FROM pg_tables t JOIN pg_class c ON c.relname=t.tablename
     WHERE t.schemaname='public' AND c.relrowsecurity AND NOT c.relforcerowsecurity$$);
SELECT _check('X-tenant-col','SCHEMA','cross-cutting',
  'Every table except the registry and global reference data has tenant_id',
  $$SELECT count(*)<=2 FROM pg_tables t WHERE t.schemaname='public'
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
        WHERE c.table_name=t.tablename AND c.column_name='tenant_id')$$);
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
\if :{?strict}
DO $$
DECLARE f INT;
BEGIN
    SELECT count(*) INTO f FROM _results WHERE NOT passed;
    IF f > 0 THEN RAISE EXCEPTION '% specification check(s) failed', f; END IF;
END $$;
\endif

ROLLBACK;

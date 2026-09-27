-- =============================================================================
-- Row visibility for six tables ./check listed in EXPOSED_PENDING
-- =============================================================================
-- Each was readable by everyone in the tenant while another committed rule
-- said it should not be (scripts/verify-matrix-complete.mjs, L103). RESTRICTIVE
-- throughout, so each is AND-ed with tenant_isolation and can only narrow
-- (L63); helper calls are wrapped in `(SELECT f())` so they evaluate once.
--
-- None of these policies re-queries its own table (L94): each reads a
-- grant helper or a DIFFERENT, parent table, and no parent's policy reads
-- back into its child.
-- =============================================================================

-- Benefit elections are GDPR Art. 9 health data; the matrix already holds the
-- same values to the subject and HR on `employees` (benefits_elections_pvt).
CREATE POLICY pii_visibility ON hr_benefits_enrollments AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_pii())
    OR employee_id = (SELECT app.current_employee_id())
);

-- A run's totals divide out to salaries on a small run. Payroll readers see
-- every run; an employee sees only the runs they were paid in, because their
-- payslip reads the run's pay date. A page must still never show a member the
-- run's TOTALS: on a two-person run, total minus your own is your colleague.
CREATE POLICY payroll_run_visibility ON payroll_runs AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_compensation())
    OR EXISTS (
        SELECT 1 FROM payroll_run_employees pe
         WHERE pe.payroll_run_id = payroll_runs.id
           AND pe.employee_id = (SELECT app.current_employee_id())
    )
);

-- The firm's own tax payments: payroll and the finance function, as
-- accounting rows are.
CREATE POLICY payroll_tax_deposit_visibility ON payroll_tax_deposits AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_compensation())
    OR (SELECT app.reads_all_accounting())
);

-- An attachment is visible exactly when its ticket is, and — if it hangs off
-- an update — when that update is, so a portal contact never sees a file
-- attached to an internal note.
CREATE POLICY attachment_visibility ON ticketing_attachments AS RESTRICTIVE FOR SELECT
USING (
    EXISTS (SELECT 1 FROM ticketing_tickets t WHERE t.id = ticketing_attachments.ticket_id)
    AND (
        ticketing_attachments.update_id IS NULL
        OR EXISTS (SELECT 1 FROM ticketing_updates u WHERE u.id = ticketing_attachments.update_id)
    )
);

-- A value is visible exactly when the project or task it describes is. Any
-- other entity_type is invisible until a policy arm names it: failing closed
-- is the point of a RESTRICTIVE policy.
CREATE POLICY custom_field_value_visibility ON custom_field_values AS RESTRICTIVE FOR SELECT
USING (
    (entity_type = 'project'
     AND EXISTS (SELECT 1 FROM projects p WHERE p.id = custom_field_values.entity_id))
    OR (entity_type = 'task'
     AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = custom_field_values.entity_id))
);

-- `message` echoes submitted values (L69), and nothing in the application
-- reads this table: the ops tools (error-report.mjs, check-error-rates.mjs,
-- prune-error-log.mjs) connect as the owner, which RLS does not govern.
-- The application only INSERTs, without RETURNING, so a closed read path
-- costs it nothing.
CREATE POLICY no_application_reads ON app_error_log AS RESTRICTIVE FOR SELECT
USING (false);

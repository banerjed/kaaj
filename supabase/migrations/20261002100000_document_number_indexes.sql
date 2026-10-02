-- The next document number (INV-2026-031, TE-0417680, T-55137) is
-- max(trailing digits) + 1 over every row of its kind in the tenant. Without
-- an index on exactly that expression each new row read the whole table —
-- 184ms per time entry at 418,000 entries, 36ms per invoice at 30,000, in
-- the perf tenant (docs/32-perf-tenant.md); with one it is a backward index
-- scan that stops at the first row, under a millisecond.
--
-- Each expression must match the query that uses it character for
-- character, or the planner will not use it:
--   max(nullif(substring(<column> from '[0-9]+$'), '')::int)
-- A counter table would be O(1) too, but it is state that must stay in step
-- with the rows, and the fixture and the perf generator insert numbered rows
-- directly.

CREATE INDEX idx_journal_entries_number_seq
    ON journal_entries (tenant_id, (nullif(substring(entry_number from '[0-9]+$'), '')::int));
CREATE INDEX idx_invoices_number_seq
    ON invoices (tenant_id, (nullif(substring(invoice_number from '[0-9]+$'), '')::int));
CREATE INDEX idx_payments_number_seq
    ON payments (tenant_id, (nullif(substring(payment_number from '[0-9]+$'), '')::int));
CREATE INDEX idx_invoice_credits_number_seq
    ON invoice_credits (tenant_id, (nullif(substring(credit_number from '[0-9]+$'), '')::int));
CREATE INDEX idx_time_tracking_entries_number_seq
    ON time_tracking_entries (tenant_id, (nullif(substring(entry_id from '[0-9]+$'), '')::int));
CREATE INDEX idx_tasks_number_seq
    ON tasks (tenant_id, (nullif(substring(task_number from '[0-9]+$'), '')::int));
CREATE INDEX idx_projects_number_seq
    ON projects (tenant_id, (nullif(substring(project_number from '[0-9]+$'), '')::int));
CREATE INDEX idx_pm_task_comments_number_seq
    ON pm_task_comments (tenant_id, (nullif(substring(comment_id from '[0-9]+$'), '')::int));
CREATE INDEX idx_pm_objectives_number_seq
    ON pm_objectives (tenant_id, (nullif(substring(objective_number from '[0-9]+$'), '')::int));

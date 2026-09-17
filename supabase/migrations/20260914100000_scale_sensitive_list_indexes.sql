-- List pages on SCALE_SENSITIVE tables paginate with LIMIT/OFFSET, but a
-- LIMIT after an unindexed ORDER BY still forces a full scan and sort before
-- the limit can apply. Each index here matches an existing page's ORDER BY
-- exactly, so the paginated query can walk the index in order and stop after
-- one page instead of touching every row.

CREATE INDEX IF NOT EXISTS idx_invoices_date
  ON invoices (tenant_id, invoice_date DESC, invoice_number DESC);

CREATE INDEX IF NOT EXISTS idx_bills_date
  ON bills (tenant_id, bill_date DESC, bill_number DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date
  ON journal_entries (tenant_id, entry_date DESC, entry_number DESC);

CREATE INDEX IF NOT EXISTS idx_hr_attendance_date
  ON hr_attendance (tenant_id, attendance_date DESC);

CREATE INDEX IF NOT EXISTS idx_hr_onboarding_tasks_due_date
  ON hr_onboarding_tasks (tenant_id, due_date ASC, task_id ASC);

-- bankAccounts() runs a feed_balance lookup (ORDER BY transaction_date DESC,
-- created_at DESC LIMIT 1) and an unmatched_count per bank account; both were
-- falling back to a full scan of bank_transactions per account.
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date
  ON bank_transactions (tenant_id, bank_account_id, transaction_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_status
  ON bank_transactions (tenant_id, bank_account_id, status);

-- bankTransactions() and the /accounting/banking page's default (unfiltered
-- by account) view sort every transaction, tenant-wide.
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date
  ON bank_transactions (tenant_id, transaction_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_tracking_entries_date
  ON time_tracking_entries (tenant_id, entry_date DESC, created_at DESC);

-- NULLS LAST, explicitly: feedback_date is nullable and the page's own
-- `ORDER BY ... DESC NULLS LAST` doesn't match a DESC index's default null
-- ordering (NULLS FIRST) — without this the index looks identical to the
-- query's sort and still goes unused, silently, for every nullable-date
-- SCALE_SENSITIVE column ordered DESC NULLS LAST.
CREATE INDEX IF NOT EXISTS idx_hr_feedback_date
  ON hr_feedback (tenant_id, feedback_date DESC NULLS LAST, feedback_id ASC);

-- cycleProgress() filters on cycle_code alone; hr_reviews had no index
-- covering it.
CREATE INDEX IF NOT EXISTS idx_hr_reviews_cycle_code
  ON hr_reviews (tenant_id, cycle_code);

-- Batched task counts (projects.repo.ts's taskCountsFor) and the project
-- detail board (tasksFor) both filter tasks by project_id — idx_tasks_project_id
-- already covers this; task_count aggregates by status additionally benefit
-- from including status.
CREATE INDEX IF NOT EXISTS idx_tasks_project_status
  ON tasks (tenant_id, project_id, status);

-- Covering (INCLUDE) indexes: the aggregate itself (sum of amount/discount,
-- sum of debits/credits) still has to touch every matching row, but an
-- Index Only Scan means "touch" is a heap-free index tuple read instead of
-- a random heap fetch per row — this is what actually moved
-- /accounting/invoices/[id] from ~92ms to ~35ms for one heavily-lined
-- invoice; the ORDER BY indexes above don't help a correlated aggregate
-- subquery at all.
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_totals
  ON invoice_lines (tenant_id, invoice_id) INCLUDE (amount, discount_amount);

CREATE INDEX IF NOT EXISTS idx_bill_lines_bill_totals
  ON bill_lines (tenant_id, bill_id) INCLUDE (amount);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry_totals
  ON journal_entry_lines (tenant_id, entry_id) INCLUDE (debit_amount, credit_amount);

-- candidatePaymentsForTransactions' per-transaction LATERAL search filters
-- payments by currency before sorting by amount closeness.
CREATE INDEX IF NOT EXISTS idx_payments_currency
  ON payments (tenant_id, currency);

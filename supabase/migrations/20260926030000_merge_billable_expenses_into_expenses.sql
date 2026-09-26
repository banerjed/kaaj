-- `time_tracking_billable_expenses` described the same event as `expenses` —
-- an employee spending money — from time tracking's side, with its own
-- approval, receipt and reimbursement columns. The fixture held the same
-- airfare in both. Neither side has an application yet (expense tracking and
-- billable expenses are both unbuilt), so this is the cheap moment to keep one.
--
-- `expenses` survives: it is wired into accounting (GL category, bill,
-- payment, journal entry) and already finance-only under RLS. What billing a
-- customer adds is a handful of columns, not a second table.

-- One statement, so the merge is all-or-nothing however it is applied: the
-- Supabase CLI and ci-database.sh do not agree on wrapping a file in a
-- transaction, and a half-applied merge could add the columns and
-- still leave the table it replaces.
DO $merge$
DECLARE
  n bigint;
BEGIN
-- Errors instead of silently filtering if this ever runs as a role RLS
-- applies to: every table here is FORCE ROW LEVEL SECURITY, and a filtered
-- count would read zero and then drop a table that still holds rows.
PERFORM set_config('row_security', 'off', true);

-- No application code ever wrote this table, and an `expenses` row needs a
-- GL category and a base-currency amount that a billable row never recorded.
-- Inventing either would be worse than stopping.
SELECT count(*) INTO n FROM time_tracking_billable_expenses;
IF n > 0 THEN
  RAISE EXCEPTION '% time_tracking_billable_expenses row(s) exist. Move each into expenses with a GL category_account_id and base_amount, then re-run; nothing has been changed.', n;
END IF;

ALTER TABLE expenses
  ADD COLUMN project_id        uuid CONSTRAINT fk_expenses_project_id  REFERENCES projects(id),
  ADD COLUMN customer_id       uuid CONSTRAINT fk_expenses_customer_id REFERENCES customers(id),
  ADD COLUMN is_billable       boolean NOT NULL DEFAULT false,
  ADD COLUMN markup_percentage numeric(18,4),
  ADD COLUMN markup_amount     numeric(15,2),
  ADD COLUMN billable_amount   numeric(15,2),
  ADD COLUMN invoice_id        uuid CONSTRAINT fk_expenses_invoice_id  REFERENCES invoices(id),
  ADD COLUMN invoiced_at       timestamptz,
  -- Billing someone means knowing who: a billable expense names the customer.
  ADD CONSTRAINT expenses_billable_has_customer
    CHECK (NOT is_billable OR customer_id IS NOT NULL);

CREATE INDEX idx_expenses_project_id  ON expenses (tenant_id, project_id);
CREATE INDEX idx_expenses_customer_id ON expenses (tenant_id, customer_id);

DROP TABLE time_tracking_billable_expenses;

END $merge$;

-- Credit memos: a reversing entry against an issued invoice that isn't a
-- cash receipt (Dr Revenue / Cr AR), so it cannot be modeled as another
-- `payment_allocations` row — `recomputeInvoiceTotals` derives `amount_paid`
-- solely from `payment_allocations`, and overloading that column with a
-- non-cash reduction would make "Amount Paid" a lie on every invoice it
-- touches. `amount_credited` is a new, separate figure instead.

ALTER TABLE invoices
    ADD COLUMN amount_credited      DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN base_amount_credited DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- L63-shaped: recreating a CHECK is not a diff, restate every clause. Adds
-- amount_credited/base_amount_credited to the existing non-negativity and
-- reconciliation terms; every other clause is unchanged from the original
-- ck_invoices_amounts_reconcile (20260827000001_initial_schema.sql).
ALTER TABLE invoices DROP CONSTRAINT ck_invoices_amounts_reconcile;
ALTER TABLE invoices ADD CONSTRAINT ck_invoices_amounts_reconcile CHECK (
    subtotal >= 0 AND tax_total >= 0 AND total >= 0
    AND amount_paid >= 0 AND amount_due >= 0 AND amount_credited >= 0
    AND base_subtotal >= 0 AND base_tax_total >= 0 AND base_total >= 0
    AND base_amount_paid >= 0 AND base_amount_due >= 0 AND base_amount_credited >= 0
    AND total = (subtotal + tax_total)
    AND amount_due = (total - amount_paid - amount_credited)
    AND base_total = (base_subtotal + base_tax_total)
    AND base_amount_due = (base_total - base_amount_paid - base_amount_credited)
);

-- One table for a credit memo today; a future bad-debt write-off (needs a
-- Bad Debt Expense account this chart of accounts doesn't have yet) adds a
-- `credit_type` column here rather than a second, near-identical table —
-- deferred rather than built ahead of need (US-ACC-020, second half).
CREATE TABLE invoice_credits (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id       UUID NOT NULL REFERENCES invoices(id),
    credit_number    VARCHAR(50) NOT NULL,
    currency         VARCHAR(3) NOT NULL,
    amount           DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    exchange_rate    DECIMAL(12, 6) NOT NULL DEFAULT 1.0,
    base_amount      DECIMAL(15, 2) NOT NULL CHECK (base_amount > 0),
    reason           TEXT NOT NULL,
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by       UUID
);

CREATE INDEX idx_invoice_credits_invoice_id ON invoice_credits (tenant_id, invoice_id);
CREATE UNIQUE INDEX idx_invoice_credits_number ON invoice_credits (tenant_id, credit_number);

ALTER TABLE invoice_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_credits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoice_credits
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- Same four RESTRICTIVE policies every accounting table carries
-- (20260903045821_accounting_row_visibility.sql) — written directly rather
-- than re-running that migration's DO block, since migrations are
-- forward-only and that one is already applied.
CREATE POLICY accounting_read ON public.invoice_credits AS RESTRICTIVE
    FOR SELECT TO public USING ((SELECT app.reads_all_accounting()));

CREATE POLICY accounting_insert ON public.invoice_credits AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_update ON public.invoice_credits AS RESTRICTIVE
    FOR UPDATE TO public
    USING ((SELECT app.writes_accounting()))
    WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_delete ON public.invoice_credits AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_accounting()));

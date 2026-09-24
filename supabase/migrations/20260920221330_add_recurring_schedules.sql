-- US-ACC-004: recurring invoice templates for subscription customers.
-- `invoices.is_recurring`/`recurring_schedule_id` were columns with no
-- table to point at; this adds it and wires the FK.

CREATE TABLE recurring_schedules (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id           UUID NOT NULL REFERENCES customers(id),
    -- Vocabulary lives in accounting.repo.ts (RECURRING_FREQUENCIES), not a
    -- CHECK — same convention as bank_reconciliation_rules.transaction_type.
    frequency             VARCHAR(20) NOT NULL,
    next_run_date         DATE NOT NULL,
    -- A plain day count, not a "Net 30"-style label parsed for its number —
    -- payment_terms below is copied onto each generated invoice as free text
    -- exactly as the manual create-invoice form treats it, independently of
    -- the due date. due_in_days is the only thing that actually computes it.
    due_in_days           INTEGER NOT NULL DEFAULT 30,
    -- Fixed at schedule setup, same limitation the manual create-invoice
    -- form already has (a person enters the rate current at creation time;
    -- nothing here refreshes it per run) — not a new gap this feature adds.
    exchange_rate         DECIMAL(12, 6) NOT NULL DEFAULT 1.0,
    payment_terms         VARCHAR(50),
    notes                 TEXT,
    -- One element per generated invoice line, same shape as NewInvoiceLine
    -- (description, quantity, unitPrice, discountPercent, taxAmount,
    -- taxRateId) — money fields are JSON strings, never numbers (CLAUDE.md
    -- § Money; registered in verify-invariants.sql's money/jsonb-is-text).
    template_lines        JSONB NOT NULL,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE INDEX idx_recurring_schedules_tenant_id ON recurring_schedules (tenant_id);

-- The "which schedules are due" query the generate action runs — a partial
-- index so it stays an index scan as the row count grows, same shape as
-- 20260919220647's bank_transactions index.
CREATE INDEX idx_recurring_schedules_due
    ON recurring_schedules (tenant_id, next_run_date)
    WHERE is_active;

ALTER TABLE invoices
    ADD CONSTRAINT fk_invoices_recurring_schedule_id
    FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules(id);

ALTER TABLE recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON recurring_schedules
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- A standing arrangement that will silently bill a customer on its own
-- schedule — same finance-only visibility as bank_reconciliation_rules,
-- reusing the app.reads_all_accounting()/app.writes_accounting() functions
-- from 20260903045821 rather than redefining them.
CREATE POLICY accounting_read ON public.recurring_schedules AS RESTRICTIVE
    FOR SELECT TO public USING ((SELECT app.reads_all_accounting()));

CREATE POLICY accounting_insert ON public.recurring_schedules AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_update ON public.recurring_schedules AS RESTRICTIVE
    FOR UPDATE TO public USING ((SELECT app.writes_accounting()))
    WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_delete ON public.recurring_schedules AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_accounting()));

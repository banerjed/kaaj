-- §11: deferred revenue / prepaid expense amortization — one mechanism, not
-- two (a balance-sheet account draining into a P&L account on a schedule;
-- direction is the only difference between the two). Auto-reversing
-- accruals (the OTHER half of §11) need no new table — both journal entries
-- post immediately via the existing postJournal(), dated the accrual
-- period's end and the next period's start.

CREATE TABLE amortization_schedules (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Vocabulary lives in accounting.repo.ts (AMORTIZATION_KINDS), not a
    -- CHECK — same convention as recurring_schedules.frequency.
    kind                        VARCHAR(20) NOT NULL,
    -- deferred_revenue: this is the LIABILITY draining down.
    -- prepaid_expense:  this is the ASSET draining down.
    balance_sheet_account_id    UUID NOT NULL REFERENCES chart_of_accounts(id),
    -- deferred_revenue: recognized revenue lands here.
    -- prepaid_expense:  recognized expense lands here.
    income_statement_account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    total_amount                DECIMAL(15, 2) NOT NULL,
    periods_total               INTEGER NOT NULL,
    next_run_date               DATE NOT NULL,
    description                 TEXT NOT NULL,
    reference                   VARCHAR(100),
    created_at                  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by                  UUID,
    updated_by                  UUID
);

-- How many periods have posted is COUNTED from journal_entries
-- (source_type = 'amortization', source_id = this row's id) every time it's
-- needed, never stored — the same "recomputed, never incremented" rule as
-- every other denormalized count in this codebase (L58).
CREATE INDEX idx_amortization_schedules_tenant_id ON amortization_schedules (tenant_id);
CREATE INDEX idx_amortization_schedules_due ON amortization_schedules (tenant_id, next_run_date);

ALTER TABLE amortization_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE amortization_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON amortization_schedules
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- A standing arrangement governing future GL postings — same finance-only
-- visibility as recurring_schedules, reusing the app.reads_all_accounting()/
-- app.writes_accounting() functions from 20260903045821.
CREATE POLICY accounting_read ON public.amortization_schedules AS RESTRICTIVE
    FOR SELECT TO public USING ((SELECT app.reads_all_accounting()));

CREATE POLICY accounting_insert ON public.amortization_schedules AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_update ON public.amortization_schedules AS RESTRICTIVE
    FOR UPDATE TO public USING ((SELECT app.writes_accounting()))
    WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_delete ON public.amortization_schedules AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_accounting()));

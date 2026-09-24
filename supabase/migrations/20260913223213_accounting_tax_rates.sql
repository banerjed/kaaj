-- Tier 6 / US-ACC-046: every accounting tax FK (invoice_lines, bill_lines,
-- chart_of_accounts, journal_entry_lines, customers) points at
-- payroll_tax_rates(id) — a payroll income-tax table, not a sales-tax /
-- jurisdiction table. Nothing in application code writes tax_rate_id today
-- (invoices/bills carry a manually-typed tax_amount per line), so this is a
-- pure model fix: a real `tax_rates` table, the five FKs repointed at it, and
-- the fixture's three sales-tax/VAT rows moved out of payroll_tax_rates,
-- which held them only because the FK forced them there.

CREATE TABLE tax_rates (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code                     VARCHAR(50) NOT NULL,
    tax_name                 VARCHAR(255) NOT NULL,
    tax_type                 tax_type NOT NULL,
    rate                     DECIMAL(8, 5) NOT NULL CHECK (rate >= 0),
    country                  VARCHAR(2) NOT NULL,
    region                   VARCHAR(100),
    jurisdiction             VARCHAR(255),
    is_reverse_charge        BOOLEAN NOT NULL DEFAULT FALSE,
    -- Output tax collected on sales (a liability) and input tax paid on
    -- purchases (recoverable) — the same two-account shape
    -- payroll_tax_rates already used for its own (misplaced) rows.
    tax_collected_account_id UUID REFERENCES chart_of_accounts(id),
    tax_paid_account_id      UUID REFERENCES chart_of_accounts(id),
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from           DATE NOT NULL,
    effective_to             DATE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by               UUID,
    updated_by               UUID,
    UNIQUE (tenant_id, code)
);

CREATE INDEX idx_tax_rates_tax_collected_account_id ON tax_rates (tenant_id, tax_collected_account_id);
CREATE INDEX idx_tax_rates_tax_paid_account_id ON tax_rates (tenant_id, tax_paid_account_id);
CREATE INDEX idx_tax_rates_is_active ON tax_rates (tenant_id, is_active);
CREATE INDEX idx_tax_rates_created ON tax_rates (tenant_id, created_at DESC);

ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tax_rates
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- Same four RESTRICTIVE policies every accounting table carries
-- (20260903045821_accounting_row_visibility.sql) — written directly rather
-- than re-running that migration's DO block, since migrations are
-- forward-only and that one is already applied (see invoice_credits,
-- 20260913020000_invoice_credits.sql, for the same shape).
CREATE POLICY accounting_read ON public.tax_rates AS RESTRICTIVE
    FOR SELECT TO public USING ((SELECT app.reads_all_accounting()));

CREATE POLICY accounting_insert ON public.tax_rates AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_update ON public.tax_rates AS RESTRICTIVE
    FOR UPDATE TO public
    USING ((SELECT app.writes_accounting()))
    WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_delete ON public.tax_rates AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_accounting()));

-- ---------------------------------------------------------------------------
-- Repoint the five FKs at tax_rates instead of payroll_tax_rates
-- ---------------------------------------------------------------------------
-- Same constraint names as the originals (20260827000001_initial_schema.sql)
-- — this is a retarget, not a rename.

ALTER TABLE invoice_lines DROP CONSTRAINT fk_invoice_lines_tax_rate_id;
ALTER TABLE invoice_lines ADD CONSTRAINT fk_invoice_lines_tax_rate_id
    FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id);

ALTER TABLE bill_lines DROP CONSTRAINT fk_bill_lines_tax_rate_id;
ALTER TABLE bill_lines ADD CONSTRAINT fk_bill_lines_tax_rate_id
    FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id);

ALTER TABLE chart_of_accounts DROP CONSTRAINT fk_chart_of_accounts_tax_rate_id;
ALTER TABLE chart_of_accounts ADD CONSTRAINT fk_chart_of_accounts_tax_rate_id
    FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id);

ALTER TABLE journal_entry_lines DROP CONSTRAINT fk_journal_entry_lines_tax_rate_id;
ALTER TABLE journal_entry_lines ADD CONSTRAINT fk_journal_entry_lines_tax_rate_id
    FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id);

ALTER TABLE customers DROP CONSTRAINT fk_customers_tax_rate_id;
ALTER TABLE customers ADD CONSTRAINT fk_customers_tax_rate_id
    FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id);

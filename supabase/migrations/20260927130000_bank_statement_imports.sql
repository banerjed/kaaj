-- Bank statement import (CSV, OFX, QFX) into bank_transactions.
--
-- bank_statement_imports records every import: which file (by SHA-256),
-- which mapping read it, and what it did — how many lines, how many new,
-- how many already present. Each imported transaction points back at its
-- import, so "where did this line come from?" always has an answer
-- (SOC 2 PI1.2, docs/testplan-soc2.md). Append-only: no DELETE is granted
-- anywhere in this schema, and an import is a fact, not a draft.
--
-- bank_accounts.statement_import_profile keeps the CSV mapping a person
-- confirmed for that account, so the next statement from the same bank is
-- one click. It stores column roles and formats only — no values.
--
-- Duplicate protection already exists: idx_bank_transactions_external_id is
-- UNIQUE (tenant_id, bank_account_id, bank_transaction_id) WHERE
-- bank_transaction_id IS NOT NULL, and the importer sets bank_transaction_id
-- to the statement's own id (OFX FITID) or a stable fingerprint.

CREATE TABLE bank_statement_imports (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bank_account_id        UUID NOT NULL
        CONSTRAINT fk_bank_statement_imports_bank_account_id REFERENCES bank_accounts(id),
    file_name              VARCHAR(255) NOT NULL,
    file_format            VARCHAR(10) NOT NULL
        CONSTRAINT bank_statement_imports_file_format_check CHECK (file_format IN ('csv', 'ofx')),
    file_sha256            CHAR(64) NOT NULL,
    -- The CSV mapping that read the file; NULL for OFX, which needs none.
    mapping                JSONB,
    lines_in_file          INTEGER NOT NULL,
    transactions_in_file   INTEGER NOT NULL,
    transactions_imported  INTEGER NOT NULL,
    duplicates_skipped     INTEGER NOT NULL,
    period_start           DATE,
    period_end             DATE,
    balance_check          VARCHAR(20) NOT NULL
        CONSTRAINT bank_statement_imports_balance_check_check CHECK (balance_check IN ('passed', 'unavailable')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by             UUID NOT NULL,
    CONSTRAINT bank_statement_imports_counts_check CHECK (
        transactions_imported >= 0 AND duplicates_skipped >= 0
        AND transactions_imported + duplicates_skipped = transactions_in_file
    )
);

CREATE INDEX idx_bank_statement_imports_account
    ON bank_statement_imports (tenant_id, bank_account_id, created_at DESC);

ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statement_imports FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON bank_statement_imports
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- The same four RESTRICTIVE policies every accounting table carries
-- (20260903045821): finance reads, finance-minus-auditor writes. Stated in
-- full rather than looped, so each modifier is visible in review (L63).
CREATE POLICY accounting_read ON bank_statement_imports AS RESTRICTIVE
    FOR SELECT TO public USING ((SELECT app.reads_all_accounting()));
CREATE POLICY accounting_insert ON bank_statement_imports AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_accounting()));
CREATE POLICY accounting_update ON bank_statement_imports AS RESTRICTIVE
    FOR UPDATE TO public USING ((SELECT app.writes_accounting()))
    WITH CHECK ((SELECT app.writes_accounting()));
CREATE POLICY accounting_delete ON bank_statement_imports AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_accounting()));

ALTER TABLE bank_transactions
    ADD COLUMN import_id UUID
        CONSTRAINT fk_bank_transactions_import_id REFERENCES bank_statement_imports(id);

CREATE INDEX idx_bank_transactions_import_id ON bank_transactions (tenant_id, import_id);

ALTER TABLE bank_accounts ADD COLUMN statement_import_profile JSONB;

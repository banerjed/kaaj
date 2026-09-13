-- A credit memo and a bad-debt write-off both reduce a receivable without
-- cash and share every mechanic in invoice_credits (numbering, the reversing
-- journal entry, recomputeInvoiceTotals) — only which account they debit and
-- what closes the invoice differ. `credit_type` distinguishes them the same
-- way journal_entries.source_type does: plain varchar, no CHECK, the
-- vocabulary lives in accounting.repo.ts (L57).
ALTER TABLE invoice_credits
    ADD COLUMN credit_type VARCHAR(20) NOT NULL DEFAULT 'credit_memo';

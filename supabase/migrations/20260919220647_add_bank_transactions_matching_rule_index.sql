-- applyReconciliationRules() (US-ACC-029) recomputes each rule's
-- times_applied by counting bank_transactions rows currently pointing at it
-- (L58: recomputed, never incremented). bank_transactions is SCALE_SENSITIVE
-- and carried no index on matching_rule_id, so that count would be a full
-- table scan per rule. Partial, since matching_rule_id is NULL on every
-- transaction that was never rule-categorized — the common case.
CREATE INDEX idx_bank_transactions_matching_rule_id
    ON bank_transactions (tenant_id, matching_rule_id)
    WHERE matching_rule_id IS NOT NULL;

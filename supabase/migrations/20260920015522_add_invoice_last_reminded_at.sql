-- US-ACC-003: track when a payment reminder was last emailed for an invoice,
-- so a second click the same day doesn't re-send. NULL means "never
-- reminded" — a legitimate, common state, not an omission.
ALTER TABLE invoices ADD COLUMN last_reminded_at TIMESTAMPTZ;

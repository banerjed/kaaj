-- =============================================================================
-- Kaaj — money is NUMERIC, never a binary float
-- =============================================================================
-- Four columns were declared `real`, which loses digits on round-trip (see
-- CLAUDE.md § Money). All affected tables are empty today, so the conversion
-- is lossless; `clients.default_hourly_rate` is a rate, not an amount, so it
-- gets (18,4) rather than the (15,2) money scale.
-- =============================================================================

ALTER TABLE firm_benefits_plans
    ALTER COLUMN employee_cost_monthly TYPE numeric(15,2),
    ALTER COLUMN employer_cost_monthly TYPE numeric(15,2),
    ALTER COLUMN total_premium_monthly TYPE numeric(15,2);

ALTER TABLE clients
    ALTER COLUMN default_hourly_rate TYPE numeric(18,4);

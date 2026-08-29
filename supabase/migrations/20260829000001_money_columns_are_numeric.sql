-- =============================================================================
-- Kaaj — money is NUMERIC, never a binary float
-- =============================================================================
-- Four columns holding money were declared `real` — 32-bit IEEE-754, roughly
-- seven significant decimal digits. Round-tripped through the live database:
--
--     stored 12345.678   ->  returns 12345.7
--     stored 99999.99    ->  returns 100000        <- a whole unit
--     stored 1234567.89  ->  returns 1234570       <- off by 2.89
--
-- The digits are gone before any application code sees them, so no amount of
-- careful rounding downstream can recover them. A benefits premium of
-- 99,999.99 becoming 100,000.00 is a reporting error at best and a billing
-- error at worst.
--
-- All four tables are empty in every environment this has run against, so the
-- conversion is lossless today. It would not be later, which is why it happens
-- now rather than when payroll starts reading these columns.
--
-- Scale follows the convention adopted in CLAUDE.md:
--     numeric(15,2)  money
--     numeric(18,4)  rates, quantities, hours
--
-- `clients.default_hourly_rate` is a RATE, not an amount, so it takes (18,4) —
-- a rate of 12.3456 per hour is meaningful, and rounding it to the cent before
-- multiplying by hours would compound the error across a timesheet.
-- =============================================================================

ALTER TABLE firm_benefits_plans
    ALTER COLUMN employee_cost_monthly TYPE numeric(15,2),
    ALTER COLUMN employer_cost_monthly TYPE numeric(15,2),
    ALTER COLUMN total_premium_monthly TYPE numeric(15,2);

ALTER TABLE clients
    ALTER COLUMN default_hourly_rate TYPE numeric(18,4);

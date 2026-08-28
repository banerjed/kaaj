-- =============================================================================
-- Local development seed
-- =============================================================================
-- Declared by config.toml: [db.seed] sql_paths = ["./seed.sql"]
-- Applied automatically by `supabase db reset` AFTER all migrations.
--
-- Loads the Northwind Consulting fixture: one tenant, 12 employees across
-- US/UK/India, 3 currencies. The fixture self-verifies 14 referential and
-- arithmetic invariants and aborts the transaction if any fail, so a bad load
-- leaves the database untouched rather than half-seeded.
--
-- The fixture runs as the connecting role, which for `supabase db reset` is a
-- superuser — RLS is therefore bypassed during seeding, which is intended.
-- To exercise isolation afterwards, connect as `app_user` and set the claim;
-- the fixture prints the exact incantation when it finishes.
-- =============================================================================

\ir ../docs/data-models/mock-data.sql

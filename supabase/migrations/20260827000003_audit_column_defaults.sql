-- =============================================================================
-- Kaaj — make the audit columns actually usable
-- =============================================================================
-- Fixes two defects invisible in the DDL: some created_at/updated_at columns
-- are NOT NULL with no DEFAULT (every INSERT fails), and app.set_updated_at()
-- was defined but never attached to a trigger anywhere.
--
-- Both are fixed generically (via information_schema), not by listing tables,
-- so a later migration can't silently reintroduce them.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Default the timestamps
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND column_name IN ('created_at', 'updated_at')
           AND is_nullable = 'NO'
           AND column_default IS NULL
    LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT now()',
                       col.table_name, col.column_name);
    END LOOP;
END
$$;


-- -----------------------------------------------------------------------------
-- 2. Attach the updated_at trigger everywhere it belongs
-- -----------------------------------------------------------------------------
-- app.set_updated_at() already exists; it has simply never been wired up.

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT c.table_name
          FROM information_schema.columns c
          JOIN information_schema.tables tb
            ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
         WHERE c.table_schema = 'public'
           AND c.column_name = 'updated_at'
           AND tb.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format(
            'CREATE OR REPLACE TRIGGER trg_%s_updated_at
               BEFORE UPDATE ON public.%I
               FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()',
            t.table_name, t.table_name);
    END LOOP;
END
$$;

-- The trigger function lives in `app`; app_user already has USAGE on it from
-- 20260827000002.


-- -----------------------------------------------------------------------------
-- 3. created_by is left alone, deliberately
-- -----------------------------------------------------------------------------
-- Some tables declare created_by NOT NULL with no default. Left alone because
-- the fix (relax the constraint, or define a system principal for
-- system-generated rows) is a product decision, not a migration.

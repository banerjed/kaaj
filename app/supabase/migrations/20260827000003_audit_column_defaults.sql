-- =============================================================================
-- Kaaj — make the audit columns actually usable
-- =============================================================================
-- Found by applying 20260827000001 to a real Postgres 17 and trying to INSERT.
-- Two defects, both invisible to reading the DDL and both fatal on first write.
--
-- 1. 33 of the 90 tables carrying created_at/updated_at declare them
--    NOT NULL with no DEFAULT, while the other 57 default to now(). Every
--    INSERT into those 33 fails:
--        null value in column "created_at" violates not-null constraint
--    The split is an oversight, not a design decision — nothing distinguishes
--    the two groups.
--
-- 2. app.set_updated_at() is defined in the schema and attached to NOTHING.
--    The database has exactly two triggers, both for ticketing search vectors.
--    So updated_at never updates on its own anywhere, on any of the 82 tables
--    that have the column.
--
-- Minimum PostgreSQL: 14, for CREATE OR REPLACE TRIGGER. Supabase provisions 15
-- or 17 depending on when the project was created; both are fine.
--
-- Both are fixed generically rather than by listing tables, so a table added by
-- a later migration cannot reintroduce them silently.
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

-- The trigger function lives in `app`, so every role that writes needs USAGE on
-- that schema. app_user already has it from 20260827000002.


-- -----------------------------------------------------------------------------
-- 3. created_by is left alone, deliberately
-- -----------------------------------------------------------------------------
-- 15 tables declare created_by NOT NULL with no default. That is defensible —
-- an audit trail wants an author — but it means the application must supply it
-- on every insert, and system-generated rows (jobs, imports, the UC-1.1
-- onboarding cascade) need a designated system actor rather than NULL.
--
-- Not changed here because the answer is a product decision, not a migration:
-- either relax the constraint, or define the system principal. Tracked so it is
-- not discovered again at the first background write.

-- DB-004 journal_entries.status accepts only draft, posted, void, reversed.
SELECT 'journal_entries.status has no CHECK constraint or enum' AS problem
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.journal_entries'::regclass AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%')
   AND (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'status') <> 'USER-DEFINED'

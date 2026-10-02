-- DB-001 journal_entry_lines.entry_id has a foreign key to journal_entries.
SELECT 'journal_entry_lines.entry_id has no foreign key' AS problem
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.journal_entry_lines'::regclass AND c.contype = 'f'
      AND c.confrelid = 'public.journal_entries'::regclass
      AND (SELECT attname FROM pg_attribute WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) = 'entry_id')

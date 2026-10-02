-- DB-002 journal_entry_lines.account_id has a foreign key to chart_of_accounts.
SELECT 'journal_entry_lines.account_id has no foreign key' AS problem
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.journal_entry_lines'::regclass AND c.contype = 'f'
      AND c.confrelid = 'public.chart_of_accounts'::regclass
      AND (SELECT attname FROM pg_attribute WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) = 'account_id')

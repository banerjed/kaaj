-- DB-006 a posted entry whose lines do not balance cannot be committed: a deferred constraint trigger.
SELECT 'no deferred constraint trigger checks that an entry balances' AS problem
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.journal_entry_lines'::regclass
      AND NOT t.tgisinternal AND t.tgdeferrable)

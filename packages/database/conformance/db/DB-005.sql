-- DB-005 a posted journal entry with zero lines cannot exist: a constraint trigger refuses it.
SELECT 'no trigger or constraint refuses a posted entry with zero lines' AS problem
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid IN ('public.journal_entries'::regclass, 'public.journal_entry_lines'::regclass)
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%line%')

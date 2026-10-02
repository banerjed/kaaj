-- DB-014 a posted journal entry refuses UPDATE: the restrictive update policy excludes status = 'posted'.
SELECT missing AS problem FROM (VALUES
  ('journal_entries accounting_update policy excluding posted',
   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journal_entries' AND cmd='UPDATE' AND permissive='RESTRICTIVE' AND qual ILIKE '%posted%')),
  ('journal_entry_lines accounting_update policy excluding posted',
   EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journal_entry_lines' AND cmd='UPDATE' AND permissive='RESTRICTIVE' AND qual ILIKE '%posted%'))
) v(missing, present) WHERE NOT present

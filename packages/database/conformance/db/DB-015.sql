-- DB-015 app_user has no DELETE grant on the journal tables.
SELECT table_name, privilege_type AS problem
  FROM information_schema.role_table_grants
 WHERE grantee = 'app_user' AND table_schema = 'public'
   AND table_name IN ('journal_entries', 'journal_entry_lines')
   AND privilege_type = 'DELETE'

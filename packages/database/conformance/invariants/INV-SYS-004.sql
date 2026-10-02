-- INV-SYS-004 Journal atomicity: no posted header without lines; no status
-- outside the enumeration.
SELECT je.entry_number, 'posted header with no lines' AS problem
  FROM journal_entries je
 WHERE je.tenant_id = $1 AND je.status = 'posted'
   AND NOT EXISTS (SELECT 1 FROM journal_entry_lines l WHERE l.entry_id = je.id)
UNION ALL
SELECT je.entry_number, 'status ' || coalesce(je.status, 'NULL')
  FROM journal_entries je
 WHERE je.tenant_id = $1 AND coalesce(je.status, '') NOT IN ('draft', 'posted', 'void', 'reversed')

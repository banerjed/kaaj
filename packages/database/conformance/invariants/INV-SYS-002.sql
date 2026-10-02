-- INV-SYS-002 No orphan lines.
SELECT l.id::text AS line, l.entry_id::text AS entry
  FROM journal_entry_lines l
 WHERE l.tenant_id = $1 AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = l.entry_id)

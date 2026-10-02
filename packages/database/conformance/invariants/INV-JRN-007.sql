-- INV-JRN-007 Valid accounts: every line's account belongs to the tenant and
-- was active.
SELECT je.entry_number, l.account_id::text AS account,
       CASE WHEN c.id IS NULL THEN 'no such account'
            WHEN c.tenant_id <> $1 THEN 'another tenant''s account'
            ELSE 'inactive account' END AS problem
  FROM journal_entries je
  JOIN journal_entry_lines l ON l.entry_id = je.id
  LEFT JOIN chart_of_accounts c ON c.id = l.account_id
 WHERE je.tenant_id = $1 AND je.status = 'posted'
   AND (c.id IS NULL OR c.tenant_id <> $1 OR NOT c.is_active)

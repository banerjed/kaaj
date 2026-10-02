-- INV-JRN-002 Meaningful journal: two or more lines; every line has either a
-- debit or a credit, never both and never neither.
SELECT je.entry_number, 'fewer than two lines' AS problem, count(l.id)::text AS detail
  FROM journal_entries je
  LEFT JOIN journal_entry_lines l ON l.entry_id = je.id
 WHERE je.tenant_id = $1 AND je.status = 'posted'
 GROUP BY je.entry_number
HAVING count(l.id) < 2
UNION ALL
SELECT je.entry_number, 'line with both or neither side', l.debit_amount::text || '/' || l.credit_amount::text
  FROM journal_entries je
  JOIN journal_entry_lines l ON l.entry_id = je.id
 WHERE je.tenant_id = $1 AND je.status = 'posted'
   AND ((l.debit_amount > 0) = (l.credit_amount > 0))

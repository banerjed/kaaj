-- INV-GL-001 Accounting equation: the sum of every posted functional-currency
-- line is zero.
SELECT sum(l.base_debit_amount - l.base_credit_amount)::text AS net
  FROM journal_entry_lines l
  JOIN journal_entries je ON je.id = l.entry_id
 WHERE je.tenant_id = $1 AND je.status = 'posted'
HAVING sum(l.base_debit_amount - l.base_credit_amount) <> 0

-- INV-JRN-001 Balanced journal: every posted entry has sum(debit) = sum(credit),
-- in transaction currency and in functional currency.
SELECT je.entry_number,
       sum(l.debit_amount)::text AS debit, sum(l.credit_amount)::text AS credit,
       sum(l.base_debit_amount)::text AS base_debit, sum(l.base_credit_amount)::text AS base_credit
  FROM journal_entries je
  JOIN journal_entry_lines l ON l.entry_id = je.id
 WHERE je.tenant_id = $1 AND je.status = 'posted'
 GROUP BY je.entry_number
HAVING sum(l.debit_amount) <> sum(l.credit_amount)
    OR sum(l.base_debit_amount) <> sum(l.base_credit_amount)

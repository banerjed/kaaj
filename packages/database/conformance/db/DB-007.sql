-- DB-007 journal_entries.source_id, when present, resolves to a row of the table source_type names.
SELECT je.entry_number, je.source_type, je.source_id::text
  FROM journal_entries je
 WHERE je.tenant_id = $1 AND je.source_id IS NOT NULL
   AND NOT (
        (je.source_type = 'invoice'      AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.source_id))
     OR (je.source_type = 'payment'      AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.source_id))
     OR (je.source_type IN ('credit_memo','write_off') AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.source_id))
     OR (je.source_type = 'bill'         AND EXISTS (SELECT 1 FROM bills b WHERE b.id = je.source_id))
     OR (je.source_type = 'bill_payment' AND EXISTS (SELECT 1 FROM bills b WHERE b.id = je.source_id))
     OR (je.source_type = 'amortization' AND EXISTS (SELECT 1 FROM amortization_schedules s WHERE s.id = je.source_id))
     OR (je.source_type IN ('accrual','accrual_reversal') AND EXISTS (SELECT 1 FROM accounting_periods p WHERE p.id = je.source_id))
     OR (je.source_type IN ('accrual','accrual_reversal') AND EXISTS (SELECT 1 FROM journal_entries o WHERE o.id = je.source_id))
   )

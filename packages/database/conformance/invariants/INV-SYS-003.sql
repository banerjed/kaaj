-- INV-SYS-003 Document and posting agree: an issued invoice or an approved
-- bill has a posted journal entry; a draft has none.
SELECT 'invoice' AS kind, i.invoice_number AS number, i.status,
       CASE WHEN i.journal_entry_id IS NULL THEN 'no journal entry' ELSE 'draft with an entry' END AS problem
  FROM invoices i
 WHERE i.tenant_id = $1
   AND ((i.status NOT IN ('draft', 'void') AND (i.journal_entry_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = i.journal_entry_id AND je.status = 'posted')))
     OR (i.status = 'draft' AND i.journal_entry_id IS NOT NULL))
UNION ALL
SELECT 'bill', b.bill_number, b.status,
       CASE WHEN b.journal_entry_id IS NULL THEN 'no journal entry' ELSE 'draft with an entry' END
  FROM bills b
 WHERE b.tenant_id = $1
   AND ((b.status NOT IN ('draft', 'void') AND (b.journal_entry_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = b.journal_entry_id AND je.status = 'posted')))
     OR (b.status = 'draft' AND b.journal_entry_id IS NOT NULL))

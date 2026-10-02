-- INV-GL-003 Draft has no effect: no posted entry cites a draft document.
SELECT je.entry_number, je.source_type, je.source_id::text
  FROM journal_entries je
 WHERE je.tenant_id = $1 AND je.status = 'posted'
   AND ((je.source_type = 'invoice' AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.source_id AND i.status = 'draft'))
     OR (je.source_type = 'bill'    AND EXISTS (SELECT 1 FROM bills b WHERE b.id = je.source_id AND b.status = 'draft')))

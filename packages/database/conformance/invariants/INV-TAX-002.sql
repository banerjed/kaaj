-- INV-TAX-002 Exclusive tax: total = subtotal + tax_total on every document.
SELECT 'invoice' AS kind, invoice_number AS number, subtotal::text, tax_total::text, total::text
  FROM invoices WHERE tenant_id = $1 AND status <> 'void' AND subtotal + tax_total <> total
UNION ALL
SELECT 'bill', bill_number, subtotal::text, tax_total::text, total::text
  FROM bills WHERE tenant_id = $1 AND status <> 'void' AND subtotal + tax_total <> total

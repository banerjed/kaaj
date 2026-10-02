-- INV-AR-002 Invoice outstanding equation, in transaction currency:
-- total - paid - credited (credit memos and write-offs) = amount_due.
SELECT i.invoice_number, i.total::text AS total, i.amount_paid::text AS paid,
       coalesce(c.credited, 0)::text AS credited, i.amount_due::text AS amount_due
  FROM invoices i
  LEFT JOIN (SELECT invoice_id, sum(amount) AS credited FROM invoice_credits GROUP BY invoice_id) c
    ON c.invoice_id = i.id
 WHERE i.tenant_id = $1 AND i.status NOT IN ('draft', 'void')
   AND i.total - i.amount_paid - coalesce(c.credited, 0) <> i.amount_due

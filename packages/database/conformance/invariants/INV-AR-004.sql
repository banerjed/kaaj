-- INV-AR-004 Allocation is bounded: paid plus credited never exceeds total;
-- no allocation is negative.
SELECT i.invoice_number, 'over-allocated' AS problem,
       (i.amount_paid + coalesce(c.credited, 0))::text || ' of ' || i.total::text AS detail
  FROM invoices i
  LEFT JOIN (SELECT invoice_id, sum(amount) AS credited FROM invoice_credits GROUP BY invoice_id) c
    ON c.invoice_id = i.id
 WHERE i.tenant_id = $1 AND i.amount_paid + coalesce(c.credited, 0) > i.total
UNION ALL
SELECT i.invoice_number, 'negative allocation', a.amount::text
  FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id
 WHERE a.tenant_id = $1 AND a.amount < 0

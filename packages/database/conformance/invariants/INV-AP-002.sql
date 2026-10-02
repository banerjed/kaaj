-- INV-AP-002 Bill outstanding equation: total - paid = amount_due.
SELECT b.bill_number, b.total::text AS total, b.amount_paid::text AS paid, b.amount_due::text AS amount_due
  FROM bills b
 WHERE b.tenant_id = $1 AND b.status NOT IN ('draft', 'void')
   AND b.total - b.amount_paid <> b.amount_due

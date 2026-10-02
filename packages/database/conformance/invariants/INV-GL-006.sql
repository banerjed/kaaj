-- INV-GL-006 No posting after a close: a posted entry dated in a closed period
-- was posted before that period closed.
SELECT je.entry_number, p.period_name, je.posted_at::text AS posted_at, p.closed_at::text AS closed_at
  FROM journal_entries je
  JOIN accounting_periods p ON p.tenant_id = je.tenant_id
   AND je.entry_date BETWEEN p.start_date AND p.end_date
 WHERE je.tenant_id = $1 AND je.status = 'posted'
   AND p.status <> 'open' AND p.closed_at IS NOT NULL AND je.posted_at > p.closed_at

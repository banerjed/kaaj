-- DB-010 accounting periods of one fiscal year neither overlap nor leave a gap.
SELECT a.period_name, b.period_name, 'overlap' AS problem
  FROM accounting_periods a JOIN accounting_periods b
    ON a.tenant_id = b.tenant_id AND a.id < b.id AND a.start_date <= b.end_date AND b.start_date <= a.end_date
 WHERE a.tenant_id = $1
UNION ALL
SELECT p.period_name, n.period_name, 'gap'
  FROM accounting_periods p
  JOIN LATERAL (SELECT period_name, start_date FROM accounting_periods q
                 WHERE q.tenant_id = p.tenant_id AND q.start_date > p.end_date
                 ORDER BY q.start_date LIMIT 1) n ON true
 WHERE p.tenant_id = $1 AND p.fiscal_year = 2026 AND n.start_date <> p.end_date + 1
   AND EXISTS (SELECT 1 FROM accounting_periods q WHERE q.tenant_id = p.tenant_id AND q.fiscal_year = 2026 AND q.start_date = n.start_date)

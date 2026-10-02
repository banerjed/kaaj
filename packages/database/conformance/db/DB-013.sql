-- DB-013 gl_daily_balances agrees with journal_entry_lines (the same check as INV-GL-002).
WITH lines AS (
  SELECT l.account_id, je.entry_date AS balance_date,
         sum(l.base_debit_amount) AS d, sum(l.base_credit_amount) AS c, count(*) AS n
    FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.entry_id
   WHERE je.tenant_id = $1 AND je.status = 'posted'
   GROUP BY l.account_id, je.entry_date),
cached AS (
  SELECT account_id, balance_date, base_debit, base_credit, line_count FROM gl_daily_balances WHERE tenant_id = $1)
SELECT coalesce(x.balance_date, b.balance_date)::text AS day
  FROM lines x FULL OUTER JOIN cached b ON b.account_id = x.account_id AND b.balance_date = x.balance_date
 WHERE x.account_id IS NULL OR b.account_id IS NULL OR x.d <> b.base_debit OR x.c <> b.base_credit OR x.n <> b.line_count

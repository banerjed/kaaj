-- INV-AR-001 AR control reconciles: balance(ACCOUNTS_RECEIVABLE) equals the
-- functional-currency amount due over every issued invoice.
WITH gl AS (
  SELECT coalesce(sum(l.base_debit_amount - l.base_credit_amount), 0) AS bal
    FROM journal_entry_lines l
    JOIN journal_entries je ON je.id = l.entry_id
    JOIN chart_of_accounts c ON c.id = l.account_id
   WHERE je.tenant_id = $1 AND je.status = 'posted' AND c.account_code = '1100'),
sub AS (
  SELECT coalesce(sum(base_amount_due), 0) AS due
    FROM invoices WHERE tenant_id = $1 AND status NOT IN ('draft', 'void'))
SELECT gl.bal::text AS gl_receivable, sub.due::text AS subledger_receivable
  FROM gl, sub WHERE gl.bal <> sub.due

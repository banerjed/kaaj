-- Finance beyond the core ledger: credit memos and write-offs for the
-- invoices 50_accounting.sql marked credited / written_off (each with the
-- journal entry the app posts — revenue reversed for a credit, bad debt for a
-- write-off), monthly bank statement imports that the statement lines belong
-- to, and monthly payroll runs per country.

-- ---------------------------------------------------------------- credits
CREATE TEMP TABLE _cr AS
SELECT row_number() OVER (ORDER BY i.invoice_date, i.id) AS n, i.id AS invoice_id,
       i.invoice_number, i.status, i.currency, i.exchange_rate AS fx, i.total, i.base_total,
       least(_perf.as_of(), i.invoice_date + 75) AS d
  FROM invoices i
 WHERE i.tenant_id = _perf.tenant() AND i.status IN ('credited', 'written_off');

CREATE TEMP TABLE _cr_je AS
SELECT c.*, _perf.u('je', 10000000 + c.n) AS je_id,
       (SELECT coalesce(max(nullif(substring(entry_number FROM '[0-9]+$'), '')::int), 0)
          FROM journal_entries WHERE tenant_id = _perf.tenant()) + c.n AS seq
  FROM _cr c;

INSERT INTO journal_entries (id, tenant_id, entry_number, entry_date, source_type, source_id,
                             description, reference, status, accounting_period, fiscal_year,
                             posted_at, created_at)
SELECT c.je_id, _perf.tenant(), 'JE-' || extract(year FROM c.d) || '-' || _perf.pad(c.seq, 4),
       c.d, 'invoice_credit', c.invoice_id,
       CASE c.status WHEN 'credited' THEN 'Credit memo' ELSE 'Written off' END || ' ' || c.invoice_number,
       c.invoice_number, 'posted', to_char(c.d, 'YYYY-MM'), extract(year FROM c.d)::int,
       c.d::timestamptz, c.d::timestamptz
  FROM _cr_je c;

INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, line_number, currency,
                                 debit_amount, credit_amount, exchange_rate, base_currency,
                                 base_debit_amount, base_credit_amount, description)
SELECT _perf.tenant(), _perf.u('jel', 1000000000 + c.n * 10 + l.line), c.je_id,
       _perf.u('coa', l.acct), l.line, c.currency, l.dr, l.cr, c.fx, 'USD', l.bdr, l.bcr,
       CASE c.status WHEN 'credited' THEN 'Credit memo' ELSE 'Write-off' END
  FROM _cr_je c
  CROSS JOIN LATERAL (VALUES
    (1, CASE c.status WHEN 'credited' THEN 4000 ELSE 5500 END, c.total, 0::numeric, c.base_total, 0::numeric),
    (2, 1100, 0::numeric, c.total, 0::numeric, c.base_total)) l(line, acct, dr, cr, bdr, bcr);

INSERT INTO invoice_credits (id, tenant_id, invoice_id, credit_number, currency, amount,
                             exchange_rate, base_amount, reason, journal_entry_id, credit_type,
                             created_at)
SELECT _perf.u('credit', c.n), _perf.tenant(), c.invoice_id, 'CN-' || _perf.pad(c.n, 5),
       c.currency, c.total, c.fx, c.base_total,
       CASE c.status WHEN 'credited' THEN 'Disputed scope, agreed with the customer'
                     ELSE 'Customer ceased trading' END,
       c.je_id, CASE c.status WHEN 'credited' THEN 'credit_memo' ELSE 'write_off' END,
       c.d::timestamptz
  FROM _cr_je c;

-- ---------------------------------------------------------------- statement imports
-- One import per bank account per month, owning that month's statement lines.
CREATE TEMP TABLE _imp AS
SELECT row_number() OVER (ORDER BY b.bank_account_id, b.month) AS n, b.bank_account_id, b.month,
       count(*) AS lines, min(b.transaction_date) AS first_day, max(b.transaction_date) AS last_day
  FROM (SELECT bank_account_id, transaction_date, date_trunc('month', transaction_date)::date AS month
          FROM bank_transactions WHERE tenant_id = _perf.tenant()) b
 GROUP BY b.bank_account_id, b.month;

INSERT INTO bank_statement_imports (id, tenant_id, bank_account_id, file_name, file_format,
                                    file_sha256, mapping, lines_in_file, transactions_in_file,
                                    transactions_imported, duplicates_skipped, period_start,
                                    period_end, balance_check, created_at, created_by)
SELECT _perf.u('import', i.n), _perf.tenant(), i.bank_account_id,
       'statement-' || to_char(i.month, 'YYYY-MM') || '.csv',
       CASE WHEN i.n % 4 = 0 THEN 'ofx' ELSE 'csv' END,
       md5('perf-import:' || i.n) || md5('perf-import2:' || i.n),
       '{"delimiter":",","columns":["date","description","amount","balance"],"dateFormat":"YYYY-MM-DD","decimal":".","invertSign":false}'::jsonb,
       i.lines + 1, i.lines, i.lines, 0, i.first_day, i.last_day, 'passed',
       (i.last_day + 2)::timestamptz,
       (SELECT employee_id FROM _perf.actors WHERE actor = 'finance')
  FROM _imp i;

UPDATE bank_transactions t SET
       import_id = _perf.u('import', i.n),
       statement_sequence = s.seq - 1
  FROM (SELECT id, bank_account_id, date_trunc('month', transaction_date)::date AS month,
               row_number() OVER (PARTITION BY bank_account_id, date_trunc('month', transaction_date)
                                  ORDER BY transaction_date, id) AS seq
          FROM bank_transactions WHERE tenant_id = _perf.tenant()) s
  JOIN _imp i ON i.bank_account_id = s.bank_account_id AND i.month = s.month
 WHERE t.id = s.id;

-- ---------------------------------------------------------------- payroll
-- Monthly runs per country over two years. Money in JSONB is a string (L41).
CREATE TEMP TABLE _runs AS
SELECT row_number() OVER (ORDER BY m, c.country) AS n, c.country, c.currency,
       (date_trunc('month', _perf.as_of()) - m * interval '1 month')::date AS period_start
  FROM generate_series(0, 23) m
  CROSS JOIN (VALUES ('US','USD'), ('GB','GBP'), ('IN','INR'), ('DE','EUR')) c(country, currency);

INSERT INTO payroll_runs (id, tenant_id, run_id, run_number, pay_period_start, pay_period_end,
                          pay_date, run_type, run_status, status, country, currency,
                          calculated_at, calculated_by, approved_at, approved_by, finalized_at,
                          created_at)
SELECT _perf.u('payroll_run', r.n), _perf.tenant(),
       'PR-' || r.country || '-' || to_char(r.period_start, 'YYYY-MM'),
       'PR-' || r.country || '-' || to_char(r.period_start, 'YYYY-MM'),
       r.period_start, (r.period_start + interval '1 month - 1 day')::date,
       (r.period_start + interval '1 month - 3 days')::date, 'regular',
       s.status, s.status, r.country, r.currency,
       CASE WHEN s.status <> 'draft' THEN r.period_start + 20 END,
       CASE WHEN s.status <> 'draft' THEN (SELECT employee_id FROM _perf.actors WHERE actor = 'hr') END,
       CASE WHEN s.status IN ('approved', 'finalized', 'paid') THEN r.period_start + 22 END,
       CASE WHEN s.status IN ('approved', 'finalized', 'paid') THEN (SELECT employee_id FROM _perf.actors WHERE actor = 'finance') END,
       CASE WHEN s.status IN ('finalized', 'paid') THEN r.period_start + 25 END,
       r.period_start::timestamptz
  FROM _runs r
  CROSS JOIN LATERAL (SELECT CASE
      WHEN r.period_start = date_trunc('month', _perf.as_of()) THEN 'draft'
      WHEN r.period_start = date_trunc('month', _perf.as_of() - 31) THEN 'approved'
      ELSE 'paid' END AS status) s;

INSERT INTO payroll_run_employees (id, tenant_id, payroll_run_id, employee_id, run_employee_id,
                                   status, work_country, regular_hours, pto_hours, earnings,
                                   gross_pay, taxable_wages, taxes, total_taxes, net_pay,
                                   payment_method, created_at)
SELECT _perf.u('pay_line', r.n * 10000 + row_number() OVER (PARTITION BY r.n ORDER BY e.id)),
       _perf.tenant(), _perf.u('payroll_run', r.n), e.id,
       'PRE-' || r.n || '-' || row_number() OVER (PARTITION BY r.n ORDER BY e.id),
       CASE WHEN r.period_start = date_trunc('month', _perf.as_of()) THEN 'pending' ELSE 'paid' END,
       r.country, 160, 0,
       jsonb_build_object('base', round(e.base_amount_pvt / 12, 2)::text),
       round(e.base_amount_pvt / 12, 2),
       jsonb_build_object('income', round(e.base_amount_pvt / 12, 2)::text),
       jsonb_build_object('income_tax', round(e.base_amount_pvt / 12 * 0.22, 2)::text,
                          'social', round(e.base_amount_pvt / 12 * 0.06, 2)::text),
       round(e.base_amount_pvt / 12 * 0.22, 2) + round(e.base_amount_pvt / 12 * 0.06, 2),
       round(e.base_amount_pvt / 12, 2)
         - round(e.base_amount_pvt / 12 * 0.22, 2) - round(e.base_amount_pvt / 12 * 0.06, 2),
       'direct_deposit', r.period_start::timestamptz
  FROM _runs r
  JOIN firm_locations l ON l.tenant_id = _perf.tenant() AND l.country = r.country
  JOIN employees e ON e.tenant_id = _perf.tenant() AND e.location_code = l.location_code
 WHERE e.start_date <= r.period_start + 27
   AND (e.end_date IS NULL OR e.end_date >= r.period_start);

UPDATE payroll_runs p SET employee_count = s.n, total_gross_pay = s.gross,
                          total_taxes = s.taxes, total_net_pay = s.net, total_deductions = 0
  FROM (SELECT payroll_run_id, count(*) AS n, sum(gross_pay) AS gross,
               sum(total_taxes) AS taxes, sum(net_pay) AS net
          FROM payroll_run_employees WHERE tenant_id = _perf.tenant()
         GROUP BY payroll_run_id) s
 WHERE p.id = s.payroll_run_id;

DROP TABLE _cr, _cr_je, _imp, _runs;

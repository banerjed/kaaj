-- Accounting, in USD base: the chart of accounts with the app's own codes
-- (accounting.repo.ts / payables.repo.ts ACCOUNTS), monthly periods, tax
-- rates, FX, bank accounts and vendors; then invoices, bills, payments and
-- the journal entries the app would have posted for them.
--
-- Every journal entry balances natively and in base. Base amounts are
-- rounded per line, as postJournal rounds them, and the receivable / payable
-- line carries the sum of the others, so the base side balances too.

CREATE TEMP TABLE _fx (currency text PRIMARY KEY, rate numeric);
INSERT INTO _fx VALUES ('USD', 1), ('GBP', 1.27), ('EUR', 1.08), ('INR', 0.012);

-- Chart of accounts.
INSERT INTO chart_of_accounts (id, tenant_id, account_code, account_name, account_type,
                               account_subtype, currency, is_bank_account, is_active, description)
SELECT _perf.u('coa', code::int), _perf.tenant(), code, name, type::account_type, subtype, 'USD',
       code = '1000', true, name
  FROM (VALUES
    ('1000','Cash at Bank','asset','current_asset'),
    ('1100','Accounts Receivable','asset','current_asset'),
    ('1150','Prepaid Expenses','asset','current_asset'),
    ('1200','Input Tax Recoverable','asset','current_asset'),
    ('1500','Equipment','asset','fixed_asset'),
    ('2000','Accounts Payable','liability','current_liability'),
    ('2100','Payroll Liabilities','liability','current_liability'),
    ('2150','Accrued Liabilities','liability','current_liability'),
    ('2200','Sales Tax Payable','liability','current_liability'),
    ('2300','Deferred Revenue','liability','current_liability'),
    ('3000','Retained Earnings','equity','retained_earnings'),
    ('4000','Consulting Revenue','revenue','operating_revenue'),
    ('4100','Software Revenue','revenue','operating_revenue'),
    ('4200','Foreign Exchange Gain','revenue','other_income'),
    ('5000','Salaries & Wages','expense','operating_expense'),
    ('5100','Contractor Costs','expense','operating_expense'),
    ('5200','Travel & Entertainment','expense','operating_expense'),
    ('5300','Software Subscriptions','expense','operating_expense'),
    ('5400','Office & Facilities','expense','operating_expense'),
    ('5500','Bad Debt Expense','expense','operating_expense'),
    ('5600','Payment Processing Fees','expense','operating_expense'),
    ('5700','Bank Charges','expense','operating_expense'),
    ('6000','Interest Income','revenue','other_income')
  ) a(code, name, type, subtype);

-- Monthly periods; everything older than two months is closed.
INSERT INTO accounting_periods (id, tenant_id, period_name, period_type, start_date, end_date,
                                fiscal_year, status, closed_at)
SELECT _perf.u('period', m), _perf.tenant(), to_char(d, 'Mon YYYY'), 'monthly', d::date,
       (d + interval '1 month - 1 day')::date, extract(year FROM d)::int,
       CASE WHEN (d + interval '1 month - 1 day')::date < _perf.as_of() - 60 THEN 'closed' ELSE 'open' END,
       CASE WHEN (d + interval '1 month - 1 day')::date < _perf.as_of() - 60
            THEN (d + interval '1 month 10 days') END
  FROM generate_series(0, 38) m,
       LATERAL (SELECT date_trunc('month', _perf.as_of() - interval '36 months') + m * interval '1 month' AS d) x;

CREATE TEMP TABLE _tax (currency text PRIMARY KEY, id uuid, rate numeric);
INSERT INTO tax_rates (id, tenant_id, code, tax_name, tax_type, rate, country, jurisdiction,
                       tax_collected_account_id, tax_paid_account_id, effective_from)
SELECT _perf.u('tax', n), _perf.tenant(), code, name, type::tax_type, rate, country, jur,
       _perf.u('coa', 2200), _perf.u('coa', 1200), date '2020-01-01'
  FROM (VALUES (1,'TAX-US-NY','New York sales tax','sales_tax',0.08875,'US','NY'),
               (2,'TAX-GB-VAT','UK VAT','vat',0.20,'GB','GB'),
               (3,'TAX-DE-VAT','German VAT','vat',0.19,'DE','DE'),
               (4,'TAX-IN-GST','India GST','gst',0.18,'IN','IN')) t(n, code, name, type, rate, country, jur);
INSERT INTO _tax VALUES ('USD', _perf.u('tax', 1), 0.08875), ('GBP', _perf.u('tax', 2), 0.20),
                        ('EUR', _perf.u('tax', 3), 0.19), ('INR', _perf.u('tax', 4), 0.18);

-- Exchange rates are global reference data, not the tenant's: kept if present.
INSERT INTO exchange_rates (from_currency, to_currency, rate_date, rate, inverse_rate, source)
SELECT f.currency, 'USD', (date_trunc('month', _perf.as_of()) - m * interval '1 month')::date,
       round(f.rate * (1 + (_perf.r('fx:' || f.currency, m)::numeric - 0.5) * 0.04), 6),
       round(1 / (f.rate * (1 + (_perf.r('fx:' || f.currency, m)::numeric - 0.5) * 0.04)), 6), 'PERF'
  FROM _fx f CROSS JOIN generate_series(0, 24) m
 WHERE f.currency <> 'USD'
ON CONFLICT DO NOTHING;

INSERT INTO bank_accounts (id, tenant_id, account_name, bank_name, currency, gl_account_id,
                           is_active, notes)
SELECT _perf.u('bank', b), _perf.tenant(),
       (ARRAY['Operating','Payroll','Reserve'])[1 + (b - 1) % 3] || ' ' || f.currency,
       CASE f.currency WHEN 'USD' THEN 'Chase' WHEN 'GBP' THEN 'Barclays'
                       WHEN 'EUR' THEN 'Deutsche Bank' ELSE 'HDFC' END,
       f.currency, _perf.u('coa', 1000), true, 'Main banking relationship'
  FROM (SELECT currency, row_number() OVER (ORDER BY currency) AS ci FROM _fx) f
  CROSS JOIN LATERAL generate_series((f.ci - 1) * 3 + 1, f.ci * 3) b;

INSERT INTO vendors (id, tenant_id, vendor_number, vendor_name, display_name, email, currency,
                     payment_terms, ap_account_id, bank_name, is_active)
SELECT _perf.u('vendor', v), _perf.tenant(), 'V-' || _perf.pad(v, 5),
       _perf.company(100000 + v), _perf.company(100000 + v),
       'billing@vendor' || v || '.example',
       _perf.pick(ARRAY['USD','USD','GBP','EUR','INR'], 'ven:cur', v),
       _perf.pick(ARRAY['Net 15','Net 30','Net 45'], 'ven:t', v),
       _perf.u('coa', 2000), 'Vendor Bank', true
  FROM generate_series(1, _perf.n(400)) v;

UPDATE customers SET ar_account_id = _perf.u('coa', 1100) WHERE tenant_id = _perf.tenant();

-- ---------------------------------------------------------------- invoices
CREATE TEMP TABLE _billed AS
SELECT row_number() OVER (ORDER BY customer_number) AS i, id, currency,
       _perf.r('cust:exempt', hashtext(id::text)) < 0.1 AS exempt
  FROM customers
 WHERE tenant_id = _perf.tenant() AND relationship_status <> 'prospect';
CREATE TEMP TABLE _billed_n AS SELECT count(*)::int AS n FROM _billed;

CREATE TEMP TABLE _inv AS
SELECT g.i, _perf.u('invoice', g.i) AS id, c.id AS customer_id, c.currency, c.exempt,
       _perf.as_of() - floor(power(_perf.r('inv:age', g.i), 0.9) * 720)::int AS d
  FROM generate_series(1, _perf.n(30000)) AS g(i)
  JOIN _billed c ON c.i = _perf.skew('inv:c', g.i, (SELECT n FROM _billed_n), 2);

CREATE TEMP TABLE _invl AS
SELECT v.i, l, v.id AS invoice_id,
       _perf.ri('il:q', v.i * 100 + l, 1, 80)::numeric AS qty,
       (_perf.ri('il:p', v.i * 100 + l, 8, 25) * 10)::numeric(15,2) AS unit_price,
       CASE WHEN v.exempt THEN NULL ELSE t.id END AS tax_rate_id,
       CASE WHEN v.exempt THEN 0 ELSE t.rate END AS tax_rate,
       CASE WHEN _perf.r('il:acct', v.i * 100 + l) < 0.8 THEN 4000 ELSE 4100 END AS acct
  FROM _inv v
  JOIN _tax t ON t.currency = v.currency
  CROSS JOIN LATERAL generate_series(1, _perf.skew('il:n', v.i, 10, 2)) l;

CREATE TEMP TABLE _invt AS
SELECT v.*, f.rate AS fx,
       s.subtotal, s.tax_total, s.subtotal + s.tax_total AS total,
       st.status
  FROM _inv v
  JOIN _fx f ON f.currency = v.currency
  JOIN (SELECT i, sum(round(qty * unit_price, 2)) AS subtotal,
               sum(round(round(qty * unit_price, 2) * tax_rate, 2)) AS tax_total
          FROM _invl GROUP BY i) s ON s.i = v.i
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN _perf.as_of() - v.d < 7 THEN CASE WHEN _perf.r('inv:st', v.i) < 0.3 THEN 'draft' ELSE 'sent' END
      WHEN _perf.as_of() - v.d < 45 THEN
        CASE WHEN _perf.r('inv:st', v.i) < 0.40 THEN 'paid'
             WHEN _perf.r('inv:st', v.i) < 0.55 THEN 'partial' ELSE 'sent' END
      ELSE
        CASE WHEN _perf.r('inv:st', v.i) < 0.82 THEN 'paid'
             WHEN _perf.r('inv:st', v.i) < 0.87 THEN 'partial'
             WHEN _perf.r('inv:st', v.i) < 0.95 THEN 'overdue'
             WHEN _perf.r('inv:st', v.i) < 0.97 THEN 'written_off'
             WHEN _perf.r('inv:st', v.i) < 0.98 THEN 'credited'
             ELSE 'void' END
      END AS status
  ) st;

CREATE TEMP TABLE _invm AS
SELECT x.*,
       round(x.subtotal * x.fx, 2) AS b_sub,
       round(x.tax_total * x.fx, 2) AS b_tax,
       CASE x.status WHEN 'paid' THEN x.total
                     WHEN 'partial' THEN round(x.total * 0.5, 2) ELSE 0 END AS paid,
       CASE WHEN x.status IN ('credited', 'written_off') THEN x.total ELSE 0 END AS credited
  FROM _invt x;

INSERT INTO invoices (id, tenant_id, customer_id, invoice_number, reference, invoice_date, due_date,
                      currency, exchange_rate, base_currency, subtotal, tax_total, total,
                      amount_paid, amount_due, amount_credited, base_subtotal, base_tax_total,
                      base_total, base_amount_paid, base_amount_due, base_amount_credited,
                      status, payment_terms, sent_at, paid_at, pdf_url, created_at)
SELECT m.id, _perf.tenant(), m.customer_id,
       'INV-' || extract(year FROM m.d) || '-' || _perf.pad(row_number() OVER (ORDER BY m.d, m.i), 3),
       'PO-' || m.i, m.d, m.d + 30, m.currency, m.fx, 'USD',
       m.subtotal, m.tax_total, m.total, m.paid, m.total - m.paid - m.credited, m.credited,
       m.b_sub, m.b_tax, m.b_sub + m.b_tax,
       CASE WHEN m.status = 'paid' THEN m.b_sub + m.b_tax ELSE round(m.paid * m.fx, 2) END,
       (m.b_sub + m.b_tax)
         - CASE WHEN m.status = 'paid' THEN m.b_sub + m.b_tax ELSE round(m.paid * m.fx, 2) END
         - CASE WHEN m.credited > 0 THEN m.b_sub + m.b_tax ELSE 0 END,
       CASE WHEN m.credited > 0 THEN m.b_sub + m.b_tax ELSE 0 END,
       m.status, 'Net 30',
       CASE WHEN m.status <> 'draft' THEN m.d::timestamptz END,
       CASE WHEN m.status = 'paid' THEN (least(_perf.as_of(), m.d + _perf.ri('inv:pd', m.i, 5, 60)))::timestamptz END,
       CASE WHEN m.status <> 'draft' THEN '/accounting/invoices/' || m.id || '/pdf' END,
       m.d::timestamptz
  FROM _invm m;

INSERT INTO invoice_lines (tenant_id, id, invoice_id, line_number, description, quantity,
                           unit_price, amount, tax_rate_id, tax_amount, revenue_account_id)
SELECT _perf.tenant(), _perf.u('invoice_line', l.i * 100 + l.l), l.invoice_id, l.l,
       _perf.pick(ARRAY['Consulting services','Engineering hours','Project management',
                        'Software licence','Support retainer','Data engineering'], 'il:d', l.i * 100 + l.l),
       l.qty, l.unit_price, round(l.qty * l.unit_price, 2), l.tax_rate_id,
       round(round(l.qty * l.unit_price, 2) * l.tax_rate, 2), _perf.u('coa', l.acct)
  FROM _invl l;

-- ---------------------------------------------------------------- bills
CREATE TEMP TABLE _bill AS
SELECT b, _perf.u('bill', b) AS id, _perf.u('vendor', v) AS vendor_id, v,
       (SELECT currency FROM vendors WHERE id = _perf.u('vendor', v)) AS currency,
       _perf.as_of() - floor(_perf.r('bill:age', b) * 720)::int AS d
  FROM generate_series(1, _perf.n(12000)) b,
       LATERAL (SELECT _perf.skew('bill:v', b, _perf.n(400), 2) AS v) x;

CREATE TEMP TABLE _billl AS
SELECT b.b, l, b.id AS bill_id,
       (_perf.ri('bl:a', b.b * 10 + l, 5, 500) * 10)::numeric(15,2) AS amount,
       _perf.pick(ARRAY[5100, 5200, 5300, 5400, 5300], 'bl:acct', b.b * 10 + l) AS acct,
       CASE WHEN b.currency IN ('GBP', 'EUR', 'INR') THEN t.id END AS tax_rate_id,
       CASE WHEN b.currency IN ('GBP', 'EUR', 'INR') THEN t.rate ELSE 0 END AS tax_rate
  FROM _bill b
  JOIN _tax t ON t.currency = b.currency
  CROSS JOIN LATERAL generate_series(1, _perf.skew('bl:n', b.b, 6, 2)) l;

CREATE TEMP TABLE _billm AS
SELECT b.*, f.rate AS fx, s.subtotal, s.tax_total, s.subtotal + s.tax_total AS total, bs.b_sub,
       round(s.tax_total * f.rate, 2) AS b_tax,
       CASE WHEN _perf.as_of() - b.d < 10 AND _perf.r('bill:st', b.b) < 0.4 THEN 'draft'
            WHEN _perf.as_of() - b.d < 30 OR _perf.r('bill:st', b.b) < 0.1 THEN 'approved'
            ELSE 'paid' END AS status
  FROM _bill b
  JOIN _fx f ON f.currency = b.currency
  JOIN (SELECT l.b, sum(l.amount) AS subtotal, sum(round(l.amount * l.tax_rate, 2)) AS tax_total
          FROM _billl l GROUP BY l.b) s ON s.b = b.b
  -- Base subtotal as the journal posts it: rounded per expense account, then
  -- summed — so the payable line equals the expense lines it balances.
  JOIN (SELECT a.b, sum(a.b_amt) AS b_sub
          FROM (SELECT x.b, round(sum(x.amount) * f2.rate, 2) AS b_amt
                  FROM _billl x
                  JOIN _bill bb ON bb.b = x.b
                  JOIN _fx f2 ON f2.currency = bb.currency
                 GROUP BY x.b, x.acct, f2.rate) a
         GROUP BY a.b) bs ON bs.b = b.b;

INSERT INTO bills (id, tenant_id, vendor_id, bill_number, reference, bill_date, due_date, currency,
                   exchange_rate, base_currency, subtotal, tax_total, total, amount_paid, amount_due,
                   base_subtotal, base_tax_total, base_total, base_amount_paid, base_amount_due,
                   status, requires_approval, approved_at, payment_terms, created_at)
SELECT m.id, _perf.tenant(), m.vendor_id, 'BILL-' || m.v || '-' || m.b, 'INV-' || m.b, m.d, m.d + 30,
       m.currency, m.fx, 'USD', m.subtotal, m.tax_total, m.total,
       CASE WHEN m.status = 'paid' THEN m.total ELSE 0 END,
       CASE WHEN m.status = 'paid' THEN 0 ELSE m.total END,
       m.b_sub, m.b_tax, m.b_sub + m.b_tax,
       CASE WHEN m.status = 'paid' THEN m.b_sub + m.b_tax ELSE 0 END,
       CASE WHEN m.status = 'paid' THEN 0 ELSE m.b_sub + m.b_tax END,
       m.status, true, CASE WHEN m.status <> 'draft' THEN (m.d + 2)::timestamptz END,
       'Net 30', m.d::timestamptz
  FROM _billm m;

-- One bill_lines row per generated line; the subtotal above sums them.
INSERT INTO bill_lines (tenant_id, id, bill_id, line_number, description, quantity, unit_price,
                        amount, tax_rate_id, tax_amount, expense_account_id)
SELECT _perf.tenant(), _perf.u('bill_line', l.b * 10 + l.l), l.bill_id, l.l,
       _perf.pick(ARRAY['Cloud hosting','Contractor services','Office supplies','Travel',
                        'Software subscription','Facilities'], 'bl:d', l.b * 10 + l.l),
       1, l.amount, l.amount, l.tax_rate_id, round(l.amount * l.tax_rate, 2), _perf.u('coa', l.acct)
  FROM _billl l;

-- ---------------------------------------------------------------- payments
CREATE TEMP TABLE _pay AS
SELECT 'inv' AS kind, m.i AS n, m.id AS doc_id, m.customer_id, NULL::uuid AS vendor_id, m.currency,
       m.paid AS amount,
       CASE WHEN m.status = 'paid' THEN m.b_sub + m.b_tax ELSE round(m.paid * m.fx, 2) END AS base_amount,
       m.fx, least(_perf.as_of(), m.d + _perf.ri('inv:pd', m.i, 5, 60)) AS d
  FROM _invm m WHERE m.paid > 0
UNION ALL
SELECT 'bill', m.b, m.id, NULL, m.vendor_id, m.currency, m.total, m.b_sub + m.b_tax, m.fx,
       least(_perf.as_of(), m.d + _perf.ri('bill:pd', m.b, 10, 45))
  FROM _billm m WHERE m.status = 'paid';

CREATE TEMP TABLE _paym AS
SELECT p.*, _perf.u('payment', CASE WHEN p.kind = 'inv' THEN p.n ELSE 10000000 + p.n END) AS id,
       row_number() OVER (ORDER BY p.d, p.kind, p.n) AS seq,
       (SELECT id FROM bank_accounts b WHERE b.tenant_id = _perf.tenant() AND b.currency = p.currency
         ORDER BY b.account_name LIMIT 1) AS bank_account_id
  FROM _pay p;

INSERT INTO payments (id, tenant_id, payment_number, payment_date, reference, customer_id, vendor_id,
                      currency, amount, exchange_rate, base_amount, payment_method, bank_account_id,
                      status, created_at)
SELECT p.id, _perf.tenant(), 'PAY-' || extract(year FROM p.d) || '-' || _perf.pad(p.seq, 3),
       p.d, 'REF-' || p.seq, p.customer_id, p.vendor_id, p.currency, p.amount, p.fx, p.base_amount,
       _perf.pick(ARRAY['direct_deposit','wire_transfer','wire_transfer','check']::payment_method[], 'pay:m', p.seq),
       p.bank_account_id, 'completed', p.d::timestamptz
  FROM _paym p;

INSERT INTO payment_allocations (tenant_id, id, payment_id, invoice_id, bill_id, amount, base_amount)
SELECT _perf.tenant(), _perf.u('allocation', p.seq), p.id,
       CASE WHEN p.kind = 'inv' THEN p.doc_id END, CASE WHEN p.kind = 'bill' THEN p.doc_id END,
       p.amount, p.base_amount
  FROM _paym p;

-- ---------------------------------------------------------------- journals
-- One entry per issued invoice, approved/paid bill, and payment; lines are
-- (account, debit, credit, base debit, base credit).
CREATE TEMP TABLE _je (key text PRIMARY KEY, d date, source_type text, source_id uuid,
                       description text, reference text, currency text, fx numeric);
CREATE TEMP TABLE _jel (key text, line int, acct int, dr numeric, cr numeric, bdr numeric, bcr numeric,
                        tax_rate_id uuid);

INSERT INTO _je
SELECT 'inv:' || m.i, m.d, 'invoice', m.id, 'Invoice raised', 'INV-' || m.i, m.currency, m.fx
  FROM _invm m WHERE m.status NOT IN ('draft', 'void');
INSERT INTO _jel
SELECT 'inv:' || m.i, 1, 1100, m.total, 0, m.b_sub + m.b_tax, 0, NULL::uuid FROM _invm m WHERE m.status NOT IN ('draft', 'void')
UNION ALL
SELECT 'inv:' || m.i, 2, 4000, 0, m.subtotal, 0, m.b_sub, NULL::uuid FROM _invm m WHERE m.status NOT IN ('draft', 'void')
UNION ALL
SELECT 'inv:' || m.i, 3, 2200, 0, m.tax_total, 0, m.b_tax, t.id
  FROM _invm m JOIN _tax t ON t.currency = m.currency
 WHERE m.status NOT IN ('draft', 'void') AND m.tax_total > 0;

INSERT INTO _je
SELECT 'bill:' || m.b, m.d + 2, 'bill', m.id, 'Bill approved', 'BILL-' || m.b, m.currency, m.fx
  FROM _billm m WHERE m.status <> 'draft';
INSERT INTO _jel
SELECT 'bill:' || l.b, row_number() OVER (PARTITION BY l.b ORDER BY l.acct)::int, l.acct,
       sum(l.amount), 0, round(sum(l.amount) * m.fx, 2), 0, NULL::uuid
  FROM _billl l JOIN _billm m ON m.b = l.b WHERE m.status <> 'draft'
 GROUP BY l.b, l.acct, m.fx
UNION ALL
SELECT 'bill:' || m.b, 20, 1200, m.tax_total, 0, m.b_tax, 0, t.id
  FROM _billm m JOIN _tax t ON t.currency = m.currency
 WHERE m.status <> 'draft' AND m.tax_total > 0
UNION ALL
SELECT 'bill:' || m.b, 21, 2000, 0, m.total, 0, m.b_sub + m.b_tax, NULL::uuid
  FROM _billm m WHERE m.status <> 'draft';

INSERT INTO _je
SELECT 'pay:' || p.seq, p.d, 'payment', p.id,
       CASE p.kind WHEN 'inv' THEN 'Customer payment received' ELSE 'Vendor payment made' END,
       'PAY-' || p.seq, p.currency, p.fx
  FROM _paym p;
INSERT INTO _jel
SELECT 'pay:' || p.seq, 1, CASE p.kind WHEN 'inv' THEN 1000 ELSE 2000 END, p.amount, 0, p.base_amount, 0, NULL::uuid FROM _paym p
UNION ALL
SELECT 'pay:' || p.seq, 2, CASE p.kind WHEN 'inv' THEN 1100 ELSE 1000 END, 0, p.amount, 0, p.base_amount, NULL::uuid FROM _paym p;

CREATE TEMP TABLE _jen AS
SELECT j.*, _perf.u('je', row_number() OVER (ORDER BY j.d, j.key)) AS id,
       row_number() OVER (ORDER BY j.d, j.key) AS seq
  FROM _je j;

INSERT INTO journal_entries (id, tenant_id, entry_number, entry_date, source_type, source_id,
                             description, reference, status, accounting_period, fiscal_year,
                             posted_at, created_at)
SELECT j.id, _perf.tenant(), 'JE-' || extract(year FROM j.d) || '-' || _perf.pad(j.seq, 4),
       j.d, j.source_type, j.source_id, j.description, j.reference, 'posted',
       to_char(j.d, 'YYYY-MM'), extract(year FROM j.d)::int, j.d::timestamptz, j.d::timestamptz
  FROM _jen j;

INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, line_number, currency,
                                 debit_amount, credit_amount, exchange_rate, base_currency,
                                 base_debit_amount, base_credit_amount, description, tax_rate_id)
SELECT _perf.tenant(), _perf.u('jel', j.seq * 100 + l.line), j.id, _perf.u('coa', l.acct),
       row_number() OVER (PARTITION BY j.id ORDER BY l.line)::int, j.currency,
       l.dr, l.cr, j.fx, 'USD', l.bdr, l.bcr, j.description, l.tax_rate_id
  FROM _jel l JOIN _jen j ON j.key = l.key
 WHERE l.dr > 0 OR l.cr > 0;

UPDATE invoices i SET journal_entry_id = j.id
  FROM _jen j WHERE j.source_type = 'invoice' AND j.source_id = i.id;
UPDATE bills b SET journal_entry_id = j.id
  FROM _jen j WHERE j.source_type = 'bill' AND j.source_id = b.id;
UPDATE payments p SET journal_entry_id = j.id
  FROM _jen j WHERE j.source_type = 'payment' AND j.source_id = p.id;

-- ---------------------------------------------------------------- bank
-- Every payment appears on its account's statement, plus fees and interest;
-- older lines are reconciled. Balances run per account.
CREATE TEMP TABLE _btx AS
SELECT p.bank_account_id, p.d, CASE WHEN p.kind = 'inv' THEN p.amount ELSE -p.amount END AS amount,
       CASE WHEN p.kind = 'inv' THEN 'Customer receipt ' ELSE 'Supplier payment ' END || 'REF-' || p.seq AS description,
       'REF-' || p.seq AS reference, 'payment' AS matched_to_type, p.id AS matched_to_id,
       CASE WHEN p.d < _perf.as_of() - 30 THEN 'reconciled' ELSE 'matched' END AS status,
       'p' || p.seq AS key
  FROM _paym p
UNION ALL
SELECT b.id, _perf.as_of() - _perf.ri('fee:d', g, 0, 720),
       CASE WHEN _perf.r('fee:k', g) < 0.7 THEN -_perf.ri('fee:a', g, 5, 80)::numeric
            ELSE _perf.ri('fee:i', g, 10, 400)::numeric END,
       CASE WHEN _perf.r('fee:k', g) < 0.7 THEN 'Bank charge' ELSE 'Interest' END,
       'BNK-' || g, NULL, NULL,
       CASE WHEN _perf.r('fee:s', g) < 0.6 THEN 'categorized' ELSE 'unmatched' END,
       'f' || g
  FROM generate_series(1, _perf.n(5000)) g
  JOIN bank_accounts b ON b.id = _perf.u('bank', 1 + (g % 12));

INSERT INTO bank_transactions (tenant_id, id, bank_account_id, transaction_date, value_date,
                               description, reference, amount, balance, transaction_type,
                               category_account_id, status, matched_to_type, matched_to_id,
                               match_confidence, imported_at, bank_transaction_id)
SELECT _perf.tenant(), _perf.u('btx', x.rn), x.bank_account_id, x.d, x.d, x.description, x.reference,
       x.amount,
       100000 + sum(x.amount) OVER (PARTITION BY x.bank_account_id ORDER BY x.d, x.key),
       CASE WHEN x.amount >= 0 THEN 'credit' ELSE 'debit' END,
       CASE WHEN x.status = 'categorized' THEN _perf.u('coa', CASE WHEN x.amount < 0 THEN 5700 ELSE 6000 END) END,
       x.status, x.matched_to_type, x.matched_to_id,
       CASE WHEN x.matched_to_id IS NOT NULL THEN 0.95 END,
       (x.d + 1)::timestamptz, 'PERF-' || x.key
  FROM (SELECT b.*, row_number() OVER (ORDER BY b.d, b.key) AS rn FROM _btx b) x;

UPDATE bank_accounts b SET current_balance = s.bal, available_balance = s.bal
  FROM (SELECT DISTINCT ON (bank_account_id) bank_account_id, balance AS bal
          FROM bank_transactions WHERE tenant_id = _perf.tenant()
         ORDER BY bank_account_id, transaction_date DESC, id DESC) s
 WHERE b.id = s.bank_account_id;

-- ---------------------------------------------------------------- expenses
INSERT INTO expenses (id, tenant_id, employee_id, expense_date, vendor_name, currency, amount,
                      exchange_rate, base_amount, category_account_id, description, expense_type,
                      is_reimbursable, reimbursement_status, approved_at, project_id, customer_id,
                      is_billable, billable_amount, created_at)
SELECT _perf.u('expense', x), _perf.tenant(), e.id, a.d, a.v, e.currency, a.amt, f.rate,
       round(a.amt * f.rate, 2), _perf.u('coa', ac.acct), a.v || ' — ' || a.kind, a.kind, true,
       CASE WHEN _perf.as_of() - a.d < 14 THEN 'pending'
            WHEN _perf.r('exp:rej', x) < 0.04 THEN 'rejected'
            WHEN _perf.as_of() - a.d < 30 THEN 'approved' ELSE 'paid' END::reimbursement_status,
       CASE WHEN _perf.as_of() - a.d >= 14 THEN (a.d + 5)::timestamptz END,
       CASE WHEN b.billable THEN pr.id END, CASE WHEN b.billable THEN pr.customer_id END,
       b.billable, CASE WHEN b.billable THEN a.amt END, a.d::timestamptz
  FROM generate_series(1, _perf.n(25000)) x
  CROSS JOIN LATERAL (SELECT _perf.as_of() - _perf.ri('exp:d', x, 0, 720) AS d,
                             (_perf.ri('exp:a', x, 5, 900))::numeric(15,2) AS amt,
                             _perf.pick(ARRAY['travel','software','office','meals','travel'], 'exp:k', x) AS kind,
                             _perf.pick(ARRAY['Uber','Delta','Hilton','Amazon','Staples','Zoom','Pret'], 'exp:v', x) AS v) a
  CROSS JOIN LATERAL (SELECT CASE a.kind WHEN 'software' THEN 5300 WHEN 'office' THEN 5400 ELSE 5200 END AS acct) ac
  JOIN employees e ON e.id = _perf.u('employee', 1 + (x * 37) % _perf.n(1000))
  JOIN _fx f ON f.currency = e.currency
  LEFT JOIN projects pr ON pr.id = _perf.u('project', 1 + (x * 13) % _perf.n(1500)) AND pr.customer_id IS NOT NULL
  CROSS JOIN LATERAL (SELECT pr.id IS NOT NULL AND _perf.r('exp:bill', x) < 0.15 AS billable) b;

-- Account balances in base, from the ledger.
UPDATE chart_of_accounts c SET current_balance = s.bal, current_balance_base = s.bal
  FROM (SELECT account_id, sum(base_debit_amount - base_credit_amount) AS bal
          FROM journal_entry_lines WHERE tenant_id = _perf.tenant() GROUP BY account_id) s
 WHERE c.id = s.account_id;

DROP TABLE _fx, _tax, _billed, _billed_n, _inv, _invl, _invt, _invm, _bill, _billl, _billm,
           _pay, _paym, _je, _jel, _jen, _btx;

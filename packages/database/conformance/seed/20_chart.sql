-- The canonical chart of accounts (spec section 6). Codes the engine
-- hardcodes (accounting.repo.ts / payables.repo.ts ACCOUNTS) keep those
-- codes: 1000 cash, 1100 receivable, 1200 input tax, 2000 payable,
-- 2150 accrued liabilities, 2200 tax payable, 3000 retained earnings,
-- 4000 revenue, 4200 FX gain/loss (netted), 5500 bad debt. The runner maps a
-- semantic ID to a row through account_code (handles.ts).
INSERT INTO chart_of_accounts (id, tenant_id, account_code, account_name, account_type,
                               account_subtype, currency, is_bank_account, is_active)
SELECT _acs.u('coa', code::int), _acs.tenant(), code, name, type::account_type, subtype,
       currency, bank, active
  FROM (VALUES
    ('1000', 'Operating Bank',                   'asset',     'current_asset',       'USD', true,  true),
    ('1020', 'Savings Bank',                     'asset',     'current_asset',       'USD', true,  true),
    ('1030', 'EUR Bank',                         'asset',     'current_asset',       'EUR', true,  true),
    ('1100', 'Accounts Receivable',              'asset',     'current_asset',       'USD', false, true),
    ('1150', 'Allowance for Doubtful Accounts',  'asset',     'current_asset',       'USD', false, true),
    ('1200', 'Input Tax Recoverable',            'asset',     'current_asset',       'USD', false, true),
    ('1210', 'Inventory',                        'asset',     'current_asset',       'USD', false, true),
    ('1250', 'Inventory Clearing',               'asset',     'current_asset',       'USD', false, true),
    ('1300', 'Prepaid Expenses',                 'asset',     'current_asset',       'USD', false, true),
    ('1400', 'Equipment',                        'asset',     'fixed_asset',         'USD', false, true),
    ('1410', 'Furniture',                        'asset',     'fixed_asset',         'USD', false, true),
    ('1490', 'Accumulated Depreciation',         'asset',     'fixed_asset',         'USD', false, true),
    ('2000', 'Accounts Payable',                 'liability', 'current_liability',   'USD', false, true),
    ('2150', 'Accrued Expenses',                 'liability', 'current_liability',   'USD', false, true),
    ('2200', 'Sales Tax Payable',                'liability', 'current_liability',   'USD', false, true),
    ('2250', 'Customer Deposits',                'liability', 'current_liability',   'USD', false, true),
    ('2300', 'Deferred Revenue',                 'liability', 'current_liability',   'USD', false, true),
    ('2400', 'Corporate Credit Card',            'liability', 'current_liability',   'USD', false, true),
    ('3000', 'Retained Earnings',                'equity',    'retained_earnings',   'USD', false, true),
    ('3100', 'Common Stock',                     'equity',    'equity',              'USD', false, true),
    ('4000', 'Service Revenue',                  'revenue',   'operating_revenue',   'USD', false, true),
    ('4100', 'Product Revenue',                  'revenue',   'operating_revenue',   'USD', false, true),
    ('4150', 'Sales Returns and Allowances',     'revenue',   'operating_revenue',   'USD', false, true),
    ('4200', 'Realized FX Gain/Loss',            'revenue',   'other_income',        'USD', false, true),
    ('5000', 'Cost of Goods Sold',               'expense',   'cost_of_sales',       'USD', false, true),
    ('5500', 'Bad Debt Expense',                 'expense',   'operating_expense',   'USD', false, true),
    ('6000', 'Rent Expense',                     'expense',   'operating_expense',   'USD', false, true),
    ('6100', 'Office Expense',                   'expense',   'operating_expense',   'USD', false, true),
    ('6200', 'Insurance Expense',                'expense',   'operating_expense',   'USD', false, true),
    ('6300', 'Depreciation Expense',             'expense',   'operating_expense',   'USD', false, true),
    ('6500', 'Bank Fees',                        'expense',   'operating_expense',   'USD', false, true),
    ('7020', 'Unrealized FX Gain',               'revenue',   'other_income',        'USD', false, true),
    ('7030', 'Unrealized FX Loss',               'expense',   'other_expense',       'USD', false, true),
    ('7100', 'Gain on Disposal of Assets',       'revenue',   'other_income',        'USD', false, true),
    ('7110', 'Loss on Disposal of Assets',       'expense',   'other_expense',       'USD', false, true),
    ('8000', 'Interest Income',                  'revenue',   'other_income',        'USD', false, true),
    ('9000', 'Inactive Test Account',            'expense',   'operating_expense',   'USD', false, false)
  ) a(code, name, type, subtype, currency, bank, active);

INSERT INTO bank_accounts (id, tenant_id, account_name, bank_name, currency, gl_account_id,
                           is_active, created_by)
VALUES
  (_acs.u('bank', 1), _acs.tenant(), 'Operating Bank', 'ACS Bank', 'USD', _acs.u('coa', 1000), true, _acs.owner_user()),
  (_acs.u('bank', 2), _acs.tenant(), 'Savings Bank',   'ACS Bank', 'USD', _acs.u('coa', 1020), true, _acs.owner_user()),
  (_acs.u('bank', 3), _acs.tenant(), 'EUR Bank',       'ACS Bank', 'EUR', _acs.u('coa', 1030), true, _acs.owner_user());

-- Spec GL-020: an account that belongs to ANOTHER tenant. The second tenant
-- holds nothing else; the runner names its account OTHER_TENANT_ACCOUNT.
INSERT INTO tenants (id, subdomain, company_name, region, default_locale, default_currency,
                     default_timezone, plan_tier, max_employees, is_active, fiscal_year_start, created_by)
VALUES (_acs.u('tenant', 2), 'acs-other', 'ACS Other Tenant', 'us-east-1', 'en-US', 'USD',
        'America/New_York', 'professional', 5, true, '01-01', 'acs-seed');
INSERT INTO chart_of_accounts (id, tenant_id, account_code, account_name, account_type, account_subtype,
                               currency, is_bank_account, is_active)
VALUES (_acs.u('coa-other', 1), _acs.u('tenant', 2), '6100', 'Other Tenant Office Expense', 'expense',
        'operating_expense', 'USD', false, true);

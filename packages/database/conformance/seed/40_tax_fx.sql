-- Tax rates (spec section 7.4) and controlled exchange rates (section 7.5).
-- The engine stores no inclusive flag: TAX-8-I is a second 8% row, and the
-- fixture supplies inclusive arithmetic in its line amounts.
INSERT INTO tax_rates (id, tenant_id, code, tax_name, tax_type, rate, country, jurisdiction,
                       tax_collected_account_id, tax_paid_account_id, effective_from,
                       created_by, updated_by)
VALUES
  (_acs.u('tax', 1), _acs.tenant(), 'TAX-0',   'Zero rate',        'sales_tax', 0.00000, 'US', 'US-ACS', _acs.u('coa', 2200), _acs.u('coa', 1200), '2026-01-01', _acs.owner_user(), _acs.owner_user()),
  (_acs.u('tax', 2), _acs.tenant(), 'TAX-8',   '8% exclusive',     'sales_tax', 0.08000, 'US', 'US-ACS', _acs.u('coa', 2200), _acs.u('coa', 1200), '2026-01-01', _acs.owner_user(), _acs.owner_user()),
  (_acs.u('tax', 3), _acs.tenant(), 'TAX-8-I', '8% inclusive',     'sales_tax', 0.08000, 'US', 'US-ACS', _acs.u('coa', 2200), _acs.u('coa', 1200), '2026-01-01', _acs.owner_user(), _acs.owner_user()),
  (_acs.u('tax', 4), _acs.tenant(), 'TAX-5',   '5% exclusive',     'sales_tax', 0.05000, 'US', 'US-ACS', _acs.u('coa', 2200), _acs.u('coa', 1200), '2026-01-01', _acs.owner_user(), _acs.owner_user());

-- exchange_rates is global reference data (no tenant_id). Source ACS so a
-- rebuild can tell these rows from anything else.
INSERT INTO exchange_rates (id, from_currency, to_currency, rate_date, rate, inverse_rate, source,
                            is_manual, created_by)
VALUES
  (_acs.u('fx', 1), 'EUR', 'USD', '2026-01-01', 1.200000, round(1 / 1.200000, 6), 'ACS', true, _acs.owner_user()),
  (_acs.u('fx', 2), 'EUR', 'USD', '2026-01-31', 1.250000, round(1 / 1.250000, 6), 'ACS', true, _acs.owner_user()),
  (_acs.u('fx', 3), 'EUR', 'USD', '2026-02-15', 1.300000, round(1 / 1.300000, 6), 'ACS', true, _acs.owner_user()),
  (_acs.u('fx', 4), 'EUR', 'USD', '2026-03-01', 1.150000, round(1 / 1.150000, 6), 'ACS', true, _acs.owner_user()),
  (_acs.u('fx', 5), 'GBP', 'USD', '2026-01-01', 1.400000, round(1 / 1.400000, 6), 'ACS', true, _acs.owner_user()),
  (_acs.u('fx', 6), 'GBP', 'USD', '2026-01-31', 1.350000, round(1 / 1.350000, 6), 'ACS', true, _acs.owner_user()),
  (_acs.u('fx', 7), 'JPY', 'USD', '2026-01-01', 0.006500, round(1 / 0.006500, 6), 'ACS', true, _acs.owner_user());

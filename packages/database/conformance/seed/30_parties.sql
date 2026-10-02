-- Customers and vendors (spec sections 7.1 and 7.2). customer_number and
-- vendor_number are the handles a fixture uses.
INSERT INTO customers (id, tenant_id, customer_number, customer_name, display_name, email,
                       currency, payment_terms, is_active, customer_type, relationship_status,
                       is_tax_exempt)
VALUES
  (_acs.u('customer', 1), _acs.tenant(), 'CUST-001', 'Acme Corporation',   'Acme Corporation',   'ap@acme.example',     'USD', 'net_30', true, 'corporate', 'active', false),
  (_acs.u('customer', 2), _acs.tenant(), 'CUST-002', 'Globex Corporation', 'Globex Corporation', 'ap@globex.example',   'USD', 'net_30', true, 'corporate', 'active', false),
  (_acs.u('customer', 3), _acs.tenant(), 'CUST-003', 'Europa GmbH',        'Europa GmbH',        'ap@europa.example',   'EUR', 'net_30', true, 'corporate', 'active', false),
  (_acs.u('customer', 4), _acs.tenant(), 'CUST-004', 'Sterling Ltd',       'Sterling Ltd',       'ap@sterling.example', 'GBP', 'net_30', true, 'corporate', 'active', false),
  (_acs.u('customer', 5), _acs.tenant(), 'CUST-005', 'Exempt Foundation',  'Exempt Foundation',  'ap@exempt.example',   'USD', 'net_30', true, 'corporate', 'active', true),
  (_acs.u('customer', 6), _acs.tenant(), 'CUST-006', 'Nippon KK',          'Nippon KK',          'ap@nippon.example',   'JPY', 'net_30', true, 'corporate', 'active', false);

INSERT INTO vendors (id, tenant_id, vendor_number, vendor_name, display_name, email, currency,
                     payment_terms, ap_account_id, is_active)
VALUES
  (_acs.u('vendor', 1), _acs.tenant(), 'VEND-001', 'SupplyCo',           'SupplyCo',           'billing@supplyco.example', 'USD', 'net_30', _acs.u('coa', 2000), true),
  (_acs.u('vendor', 2), _acs.tenant(), 'VEND-002', 'Euro Supplier GmbH', 'Euro Supplier GmbH', 'billing@eurosup.example',  'EUR', 'net_30', _acs.u('coa', 2000), true);

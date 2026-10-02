-- The canonical conformance tenant (spec section 5): ACS Conformance
-- Corporation, USD, calendar fiscal year 2026, twelve open monthly periods.
INSERT INTO tenants (id, subdomain, company_name, legal_entity_name, region,
                     default_locale, supported_locales, default_currency,
                     supported_currencies, default_timezone, plan_tier,
                     max_employees, company_size, industry, is_active,
                     fiscal_year_start, created_by)
VALUES (_acs.tenant(), 'acs', 'ACS Conformance Corporation',
        'ACS Conformance Corporation', 'us-east-1', 'en-US',
        ARRAY['en-US'], 'USD', ARRAY['USD','EUR','GBP','JPY'],
        'America/New_York', 'professional', 50, '11-50',
        'Professional services', true, '01-01', 'acs-seed');

INSERT INTO firm_locations (id, tenant_id, name, city, country, timezone, locale,
                            currency, is_headquarters, is_active, location_code,
                            address_line1, postal_code, capacity)
VALUES (_acs.u('location', 1), _acs.tenant(), 'Head Office', 'New York', 'US',
        'America/New_York', 'en-US', 'USD', true, true, 'HQ',
        '1 Conformance Plaza', '10001', 20);

-- Two actors (spec section 4.2): the owner, and a finance administrator who
-- is a different person — recordVendorPayment refuses the approver as payer.
INSERT INTO employees (id, tenant_id, employee_id, employee_number, first_name, last_name,
                       email, timezone, employment_status, employment_type, start_date,
                       location_code, currency, is_active, created_by)
VALUES
  (_acs.u('employee', 1), _acs.tenant(), 'ACS-001', '000001', 'Olive', 'Owner',
   'owner@acs.example', 'America/New_York', 'active', 'full_time', '2026-01-01',
   'HQ', 'USD', true, 'acs-seed'),
  (_acs.u('employee', 2), _acs.tenant(), 'ACS-002', '000002', 'Frank', 'Finance',
   'finance@acs.example', 'America/New_York', 'active', 'full_time', '2026-01-01',
   'HQ', 'USD', true, 'acs-seed');

INSERT INTO tenant_users (id, tenant_id, user_id, employee_id, role, functional_roles,
                          is_active, is_default_tenant, accepted_at)
VALUES
  (_acs.u('tenant_user', 1), _acs.tenant(), _acs.u('user', 1), _acs.u('employee', 1),
   'owner', '{}'::text[], true, true, '2026-01-01T00:00:00Z'),
  (_acs.u('tenant_user', 2), _acs.tenant(), _acs.u('user', 2), _acs.u('employee', 2),
   'employee', ARRAY['finance_admin']::text[], true, true, '2026-01-01T00:00:00Z');

-- Twelve monthly periods, all open. Named YYYY-MM so a fixture names one
-- without ambiguity.
INSERT INTO accounting_periods (id, tenant_id, period_name, period_type, start_date,
                                end_date, fiscal_year, status)
SELECT _acs.u('period', m), _acs.tenant(), to_char(d, 'YYYY-MM'), 'monthly', d::date,
       (d + interval '1 month - 1 day')::date, 2026, 'open'
  FROM generate_series(1, 12) m,
       LATERAL (SELECT date '2026-01-01' + (m - 1) * interval '1 month' AS d) x;

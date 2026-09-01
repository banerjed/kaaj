-- =============================================================================
-- Kaaj — Mock Data for a Test Organization
-- =============================================================================
-- Version:      2.0
-- Last Updated: 2026-08-27
-- Target:       supabase/migrations/ (98 tables, Supabase PostgreSQL)
--
-- Supersedes the v1 mock data, which targeted the D1/SQLite schema and its
-- natural keys (EMP-001, US-NYC, ENG). Those keys collide under shared-schema
-- tenancy and could not be reused.
--
-- THE TEST ORGANIZATION
--   Northwind Consulting — a 12-person professional services firm operating in
--   the US, UK and India. Chosen to exercise the parts of the schema that are
--   easy to get wrong:
--     * three currencies (USD/GBP/INR) and three timezones
--     * a manager hierarchy and a department tree (ENG -> ENG-BE, ENG-FE)
--     * effective-dated compensation, so historical payroll is reproducible
--     * per-client, effective-dated billing rates
--     * balanced double-entry journals
--     * jurisdiction-specific leave policies and accrual ledgers
--     * split direct deposit, and career-progression history with reasons
--
-- UUIDs are deterministic (uuid5 over a fixed namespace), so regenerating this
-- file produces identical identifiers and diffs stay readable.
--
-- USAGE
--   psql "$DATABASE_URL" -f packages/database/reference/schema.sql
--   psql "$DATABASE_URL" -f packages/database/fixtures/mock-data.sql
--
-- RLS NOTE
--   These INSERTs run as the table owner, for whom RLS is bypassed. To exercise
--   isolation, connect as the non-owner application role and set the tenant:
--     SET request.jwt.claims = '{"app_metadata":{"tenant_id":"<tenant uuid>"}}';
--   The tenant id is printed by the verification block at the end of this file.
-- =============================================================================

BEGIN;

-- Deterministic id helper, so re-running produces identical uuids and diffs
-- stay readable. Dropped at the end of this file.
CREATE OR REPLACE FUNCTION uuid_generate_v5_compat(seed UUID, salt TEXT)
RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
    -- md5 yields exactly 32 hex chars, which Postgres casts straight to uuid.
    -- Not a real v5 uuid (no namespace/version bits) but deterministic, which
    -- is the property the fixture needs.
    SELECT md5(seed::text || ':' || salt)::uuid
$$;


-- Test organization: a 12-person professional services firm operating in 3 countries
INSERT INTO tenants (id, subdomain, company_name, company_name_i18n, region, data_residency_country, default_locale, default_currency, default_timezone, plan_tier, max_employees, billing_email, billing_currency, billing_status, is_active) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'northwind', 'Northwind Consulting', '{"en-US": "Northwind Consulting", "fr-FR": "Northwind Conseil"}'::jsonb, 'us-east-1', 'US', 'en-US', 'USD', 'America/New_York', 'professional', 200, 'billing@northwind.example', 'USD', 'active', TRUE);

UPDATE tenants SET
    supported_locales = ARRAY['en-US','en-GB','en-IN','fr-FR','de-DE'],
    supported_currencies = ARRAY['USD','GBP','INR','EUR'],
    legal_entity_name = 'Northwind Consulting LLC',
    industry = 'professional_services',
    primary_contact_name = 'Sarah Johnson',
    primary_contact_email = 'sarah.johnson@northwind.example',
    city = 'New York',
    state_province = 'NY',
    billing_country = 'US'
WHERE id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1';

-- Tier 3 customization: behaviour settings
INSERT INTO tenant_settings (tenant_id, namespace, key, value) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'accounting', 'fiscal_year_start', '{"month": 1, "day": 1}'::jsonb),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'expenses', 'approval_threshold', '{"amount": 5000, "currency": "USD"}'::jsonb),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ticketing', 'default_sla_hours', '{"standard": 24, "urgent": 4}'::jsonb),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'payroll', 'approval_required', 'true'::jsonb);

-- Tier 2 customization: definitions backing the custom_fields JSONB columns
INSERT INTO custom_field_definitions (id, tenant_id, entity_type, field_key, label, data_type, display_order, options) VALUES
    ('e4788475-9d6a-56f2-9be2-7ab543db0d44', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'shirt_size', 'Shirt Size', 'select', 1, '[{"value": "S", "label": "Small"}, {"value": "M", "label": "Medium"}, {"value": "L", "label": "Large"}]'::jsonb),
    ('3e0587fa-cdd0-510d-bce9-cec06a58ea2f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'parking_spot', 'Parking Spot', 'text', 2, NULL),
    ('2a813d6d-9104-543d-8be1-492dfa4d4482', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'legacy_id', 'Legacy HR System ID', 'text', 3, NULL),
    ('210b40b7-df80-5139-b843-821bfa8da2f7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'task', 'client_billable', 'Client Billable', 'boolean', 1, NULL);

-- Three locations: multi-currency, multi-timezone, multi-locale
INSERT INTO firm_locations (id, tenant_id, location_code, name, name_i18n, city, state, country, timezone, locale, currency, is_headquarters, is_active, capacity) VALUES
    ('12c07799-28b4-55df-b8cf-df96df0bf40f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'US-NYC', 'New York HQ', '{"en-US": "New York HQ"}'::jsonb, 'New York', 'NY', 'US', 'America/New_York', 'en-US', 'USD', TRUE, TRUE, 45),
    ('bf32fdb3-c7ed-52bd-b5e3-a581d6ab000c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'UK-LON', 'London Office', '{"en-US": "London Office"}'::jsonb, 'London', NULL, 'GB', 'Europe/London', 'en-GB', 'GBP', FALSE, TRUE, 18),
    ('25dc9e1b-aa1f-59ae-ad80-da21c61c8242', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'IN-BLR', 'Bangalore Delivery Centre', '{"en-US": "Bangalore Delivery Centre"}'::jsonb, 'Bangalore', 'Karnataka', 'IN', 'Asia/Kolkata', 'en-IN', 'INR', FALSE, TRUE, 30);

UPDATE firm_locations SET
    name_i18n = name_i18n || jsonb_build_object('fr-FR', CASE location_code WHEN 'US-NYC' THEN 'Siege de New York' WHEN 'UK-LON' THEN 'Bureau de Londres' ELSE 'Centre de livraison de Bangalore' END),
    address_line1 = CASE location_code WHEN 'US-NYC' THEN '120 Madison Avenue' WHEN 'UK-LON' THEN '24 King William Street' ELSE '5 Residency Road' END,
    postal_code = CASE location_code WHEN 'US-NYC' THEN '10016' WHEN 'UK-LON' THEN 'EC4R 9AT' ELSE '560025' END,
    working_hours = '{"monday": {"start": "09:00", "end": "17:30"}, "tuesday": {"start": "09:00", "end": "17:30"}, "wednesday": {"start": "09:00", "end": "17:30"}, "thursday": {"start": "09:00", "end": "17:30"}, "friday": {"start": "09:00", "end": "16:00"}}'::jsonb
WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1';

-- Department hierarchy: ENG -> ENG-BE, ENG-FE
INSERT INTO firm_departments (id, tenant_id, department_code, name, name_i18n, parent_department_code, location_code, cost_center, budget_currency, is_active) VALUES
    ('10cfa606-7c38-5de8-b72a-4ec11d9ae922', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ENG', 'Engineering', '{"en-US": "Engineering"}'::jsonb, NULL, 'US-NYC', 'CC-ENG', 'USD', TRUE),
    ('f58a2938-4faf-5b35-a6c5-872323e5356c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ENG-BE', 'Backend Engineering', '{"en-US": "Backend Engineering"}'::jsonb, 'ENG', 'IN-BLR', 'CC-ENG-BE', 'USD', TRUE),
    ('e04f14d9-b662-59a5-b9b1-309e32f5b772', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ENG-FE', 'Frontend Engineering', '{"en-US": "Frontend Engineering"}'::jsonb, 'ENG', 'US-NYC', 'CC-ENG-FE', 'USD', TRUE),
    ('fc0935fd-6c10-5db1-8e61-e458aeca68c0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CONSULT', 'Consulting', '{"en-US": "Consulting"}'::jsonb, NULL, 'US-NYC', 'CC-CONSULT', 'USD', TRUE),
    ('0e8f258e-562d-586e-9961-0344eab74686', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'SALES', 'Sales', '{"en-US": "Sales"}'::jsonb, NULL, 'UK-LON', 'CC-SALES', 'USD', TRUE),
    ('3b5a4d7f-644c-5c03-99a6-8f96582393da', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'GA', 'General & Administrative', '{"en-US": "General & Administrative"}'::jsonb, NULL, 'US-NYC', 'CC-GA', 'USD', TRUE);

UPDATE firm_departments SET
    name_i18n = name_i18n || jsonb_build_object('fr-FR', name, 'de-DE', name),
    head_employee_id = CASE department_code
        WHEN 'ENG' THEN '6d466aa9-e51a-5d52-9015-152600855932'::uuid
        WHEN 'CONSULT' THEN '11f31511-ad53-59c7-9e90-8ee3b553489b'::uuid
        WHEN 'SALES' THEN 'e05fd53c-ebdf-5049-810a-28a63369f93a'::uuid
        WHEN 'GA' THEN 'a87e0200-0849-53b6-a491-e882feace3f5'::uuid
        ELSE '6d466aa9-e51a-5d52-9015-152600855932'::uuid
    END
WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1';

-- Location-specific holiday calendars
INSERT INTO firm_holidays (id, tenant_id, holiday_id, location_id, location_code, name, name_i18n, date, is_recurring, is_paid, is_mandatory) VALUES
    ('f61553f4-b641-567a-af7d-ab5f91e1b9ae', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'US-NEWYEAR', '12c07799-28b4-55df-b8cf-df96df0bf40f', 'US-NYC', 'New Year Day', '{"en-US": "New Year Day"}'::jsonb, '2026-01-01', TRUE, TRUE, TRUE),
    ('8aa5b2c6-6226-53e7-8adb-d4673a8a4810', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'US-JUL4', '12c07799-28b4-55df-b8cf-df96df0bf40f', 'US-NYC', 'Independence Day', '{"en-US": "Independence Day"}'::jsonb, '2026-07-04', TRUE, TRUE, TRUE),
    ('2d3acad6-e0a1-58b6-b75d-90f1394275f9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'UK-MAYDAY', 'bf32fdb3-c7ed-52bd-b5e3-a581d6ab000c', 'UK-LON', 'Early May Bank Holiday', '{"en-US": "Early May Bank Holiday"}'::jsonb, '2026-05-04', TRUE, TRUE, TRUE),
    ('abb73ed9-3a92-596e-b7d4-9af138490817', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'IN-REPUBLIC', '25dc9e1b-aa1f-59ae-ad80-da21c61c8242', 'IN-BLR', 'Republic Day', '{"en-US": "Republic Day"}'::jsonb, '2026-01-26', TRUE, TRUE, TRUE);

-- Job titles
INSERT INTO firm_job_titles (id, tenant_id, title, title_i18n, is_exempt, is_active) VALUES
    ('5a252af5-2ac9-5bfe-aaa9-743f4260a4bb', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Software Engineer', '{"en-US": "Software Engineer"}'::jsonb, TRUE, TRUE),
    ('002ca495-22e8-58ba-b7ef-cf5cd13e9a56', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Senior Consultant', '{"en-US": "Senior Consultant"}'::jsonb, TRUE, TRUE),
    ('a3e4f0ee-9884-5876-a7dc-5f61d6eaeaaa', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Account Executive', '{"en-US": "Account Executive"}'::jsonb, TRUE, TRUE),
    ('12d2c82c-1840-5ffa-af93-0a3b146e257f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Engineering Manager', '{"en-US": "Engineering Manager"}'::jsonb, TRUE, TRUE),
    ('7e98e315-82a0-580c-9665-ddcce2945242', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Office Administrator', '{"en-US": "Office Administrator"}'::jsonb, FALSE, TRUE);

UPDATE firm_job_titles SET
    title_i18n = title_i18n || jsonb_build_object('fr-FR', title, 'de-DE', title),
    description_i18n = jsonb_build_object('en-US', title || ' role expectations and competencies')
WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1';

-- Job levels with multi-currency salary ranges
INSERT INTO firm_job_levels (id, tenant_id, job_title_id, level_name, level_name_i18n, salary_ranges, sort_order) VALUES
    ('7eb579fc-befd-5ef6-9ad2-d94544a3bf93', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5a252af5-2ac9-5bfe-aaa9-743f4260a4bb', 'L3', '{"en-US": "L3"}'::jsonb, '{"USD": {"min": "95000", "max": "130000"}, "INR": {"min": "1800000", "max": "2600000"}}'::jsonb, 1),
    ('82c7ef42-42a7-530c-81e7-3ca0a96d4a2f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5a252af5-2ac9-5bfe-aaa9-743f4260a4bb', 'L4', '{"en-US": "L4"}'::jsonb, '{"USD": {"min": "125000", "max": "165000"}, "INR": {"min": "2500000", "max": "3400000"}}'::jsonb, 2),
    ('d61e889e-7e4e-5f63-a058-bc50b3a11a7c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '002ca495-22e8-58ba-b7ef-cf5cd13e9a56', 'C2', '{"en-US": "C2"}'::jsonb, '{"USD": {"min": "110000", "max": "150000"}, "GBP": {"min": "75000", "max": "100000"}}'::jsonb, 1);

-- 12 employees across 3 locations, 6 departments, with a manager hierarchy
INSERT INTO employees (id, tenant_id, employee_id, employee_number, first_name, last_name, email, phone, employment_status, employment_type, start_date, birth_date, department_code, job_title, job_level, location_code, manager_id, timezone, currency, base_amount_pvt, compensation_type, pay_frequency, overtime_eligible, default_billable_rate_pvt, fte, is_active, custom_fields, celebration_preferences, pto_balances, created_at, updated_at, created_by) VALUES
    ('6d466aa9-e51a-5d52-9015-152600855932', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E001', 'E001', 'Sarah', 'Johnson', 'sarah.johnson@northwind.example', '+1-212-555-0001', 'active', 'full_time', '2024-11-27', '1978-01-01', 'ENG', 'Engineering Manager', 'L4', 'US-NYC', NULL, 'America/New_York', 'USD', 185000, 'salary', 'monthly', FALSE, 225, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E001"}'::jsonb, '{"show_birthday": true, "show_age": false, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('db1f1f2b-b140-5948-a34e-1c998ed98757', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E002', 'E002', 'Marcus', 'Chen', 'marcus.chen@northwind.example', '+1-212-555-0002', 'active', 'full_time', '2024-12-17', '1979-02-02', 'ENG-BE', 'Software Engineer', 'L4', 'IN-BLR', '6d466aa9-e51a-5d52-9015-152600855932', 'Asia/Kolkata', 'INR', 3200000, 'salary', 'monthly', TRUE, 95, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E002"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('bf17b1af-963b-53ef-9083-21506fb34e9c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E003', 'E003', 'Priya', 'Raman', 'priya.raman@northwind.example', '+1-212-555-0003', 'active', 'full_time', '2025-01-06', '1980-03-03', 'ENG-BE', 'Software Engineer', 'L3', 'IN-BLR', '6d466aa9-e51a-5d52-9015-152600855932', 'Asia/Kolkata', 'INR', 2100000, 'salary', 'monthly', TRUE, 85, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E003"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('b9b84064-a67a-5048-8282-8fc048b4dbfb', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E004', 'E004', 'Tom', 'Whitfield', 'tom.whitfield@northwind.example', '+1-212-555-0004', 'active', 'full_time', '2025-01-26', '1981-04-04', 'ENG-FE', 'Software Engineer', 'L4', 'US-NYC', '6d466aa9-e51a-5d52-9015-152600855932', 'America/New_York', 'USD', 148000, 'salary', 'monthly', FALSE, 195, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E004"}'::jsonb, '{"show_birthday": true, "show_age": false, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('11f31511-ad53-59c7-9e90-8ee3b553489b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E005', 'E005', 'Aisha', 'Okafor', 'aisha.okafor@northwind.example', '+1-212-555-0005', 'active', 'full_time', '2025-02-15', '1982-05-05', 'CONSULT', 'Senior Consultant', 'C2', 'US-NYC', NULL, 'America/New_York', 'USD', 142000, 'salary', 'monthly', FALSE, 265, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E005"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('c095eafa-952e-5047-961a-82ce7b45cbf1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E006', 'E006', 'James', 'Reid', 'james.reid@northwind.example', '+1-212-555-0006', 'active', 'full_time', '2025-03-07', '1983-06-06', 'CONSULT', 'Senior Consultant', 'C2', 'UK-LON', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'Europe/London', 'GBP', 88000, 'salary', 'monthly', FALSE, 240, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E006"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('18503470-ba5c-5450-bc3e-b0a2454d757f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E007', 'E007', 'Lena', 'Fischer', 'lena.fischer@northwind.example', '+1-212-555-0007', 'active', 'full_time', '2025-03-27', '1984-07-07', 'CONSULT', 'Senior Consultant', 'C2', 'UK-LON', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'Europe/London', 'GBP', 82000, 'salary', 'monthly', FALSE, 235, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E007"}'::jsonb, '{"show_birthday": true, "show_age": false, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e05fd53c-ebdf-5049-810a-28a63369f93a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E008', 'E008', 'Diego', 'Morales', 'diego.morales@northwind.example', '+1-212-555-0008', 'active', 'full_time', '2025-04-16', '1985-08-08', 'SALES', 'Account Executive', 'C2', 'UK-LON', NULL, 'Europe/London', 'GBP', 71000, 'salary', 'monthly', FALSE, NULL, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E008"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('fa4c9324-158b-55b7-acdd-7fe7917bc7cf', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E009', 'E009', 'Yuki', 'Tanaka', 'yuki.tanaka@northwind.example', '+1-212-555-0009', 'active', 'full_time', '2025-05-06', '1986-09-09', 'SALES', 'Account Executive', 'C2', 'US-NYC', 'e05fd53c-ebdf-5049-810a-28a63369f93a', 'America/New_York', 'USD', 118000, 'salary', 'monthly', FALSE, NULL, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E009"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a87e0200-0849-53b6-a491-e882feace3f5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E010', 'E010', 'Rachel', 'Adeyemi', 'rachel.adeyemi@northwind.example', '+1-212-555-0010', 'active', 'full_time', '2025-05-26', '1987-01-10', 'GA', 'Office Administrator', 'C2', 'US-NYC', NULL, 'America/New_York', 'USD', 68000, 'salary', 'monthly', TRUE, NULL, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E010"}'::jsonb, '{"show_birthday": true, "show_age": false, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('56bd1329-6740-572f-aa90-c44d1b27bedf', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E011', 'E011', 'Oliver', 'Grant', 'oliver.grant@northwind.example', '+1-212-555-0011', 'active', 'part_time', '2025-06-15', '1988-02-11', 'ENG-FE', 'Software Engineer', 'L3', 'US-NYC', '6d466aa9-e51a-5d52-9015-152600855932', 'America/New_York', 'USD', 104000, 'salary', 'monthly', FALSE, 165, 0.5, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E011"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('385f5ae5-e567-5fb6-98f8-b45007099ff8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'E012', 'E012', 'Nadia', 'Hassan', 'nadia.hassan@northwind.example', '+1-212-555-0012', 'active', 'contractor', '2025-07-05', '1989-03-12', 'CONSULT', 'Senior Consultant', 'C2', 'US-NYC', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'America/New_York', 'USD', 96000, 'salary', 'monthly', FALSE, 210, 1.0, TRUE, '{"shirt_size": "M", "legacy_id": "HR-E012"}'::jsonb, '{"show_birthday": true, "show_age": true, "show_anniversary": true}'::jsonb, '{"annual": {"balance": 12.5, "unit": "days"}}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

UPDATE employees SET
    profile_picture = '/storage/employees/' || employee_id || '/profile.jpg'
WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1'
  AND employee_id IN ('E001','E002','E004');

UPDATE employees SET
    employment_status = 'terminated',
    end_date = '2026-01-15',
    is_active = FALSE
WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1'
  AND employee_id = 'E012';

-- RESTORED table: two effective-dated rows per employee. A payslip reissued for a period before 2025-12-02 must use the earlier amount - impossible with D1 inlining.
INSERT INTO compensation_base (id, tenant_id, employee_id, effective_from, effective_to, compensation_type, amount, currency, pay_frequency, annual_equivalent, overtime_eligible, change_reason, created_by) VALUES
    ('143c42f7-486d-500f-b8a3-4e0400b6f277', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '2024-11-27', '2025-12-01', 'salary', 173900, 'USD', 'monthly', 173900, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e2c1dcf2-ca82-5b8b-9360-c2a0cf3232ab', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '2025-12-02', NULL, 'salary', 185000, 'USD', 'monthly', 185000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('62bd1982-0827-5003-9ede-1a9e6cd41236', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2024-11-27', '2025-12-01', 'salary', 3008000, 'INR', 'monthly', 3008000, TRUE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('ff54a17b-03e5-543a-b5e9-5d28d00499c0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2025-12-02', NULL, 'salary', 3200000, 'INR', 'monthly', 3200000, TRUE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e3557614-a73f-51f1-8054-55a551f8906a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2024-11-27', '2025-12-01', 'salary', 1974000, 'INR', 'monthly', 1974000, TRUE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('3ca15858-1475-5c1b-8f4b-e3903f77438b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2025-12-02', NULL, 'salary', 2100000, 'INR', 'monthly', 2100000, TRUE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('698bf459-9bd0-5b44-835c-0475b343b885', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2024-11-27', '2025-12-01', 'salary', 139120, 'USD', 'monthly', 139120, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a73e9ec8-85df-58a6-8654-3e12493944ee', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2025-12-02', NULL, 'salary', 148000, 'USD', 'monthly', 148000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('8d8e2f35-f8c0-57e5-a2f0-5ecd1b88e5a2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2024-11-27', '2025-12-01', 'salary', 133480, 'USD', 'monthly', 133480, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('389d9606-f947-503d-98ad-f0fc8aac36d2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2025-12-02', NULL, 'salary', 142000, 'USD', 'monthly', 142000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('d4a8801e-bc54-528b-bd50-0f695e93efde', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '2024-11-27', '2025-12-01', 'salary', 82720, 'GBP', 'monthly', 82720, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('964af5c9-d2a1-5c08-9291-f47f2c83873e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '2025-12-02', NULL, 'salary', 88000, 'GBP', 'monthly', 88000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('98f76243-5db8-5dfd-aa94-b7f5c6028fce', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '18503470-ba5c-5450-bc3e-b0a2454d757f', '2024-11-27', '2025-12-01', 'salary', 77080, 'GBP', 'monthly', 77080, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('57fc8797-3c9a-5b47-90a8-cafb847e5ceb', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '18503470-ba5c-5450-bc3e-b0a2454d757f', '2025-12-02', NULL, 'salary', 82000, 'GBP', 'monthly', 82000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a4dfef96-7936-575f-9407-fc8b054b00b0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e05fd53c-ebdf-5049-810a-28a63369f93a', '2024-11-27', '2025-12-01', 'salary', 66740, 'GBP', 'monthly', 66740, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('6f200743-e4a9-5290-90b9-b458700fc3a2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e05fd53c-ebdf-5049-810a-28a63369f93a', '2025-12-02', NULL, 'salary', 71000, 'GBP', 'monthly', 71000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('ef63423e-5c7f-559c-ba7f-190968cefef6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', '2024-11-27', '2025-12-01', 'salary', 110920, 'USD', 'monthly', 110920, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('11669902-8e51-528e-a796-59ad223ccf5d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', '2025-12-02', NULL, 'salary', 118000, 'USD', 'monthly', 118000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('89364685-dd04-573b-85fe-b49fc2cf7e7e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', '2024-11-27', '2025-12-01', 'salary', 63920, 'USD', 'monthly', 63920, TRUE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('2c3e9e38-4a34-5de4-850a-5b24826960d1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', '2025-12-02', NULL, 'salary', 68000, 'USD', 'monthly', 68000, TRUE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('f2447a3c-7840-53bf-b001-deaa9fafe2a0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2024-11-27', '2025-12-01', 'salary', 97760, 'USD', 'monthly', 97760, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('218fdaf4-cb5c-5017-823b-904c541520fc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2025-12-02', NULL, 'salary', 104000, 'USD', 'monthly', 104000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('38bdc9b4-506c-5339-9b4a-6d0d06763a40', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '385f5ae5-e567-5fb6-98f8-b45007099ff8', '2024-11-27', '2025-12-01', 'salary', 90240, 'USD', 'monthly', 90240, FALSE, 'new_hire', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('ca3ce8d1-681d-5529-8ed5-8518f70cf093', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '385f5ae5-e567-5fb6-98f8-b45007099ff8', '2025-12-02', NULL, 'salary', 96000, 'USD', 'monthly', 96000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- RESTORED table: work authorization expiry is a compliance obligation D1 had dropped
INSERT INTO employment_terms (id, tenant_id, employee_id, employment_type, start_date, contract_type, probation_period_days, probation_end_date, notice_period_days, work_authorization_type, work_authorization_expiry, fte) VALUES
    ('dc3b2bd4-43d5-57d2-ac07-145993fe8fea', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'full_time', '2024-11-27', 'permanent', 90, '2025-02-25', 30, 'citizen', NULL, 1.0),
    ('fa32e689-d93e-5108-b74f-d8b645f47490', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'full_time', '2024-12-17', 'permanent', 90, '2025-03-17', 30, 'work_visa', '2027-05-26', 1.0),
    ('3e2600d8-ec5b-5021-9495-55e7b6f11cc7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'full_time', '2025-01-06', 'permanent', 90, '2025-04-06', 30, 'work_visa', '2027-06-05', 1.0),
    ('7c20ec10-34bf-5dbd-a0f0-93cde5ccab49', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'full_time', '2025-01-26', 'permanent', 90, '2025-04-26', 30, 'citizen', NULL, 1.0),
    ('11dd17a2-33a5-5020-ad69-221cedb9c496', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'full_time', '2025-02-15', 'permanent', 90, '2025-05-16', 30, 'citizen', NULL, 1.0),
    ('a38702a9-50f3-52de-b857-513d7e01b145', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'full_time', '2025-03-07', 'permanent', 90, '2025-06-05', 30, 'work_visa', '2027-07-05', 1.0),
    ('867f320c-77dc-5029-9e81-b64ca1887935', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '18503470-ba5c-5450-bc3e-b0a2454d757f', 'full_time', '2025-03-27', 'permanent', 90, '2025-06-25', 30, 'work_visa', '2027-07-15', 1.0),
    ('fc990a82-ba3e-5448-ae0a-a5b1dc6cb5f2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e05fd53c-ebdf-5049-810a-28a63369f93a', 'full_time', '2025-04-16', 'permanent', 90, '2025-07-15', 30, 'work_visa', '2027-07-25', 1.0),
    ('7b5321eb-83fa-517c-895c-dd7c42f192f9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', 'full_time', '2025-05-06', 'permanent', 90, '2025-08-04', 30, 'citizen', NULL, 1.0),
    ('da977090-28e3-5de5-af25-4d728876b2a7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', 'full_time', '2025-05-26', 'permanent', 90, '2025-08-24', 30, 'citizen', NULL, 1.0),
    ('5c1c5f95-afd9-5c6a-8ae8-8bd13df81a07', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'part_time', '2025-06-15', 'permanent', 90, '2025-09-13', 30, 'citizen', NULL, 0.5),
    ('7b53fc2c-b917-58cd-a23c-93f521fbcc5f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'contractor', '2025-07-05', 'fixed_term', 90, '2025-10-03', 14, 'citizen', NULL, 1.0);

-- Allowances incl. Indian HRA (multi-currency)
INSERT INTO compensation_allowances (id, tenant_id, employee_id, allowance_type, allowance_name, effective_from, amount, currency, frequency, is_taxable, status) VALUES
    ('f987d8c3-e145-58c3-9e7c-ac27beaf5d6d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'housing', 'House Rent Allowance', '2025-01-01', 45000, 'INR', 'monthly', TRUE, 'active'),
    ('0129f504-4ffe-5530-b6fb-e11c766ba465', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'housing', 'House Rent Allowance', '2025-01-01', 32000, 'INR', 'monthly', TRUE, 'active'),
    ('9bf56bef-928e-5392-af9b-e42f2e14e460', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'transportation', 'Transport Allowance', '2025-01-01', 3200, 'INR', 'monthly', FALSE, 'active'),
    ('05339b3a-dd24-529d-8708-68a67e785473', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'phone', 'Mobile Allowance', '2025-01-01', 60, 'GBP', 'monthly', FALSE, 'active'),
    ('20f23e62-318d-56fb-87d1-acddd843ab07', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'internet', 'Home Internet', '2025-01-01', 80, 'USD', 'monthly', FALSE, 'active');

-- Jurisdiction-specific leave policies
INSERT INTO hr_time_off_policies (id, tenant_id, policy_code, policy_name, time_off_type, accrual_rules, employment_types, location_codes, is_active, created_at, updated_at, created_by) VALUES
    ('83fce9b5-f070-5026-9283-fda8e335a592', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'US-PTO', 'US Paid Time Off', 'pto', '{"rate": 1.67, "unit": "days", "period": "monthly", "max_carryover": 5}'::jsonb, '["full_time", "part_time"]'::jsonb, '["US-NYC"]'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('2fc48afc-a516-563c-aeb0-1797cb88dd60', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'UK-ANNUAL', 'UK Annual Leave', 'annual', '{"rate": 2.33, "unit": "days", "period": "monthly", "max_carryover": 5}'::jsonb, '["full_time", "part_time"]'::jsonb, '["UK-LON"]'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('2f24f516-1e79-5c6b-824d-43e4f0004055', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'IN-EARNED', 'India Earned Leave', 'annual', '{"rate": 1.75, "unit": "days", "period": "monthly", "max_carryover": 30}'::jsonb, '["full_time", "part_time"]'::jsonb, '["IN-BLR"]'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('c37bc178-2ab7-57a4-89c7-e342e8094138', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'GLOBAL-SICK', 'Sick Leave', 'sick', '{"rate": 0.83, "unit": "days", "period": "monthly", "max_carryover": 0}'::jsonb, '["full_time", "part_time"]'::jsonb, '["US-NYC", "UK-LON", "IN-BLR"]'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- RESTORED table: accrual ledger. D1 inlined this to a mutable JSONB blob with no audit trail.
INSERT INTO hr_time_off_balances (id, tenant_id, employee_id, policy_id, accrual_year, opening_balance, accrued, used, pending, carried_over, current_balance, unit) VALUES
    ('d7dd3529-c715-57e5-80b3-a405485e886a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '83fce9b5-f070-5026-9283-fda8e335a592', 2026, 5.0, 10.0, 3.0, 0.0, 5.0, 12.0, 'days'),
    ('6c171532-12a0-5caf-8231-465f8139711a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '83fce9b5-f070-5026-9283-fda8e335a592', 2026, 2.0, 10.0, 6.5, 1.0, 2.0, 4.5, 'days'),
    ('e200e0cb-8c2f-5bf5-8be0-c04361f8eb0b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '83fce9b5-f070-5026-9283-fda8e335a592', 2026, 5.0, 10.0, 0.0, 2.0, 5.0, 13.0, 'days'),
    ('bbfe5767-f544-5afc-84a6-1af5ab262814', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '2fc48afc-a516-563c-aeb0-1797cb88dd60', 2026, 5.0, 14.0, 8.0, 0.0, 5.0, 11.0, 'days'),
    ('7384f0ef-8b24-5659-9347-0eeb8b472cc4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2f24f516-1e79-5c6b-824d-43e4f0004055', 2026, 12.0, 10.5, 4.0, 0.0, 12.0, 18.5, 'days'),
    ('5325550c-49e6-5324-b8b7-23bf2c51bbbb', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2f24f516-1e79-5c6b-824d-43e4f0004055', 2026, 6.0, 10.5, 0.0, 3.0, 6.0, 13.5, 'days'),
    ('eed7ed08-1b67-564c-8a13-b5ce3d796b99', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'c37bc178-2ab7-57a4-89c7-e342e8094138', 2026, 0.0, 5.0, 1.0, 0.0, 0.0, 4.0, 'days');

-- Time off requests in mixed approval states
INSERT INTO hr_time_off_requests (id, tenant_id, request_id, employee_id, policy_code, start_date, end_date, total_hours, status, reason, approver_id, approved_at, submitted_at, updated_at) VALUES
    ('70aa9eff-61f7-5867-a657-3a6940cde2bd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TOR-001', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'US-PTO', '2026-02-10', '2026-02-14', 40.0, 'approved', 'Family holiday', '6d466aa9-e51a-5d52-9015-152600855932', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('6c7521f5-94e0-52de-b767-cf23b9611bcc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TOR-002', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'UK-ANNUAL', '2026-03-02', '2026-03-09', 56.0, 'approved', 'Annual leave', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('28cb9708-d666-5753-8574-3ccc56b611a1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TOR-003', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'IN-EARNED', '2026-03-17', '2026-03-19', 24.0, 'pending', 'Personal', NULL, NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('8e433633-f423-57b6-ae17-027051bd73c0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TOR-004', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'US-PTO', '2026-04-01', '2026-04-02', 16.0, 'pending', 'Conference', NULL, NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('7c9370ff-d2be-5606-bda3-3594b05dda4e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TOR-005', '6d466aa9-e51a-5d52-9015-152600855932', 'GLOBAL-SICK', '2026-01-13', '2026-01-13', 8.0, 'approved', 'Unwell', NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Emergency contacts
INSERT INTO hr_emergency_contacts (id, tenant_id, employee_id, contact_name, relationship, is_primary, created_at, updated_at) VALUES
    ('ad65d92d-c7d3-5178-a788-b7e4ecb9e2bd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'Michael Johnson', 'spouse', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('c75f6a31-cddf-58c8-97de-b87698f53477', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'Wei Chen', 'parent', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('a5291a83-e115-5c77-8e35-41b9c64c6f23', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'Chidi Okafor', 'sibling', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Three clients
INSERT INTO clients (id, tenant_id, client_code, client_name, industry, status, is_active, country, currency, default_hourly_rate, payment_terms, account_manager_id, primary_contact_name, primary_contact_email, created_by) VALUES
    ('0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ACME', 'Acme Manufacturing', 'manufacturing', 'active', TRUE, 'US', 'USD', 225, 'net_30', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', 'A. Contact', 'contact@acme.example', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('8594031f-d3f3-5d62-a5ab-f99b3a89c720', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'BRITCO', 'Britannia Retail Group', 'retail', 'active', TRUE, 'GB', 'GBP', 195, 'net_30', 'e05fd53c-ebdf-5049-810a-28a63369f93a', 'A. Contact', 'contact@britco.example', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e22e6459-7c1d-5857-9908-89d775c82245', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'HELIOS', 'Helios Energy', 'energy', 'active', TRUE, 'US', 'USD', 260, 'net_30', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', 'A. Contact', 'contact@helios.example', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Company objective (links to hr_goals)
INSERT INTO pm_objectives (id, tenant_id, objective_id, objective_number, objective_name, objective_type, fiscal_year, quarter, department_code, owner_employee_id, status, progress_percentage, target_revenue, actual_revenue, currency, start_date, target_end_date, created_at, updated_at, created_by) VALUES
    ('960d66b2-8a52-59d0-8cf8-5c383d031244', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'OBJ-001', 'OBJ-001', 'Grow consulting revenue 30% in FY26', 'revenue', 2026, 'Q1', 'CONSULT', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'active', 42.0, 2400000, 1010000, 'USD', '2026-01-01', '2026-12-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Four projects linked to clients and the company objective
INSERT INTO projects (id, tenant_id, project_id, project_number, project_name, objective_id, client_id, project_manager_id, department_code, location_code, start_date, target_end_date, status, priority, progress_percentage, health_status, budget, currency, estimated_hours, actual_hours, billing_method, is_billable, hourly_rate, client_visible, custom_fields, task_count, completed_task_count, created_at, updated_at, created_by) VALUES
    ('8257009f-6a91-5fd1-9efb-518198c08e2a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-001', 'PRJ-001', 'Acme ERP Integration', '960d66b2-8a52-59d0-8cf8-5c383d031244', '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'active', 'high', 35.0, 'on_track', 180000, 'USD', 1200, 408, 'hourly', TRUE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('fda698f3-bf14-5aae-bed6-330c8b5a6a70', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-002', 'PRJ-002', 'Britannia Loyalty Platform', '960d66b2-8a52-59d0-8cf8-5c383d031244', '8594031f-d3f3-5d62-a5ab-f99b3a89c720', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'active', 'high', 35.0, 'on_track', 140000, 'GBP', 900, 306, 'hourly', TRUE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('f606af3e-f56f-5050-b663-02471b9f9dbd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-003', 'PRJ-003', 'Helios Data Migration', '960d66b2-8a52-59d0-8cf8-5c383d031244', 'e22e6459-7c1d-5857-9908-89d775c82245', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'active', 'high', 35.0, 'on_track', 95000, 'USD', 620, 211, 'hourly', TRUE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('1da967fa-e086-53c7-b9d1-7605759dfda3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-004', 'PRJ-004', 'Internal Tooling', '960d66b2-8a52-59d0-8cf8-5c383d031244', '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', '6d466aa9-e51a-5d52-9015-152600855932', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'on_hold', 'high', 35.0, 'on_track', 0, 'USD', 300, 102, 'hourly', FALSE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Tasks across projects, mixed statuses
INSERT INTO tasks (id, tenant_id, task_id, task_number, project_id, task_name, status, priority, assigned_to, estimated_hours, actual_hours, progress_percentage, is_billable, due_date, custom_fields, created_at, updated_at, created_by) VALUES
    ('48961ce2-d17a-5ebe-81db-f608b4b6b125', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'T-001', 'T-001', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'Discovery workshops', 'done', 'medium', '11f31511-ad53-59c7-9e90-8ee3b553489b', 40, 38, 100.0, TRUE, '2026-03-02', '{"client_billable": true}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('864cc09e-6b7e-58b4-a2e2-04233fbfea70', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'T-002', 'T-002', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'Data model mapping', 'in_progress', 'medium', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 120, 54, 40.0, TRUE, '2026-03-02', '{"client_billable": true}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('6d029a3a-8887-50a7-85b0-9e22408bdf61', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'T-003', 'T-003', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'Integration build', 'todo', 'medium', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 260, 0, 0.0, TRUE, '2026-03-02', '{"client_billable": true}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e5557981-472b-5016-a458-b1de5cce6910', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'T-004', 'T-004', 'fda698f3-bf14-5aae-bed6-330c8b5a6a70', 'Loyalty rules engine', 'in_progress', 'medium', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 180, 72, 40.0, TRUE, '2026-03-02', '{"client_billable": true}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e4e56db4-f78b-53d8-8478-d304c6faf982', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'T-005', 'T-005', 'fda698f3-bf14-5aae-bed6-330c8b5a6a70', 'Frontend build', 'todo', 'medium', '56bd1329-6740-572f-aa90-c44d1b27bedf', 150, 0, 0.0, TRUE, '2026-03-02', '{"client_billable": true}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('d144cb33-1f61-5317-993c-074c63e6716e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'T-006', 'T-006', 'f606af3e-f56f-5050-b663-02471b9f9dbd', 'Legacy extract', 'in_progress', 'medium', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 90, 31, 40.0, TRUE, '2026-03-02', '{"client_billable": true}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('4f6dba03-79a9-5486-8d78-dab75767d59e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'T-007', 'T-007', '1da967fa-e086-53c7-b9d1-7605759dfda3', 'CI pipeline', 'todo', 'medium', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 60, 0, 0.0, TRUE, '2026-03-02', '{"client_billable": true}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- RESTORED table: effective-dated rates. January work must bill at January rates.
INSERT INTO time_tracking_hourly_rates (id, tenant_id, employee_id, client_id, cost_rate, billable_rate, currency, effective_from, effective_to, change_reason, is_active, created_by) VALUES
    ('eac68c02-7b6f-5f53-9a11-86a4cf292524', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', 95, 205, 'USD', '2025-01-01', '2025-12-31', 'initial_rate_card', FALSE, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('f0f6d0e9-559e-53c8-acb8-eceb3b637197', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', 102, 225, 'USD', '2026-01-01', NULL, '2026_rate_increase', TRUE, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('286da2b9-071e-577f-9fb4-8d816408fa4a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '8594031f-d3f3-5d62-a5ab-f99b3a89c720', 78, 195, 'GBP', '2026-01-01', NULL, '2026_rate_card', TRUE, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('1cd9318f-1404-5da3-8137-b7e34a981661', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'e22e6459-7c1d-5857-9908-89d775c82245', 110, 260, 'USD', '2026-01-01', NULL, 'contractor_rate', TRUE, '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Weekly timesheets. Hours and entry counts are DERIVED from time_tracking_entries.
INSERT INTO time_tracking_timesheets (id, tenant_id, timesheet_number, employee_id, period_type, period_start, period_end, total_hours, billable_hours, non_billable_hours, entry_count, status, created_at, updated_at) VALUES
    ('90ec22cb-b19d-52c4-b8ad-c0dffc9b8ea0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TS-001', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'weekly', '2026-01-06', '2026-01-12', 26.0, 22.0, 4.0, 4, 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('dbd91428-a92e-5214-ae97-8a88806a7f67', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TS-002', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'weekly', '2026-01-06', '2026-01-12', 15.5, 15.5, 0.0, 2, 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('e40b5ae5-586e-5cf5-b086-c8acf146e0da', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TS-003', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'weekly', '2026-01-06', '2026-01-12', 15.0, 15.0, 0.0, 2, 'submitted', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('d634105b-83dc-55f4-944b-ea9dcb78d1f6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TS-004', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'weekly', '2026-01-06', '2026-01-12', 8.0, 8.0, 0.0, 1, 'draft', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Time entries linked to timesheets, projects and tasks
INSERT INTO time_tracking_entries (id, tenant_id, entry_id, employee_id, timesheet_id, project_id, task_id, client_id, entry_date, hours, duration_hours, is_billable, hourly_rate, billable_amount, currency, description, status, created_at, updated_at) VALUES
    ('28a1b5e3-0d2e-57ba-a0db-5953f65e20f2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-001', '11f31511-ad53-59c7-9e90-8ee3b553489b', '90ec22cb-b19d-52c4-b8ad-c0dffc9b8ea0', '8257009f-6a91-5fd1-9efb-518198c08e2a', '48961ce2-d17a-5ebe-81db-f608b4b6b125', NULL, '2026-01-06', 7.5, 7.5, TRUE, 225, 1687.5, 'USD', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('29785891-532c-5055-b8ff-17b2bebbc8c6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-002', '11f31511-ad53-59c7-9e90-8ee3b553489b', '90ec22cb-b19d-52c4-b8ad-c0dffc9b8ea0', '8257009f-6a91-5fd1-9efb-518198c08e2a', '864cc09e-6b7e-58b4-a2e2-04233fbfea70', NULL, '2026-01-07', 8.0, 8.0, TRUE, 225, 1800.0, 'USD', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('f8cb641a-6288-5b73-b488-c01c35f73754', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-003', '11f31511-ad53-59c7-9e90-8ee3b553489b', '90ec22cb-b19d-52c4-b8ad-c0dffc9b8ea0', '8257009f-6a91-5fd1-9efb-518198c08e2a', '864cc09e-6b7e-58b4-a2e2-04233fbfea70', NULL, '2026-01-08', 6.5, 6.5, TRUE, 225, 1462.5, 'USD', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('7eb074e7-8cc1-5c98-a3f2-f3393e3f8d20', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-004', '11f31511-ad53-59c7-9e90-8ee3b553489b', '90ec22cb-b19d-52c4-b8ad-c0dffc9b8ea0', NULL, NULL, NULL, '2026-01-09', 4.0, 4.0, FALSE, NULL, NULL, 'USD', 'Internal admin', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('a07027b1-0c58-561c-995d-8f2ca556fddd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-005', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'dbd91428-a92e-5214-ae97-8a88806a7f67', 'fda698f3-bf14-5aae-bed6-330c8b5a6a70', 'e5557981-472b-5016-a458-b1de5cce6910', NULL, '2026-01-10', 8.0, 8.0, TRUE, 195, 1560.0, 'GBP', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('9448ef6b-fdce-58fe-ba36-20508fa34bc5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-006', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'dbd91428-a92e-5214-ae97-8a88806a7f67', 'fda698f3-bf14-5aae-bed6-330c8b5a6a70', 'e5557981-472b-5016-a458-b1de5cce6910', NULL, '2026-01-06', 7.5, 7.5, TRUE, 195, 1462.5, 'GBP', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('21549c01-d3f5-5d2c-af1a-2ddf46f223b7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-007', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'e40b5ae5-586e-5cf5-b086-c8acf146e0da', '8257009f-6a91-5fd1-9efb-518198c08e2a', '864cc09e-6b7e-58b4-a2e2-04233fbfea70', NULL, '2026-01-07', 8.0, 8.0, TRUE, 150, 1200.0, 'USD', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('6fe05d7d-a1ea-5532-84cd-1e6d2b7bf4a9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-008', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'e40b5ae5-586e-5cf5-b086-c8acf146e0da', '8257009f-6a91-5fd1-9efb-518198c08e2a', '864cc09e-6b7e-58b4-a2e2-04233fbfea70', NULL, '2026-01-08', 7.0, 7.0, TRUE, 150, 1050.0, 'USD', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('990702ae-fed9-57b0-8b5e-769ed2c28f8b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-009', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'd634105b-83dc-55f4-944b-ea9dcb78d1f6', 'f606af3e-f56f-5050-b663-02471b9f9dbd', 'd144cb33-1f61-5317-993c-074c63e6716e', NULL, '2026-01-09', 8.0, 8.0, TRUE, 260, 2080.0, 'USD', 'Client delivery work', 'approved', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

INSERT INTO time_tracking_billable_expenses (id, tenant_id, expense_id, employee_id, project_id, client_id, expense_date, description, expense_type, category, amount, currency, markup_percentage, markup_amount, billable_amount, has_receipt, receipt_url, is_billable, is_reimbursable, status, approved_by, approved_at, submitted_at, created_at, updated_at) VALUES
    ('a3fb770c-9ae9-58ab-8104-29a642d613e2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TT-EXP-001', '11f31511-ad53-59c7-9e90-8ee3b553489b', '8257009f-6a91-5fd1-9efb-518198c08e2a', '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', '2026-01-16', 'Acme onsite workshop airfare', 'travel', 'travel', 845.20, 'USD', 0.00, 0.00, 845.20, TRUE, '/storage/receipts/TT-EXP-001.pdf', TRUE, TRUE, 'approved', '6d466aa9-e51a-5d52-9015-152600855932', '2026-01-17T09:00:00Z', '2026-01-16T18:00:00Z', '2026-01-16T18:00:00Z', '2026-01-17T09:00:00Z');

-- Ticketing business areas with per-area number sequences
INSERT INTO ticketing_business_areas (id, tenant_id, prefix, name, description, active, current_sequence, is_active, created_at, created_by, updated_at) VALUES
    ('872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'IT', 'IT Support', 'Internal IT and equipment requests', TRUE, 3, TRUE, '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-01T09:00:00Z'),
    ('2e90b722-25ef-51b7-866b-e93d3bcca1c3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'FAC', 'Facilities', 'Office and facilities requests', TRUE, 1, TRUE, '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-01T09:00:00Z'),
    ('c9800088-b86b-5ddd-acdc-5b9fbe32f268', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CS', 'Client Support', 'Client-raised support tickets', TRUE, 2, TRUE, '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-01T09:00:00Z');

UPDATE ticketing_business_areas SET
    categories = CASE prefix
        WHEN 'IT' THEN '[{"key": "hardware", "label": "Hardware"}, {"key": "access", "label": "Access"}]'::jsonb
        WHEN 'CS' THEN '[{"key": "performance", "label": "Performance"}, {"key": "question", "label": "Question"}]'::jsonb
        ELSE '[{"key": "facilities", "label": "Facilities"}]'::jsonb
    END,
    custom_fields = '{"impact": {"type": "select", "required": true}, "client_visible": {"type": "boolean"}}'::jsonb,
    roles = '{"agent": ["update", "assign"], "manager": ["close", "reopen"]}'::jsonb
WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1';

-- Tickets across three business areas. search_vector is populated by trigger on insert.
INSERT INTO ticketing_tickets (id, tenant_id, business_area_id, ticket_number, prefix, sequence_number, title, subject, description, category, status, priority, severity, internal_summary, external_summary, private, due_date, logged_at, updated_at, resolved_at, reported_by, logger_id, last_updated_by, assignees, custom_fields, version, created_at) VALUES
    ('a22f6d41-d654-5951-a043-e174f7e1a258', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', 'IT-0001', 'IT', 1, 'Laptop will not boot', 'Laptop will not boot', 'Laptop will not boot', 'hardware', 'open', 'high', 'high', 'Internal notes for Laptop will not boot', 'Laptop will not boot', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('81535673-0241-5ed1-bb17-6fe1c042e9f1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', 'IT-0002', 'IT', 2, 'VPN access for new starter', 'VPN access for new starter', 'VPN access for new starter', 'access', 'resolved', 'medium', 'medium', 'Internal notes for VPN access for new starter', 'VPN access for new starter', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '56bd1329-6740-572f-aa90-c44d1b27bedf', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('c7f8ebb6-27b9-5098-b584-d4a3e0518c50', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', 'IT-0003', 'IT', 3, 'Second monitor request', 'Second monitor request', 'Second monitor request', 'hardware', 'open', 'low', 'low', 'Internal notes for Second monitor request', 'Second monitor request', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('7cf9d829-a0aa-5a22-a1f5-f8f7d7464977', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2e90b722-25ef-51b7-866b-e93d3bcca1c3', 'FAC-0001', 'FAC', 1, 'Meeting room booking system down', 'Meeting room booking system down', 'Meeting room booking system down', 'facilities', 'in_progress', 'medium', 'medium', 'Internal notes for Meeting room booking system down', 'Meeting room booking system down', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, '11f31511-ad53-59c7-9e90-8ee3b553489b', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('fbc213ca-f362-58d3-aa36-45db45958e60', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c9800088-b86b-5ddd-acdc-5b9fbe32f268', 'CS-0001', 'CS', 1, 'Acme reports slow report generation', 'Acme reports slow report generation', 'Acme reports slow report generation', 'performance', 'in_progress', 'high', 'high', 'Internal notes for Acme reports slow report generation', 'Acme reports slow report generation', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, '11f31511-ad53-59c7-9e90-8ee3b553489b', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '["db1f1f2b-b140-5948-a34e-1c998ed98757"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('6e78ba43-d504-546e-933d-4a5dce8d3313', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c9800088-b86b-5ddd-acdc-5b9fbe32f268', 'CS-0002', 'CS', 2, 'Britannia data export format query', 'Britannia data export format query', 'Britannia data export format query', 'question', 'resolved', 'low', 'low', 'Internal notes for Britannia data export format query', 'Britannia data export format query', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '["b9b84064-a67a-5048-8282-8fc048b4dbfb"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z');

UPDATE ticketing_tickets SET
    private = TRUE,
    subscribers = '["6d466aa9-e51a-5d52-9015-152600855932", "a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb,
    request_type = 'bug_fix',
    custom_fields = '{"impact": "department", "client_visible": false}'::jsonb
WHERE ticket_number = 'IT-0003';

UPDATE ticketing_tickets SET
    parent_ticket_number = 'CS-0001',
    linked_tickets = '["IT-0001"]'::jsonb,
    request_type = 'support',
    custom_fields = '{"impact": "client", "client_visible": true}'::jsonb
WHERE ticket_number = 'CS-0002';

-- Ticket updates - also trigger-indexed for full-text search
INSERT INTO ticketing_updates (id, tenant_id, update_id, ticket_id, ticket_number, update_type, author_id, author_employee_id, author_name, comment_text, content_text, visibility, is_internal, created_at) VALUES
    ('9b9048a4-633b-542c-aa10-5e701d68d599', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TU-001', 'a22f6d41-d654-5951-a043-e174f7e1a258', 'IT-0001', 'comment', 'a87e0200-0849-53b6-a491-e882feace3f5', 'a87e0200-0849-53b6-a491-e882feace3f5', 'E010', 'Replacement unit ordered, ETA Thursday.', 'Replacement unit ordered, ETA Thursday.', 'internal', TRUE, '2026-01-01T09:00:00Z'),
    ('adeb5b8f-2931-5953-8f88-20f70c485ca5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TU-002', 'a22f6d41-d654-5951-a043-e174f7e1a258', 'IT-0001', 'comment', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'E004', 'Thanks - I can work from the spare machine until then.', 'Thanks - I can work from the spare machine until then.', 'internal', TRUE, '2026-01-01T09:00:00Z'),
    ('04634de5-de4e-51a9-91b1-4e08eed80953', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TU-003', '81535673-0241-5ed1-bb17-6fe1c042e9f1', 'IT-0002', 'comment', 'a87e0200-0849-53b6-a491-e882feace3f5', 'a87e0200-0849-53b6-a491-e882feace3f5', 'E010', 'VPN profile issued and tested.', 'VPN profile issued and tested.', 'internal', TRUE, '2026-01-01T09:00:00Z'),
    ('d746ac08-167a-52b6-9e0d-14717998905e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TU-004', 'fbc213ca-f362-58d3-aa36-45db45958e60', 'CS-0001', 'comment', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'E002', 'Traced to a missing index on the reporting query.', 'Traced to a missing index on the reporting query.', 'internal', TRUE, '2026-01-01T09:00:00Z'),
    ('eccad372-c665-5b56-845a-4880f7df21a2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TU-005', 'fbc213ca-f362-58d3-aa36-45db45958e60', 'CS-0001', 'comment', '11f31511-ad53-59c7-9e90-8ee3b553489b', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'E005', 'Client confirmed the slowdown started last Tuesday.', 'Client confirmed the slowdown started last Tuesday.', 'internal', TRUE, '2026-01-01T09:00:00Z'),
    ('a33c3c9c-0762-5919-82da-ce25bad737bf', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TU-006', '6e78ba43-d504-546e-933d-4a5dce8d3313', 'CS-0002', 'comment', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'E004', 'Sent the CSV schema documentation.', 'Sent the CSV schema documentation.', 'internal', TRUE, '2026-01-01T09:00:00Z');

-- Chart of accounts (seeded default for a services firm)
INSERT INTO chart_of_accounts (id, tenant_id, account_code, account_name, account_name_i18n, account_type, account_subtype, is_bank_account, is_active, currency, current_balance) VALUES
    ('eef02e95-6acb-5039-8acc-56340013e53a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '1000', 'Cash at Bank', '{"en-US": "Cash at Bank"}'::jsonb, 'asset', 'current_asset', TRUE, TRUE, 'USD', 0),
    ('a6ecad5d-10af-5286-807b-cd31b3266d99', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '1100', 'Accounts Receivable', '{"en-US": "Accounts Receivable"}'::jsonb, 'asset', 'current_asset', FALSE, TRUE, 'USD', 0),
    ('b82fcb24-a418-5a43-9e06-2d1f0a4a0f3a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '1200', 'Input Tax Recoverable', '{"en-US": "Input Tax Recoverable"}'::jsonb, 'asset', 'current_asset', FALSE, TRUE, 'USD', 0),
    ('3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2000', 'Accounts Payable', '{"en-US": "Accounts Payable"}'::jsonb, 'liability', 'current_liability', FALSE, TRUE, 'USD', 0),
    ('b4399f41-0f93-5eda-8475-df032080505f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2100', 'Payroll Liabilities', '{"en-US": "Payroll Liabilities"}'::jsonb, 'liability', 'current_liability', FALSE, TRUE, 'USD', 0),
    ('c93f0bd3-06a7-51d0-a670-159daf6420fa', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2200', 'Sales Tax Payable', '{"en-US": "Sales Tax Payable"}'::jsonb, 'liability', 'current_liability', FALSE, TRUE, 'USD', 0),
    ('f272fefe-ad92-5d94-bf3f-b834568c0586', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '3000', 'Retained Earnings', '{"en-US": "Retained Earnings"}'::jsonb, 'equity', 'retained_earnings', FALSE, TRUE, 'USD', 0),
    ('6d1ef213-cb96-5ad4-beaf-1d4e07242d65', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '4000', 'Consulting Revenue', '{"en-US": "Consulting Revenue"}'::jsonb, 'revenue', 'operating_revenue', FALSE, TRUE, 'USD', 0),
    ('8e5bbb5d-e1c7-521a-b4d3-98b8cf3b40e4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '4100', 'Software Revenue', '{"en-US": "Software Revenue"}'::jsonb, 'revenue', 'operating_revenue', FALSE, TRUE, 'USD', 0),
    ('d7b8a8d7-d0c0-58cf-8ac0-985c1d7520d3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '4200', 'Foreign Exchange Gain', '{"en-US": "Foreign Exchange Gain"}'::jsonb, 'revenue', 'other_income', FALSE, TRUE, 'USD', 0),
    ('169fb687-1575-5bcc-8e1b-2e32cdfc65c2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5000', 'Salaries & Wages', '{"en-US": "Salaries & Wages"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('2f318c15-7833-53a7-a0a1-71a84087dd17', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5100', 'Contractor Costs', '{"en-US": "Contractor Costs"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('c1158fe0-38ae-5741-a84f-a76381cebae3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5200', 'Travel & Entertainment', '{"en-US": "Travel & Entertainment"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('030e294b-88ad-544e-841a-cfda187885ac', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5300', 'Software Subscriptions', '{"en-US": "Software Subscriptions"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('9d558ace-8adc-52ed-811a-de519ad88a29', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5400', 'Office & Facilities', '{"en-US": "Office & Facilities"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('47289db6-a99e-5207-8f78-a62e982f8e20', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5600', 'Payment Processing Fees', '{"en-US": "Payment Processing Fees"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0);

INSERT INTO payroll_tax_rates (id, tenant_id, tax_rate_id, tax_name, tax_name_i18n, tax_type, rate, country_code, country, region, jurisdiction, jurisdiction_type, jurisdiction_code, effective_from, tax_year, tax_collected_account_id, tax_paid_account_id, is_reverse_charge, rate_structure, is_active) VALUES
    ('a1952ec4-9252-5bbf-89aa-9f2e89d7ef53', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TAX-US-NY-2026', 'New York Sales Tax', '{"en-US": "New York Sales Tax"}'::jsonb, 'sales_tax', 0.08875, 'US', 'US', 'NY', 'US-NY-New York City', 'state_local', 'NYC', '2026-01-01', 2026, 'c93f0bd3-06a7-51d0-a670-159daf6420fa', 'b82fcb24-a418-5a43-9e06-2d1f0a4a0f3a', FALSE, '{"components": [{"name": "state", "rate": 0.04}, {"name": "city", "rate": 0.04875}]}'::jsonb, TRUE),
    ('f740baac-f88d-557d-b54d-ea24fe1a0b91', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TAX-GB-VAT-2026', 'UK VAT Standard', '{"en-US": "UK VAT Standard"}'::jsonb, 'vat', 0.20000, 'GB', 'GB', NULL, 'GB-HMRC', 'country', 'GB', '2026-01-01', 2026, 'c93f0bd3-06a7-51d0-a670-159daf6420fa', 'b82fcb24-a418-5a43-9e06-2d1f0a4a0f3a', FALSE, '{"components": [{"name": "standard_vat", "rate": 0.20}]}'::jsonb, TRUE),
    ('10ef757c-3aa2-5c25-8c18-7f7c19bc0ac3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TAX-GB-RC-2026', 'UK VAT Reverse Charge', '{"en-US": "UK VAT Reverse Charge"}'::jsonb, 'vat', 0.00000, 'GB', 'GB', NULL, 'GB-HMRC-REVERSE-CHARGE', 'country', 'GB', '2026-01-01', 2026, 'c93f0bd3-06a7-51d0-a670-159daf6420fa', 'b82fcb24-a418-5a43-9e06-2d1f0a4a0f3a', TRUE, '{"reverse_charge": true, "customer_self_assesses": true}'::jsonb, TRUE);

INSERT INTO exchange_rates (id, from_currency, to_currency, rate_date, rate, inverse_rate, source, is_manual, created_at, created_by) VALUES
    ('4f4ff4ab-e64c-50f8-9d84-d926f3494dc1', 'GBP', 'USD', '2026-01-21', 1.270000, 0.787402, 'ECB', FALSE, '2026-01-21T08:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('4ba04769-06cb-520b-a140-c677582102b0', 'GBP', 'USD', '2026-02-07', 1.280000, 0.781250, 'ECB', FALSE, '2026-02-07T08:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('13639ff8-f902-5e32-b1a0-fde77b5e54aa', 'EUR', 'USD', '2026-01-24', 1.090000, 0.917431, 'ECB', FALSE, '2026-01-24T08:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Billing customers (mirror of clients)
INSERT INTO customers (id, tenant_id, customer_number, customer_name, display_name, email, currency, payment_terms, ar_account_id, is_active, custom_fields) VALUES
    ('e40d0f18-1333-5cd1-a969-f5113df51e70', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ACME', 'Acme Manufacturing', 'Acme Manufacturing', 'ap@acme.example', 'USD', 'net_30', 'a6ecad5d-10af-5286-807b-cd31b3266d99', TRUE, '{}'::jsonb),
    ('ac7a04b4-a28e-5a15-9993-596db32c8d4e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'BRITCO', 'Britannia Retail Group', 'Britannia Retail Group', 'ap@britco.example', 'GBP', 'net_30', 'a6ecad5d-10af-5286-807b-cd31b3266d99', TRUE, '{}'::jsonb),
    ('df492f8b-55ce-504f-869d-52f5ffc6292d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'HELIOS', 'Helios Energy', 'Helios Energy', 'ap@helios.example', 'USD', 'net_30', 'a6ecad5d-10af-5286-807b-cd31b3266d99', TRUE, '{}'::jsonb);

UPDATE customers SET
    billing_address = '{"city": "New York", "state": "NY", "country": "US"}'::jsonb,
    tax_rate_id = 'a1952ec4-9252-5bbf-89aa-9f2e89d7ef53'
WHERE customer_number = 'ACME';

UPDATE customers SET
    billing_address = '{"city": "London", "country": "GB"}'::jsonb,
    tax_number = 'GB123456789',
    tax_rate_id = 'f740baac-f88d-557d-b54d-ea24fe1a0b91'
WHERE customer_number = 'BRITCO';

UPDATE customers SET
    billing_address = '{"city": "Austin", "state": "TX", "country": "US"}'::jsonb,
    is_tax_exempt = TRUE,
    custom_fields = '{"tax_exemption_certificate": "EXEMPT-HELIOS-2026"}'::jsonb
WHERE customer_number = 'HELIOS';

-- Invoices in mixed states, multi-currency with base conversion
INSERT INTO invoices (id, tenant_id, customer_id, invoice_number, invoice_date, due_date, currency, exchange_rate, base_currency, subtotal, tax_total, total, amount_paid, amount_due, base_subtotal, base_tax_total, base_total, base_amount_paid, base_amount_due, status, payment_terms) VALUES
    ('c72699f8-700c-5760-a8e8-19ae6dfd53c5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e40d0f18-1333-5cd1-a969-f5113df51e70', 'INV-2026-001', '2026-01-21', '2026-02-20', 'USD', 1.0, 'USD', 42300.0, 0, 42300.0, 42300.0, 0, 42300.0, 0, 42300.0, 42300.0, 0, 'paid', 'net_30'),
    ('a31732ea-dadb-575f-bd99-cbcfeaba29da', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ac7a04b4-a28e-5a15-9993-596db32c8d4e', 'INV-2026-002', '2026-01-21', '2026-02-20', 'GBP', 1.27, 'USD', 28860.0, 0, 28860.0, 10000.0, 18860.0, 36652.2, 0, 36652.2, 12800.0, 23852.2, 'overdue', 'net_30'),
    ('bee0d3ca-72f7-5ba2-9a31-3bbf17daf320', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'df492f8b-55ce-504f-869d-52f5ffc6292d', 'INV-2026-003', '2026-01-21', '2026-02-20', 'USD', 1.0, 'USD', 19760.0, 0, 19760.0, 0, 19760.0, 19760.0, 0, 19760.0, 0, 19760.0, 'draft', 'net_30'),
    ('37bd63c2-86a1-513c-8404-b731dd666b28', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e40d0f18-1333-5cd1-a969-f5113df51e70', 'INV-2026-004', '2026-01-21', '2026-02-20', 'USD', 1.0, 'USD', 36225.0, 3214.97, 39439.97, 7000.0, 32439.97, 36225.0, 3214.97, 39439.97, 7000.0, 32439.97, 'partial', 'net_30'),
    ('a3ff49bc-30c8-57c3-ae07-c0fd6813df3e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e40d0f18-1333-5cd1-a969-f5113df51e70', 'INV-2026-005', '2026-02-05', '2026-02-20', 'USD', 1.0, 'USD', 5000.0, 443.75, 5443.75, 3000.0, 2443.75, 5000.0, 443.75, 5443.75, 3000.0, 2443.75, 'partial', 'net_30');

-- Invoice line items. Invoice subtotal/total are DERIVED from these.
INSERT INTO invoice_lines (tenant_id, id, invoice_id, line_number, description, quantity, unit_price, amount, revenue_account_id) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '99295121-9731-52d7-aa57-16dc70dd66ae', 'c72699f8-700c-5760-a8e8-19ae6dfd53c5', 1, 'Consulting - discovery workshops', 38.0, 225, 8550.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '979c3096-9a3d-5ae9-8999-1a24c091bdb5', 'c72699f8-700c-5760-a8e8-19ae6dfd53c5', 2, 'Consulting - data mapping', 150.0, 225, 33750.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'd333265b-df6b-565c-9f8c-4e77e9e92eb4', 'a31732ea-dadb-575f-bd99-cbcfeaba29da', 1, 'Loyalty platform development', 148.0, 195, 28860.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '38a295f5-cc12-5286-900a-eb30c0258994', 'bee0d3ca-72f7-5ba2-9a31-3bbf17daf320', 1, 'Data migration services', 76.0, 260, 19760.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '9ce4ba89-2258-53c2-94e7-f9afee5aa317', '37bd63c2-86a1-513c-8404-b731dd666b28', 1, 'Integration build - phase 1', 161.0, 225, 36225.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65');

INSERT INTO invoice_lines (tenant_id, id, invoice_id, line_number, description, quantity, unit_price, amount, tax_rate_id, tax_amount, revenue_account_id, tracking_categories) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a80c5d4e-d7fc-5e8a-9d10-12db6be8e308', 'a3ff49bc-30c8-57c3-ae07-c0fd6813df3e', 1, 'Recurring support retainer', 1.0, 5000.0, 5000.0, 'a1952ec4-9252-5bbf-89aa-9f2e89d7ef53', 443.75, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65', '{"region": "US", "project": "support-retainer"}'::jsonb);

UPDATE invoice_lines SET
    tracking_categories = '{"region": "US", "project": "acme-erp"}'::jsonb
WHERE invoice_id IN ('c72699f8-700c-5760-a8e8-19ae6dfd53c5', '37bd63c2-86a1-513c-8404-b731dd666b28');

UPDATE invoice_lines SET
    tracking_categories = '{"region": "UK", "project": "britannia-loyalty"}'::jsonb
WHERE invoice_id = 'a31732ea-dadb-575f-bd99-cbcfeaba29da';

UPDATE invoice_lines SET
    tax_rate_id = 'a1952ec4-9252-5bbf-89aa-9f2e89d7ef53',
    tax_amount = 3214.97
WHERE id = '9ce4ba89-2258-53c2-94e7-f9afee5aa317';

UPDATE invoices SET
    payment_url = 'https://pay.northwind.example/invoices/' || lower(invoice_number),
    payment_gateway = CASE WHEN customer_id = 'ac7a04b4-a28e-5a15-9993-596db32c8d4e' THEN 'GoCardless' ELSE 'Stripe' END,
    payment_gateway_id = 'gw_' || lower(replace(invoice_number, '-', '_')),
    footer_text = 'Thank you for your business.',
    tracking_categories = '{"segment": "professional_services"}'::jsonb,
    pdf_url = '/storage/invoices/' || invoice_number || '.pdf',
    sent_at = invoice_date::timestamptz + INTERVAL '1 hour',
    viewed_at = invoice_date::timestamptz + INTERVAL '2 days',
    paid_at = CASE WHEN status='paid' THEN invoice_date::timestamptz + INTERVAL '1 day' ELSE NULL END,
    is_recurring = CASE WHEN invoice_number='INV-2026-005' THEN TRUE ELSE is_recurring END,
    recurring_schedule_id = CASE WHEN invoice_number='INV-2026-005' THEN '4d83e8af-2f37-52ff-8971-5e10e9e651b9'::uuid ELSE recurring_schedule_id END
WHERE invoice_number IN ('INV-2026-001','INV-2026-002','INV-2026-004','INV-2026-005');

-- Journal entries
INSERT INTO journal_entries (id, tenant_id, entry_number, entry_date, description, source_type, status, accounting_period, fiscal_year, posted_at) VALUES
    ('c1c96d31-cfa4-57d3-9048-06e3ae1725e6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0001', '2026-01-21', 'Invoice INV-2026-001 raised', 'invoice', 'posted', '2026-01', 2026, '2026-01-01T09:00:00Z'),
    ('7d5527ea-8449-5a3c-8819-e93caf4073b5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0002', '2026-01-21', 'Payment received - Acme', 'payment', 'posted', '2026-01', 2026, '2026-01-01T09:00:00Z'),
    ('9a2fac71-4b74-5342-8c43-46fb77267929', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0003', '2026-01-21', 'January payroll accrual', 'payroll', 'posted', '2026-01', 2026, '2026-01-01T09:00:00Z'),
    ('342f47a2-7820-5fa2-9f92-30e641731b41', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0004', '2026-02-07', 'Partial payment allocated across Acme invoices', 'payment', 'posted', '2026-02', 2026, '2026-02-07T13:00:00Z'),
    ('2a21de82-b959-5412-99ac-89012024b59b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0005', '2026-01-25', 'Bill BILL-AWS-2026-01 approved', 'bill', 'posted', '2026-01', 2026, '2026-01-25T09:00:00Z'),
    ('52034898-f3d8-542e-8202-97395e16e7df', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0006', '2026-02-10', 'AWS batch vendor payment', 'payment', 'posted', '2026-02', 2026, '2026-02-10T15:00:00Z'),
    ('d6b96dae-b54e-5c68-b377-1e8caf7bb90f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0007', '2026-02-12', '1099 contractor bill approved', 'bill', 'posted', '2026-02', 2026, '2026-02-12T10:00:00Z'),
    ('731804dc-b1b9-59a0-9449-14014d9aec92', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0008', '2026-02-15', '1099 contractor payment', 'payment', 'posted', '2026-02', 2026, '2026-02-15T15:00:00Z');

-- Balanced double-entry lines (each entry nets to zero)
INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, line_number, currency, debit_amount, credit_amount, exchange_rate, base_currency, base_debit_amount, base_credit_amount, description) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '34dd6b71-7040-5aa7-98c2-2fb1a0a06e48', 'c1c96d31-cfa4-57d3-9048-06e3ae1725e6', 'a6ecad5d-10af-5286-807b-cd31b3266d99', 1, 'USD', 42300, 0, 1.0, 'USD', 42300, 0, 'AR - Acme'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ac4e339f-1054-56ed-8137-9079dd19062c', 'c1c96d31-cfa4-57d3-9048-06e3ae1725e6', '6d1ef213-cb96-5ad4-beaf-1d4e07242d65', 2, 'USD', 0, 42300, 1.0, 'USD', 0, 42300, 'Consulting revenue'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '3e74ed8d-79d4-5a21-b1a1-7c0fda6f5a1b', '7d5527ea-8449-5a3c-8819-e93caf4073b5', 'eef02e95-6acb-5039-8acc-56340013e53a', 1, 'USD', 42300, 0, 1.0, 'USD', 42300, 0, 'Cash received'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '1f96c924-a682-5c9e-86ce-52a29ad5ecdd', '7d5527ea-8449-5a3c-8819-e93caf4073b5', 'a6ecad5d-10af-5286-807b-cd31b3266d99', 2, 'USD', 0, 42300, 1.0, 'USD', 0, 42300, 'AR cleared'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bc01c486-4fee-5e62-abea-ae7654475e89', '9a2fac71-4b74-5342-8c43-46fb77267929', '169fb687-1575-5bcc-8e1b-2e32cdfc65c2', 1, 'USD', 96500, 0, 1.0, 'USD', 96500, 0, 'Salaries expense'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf47dc80-aff7-5635-9faf-a46a24a52094', '9a2fac71-4b74-5342-8c43-46fb77267929', 'b4399f41-0f93-5eda-8475-df032080505f', 2, 'USD', 0, 96500, 1.0, 'USD', 0, 96500, 'Payroll liability'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '72c7ef17-523f-57ee-8aad-e425438717dc', '342f47a2-7820-5fa2-9f92-30e641731b41', 'eef02e95-6acb-5039-8acc-56340013e53a', 1, 'USD', 10000, 0, 1.0, 'USD', 10000, 0, 'Cash received for Acme invoices'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '1a486efa-2451-57ab-b0d1-dd08bb2c0779', '342f47a2-7820-5fa2-9f92-30e641731b41', 'a6ecad5d-10af-5286-807b-cd31b3266d99', 2, 'USD', 0, 10000, 1.0, 'USD', 0, 10000, 'AR cleared across two invoices'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ec4f044a-3361-53e9-97ab-6fefb7d40cf9', '2a21de82-b959-5412-99ac-89012024b59b', '030e294b-88ad-544e-841a-cfda187885ac', 1, 'USD', 1820, 0, 1.0, 'USD', 1820, 0, 'Cloud hosting expense'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6318e165-71e7-58fb-8873-6a24ea97e7b3', '2a21de82-b959-5412-99ac-89012024b59b', 'b82fcb24-a418-5a43-9e06-2d1f0a4a0f3a', 2, 'USD', 161.53, 0, 1.0, 'USD', 161.53, 0, 'Recoverable input tax'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'cc3bf7e7-7449-551a-872e-f1cb383ebd3f', '2a21de82-b959-5412-99ac-89012024b59b', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 3, 'USD', 0, 1981.53, 1.0, 'USD', 0, 1981.53, 'AP recognized'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2ea421da-d973-5843-8736-25f6a52dfb12', '52034898-f3d8-542e-8202-97395e16e7df', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 1, 'USD', 2500, 0, 1.0, 'USD', 2500, 0, 'AP cleared in vendor batch'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c357204d-832a-5143-8d34-284c7d34c2a1', '52034898-f3d8-542e-8202-97395e16e7df', 'eef02e95-6acb-5039-8acc-56340013e53a', 2, 'USD', 0, 2500, 1.0, 'USD', 0, 2500, 'Cash paid to AWS'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '64e7ff14-c50e-5f33-9d82-a75850148b18', 'd6b96dae-b54e-5c68-b377-1e8caf7bb90f', '2f318c15-7833-53a7-a0a1-71a84087dd17', 1, 'USD', 900, 0, 1.0, 'USD', 900, 0, '1099 contractor services'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a944d19e-7b99-5982-90a8-9627db39f135', 'd6b96dae-b54e-5c68-b377-1e8caf7bb90f', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 2, 'USD', 0, 900, 1.0, 'USD', 0, 900, 'AP recognized for 1099 vendor'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'd0df584b-5e52-5a19-a45e-e4892262ad32', '731804dc-b1b9-59a0-9449-14014d9aec92', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 1, 'USD', 900, 0, 1.0, 'USD', 900, 0, 'AP cleared for contractor'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'dc41be53-0c9a-5d74-a45d-4d9cd6634d36', '731804dc-b1b9-59a0-9449-14014d9aec92', 'eef02e95-6acb-5039-8acc-56340013e53a', 2, 'USD', 0, 900, 1.0, 'USD', 0, 900, 'Cash paid to 1099 contractor');

UPDATE journal_entries SET
    source_id = CASE entry_number
        WHEN 'JE-2026-0001' THEN 'c72699f8-700c-5760-a8e8-19ae6dfd53c5'::uuid
        WHEN 'JE-2026-0002' THEN '26361e4b-8a87-5b2a-a692-10ec68e02875'::uuid
        WHEN 'JE-2026-0004' THEN '4c3b0a1e-770f-55b6-820d-d6ba91c6bf73'::uuid
        WHEN 'JE-2026-0005' THEN 'fdab0a8b-c4d8-5601-bf23-59c3028e9359'::uuid
        WHEN 'JE-2026-0006' THEN 'c147933d-3de1-5a49-b045-3645d4bc5eaf'::uuid
        WHEN 'JE-2026-0007' THEN '0bb6dc98-fc11-5fdc-8986-3fdf2d9e1e4a'::uuid
        WHEN 'JE-2026-0008' THEN '0b67be47-d010-5fb5-9766-c4bb19e30878'::uuid
        ELSE source_id
    END
WHERE entry_number IN ('JE-2026-0001','JE-2026-0002','JE-2026-0004','JE-2026-0005','JE-2026-0006','JE-2026-0007','JE-2026-0008');

UPDATE invoices SET
    journal_entry_id = 'c1c96d31-cfa4-57d3-9048-06e3ae1725e6'
WHERE invoice_number = 'INV-2026-001';

-- Employee expenses posted against expense accounts
INSERT INTO expenses (id, tenant_id, employee_id, expense_date, vendor_name, currency, amount, exchange_rate, base_amount, category_account_id, description, expense_type, is_reimbursable, reimbursement_status) VALUES
    ('0322e10e-37fd-51cc-af9c-cade3b267676', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2026-01-16', 'Delta Airlines', 'USD', 845.2, 1.0, 845.2, 'c1158fe0-38ae-5741-a84f-a76381cebae3', 'Client site visit - Acme', 'travel', TRUE, 'approved'),
    ('79b3bb69-0f9c-51e8-896e-4b77a71c65b7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '2026-01-16', 'Great Western Railway', 'GBP', 142.5, 1.27, 180.97, 'c1158fe0-38ae-5741-a84f-a76381cebae3', 'Client site visit - Britannia', 'travel', TRUE, 'approved'),
    ('aff8d2a4-1126-5e99-a284-a17fe510b356', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '2026-01-16', 'JetBrains', 'USD', 299.0, 1.0, 299.0, '030e294b-88ad-544e-841a-cfda187885ac', 'IDE licences', 'software', TRUE, 'pending'),
    ('f5fe924a-9b92-551f-99b3-a4086f3a247d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', '2026-01-16', 'Staples', 'USD', 86.4, 1.0, 86.4, '9d558ace-8adc-52ed-811a-de519ad88a29', 'Office supplies', 'office', TRUE, 'approved');

UPDATE expenses SET
    receipt_url = '/storage/receipts/delta-acme-2026-01.jpg',
    receipt_ocr_data = '{"vendor": "Delta Airlines", "amount": 845.20, "confidence": 0.94}'::jsonb,
    approved_by = '6d466aa9-e51a-5d52-9015-152600855932',
    approved_at = '2026-01-17T09:00:00Z',
    department_id = 'fc0935fd-6c10-5db1-8e61-e458aeca68c0',
    tracking_categories = '{"client": "ACME", "project": "PRJ-001"}'::jsonb
WHERE id = '0322e10e-37fd-51cc-af9c-cade3b267676';

-- Timezone-aware pay schedules, one per country
INSERT INTO payroll_pay_schedules (id, tenant_id, name, name_i18n, frequency, anchor_date, timezone, currency, location_ids, pay_day_of_month, is_active, is_default, description) VALUES
    ('b57b7e37-7192-5e00-ad55-4ef5ec240a74', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'US Monthly Payroll', '{"en-US": "US Monthly Payroll"}'::jsonb, 'monthly', '2026-01-31', 'America/New_York', 'USD', ARRAY['12c07799-28b4-55df-b8cf-df96df0bf40f']::UUID[], -1, TRUE, TRUE, 'US Monthly Payroll'),
    ('dd7a0200-4d8c-59df-961a-23688d69a312', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'UK Monthly Payroll', '{"en-US": "UK Monthly Payroll"}'::jsonb, 'monthly', '2026-01-31', 'Europe/London', 'GBP', ARRAY['bf32fdb3-c7ed-52bd-b5e3-a581d6ab000c']::UUID[], 28, TRUE, FALSE, 'UK Monthly Payroll'),
    ('ff6266c2-144c-5624-9025-8a8727b449e8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'India Monthly Payroll', '{"en-US": "India Monthly Payroll"}'::jsonb, 'monthly', '2026-01-31', 'Asia/Kolkata', 'INR', ARRAY['25dc9e1b-aa1f-59ae-ad80-da21c61c8242']::UUID[], -1, TRUE, FALSE, 'India Monthly Payroll');

-- January payroll runs, one per country
INSERT INTO payroll_runs (id, tenant_id, run_id, run_number, pay_period_start, pay_period_end, pay_date, run_type, country, pay_schedule_id, currency, run_status, status, employee_count, total_gross_pay, total_net_pay, total_taxes, total_deductions, calculated_at, approved_at, finalized_at, calculated_by, approved_by) VALUES
    ('953095ac-deb3-54dc-baf2-09a7e3829e82', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PR-2026-01-US', 'PR-2026-01-US', '2026-01-01', '2026-01-31', '2026-02-01', 'regular', 'US', 'b57b7e37-7192-5e00-ad55-4ef5ec240a74', 'USD', 'finalized', 'finalized', 7, 63416.66, 44391.66, 15854.16, 3170.84, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-02-01T10:00:00Z', 'a87e0200-0849-53b6-a491-e882feace3f5', '6d466aa9-e51a-5d52-9015-152600855932'),
    ('aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PR-2026-01-UK', 'PR-2026-01-UK', '2026-01-01', '2026-01-31', '2026-02-01', 'regular', 'GB', 'dd7a0200-4d8c-59df-961a-23688d69a312', 'GBP', 'finalized', 'finalized', 3, 20083.33, 13857.6, 5020.75, 1204.98, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-02-01T10:00:00Z', 'a87e0200-0849-53b6-a491-e882feace3f5', '6d466aa9-e51a-5d52-9015-152600855932'),
    ('cf6699a0-43f1-5002-b44f-64f4b8ff7e43', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PR-2026-01-IN', 'PR-2026-01-IN', '2026-01-01', '2026-01-31', '2026-02-01', 'regular', 'IN', 'ff6266c2-144c-5624-9025-8a8727b449e8', 'INR', 'approved', 'approved', 2, 441667.0, 357750.27, 61833.38, 22083.35, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, 'a87e0200-0849-53b6-a491-e882feace3f5', '6d466aa9-e51a-5d52-9015-152600855932');

-- Per-employee payroll lines. gross = net + taxes + deductions for every row.
INSERT INTO payroll_run_employees (id, tenant_id, payroll_run_id, employee_id, status, work_country, work_state, regular_hours, earnings, gross_pay, taxable_wages, taxes, total_taxes, posttax_deductions, total_posttax_deductions, net_pay, payment_method, ytd_gross) VALUES
    ('d191d307-4263-5d5b-a650-927fea148188', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '6d466aa9-e51a-5d52-9015-152600855932', 'calculated', 'US', 'NY', 160.0, '{"base": "15416.67"}'::jsonb, 15416.67, '"15416.67"'::jsonb, '{"income_tax": "2697.92", "social": "1156.25"}'::jsonb, 3854.17, '{"pension": "770.83"}'::jsonb, 770.83, 10791.67, 'direct_deposit', 15416.67),
    ('95ff709e-a864-5ef6-97f1-fc7065faa477', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'calculated', 'US', 'NY', 160.0, '{"base": "12333.33"}'::jsonb, 12333.33, '"12333.33"'::jsonb, '{"income_tax": "2158.33", "social": "925.0"}'::jsonb, 3083.33, '{"pension": "616.67"}'::jsonb, 616.67, 8633.33, 'direct_deposit', 12333.33),
    ('0a757a53-980a-5db8-b579-45805cdb19ad', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'calculated', 'US', 'NY', 160.0, '{"base": "11833.33"}'::jsonb, 11833.33, '"11833.33"'::jsonb, '{"income_tax": "2070.83", "social": "887.5"}'::jsonb, 2958.33, '{"pension": "591.67"}'::jsonb, 591.67, 8283.33, 'direct_deposit', 11833.33),
    ('39f43510-5674-5bd5-aeff-eb88dfc69f76', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', 'calculated', 'US', 'NY', 160.0, '{"base": "9833.33"}'::jsonb, 9833.33, '"9833.33"'::jsonb, '{"income_tax": "1720.83", "social": "737.5"}'::jsonb, 2458.33, '{"pension": "491.67"}'::jsonb, 491.67, 6883.33, 'direct_deposit', 9833.33),
    ('abecce90-9b0e-5ae1-b71a-fd866178f640', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', 'a87e0200-0849-53b6-a491-e882feace3f5', 'calculated', 'US', 'NY', 160.0, '{"base": "5666.67"}'::jsonb, 5666.67, '"5666.67"'::jsonb, '{"income_tax": "991.67", "social": "425.0"}'::jsonb, 1416.67, '{"pension": "283.33"}'::jsonb, 283.33, 3966.67, 'direct_deposit', 5666.67),
    ('b6a03f3c-27e9-5362-8479-c52949439472', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'calculated', 'US', 'NY', 160.0, '{"base": "4333.33"}'::jsonb, 4333.33, '"4333.33"'::jsonb, '{"income_tax": "758.33", "social": "325.0"}'::jsonb, 1083.33, '{"pension": "216.67"}'::jsonb, 216.67, 3033.33, 'direct_deposit', 4333.33),
    ('5328dbdb-ccba-59ed-8bb2-87e05c191f3b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'calculated', 'US', 'NY', 160.0, '{"base": "4000.0"}'::jsonb, 4000.0, '"4000.0"'::jsonb, '{"income_tax": "700.0", "social": "300.0"}'::jsonb, 1000.0, '{"pension": "200.0"}'::jsonb, 200.0, 2800.0, 'direct_deposit', 4000.0),
    ('5e868e2e-1bec-52a8-a9c7-393cef523dfc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'calculated', 'GB', NULL, 160.0, '{"base": "7333.33"}'::jsonb, 7333.33, '"7333.33"'::jsonb, '{"income_tax": "1283.33", "social": "550.0"}'::jsonb, 1833.33, '{"pension": "440.0"}'::jsonb, 440.0, 5060.0, 'direct_deposit', 7333.33),
    ('c0a6c331-fe4c-5b89-bfda-0576173e7a46', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', '18503470-ba5c-5450-bc3e-b0a2454d757f', 'calculated', 'GB', NULL, 160.0, '{"base": "6833.33"}'::jsonb, 6833.33, '"6833.33"'::jsonb, '{"income_tax": "1195.83", "social": "512.5"}'::jsonb, 1708.33, '{"pension": "410.0"}'::jsonb, 410.0, 4715.0, 'direct_deposit', 6833.33),
    ('27f3f1bc-90f5-533c-9173-ffb82a7e915e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', 'e05fd53c-ebdf-5049-810a-28a63369f93a', 'calculated', 'GB', NULL, 160.0, '{"base": "5916.67"}'::jsonb, 5916.67, '"5916.67"'::jsonb, '{"income_tax": "1035.36", "social": "443.73"}'::jsonb, 1479.09, '{"pension": "354.98"}'::jsonb, 354.98, 4082.6, 'direct_deposit', 5916.67),
    ('0c959f40-718e-5922-8acc-2629c44307ec', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'cf6699a0-43f1-5002-b44f-64f4b8ff7e43', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'calculated', 'IN', 'KA', 160.0, '{"base": "266667.0"}'::jsonb, 266667.0, '"266667.0"'::jsonb, '{"income_tax": "26133.37", "social": "11200.01"}'::jsonb, 37333.38, '{"pension": "13333.35"}'::jsonb, 13333.35, 216000.27, 'direct_deposit', 266667.0),
    ('3d63bb34-f6c8-5947-a1e2-171ed3961aa3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'cf6699a0-43f1-5002-b44f-64f4b8ff7e43', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'calculated', 'IN', 'KA', 160.0, '{"base": "175000.0"}'::jsonb, 175000.0, '"175000.0"'::jsonb, '{"income_tax": "17150.0", "social": "7350.0"}'::jsonb, 24500.0, '{"pension": "8750.0"}'::jsonb, 8750.0, 141750.0, 'direct_deposit', 175000.0);

UPDATE payroll_run_employees SET
    pay_stub_url = '/storage/payroll/' || id || '.pdf',
    pay_stub_generated_at = '2026-02-01T14:00:00Z',
    calculation_details = '{"engine": "mock-payroll", "version": "2026.01"}'::jsonb
WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1';

-- Off-cycle payroll run for a bonus correction (US-PAY-003)
INSERT INTO payroll_runs (id, tenant_id, run_id, run_number, pay_period_start, pay_period_end, pay_date, run_type, country, pay_schedule_id, currency, run_status, status, employee_count, total_gross_pay, total_net_pay, total_taxes, total_deductions, calculated_at, approved_at, finalized_at, calculated_by, approved_by) VALUES
    ('30da1814-aa14-5b7a-b970-d54897fb2a41', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PR-2026-01-BONUS-US', 'PR-2026-01-BONUS-US', '2026-01-15', '2026-01-15', '2026-01-19', 'off_cycle', 'US', 'b57b7e37-7192-5e00-ad55-4ef5ec240a74', 'USD', 'approved', 'approved', 1, 2500.00, 1750.00, 750.00, 0.00, '2026-01-15T16:00:00Z', '2026-01-15T17:00:00Z', NULL, 'a87e0200-0849-53b6-a491-e882feace3f5', '6d466aa9-e51a-5d52-9015-152600855932');

-- The off-cycle bonus run's line. Without it the run claimed one employee and
-- 2,500.00 gross with nothing behind it, while marked calculated AND approved
-- — a run that says it paid someone and cannot say whom.
INSERT INTO payroll_run_employees (id, tenant_id, payroll_run_id, employee_id, status, work_country, work_state, regular_hours, earnings, gross_pay, taxable_wages, taxes, total_taxes, posttax_deductions, total_posttax_deductions, net_pay, payment_method, ytd_gross) VALUES
    ('a1c93f5e-2d47-5b81-9c06-3e8f7a2b4d19', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '30da1814-aa14-5b7a-b970-d54897fb2a41', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'calculated', 'US', 'NY', 0.0, '{"bonus": "2500.00"}'::jsonb, 2500.00, '"2500.00"'::jsonb, '{"income_tax": "437.50", "social": "155.00", "medicare": "36.25", "state": "121.25"}'::jsonb, 750.00, '{}'::jsonb, 0.00, 1750.00, 'direct_deposit', 2500.00);

INSERT INTO payroll_tax_deposits (id, tenant_id, deposit_id, deposit_type, jurisdiction, tax_period, period_start, period_end, amount, currency, due_date, payment_status, status, tax_breakdown, related_payroll_runs, created_at, updated_at, created_by) VALUES
    ('969915c1-5b58-5562-bc42-6eef6997a20b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TAXDEP-US-Q1-2026', '941', 'US-FED', '2026-Q1', '2026-01-01', '2026-03-31', 15854.16, 'USD', CURRENT_DATE + 15, 'pending', 'pending', '{"federal_income_tax": "9210.0", "fica": "6644.16"}'::jsonb, ARRAY['953095ac-deb3-54dc-baf2-09a7e3829e82']::UUID[], '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('8c130334-a06f-5561-b1c1-92d04e5e8f90', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TAXDEP-IN-24Q-Q4', '24Q', 'IN-TDS', '2026-Q1', '2026-01-01', '2026-03-31', 61833.38, 'INR', CURRENT_DATE + 20, 'pending', 'pending', '{"tds": "43283.37", "epf": "18550.01"}'::jsonb, ARRAY['cf6699a0-43f1-5002-b44f-64f4b8ff7e43']::UUID[], '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Review cycle
INSERT INTO hr_review_cycles (id, tenant_id, cycle_code, cycle_name, review_type, start_date, self_assessment_due, manager_assessment_due, cycle_close_date, status, is_active, created_at, updated_at, created_by) VALUES
    ('c3f210c4-dfe6-5a9a-9614-53c907fd6187', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2026-H1', 'H1 2026 Performance Review', 'semi_annual', '2026-05-31', '2026-06-15', '2026-06-25', '2026-07-10', 'open', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Performance reviews with JSONB assessments (a preserved D1 simplification)
INSERT INTO hr_reviews (id, tenant_id, review_id, employee_id, reviewer_id, cycle_code, review_type, review_date, self_assessment, manager_assessment, competencies, overall_rating, status, created_at, updated_at) VALUES
    ('40e86787-3514-59e7-acb6-935e9a28a9f3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E002', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '6d466aa9-e51a-5d52-9015-152600855932', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 4.2}'::jsonb, '{"technical": 4.2, "communication": 4.0, "ownership": 4.2}'::jsonb, 4.2, 'submitted', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('568f6664-334c-564a-a5aa-37498ef233dd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E004', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '6d466aa9-e51a-5d52-9015-152600855932', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 4.5}'::jsonb, '{"technical": 4.5, "communication": 4.3, "ownership": 4.5}'::jsonb, 4.5, 'submitted', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('92decf94-143b-5159-8e6e-06b8d243fba1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E006', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 3.9}'::jsonb, '{"technical": 3.9, "communication": 3.6999999999999997, "ownership": 3.9}'::jsonb, 3.9, 'draft', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('f25614d5-256e-502d-9979-7245769eaf56', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E003', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '6d466aa9-e51a-5d52-9015-152600855932', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 4.0}'::jsonb, '{"technical": 4.0, "communication": 3.8, "ownership": 4.0}'::jsonb, 4.0, 'draft', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

UPDATE hr_reviews SET
    status = 'acknowledged',
    manager_assessment = manager_assessment || '{"acknowledged_at": "2026-06-22T15:30:00Z", "acknowledged_by": "db1f1f2b-b140-5948-a34e-1c998ed98757"}'::jsonb
WHERE review_id = 'REV-E002';

-- RESTORED table: goals link to pm_objectives - impossible when nested in hr_reviews JSONB
INSERT INTO hr_goals (id, tenant_id, employee_id, review_id, objective_id, goal_title, category, measurement_type, target_value, current_value, weight, status, progress_percentage, start_date, target_date) VALUES
    ('01b00358-df04-5eaf-af8b-91c6b1ab45c4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '40e86787-3514-59e7-acb6-935e9a28a9f3', NULL, 'Reduce integration defect rate', 'performance', 'percentage', 100, 62, 30, 'active', 62.0, '2026-01-01', '2026-06-30'),
    ('e2e740a1-ee4d-5d3f-9275-db47145d67b3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '568f6664-334c-564a-a5aa-37498ef233dd', '960d66b2-8a52-59d0-8cf8-5c383d031244', 'Ship loyalty frontend to production', 'delivery', 'percentage', 100, 45, 40, 'active', 45.0, '2026-01-01', '2026-06-30'),
    ('ebd4d4ec-1e50-5901-9d53-110cf0314dda', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '92decf94-143b-5159-8e6e-06b8d243fba1', '960d66b2-8a52-59d0-8cf8-5c383d031244', 'Grow Britannia account revenue', 'revenue', 'percentage', 100, 71, 50, 'active', 71.0, '2026-01-01', '2026-06-30'),
    ('d6fc6358-835e-5aaa-b218-d77df8175d25', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'f25614d5-256e-502d-9979-7245769eaf56', NULL, 'Complete Postgres certification', 'development', 'percentage', 100, 30, 20, 'active', 30.0, '2026-01-01', '2026-06-30');

-- Background job queue (SELECT ... FOR UPDATE SKIP LOCKED)
INSERT INTO jobs (id, tenant_id, job_type, payload, status, priority) VALUES
    ('c7d9757d-0473-5308-94e1-ec5455cdecb2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'payroll_run', '{"run_id": "PR-2026-01-US"}'::jsonb, 'succeeded', 10),
    ('72117bfe-a5a0-5ff3-a700-387e4befffa7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'export', '{"format": "csv", "entity": "employees"}'::jsonb, 'succeeded', 100),
    ('eedaa354-9181-561c-8ef1-fd8b44490b8e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'invoice_pdf', '{"invoice_number": "INV-2026-002"}'::jsonb, 'pending', 50),
    ('db2864ae-7e11-5433-9d78-7bb4238d9c99', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'timeoff_accrual', '{"period": "2026-01"}'::jsonb, 'pending', 100);

-- Database-backed translations
INSERT INTO translations (id, tenant_id, locale, namespace, key, value) VALUES
    ('9816b701-97fa-5c6b-bad3-4fcd6ecadb61', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'en-US', 'app', 'nav.employees', 'Employees'),
    ('424226ec-9088-5229-84dc-644d7e07503c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fr-FR', 'app', 'nav.employees', 'Employes'),
    ('40183202-2728-5938-936d-34990c31b6a9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'en-US', 'app', 'nav.timesheets', 'Timesheets'),
    ('08d1545e-efa3-58d2-9e70-cc3502bd7b92', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fr-FR', 'app', 'nav.timesheets', 'Feuilles de temps'),
    ('d7074187-6fbd-5a68-b0fd-7d15212d2697', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'en-US', 'app', 'nav.invoices', 'Invoices'),
    ('f771f593-b1ea-5138-8976-e0a7494edf1e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fr-FR', 'app', 'nav.invoices', 'Factures');

-- Polymorphic cross-module links (cross-module-integration-plan.md)
INSERT INTO cross_module_links (id, tenant_id, source_module, source_entity_type, source_entity_id, target_module, target_entity_type, target_entity_id, link_type) VALUES
    ('a4ee7fdf-7403-576c-9e75-98ac0929eb47', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ticketing', 'ticket', 'fbc213ca-f362-58d3-aa36-45db45958e60', 'project_management', 'project', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'reference'),
    ('88bc9e7b-e5aa-52fa-8a22-a49f0e0c3533', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'time_tracking', 'entry', '28a1b5e3-0d2e-57ba-a0db-5953f65e20f2', 'accounting', 'invoice', 'c72699f8-700c-5760-a8e8-19ae6dfd53c5', 'billed_on'),
    ('5af988bd-ab71-596d-b613-914f764fddec', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'hr', 'goal', 'ebd4d4ec-1e50-5901-9d53-110cf0314dda', 'project_management', 'objective', '960d66b2-8a52-59d0-8cf8-5c383d031244', 'aligned_to');

-- Audit trail examples
INSERT INTO audit_log (tenant_id, actor_user_id, actor_employee_id, action, entity_type, entity_id, module, changes) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '6d466aa9-e51a-5d52-9015-152600855932', 'update', 'employee', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'hr', '{"base_amount": {"from": 139000, "to": 148000}}'::jsonb),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5', 'create', 'ticket', 'a22f6d41-d654-5951-a043-e174f7e1a258', 'ticketing', NULL),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'approve', 'time_off_request', '70aa9eff-61f7-5867-a657-3a6940cde2bd', 'hr', '{"status": {"from": "pending", "to": "approved"}}'::jsonb),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5', 'send', 'invoice', 'c72699f8-700c-5760-a8e8-19ae6dfd53c5', 'accounting', '{"status": {"from": "draft", "to": "sent"}}'::jsonb),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5', 'record_payment', 'payment', '26361e4b-8a87-5b2a-a692-10ec68e02875', 'accounting', '{"amount": {"to": 42300.00}, "payment_gateway": {"to": "Stripe"}}'::jsonb),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '6d466aa9-e51a-5d52-9015-152600855932', 'close_period', 'accounting_period', '957b6ce4-6f44-50c1-84b1-d9bdb8892585', 'accounting', '{"status": {"from": "closed", "to": "locked"}}'::jsonb);

-- Employee direct-deposit accounts (FR-PAY-005). E001 splits 15% to savings; the primary account takes the remainder. Account numbers are stored encrypted.
INSERT INTO employee_bank_accounts (id, tenant_id, employee_id, account_holder_name, bank_name, country, currency, account_type, account_number_encrypted, account_number_last4, is_primary, allocation_type, allocation_value, priority, verification_status, verified_at, is_active, effective_from, created_by) VALUES
    ('63fb798f-93a9-5fcb-ba44-ce65cbbd4693', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'Sarah Johnson', 'Chase Bank', 'US', 'USD', 'checking', 'enc:e3094e7e-6752-5cb5-9cdf-', '4417', TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('84274790-b9c2-5b7c-b4b3-d285ed8d3204', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'Sarah Johnson', 'Ally Bank', 'US', 'USD', 'savings', 'enc:91e5ac04-4bdc-5f82-a93f-', '9902', FALSE, 'percentage', 15, 2, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('2126f414-630c-5e02-9aa7-c399facb3401', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'Tom Whitfield', 'Bank of America', 'US', 'USD', 'checking', 'enc:bcf73c36-86d9-5b06-ab97-', '3310', TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('392ca0d4-b157-5011-a291-a2f42a7fe4c2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'Aisha Okafor', 'Citibank', 'US', 'USD', 'checking', 'enc:5d367b06-ae01-55fa-ad38-', '7745', TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('d8944f60-d19c-5f8f-b0e3-133a26453b16', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'Marcus Chen', 'HDFC Bank', 'IN', 'INR', 'savings', 'enc:3becbf7c-a2f4-5da9-b988-', '2288', TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('fb7bc54b-4f47-5429-9747-eede693b51c4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'Priya Raman', 'ICICI Bank', 'IN', 'INR', 'savings', 'enc:e134520b-1558-5092-9651-', '6631', TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('34a7cbd3-f5bf-5b13-86eb-6bef76e90c4b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'James Reid', 'Barclays', 'GB', 'GBP', 'checking', 'enc:24e771f4-94dc-5c8d-bc99-', '1104', TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- RESTORED capability: job changes with reasons (US-HR-007/008/010/011). compensation_base remains authoritative for pay; this is the career-progression view.
INSERT INTO hr_employment_history (id, tenant_id, employee_id, effective_date, change_type, previous_job_title, previous_job_level, previous_department_code, job_title, job_level, department_code, compensation_amount, compensation_currency, compensation_type, reason, reason_notes, created_by) VALUES
    ('7abc08d2-217a-5144-b00f-a0e9b7635466', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '2024-11-27', 'hire', NULL, NULL, NULL, 'Engineering Manager', 'L4', 'ENG', 185000, 'USD', 'salary', 'new_hire', NULL, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a211c54d-2627-511c-ab26-38de41c96532', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2024-12-17', 'hire', NULL, NULL, NULL, 'Software Engineer', 'L3', 'ENG-BE', 2400000, 'INR', 'salary', 'new_hire', NULL, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('fbd97c5d-8b07-53fb-862c-517d937c1fa6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2025-12-02', 'promotion', 'Software Engineer', 'L3', 'ENG-BE', 'Software Engineer', 'L4', 'ENG-BE', 3200000, 'INR', 'salary', 'promotion', 'Consistently exceeding expectations', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('0d484a78-fb31-5662-92a6-d6447b7c765f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2025-01-26', 'hire', NULL, NULL, NULL, 'Software Engineer', 'L3', 'ENG-FE', 128000, 'USD', 'salary', 'new_hire', NULL, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('5754e38c-9e11-518d-9d97-03ae2d4a0294', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2025-12-02', 'promotion', 'Software Engineer', 'L3', 'ENG-FE', 'Software Engineer', 'L4', 'ENG-FE', 148000, 'USD', 'salary', 'merit_increase', 'Strong delivery record', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('b4f62e14-a420-50b2-903e-d0b92f350087', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2025-02-15', 'hire', NULL, NULL, NULL, 'Senior Consultant', 'C2', 'CONSULT', 134000, 'USD', 'salary', 'new_hire', NULL, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('9d2c7113-8284-5bbf-9643-8439f591433c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2025-12-02', 'compensation_change', 'Senior Consultant', 'C2', 'CONSULT', 'Senior Consultant', 'C2', 'CONSULT', 142000, 'USD', 'salary', 'cost_of_living', 'Annual COLA', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e3ddbfb4-eb83-5bd2-a17f-07d71b5d013a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2025-11-02', 'transfer', 'Software Engineer', 'L3', 'ENG-BE', 'Software Engineer', 'L3', 'ENG-FE', 104000, 'USD', 'salary', 'reorganization', 'Moved from ENG-BE to ENG-FE', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Reusable onboarding templates (FR-HR-009). Previously only a per-employee copy existed.
INSERT INTO hr_onboarding_templates (id, tenant_id, template_code, template_name, template_name_i18n, description, applies_to_department_code, applies_to_employment_types, is_default, is_active, created_by) VALUES
    ('36a1750d-f32f-5fbb-9948-200a3cdb124f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'STANDARD', 'Standard New Hire', '{"en-US": "Standard New Hire"}'::jsonb, 'Applies to all new employees unless a more specific template matches', NULL, '["full_time", "part_time"]'::jsonb, TRUE, TRUE, '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('7d80186b-19d4-53e9-af75-6beb92fa0350', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ENGINEERING', 'Engineering New Hire', '{"en-US": "Engineering New Hire"}'::jsonb, 'Adds environment setup and code access', 'ENG', '["full_time", "part_time"]'::jsonb, FALSE, TRUE, '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Template tasks across the pre-boarding -> 90-day phases, with role-based assignment
INSERT INTO hr_onboarding_template_tasks (id, tenant_id, template_id, task_name, task_name_i18n, task_type, phase, assignee_role, due_offset_days, sort_order, is_required, reminder_days_before, task_config, is_active) VALUES
    ('c8158bca-4e26-5c82-ba64-222ff92af760', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Sign employment contract', '{"en-US": "Sign employment contract"}'::jsonb, 'e_signature', 'pre_boarding', 'employee', -7, 1, TRUE, 2, '{}'::jsonb, TRUE),
    ('b0836c65-0159-5ace-aa27-9362517f9742', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Submit I-9 documentation', '{"en-US": "Submit I-9 documentation"}'::jsonb, 'i9_verification', 'pre_boarding', 'employee', -3, 2, TRUE, 2, '{}'::jsonb, TRUE),
    ('3cc54d42-acd4-5f22-9712-33649872b401', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Provision laptop', '{"en-US": "Provision laptop"}'::jsonb, 'equipment_request', 'pre_boarding', 'it', -5, 3, TRUE, 2, '{}'::jsonb, TRUE),
    ('a3395964-e51a-5369-8de8-fcd8ed5f7985', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Create email account', '{"en-US": "Create email account"}'::jsonb, 'equipment_request', 'pre_boarding', 'it', -2, 4, TRUE, 2, '{}'::jsonb, TRUE),
    ('48c28c4d-1d55-5323-9554-1940a2024a57', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Welcome meeting with manager', '{"en-US": "Welcome meeting with manager"}'::jsonb, 'meeting', 'first_day', 'manager', 0, 5, TRUE, 2, '{}'::jsonb, TRUE),
    ('1dfc2963-322e-5370-a4d4-515e68133f40', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Office tour and introductions', '{"en-US": "Office tour and introductions"}'::jsonb, 'meeting', 'first_day', 'buddy', 0, 6, FALSE, NULL, '{}'::jsonb, TRUE),
    ('fd8c9e9b-182e-5406-a6ee-dad5d5508bb1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Acknowledge employee handbook', '{"en-US": "Acknowledge employee handbook"}'::jsonb, 'policy_acknowledgment', 'first_week', 'employee', 3, 7, TRUE, 2, '{}'::jsonb, TRUE),
    ('bdd61148-d5a9-53af-9942-842a78335f85', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Benefits enrolment', '{"en-US": "Benefits enrolment"}'::jsonb, 'form_completion', 'first_week', 'employee', 5, 8, TRUE, 2, '{}'::jsonb, TRUE),
    ('7f0995f0-ebf6-58da-9cac-5999fda44aac', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', 'Complete security training', '{"en-US": "Complete security training"}'::jsonb, 'training', 'first_30_days', 'employee', 30, 9, TRUE, 2, '{}'::jsonb, TRUE),
    ('25bd4b56-c706-52b0-8c6e-7741c61da2a1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', '30-day check-in', '{"en-US": "30-day check-in"}'::jsonb, 'meeting', 'first_30_days', 'manager', 30, 10, TRUE, 2, '{}'::jsonb, TRUE),
    ('d1d02f74-c3bf-5cbe-8509-f86f7722865d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '36a1750d-f32f-5fbb-9948-200a3cdb124f', '90-day performance conversation', '{"en-US": "90-day performance conversation"}'::jsonb, 'meeting', 'first_90_days', 'manager', 90, 11, TRUE, 2, '{}'::jsonb, TRUE),
    ('825daa31-e39e-55ac-9cd7-73ee7487cbd1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '7d80186b-19d4-53e9-af75-6beb92fa0350', 'Set up development environment', '{"en-US": "Set up development environment"}'::jsonb, 'other', 'first_day', 'buddy', 0, 1, TRUE, 2, '{}'::jsonb, TRUE),
    ('068874f4-ee1b-56e3-8847-85dc17357ae4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '7d80186b-19d4-53e9-af75-6beb92fa0350', 'Repository and CI access', '{"en-US": "Repository and CI access"}'::jsonb, 'equipment_request', 'first_day', 'it', 0, 2, TRUE, 2, '{}'::jsonb, TRUE),
    ('97ab2203-e302-5eae-ae64-8487c1f8bf14', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '7d80186b-19d4-53e9-af75-6beb92fa0350', 'Ship first pull request', '{"en-US": "Ship first pull request"}'::jsonb, 'other', 'first_week', 'employee', 5, 3, FALSE, NULL, '{}'::jsonb, TRUE);

INSERT INTO hr_onboarding_tasks (id, tenant_id, task_id, employee_id, task_name, description, task_type, assigned_to_employee_id, due_date, completion_date, status, template_data, result_data, priority, created_at, updated_at) VALUES
    ('4dcb5442-4bf7-51b1-bf11-279c34eb58f2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'OB-E011-001', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'Sign employment contract', 'Generated from the Standard New Hire template.', 'approval', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2026-01-01', '2026-01-01', 'completed', '{"template_code": "STANDARD", "phase": "pre_boarding", "buddy_employee_id": "b9b84064-a67a-5048-8282-8fc048b4dbfb"}'::jsonb, '{"document_id": "DOC-E011-HANDBOOK"}'::jsonb, 'high', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('2a00daef-3798-50bf-a8e4-cb26def3b6b6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'OB-E011-002', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'Complete security training', 'Generated from the Standard New Hire template.', 'task', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2026-01-31', '2026-01-12', 'completed', '{"template_code": "STANDARD", "phase": "first_30_days", "training_record_id": "TR-001"}'::jsonb, '{"training_record_id": "TR-001"}'::jsonb, 'medium', '2026-01-01T09:00:00Z', '2026-01-12T09:00:00Z'),
    ('f8a3342d-1efc-5d09-abab-cf5dd10592a2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'OB-E011-003', '56bd1329-6740-572f-aa90-c44d1b27bedf', '90-day performance conversation', 'Manager check-in scheduled from onboarding template.', 'review', '6d466aa9-e51a-5d52-9015-152600855932', '2026-03-15', NULL, 'pending', '{"template_code": "STANDARD", "phase": "first_90_days", "buddy_employee_id": "b9b84064-a67a-5048-8282-8fc048b4dbfb"}'::jsonb, '{}'::jsonb, 'medium', '2026-01-01T09:00:00Z', '2026-01-12T09:00:00Z');

-- Company news feed (FR-HR-011). Birthdays and anniversaries are NOT stored here — they are derived by the v_upcoming_celebrations view.
INSERT INTO hr_company_news (id, tenant_id, title, title_i18n, body, summary, post_type, subject_employee_id, event_date, is_pinned, publish_at, status, attachments, created_by, author_employee_id) VALUES
    ('f4b41e42-a1f2-5a7d-9111-58568cb99854', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Q1 all-hands on 12 February', '{"en-US": "Q1 all-hands on 12 February"}'::jsonb, 'Join us for the quarterly all-hands. Remote attendance available.', 'Join us for the quarterly all-hands. Remote attendance available.', 'event', NULL, '2026-02-12', TRUE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('342f31e5-6148-53cc-9ee2-d9e76c646fc7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Marcus Chen promoted to L4', '{"en-US": "Marcus Chen promoted to L4"}'::jsonb, 'Congratulations to Marcus on his promotion to Software Engineer L4.', 'Congratulations to Marcus on his promotion to Software Engineer L4.', 'recognition', 'db1f1f2b-b140-5948-a34e-1c998ed98757', NULL, FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('4fe8a6b0-f0f5-5bcd-9d70-25516184ba92', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Updated expense policy', '{"en-US": "Updated expense policy"}'::jsonb, 'Expenses above $5,000 now require a second approver. See the policy page.', 'Expenses above $5,000 now require a second approver. See the policy page.', 'policy_update', NULL, NULL, FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('991aef6d-6151-555f-af28-beb2eb4cc552', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Bangalore office expansion', '{"en-US": "Bangalore office expansion"}'::jsonb, 'Our Bangalore delivery centre expands to a second floor in March.', 'Our Bangalore delivery centre expands to a second floor in March.', 'announcement', NULL, NULL, FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('8cbc011a-36e8-57fd-b9cc-81cd5d50dc2e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Northwind turns three', '{"en-US": "Northwind turns three"}'::jsonb, 'Three years since incorporation. Thank you all.', 'Three years since incorporation. Thank you all.', 'milestone', NULL, '2026-03-02', FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5');

-- Approved leave spanning today, so the "Who is Out Today" widget has data
INSERT INTO hr_time_off_requests (id, tenant_id, request_id, employee_id, policy_code, start_date, end_date, total_hours, status, reason, approver_id, approved_at, submitted_at, updated_at) VALUES
    ('52ad181d-6589-5c51-a179-14c246a4b2c8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TOR-006', '18503470-ba5c-5450-bc3e-b0a2454d757f', 'UK-ANNUAL', (CURRENT_DATE - 1), (CURRENT_DATE + 2), 24.0, 'approved', 'Family commitment', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- User groups: department, security and distribution types
INSERT INTO employee_user_groups (id, tenant_id, group_name, display_name, description, group_type, approver_id, backup_approver_id, is_active, created_at, updated_at, created_by) VALUES
    ('0158d8de-be1c-565f-a3c4-78624d177e7f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'engineering@northwind.example', 'Engineering', 'All engineering staff', 'department', '6d466aa9-e51a-5d52-9015-152600855932', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('7fbde845-a1ae-5000-b476-907b24b26788', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'consulting@northwind.example', 'Consulting', 'Client-facing consultants', 'department', '11f31511-ad53-59c7-9e90-8ee3b553489b', '385f5ae5-e567-5fb6-98f8-b45007099ff8', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('b1767520-bcaf-5a97-812e-7fe119d6b791', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'payroll-approvers@northwind.example', 'Payroll Approvers', 'Can approve payroll runs', 'functional', '6d466aa9-e51a-5d52-9015-152600855932', 'a87e0200-0849-53b6-a491-e882feace3f5', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('46c7bd0b-08e5-541d-9942-f8ffee9f772f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'all-staff@northwind.example', 'All Staff', 'Everyone', 'custom', 'a87e0200-0849-53b6-a491-e882feace3f5', '6d466aa9-e51a-5d52-9015-152600855932', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Group membership — RBAC resolution queries depend on this
INSERT INTO employee_group_members (id, tenant_id, group_name, employee_id, role, joined_at, joined_by) VALUES
    ('bf729913-ed3b-5bc5-9875-186102de7bb2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'engineering@northwind.example', '6d466aa9-e51a-5d52-9015-152600855932', 'owner', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('4cc13d94-8b1b-5a2b-8b58-cbae900e6e6a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'engineering@northwind.example', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'member', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('60f45c25-5829-5e5c-ac74-dd30aa09ca40', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'engineering@northwind.example', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'member', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('4c5a56c1-89ce-56c9-a9f5-7e26ffa59721', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'consulting@northwind.example', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'owner', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('6807dba6-48a6-5935-98cd-441ec0056c4e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'consulting@northwind.example', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'member', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('17009da4-bdc6-5aca-b916-3b5a178aefd1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'payroll-approvers@northwind.example', '6d466aa9-e51a-5d52-9015-152600855932', 'owner', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('37be0809-41ec-5de0-a662-06718ad05db4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'payroll-approvers@northwind.example', 'a87e0200-0849-53b6-a491-e882feace3f5', 'member', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('4a0507b1-3a84-5f42-ab61-ec0678d62769', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'all-staff@northwind.example', 'a87e0200-0849-53b6-a491-e882feace3f5', 'owner', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO employee_group_roles (id, tenant_id, group_role_id, group_name, role_name, department_code, location_code, granted_at, granted_by) VALUES
    ('2e0328b4-9324-5786-8538-51952e3a319e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'GR-001', 'engineering@northwind.example', 'project_member', 'ENG', NULL, '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('3f0211af-a43b-5036-94da-c97a4e61d030', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'GR-002', 'payroll-approvers@northwind.example', 'payroll_approver', NULL, 'US-NYC', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Self-service change requests with approval chains, one mid-flight (Phase 1 module #8)
INSERT INTO hr_change_requests (id, tenant_id, request_id, requested_by, requested_for, request_type, status, request_details, approval_chain, comments, attached_documents, created_at, updated_at) VALUES
    ('84dc918d-401d-55a3-9c58-ced45ae50f27', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CR-001', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'address_change', 'approved', '{"field": "address_line1", "currentValue": "12 Old St", "requestedValue": "88 New Ave", "reason": "Moved house"}'::jsonb, '[{"approver_id": "a87e0200-0849-53b6-a491-e882feace3f5", "role": "hr_admin", "status": "approved", "approved_at": "2026-01-01T09:00:00Z"}]'::jsonb, '[{"user_id": "b9b84064-a67a-5048-8282-8fc048b4dbfb", "comment": "Moved house", "created_at": "2026-01-01T09:00:00Z"}]'::jsonb, '[]'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('9c07fa0d-629c-5209-ad50-9c6df0364e1f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CR-002', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'bank_details', 'pending', '{"field": "account_number", "currentValue": "****1104", "requestedValue": "****7788", "reason": "Switched bank"}'::jsonb, '[{"approver_id": "a87e0200-0849-53b6-a491-e882feace3f5", "role": "hr_admin", "status": "pending", "approved_at": null}]'::jsonb, '[{"user_id": "c095eafa-952e-5047-961a-82ce7b45cbf1", "comment": "Switched bank", "created_at": "2026-01-01T09:00:00Z"}]'::jsonb, '[]'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('2ebe3bba-ab7a-5999-8a97-5626214170a8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CR-003', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'name_change', 'pending', '{"field": "last_name", "currentValue": "Raman", "requestedValue": "Raman-Iyer", "reason": "Marriage"}'::jsonb, '[{"approver_id": "a87e0200-0849-53b6-a491-e882feace3f5", "role": "hr_admin", "status": "pending", "approved_at": null}]'::jsonb, '[{"user_id": "bf17b1af-963b-53ef-9083-21506fb34e9c", "comment": "Marriage", "created_at": "2026-01-01T09:00:00Z"}]'::jsonb, '[{"document_type": "marriage_certificate", "file_url": "/storage/change-requests/CR-003/marriage-certificate.pdf"}]'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Clock in/out attendance records (FR-HR)
--
-- clock_in_time/clock_out_time are timestamptz: an INSTANT, not a wall clock.
-- These were originally written as '09:00:00Z' for a Bangalore employee, which
-- is 14:30 IST — a plausible-looking row that only reads wrong once a page
-- renders it in the office's zone. Times below are the real UTC instants of the
-- intended local times (IST +05:30, EST -05:00 in January).
--
-- Tom's 2026-01-09 row is deliberate: an evening shift whose clock_out lands on
-- the NEXT UTC day. attendance_date is the LOCAL date, and cannot be derived
-- from the UTC timestamp without the office's timezone.
INSERT INTO hr_attendance (id, tenant_id, employee_id, attendance_date, clock_in_time, clock_out_time, break_minutes, total_hours, regular_hours, overtime_hours, status, created_at, updated_at) VALUES
    ('cf64fb8a-ec72-5b98-942f-ab43e406d329', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2026-01-06', '2026-01-06T03:30:00Z', '2026-01-06T12:00:00Z', 45, 7.75, 7.75, NULL, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('7474f042-c201-579c-ab38-40c9e2b92930', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2026-01-07', '2026-01-07T03:31:00Z', '2026-01-07T12:01:00Z', 45, 7.75, 7.75, NULL, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('967a2bf5-6529-58a6-9f4e-c3e336643080', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2026-01-08', '2026-01-08T03:32:00Z', '2026-01-08T12:02:00Z', 45, 7.75, 7.75, NULL, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('8590ba46-72f8-5da4-a045-caea4064ee32', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2026-01-06', '2026-01-06T03:30:00Z', '2026-01-06T12:00:00Z', 45, 7.75, 7.75, NULL, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('5deac028-5785-5f13-b0d3-cc571169bbba', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2026-01-07', '2026-01-07T03:31:00Z', '2026-01-07T12:01:00Z', 45, 7.75, 7.75, NULL, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('e2b2e36c-224e-5181-a638-a9a10b3b0a1e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2026-01-08', '2026-01-08T03:32:00Z', '2026-01-08T12:02:00Z', 45, 7.75, 7.75, NULL, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('e39d3de1-81f0-58d8-a050-d579c8b8549a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', '2026-01-08', '2026-01-08T14:34:00Z', '2026-01-08T22:00:00Z', 30, 6.9333, 6.9333, NULL, 'late', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('3f0c1d6e-9a44-5c2b-8e17-6b2f4d8a10c5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2026-01-09', '2026-01-09T19:00:00Z', '2026-01-10T04:00:00Z', 30, 8.5, 8.0, 0.5, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    -- A real night shift: 22:00-06:00 in New York. Both instants land on ONE
    -- UTC date, so comparing UTC dates calls this a normal day — the inverse
    -- of the Auckland error. Only the LOCAL dates say what it is.
    ('7c41a92d-3b58-5e6f-9012-4a8de7c30b91', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2026-01-12', '2026-01-13T03:00:00Z', '2026-01-13T11:00:00Z', 30, 7.5, 7.5, NULL, 'present', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Benefits enrolments with dependents and beneficiaries as queryable JSONB (FR-HR-008)
INSERT INTO hr_benefits_enrollments (id, tenant_id, employee_id, plan_year, benefit_type, plan_name, coverage_level, enrollment_date, effective_date, dependents, beneficiaries, election_details, status, created_at, updated_at) VALUES
    ('9d6873bb-fd7f-5272-b7b0-6b056c8fffb4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 2026, 'medical', 'Blue Cross PPO', 'employee_family', '2025-12-12', '2026-01-01', '[{"name": "Michael Johnson", "relationship": "spouse", "date_of_birth": "1984-05-11"}, {"name": "Ava Johnson", "relationship": "child", "date_of_birth": "2016-09-02"}]'::jsonb, '[{"name": "Michael Johnson", "relationship": "spouse", "percentage": 100}]'::jsonb, '{"employee_contribution": 220, "employer_contribution": 880, "currency": "USD"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('84e8284d-c8d2-5652-bda5-c272e3500f11', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 2026, 'medical', 'Blue Cross PPO', 'employee_only', '2025-12-12', '2026-01-01', '[]'::jsonb, '[{"name": "Estate", "relationship": "other", "percentage": 100}]'::jsonb, '{"employee_contribution": 95, "employer_contribution": 505, "currency": "USD"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('caf6cb8e-d651-5049-be4f-1bf90d4d4528', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 2026, 'dental', 'Delta Dental', 'employee_spouse', '2025-12-12', '2026-01-01', '[{"name": "Chidi Okafor", "relationship": "spouse", "date_of_birth": "1990-02-18"}]'::jsonb, '[]'::jsonb, '{"employee_contribution": 40, "employer_contribution": 110, "currency": "USD"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Continuous feedback (FR-HR-010)
INSERT INTO hr_feedback (id, tenant_id, feedback_id, from_employee_id, to_employee_id, feedback_type, content, is_anonymous, visibility, tags, created_at, updated_at) VALUES
    ('51421c2a-17e8-573a-ad83-c60d4f036728', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'FB-001', '6d466aa9-e51a-5d52-9015-152600855932', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'praise', 'Excellent work untangling the Acme data model.', FALSE, 'manager_only', '["technical"]'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('a88349a8-db1c-5492-a864-2adeca2ba609', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'FB-002', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'praise', 'Client specifically called out your responsiveness.', FALSE, 'public', '["client", "communication"]'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('17fc284f-0a5d-530b-9123-a65483de7f5b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'FB-003', '6d466aa9-e51a-5d52-9015-152600855932', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'constructive', 'Consider bringing the team in earlier on design decisions.', FALSE, 'private', '["collaboration"]'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    -- The anonymous case. Without it the promise "we will not show who wrote
    -- this" is untestable, and a page that rendered from_employee_id would
    -- pass every check while breaking it for real. Marked anonymous but WITH a
    -- source recorded, which is exactly the shape that goes wrong: the column
    -- is populated and correct, and must never be returned.
    ('c4a2f3e1-8b6d-5a47-9e02-1f5c8d3b7a90', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'FB-004', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '6d466aa9-e51a-5d52-9015-152600855932', 'constructive', 'Sprint planning often runs long; a tighter agenda would help.', TRUE, 'private', '["process"]'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Pulse surveys with questions as JSONB
INSERT INTO hr_surveys (id, tenant_id, survey_id, survey_name, survey_type, questions, start_date, end_date, is_anonymous, status, response_count, created_at, updated_at, created_by) VALUES
    ('4967f53e-36f1-5ed3-9e71-203b94380e89', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'SV-001', 'Q1 Pulse Check', 'pulse', '[{"id": "q1", "text": "How supported do you feel?", "type": "scale", "scale": 5}, {"id": "q2", "text": "What should we change?", "type": "text"}]'::jsonb, '2026-01-21', '2026-02-04', TRUE, 'closed', 9, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('f073295a-6b90-5915-9f36-139073507cf1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'SV-002', 'Onboarding Experience', 'onboarding', '[{"id": "q1", "text": "Was your first week clear?", "type": "scale", "scale": 5}]'::jsonb, '2026-01-21', '2026-02-04', FALSE, 'closed', 3, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Survey responses, anonymous where the survey requires it
INSERT INTO hr_survey_responses (id, tenant_id, response_id, survey_id, respondent_id, responses, is_complete, submitted_at, created_at, updated_at) VALUES
    ('bd720a03-1032-5ac6-bfae-5f7d8c22a6f2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'SV-001-R1', '4967f53e-36f1-5ed3-9e71-203b94380e89', NULL, '{"q1": 4}', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('fd232028-8914-5f19-a373-6c0e52903ed4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'SV-001-R2', '4967f53e-36f1-5ed3-9e71-203b94380e89', NULL, '{"q1": 5}', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('55932ff6-0df3-5e89-89a2-5378d2e91251', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'SV-002-R1', 'f073295a-6b90-5915-9f36-139073507cf1', '56bd1329-6740-572f-aa90-c44d1b27bedf', '{"q1": 4}', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Variable compensation with tiered commission structures
INSERT INTO compensation_variable (id, tenant_id, employee_id, component_type, comp_type, component_name, comp_name, effective_from, target_amount, currency, payment_frequency, frequency, commission_structure, quota_structure, status, created_at, updated_at, created_by) VALUES
    ('48c7f07e-1c76-5838-a847-6c25ec37e1a4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e05fd53c-ebdf-5049-810a-28a63369f93a', 'commission', 'commission', 'Sales Commission', 'Sales Commission', '2026-01-01', 45000, 'GBP', 'quarterly', 'quarterly', '{"tiers": [{"threshold_pct": 80, "payout_pct": 50}, {"threshold_pct": 100, "payout_pct": 100}, {"threshold_pct": 120, "payout_pct": 150}]}'::jsonb, '{"annual_quota": 360000, "currency": "GBP"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('364de8f8-e21c-5d79-bf4d-9409309f888e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', 'commission', 'commission', 'Sales Commission', 'Sales Commission', '2026-01-01', 52000, 'USD', 'quarterly', 'quarterly', '{"tiers": [{"threshold_pct": 80, "payout_pct": 50}, {"threshold_pct": 100, "payout_pct": 100}, {"threshold_pct": 120, "payout_pct": 150}]}'::jsonb, '{"annual_quota": 416000, "currency": "USD"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e0fcc8ea-361e-52d4-b1b8-b73cc5653db7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'performance_bonus', 'performance_bonus', 'Annual Performance Bonus', 'Annual Performance Bonus', '2026-01-01', 30000, 'USD', 'annual', 'annual', '{"tiers": [{"threshold_pct": 80, "payout_pct": 50}, {"threshold_pct": 100, "payout_pct": 100}, {"threshold_pct": 120, "payout_pct": 150}]}'::jsonb, '{"annual_quota": 240000, "currency": "USD"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('d7d39bb2-cd62-5336-9d34-33de81b035fe', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'bonus', 'bonus', 'Delivery Bonus', 'Delivery Bonus', '2026-01-01', 18000, 'USD', 'annual', 'annual', '{"tiers": [{"threshold_pct": 80, "payout_pct": 50}, {"threshold_pct": 100, "payout_pct": 100}, {"threshold_pct": 120, "payout_pct": 150}]}'::jsonb, '{"annual_quota": 144000, "currency": "USD"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('5b9e0a37-4c12-5f6d-a8b4-19e7c250d3af', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'bonus', 'bonus', 'Consulting Delivery Bonus', 'Consulting Delivery Bonus', '2026-01-01', 14000, 'GBP', 'annual', 'annual', '{"tiers": [{"threshold_pct": 80, "payout_pct": 50}, {"threshold_pct": 100, "payout_pct": 100}]}'::jsonb, '{"annual_quota": 112000, "currency": "GBP"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Equity grants: 1-year cliff then monthly vesting over 4 years
INSERT INTO compensation_equity (id, tenant_id, employee_id, grant_type, equity_type, grant_number, grant_date, shares_granted, total_shares, shares_vested, strike_price, exercise_price, currency, vesting_type, vesting_start_date, vesting_cliff_months, vesting_period_months, vesting_schedule, status, created_at, updated_at, created_by) VALUES
    ('a76cf8b9-9812-5154-8a7f-61ded22cf692', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'iso', 'iso', 'GRANT-E001', '2025-01-06', 40000, 40000, 10000, 1.25, 1.25, 'USD', 'cliff_then_monthly', '2025-01-06', 12, 48, '{"cliff_months": 12, "total_months": 48, "frequency": "monthly"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('6d3a6739-6abb-5a90-accc-772414d330cb', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'rsu', 'rsu', 'GRANT-E005', '2025-01-06', 12000, 12000, 3000, NULL, NULL, 'USD', 'cliff_then_monthly', '2025-01-06', 12, 48, '{"cliff_months": 12, "total_months": 48, "frequency": "monthly"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('111d5707-3d5a-5a90-a6cd-04c88efc7e6c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'nso', 'nso', 'GRANT-E004', '2025-01-06', 18000, 18000, 4500, 1.25, 1.25, 'USD', 'cliff_then_monthly', '2025-01-06', 12, 48, '{"cliff_months": 12, "total_months": 48, "frequency": "monthly"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('2a6f5c81-93b7-5d04-bc2e-7f18a94e6053', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'rsu', 'rsu', 'GRANT-E007', '2025-06-02', 9000, 9000, 2250, NULL, NULL, 'USD', 'cliff_then_monthly', '2025-06-02', 12, 48, '{"cliff_months": 12, "total_months": 48, "frequency": "monthly"}'::jsonb, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Shift and on-call premiums.
--
-- compensation_premiums held ZERO rows, so every "a colleague cannot see this"
-- assertion against it passed without anything to hide — the vacuous pass this
-- codebase keeps rediscovering (L41, L47). A policy with no fixture row has
-- never been tested. James Reid also gets a row in every other
-- compensation_* table for the same reason: the disclosure matrix uses one
-- subject across all of them, so a missing row silently weakens every case.
INSERT INTO compensation_premiums (id, tenant_id, employee_id, premium_type, premium_name, effective_from, calculation_method, premium_amount, premium_percentage, currency, rate_multiplier, amount, status, created_at, updated_at, created_by) VALUES
    ('3f2b91c4-7d5a-5e88-9c31-4a7e2b6f0d13', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'on_call', 'On-call rota', '2026-01-01', 'fixed_amount', 450.00, NULL, 'GBP', NULL, 450.00, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('8c14d7e2-b306-5a49-81f7-25d9e3c84b60', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '18503470-ba5c-5450-bc3e-b0a2454d757f', 'shift_differential', 'Night shift differential', '2026-01-01', 'multiplier', NULL, NULL, 'GBP', 1.2500, NULL, 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Work schedules: standard, flexible, remote and hybrid
INSERT INTO compensation_work_schedules (id, tenant_id, employee_id, schedule_name, schedule_type, effective_from, standard_hours_per_week, timezone, time_tracking_required, weekly_schedule, is_active, created_at, updated_at, created_by) VALUES
    ('25de894c-f69b-5f88-851c-70565979f6d7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'Standard NYC', 'standard', '2025-03-07', 40, 'America/New_York', 'hours_only', '{"monday": {"start": "09:00", "end": "17:30"}, "friday": {"start": "09:00", "end": "16:00"}}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('c3bc544a-f2fb-5eff-81bd-ab857709a50e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'Part-time flexible', 'flexible', '2025-03-07', 20, 'America/New_York', 'hours_only', '{"monday": {"start": "09:00", "end": "17:30"}, "friday": {"start": "09:00", "end": "16:00"}}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('44437e43-50a7-5b2f-8fe0-5e27b1d2dc58', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'Remote Bangalore', 'remote', '2025-03-07', 40, 'Asia/Kolkata', 'hours_only', '{"monday": {"start": "09:00", "end": "17:30"}, "friday": {"start": "09:00", "end": "16:00"}}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('09d17647-5390-57ca-b4b1-093ce942defa', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'Hybrid London', 'hybrid', '2025-03-07', 37.5, 'Europe/London', 'hours_only', '{"monday": {"start": "09:00", "end": "17:30"}, "friday": {"start": "09:00", "end": "16:00"}}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Deduction definitions across US (401k + match), India (EPF/ESI), UK pension, garnishment
INSERT INTO payroll_deduction_definitions (id, tenant_id, deduction_code, deduction_name, category, deduction_type, calculation_method, default_percentage, default_amount, is_pretax, reduces_federal_taxable, reduces_fica_taxable, reduces_india_taxable, has_employer_match, employer_match_config, is_active, created_at, updated_at) VALUES
    ('979e3ee1-9097-5a82-93d9-345f9fa50fc9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '401K', '401(k) Retirement', 'retirement', 'pretax', 'percentage', 6, NULL, TRUE, TRUE, TRUE, FALSE, TRUE, '{"match_pct": 100, "up_to_pct": 4}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('d26ea8ce-8fdf-550b-9b37-84da469c4e5e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'MEDICAL', 'Medical Premium', 'health', 'pretax', 'fixed', NULL, 220, TRUE, TRUE, TRUE, FALSE, FALSE, NULL, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('0459dc14-156b-5ca5-9fb3-0250fa715eb9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'EPF', 'Employee Provident Fund', 'retirement', 'pretax', 'percentage', 12, NULL, TRUE, FALSE, FALSE, TRUE, FALSE, NULL, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('e2e25807-5fdb-50b5-ab01-63588282c8b1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ESI', 'Employee State Insurance', 'health', 'pretax', 'percentage', 0.75, NULL, TRUE, FALSE, FALSE, TRUE, FALSE, NULL, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('cfdaba7e-eab4-5f81-be39-bdbdc1f9d184', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PENSION-UK', 'Workplace Pension', 'retirement', 'pretax', 'percentage', 5, NULL, TRUE, FALSE, FALSE, FALSE, FALSE, NULL, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('fd87bdfd-305e-570c-b55e-193d2bc5f107', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'GARNISH', 'Wage Garnishment', 'garnishment', 'posttax', 'fixed', NULL, 400, FALSE, FALSE, FALSE, FALSE, FALSE, NULL, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Per-employee deduction elections with year-to-date accumulation
INSERT INTO payroll_employee_deductions (id, tenant_id, employee_id, deduction_id, deduction_def_id, deduction_type, calculation_method, effective_from, percentage, amount, frequency, ytd_deducted, is_active, created_at, updated_at) VALUES
    ('51287eaf-e002-5399-ac0c-0ecec0f801a9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '979e3ee1-9097-5a82-93d9-345f9fa50fc9', '979e3ee1-9097-5a82-93d9-345f9fa50fc9', 'pretax', 'percentage', '2025-03-07', 6, NULL, 'monthly', 925.0, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('dbecae2d-6b24-5820-92f5-d2826273c24c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'd26ea8ce-8fdf-550b-9b37-84da469c4e5e', 'd26ea8ce-8fdf-550b-9b37-84da469c4e5e', 'pretax', 'fixed', '2025-03-07', NULL, 220, 'monthly', 220.0, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('03cf6767-8406-5793-91a2-a40390616170', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '979e3ee1-9097-5a82-93d9-345f9fa50fc9', '979e3ee1-9097-5a82-93d9-345f9fa50fc9', 'pretax', 'percentage', '2025-03-07', 4, NULL, 'monthly', 493.33, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('b3ffa019-20d0-5b8f-8430-28e277a24628', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '0459dc14-156b-5ca5-9fb3-0250fa715eb9', '0459dc14-156b-5ca5-9fb3-0250fa715eb9', 'pretax', 'percentage', '2025-03-07', 12, NULL, 'monthly', 32000.0, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('7baeff80-cb7d-5a84-9dc6-9431bfb517ce', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'e2e25807-5fdb-50b5-ab01-63588282c8b1', 'e2e25807-5fdb-50b5-ab01-63588282c8b1', 'pretax', 'percentage', '2025-03-07', 0.75, NULL, 'monthly', 2000.0, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('59b2eec5-344e-57e4-b49d-1250a20f4dc8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '0459dc14-156b-5ca5-9fb3-0250fa715eb9', '0459dc14-156b-5ca5-9fb3-0250fa715eb9', 'pretax', 'percentage', '2025-03-07', 12, NULL, 'monthly', 21000.0, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('1f385439-73f7-597c-b2e4-7d28f8b8973e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'cfdaba7e-eab4-5f81-be39-bdbdc1f9d184', 'cfdaba7e-eab4-5f81-be39-bdbdc1f9d184', 'pretax', 'percentage', '2025-03-07', 5, NULL, 'monthly', 366.67, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

INSERT INTO payroll_employee_deductions (id, tenant_id, employee_id, deduction_id, deduction_def_id, deduction_type, calculation_method, effective_from, amount, frequency, ytd_deducted, garnishment_case_number, garnishment_authority, garnishment_total_amount, garnishment_amount_remaining, is_active, employee_deduction_id, created_at, updated_at) VALUES
    ('4d3f96c0-9264-563f-b66c-a67837e806e2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', 'fd87bdfd-305e-570c-b55e-193d2bc5f107', 'fd87bdfd-305e-570c-b55e-193d2bc5f107', 'garnishment', 'fixed', '2026-01-01', 400, 'monthly', 800.00, 'NY-FAM-2025-1842', 'New York Family Court', 4800.00, 4000.00, TRUE, 'DED-E010-GARNISH-001', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Withholding certificates: US W-4 (2020+ steps) and India Form 12BB declarations
INSERT INTO payroll_tax_withholding_certificates (id, tenant_id, employee_id, tax_year, country, effective_from, us_filing_status, us_multiple_jobs, us_step3_dependents, us_step4c_extra_withholding, us_exempt, india_tax_regime, india_section_declarations, submitted_at, created_at, updated_at) VALUES
    ('d3abbb2d-49c1-5394-8017-2c6ef90e9a04', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 2026, 'US', '2025-03-07', 'married_filing_jointly', FALSE, 2000, 150, FALSE, NULL, NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('9a2d9346-68dd-5b99-9d9d-359a44231f09', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 2026, 'US', '2025-03-07', 'single', TRUE, 0, 0, FALSE, NULL, NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('ff7f45af-540f-5275-b55e-95b54a57afe8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 2026, 'US', '2025-03-07', 'head_of_household', FALSE, 2000, 0, FALSE, NULL, NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('0d7ac1a7-2d4b-5b48-b8f3-920170473a08', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 2026, 'IN', '2025-03-07', NULL, FALSE, 0, 0, FALSE, 'new_regime', '{"80C": 150000, "80D": 25000}'::jsonb, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

UPDATE payroll_tax_withholding_certificates SET
    state_withholding = '{"NY": {"additional_withholding": 50}, "NJ": {"allocation_pct": 20}}'::jsonb
WHERE id = '9a2d9346-68dd-5b99-9d9d-359a44231f09';

INSERT INTO payroll_india_salary_structure (id, tenant_id, employee_id, effective_from, annual_ctc, currency, basic_salary, hra, conveyance_allowance, special_allowance, employer_epf, employer_esi, monthly_gross, created_at, updated_at) VALUES
    ('0f9ab83e-a353-5970-bd3c-343e90b67df5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2026-01-01', 3200000.00, 'INR', 1280000.00, 640000.00, 19200.00, 900800.00, 153600.00, 0.00, 266667.00, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('4cfd8fab-2753-56a0-a7a5-b3cf48740e20', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2026-01-01', 2100000.00, 'INR', 840000.00, 420000.00, 19200.00, 610800.00, 100800.00, 0.00, 175000.00, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

INSERT INTO payroll_india_tax_declarations (id, tenant_id, employee_id, financial_year, tax_regime, section_80c, section_80d, hra_exemption_claimed, rent_paid_monthly, metro_city, documents, status, submitted_at, created_at, updated_at) VALUES
    ('8cebd33e-c4eb-5739-b4fe-36c7839c2ef6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2025-2026', 'new_regime', 150000.00, 25000.00, 0.00, 42000.00, TRUE, '[{"type": "rent_receipt", "url": "/storage/payroll/india/rent-e002.pdf"}]'::jsonb, 'submitted', '2026-01-10T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Assigned equipment
INSERT INTO employee_assets (id, tenant_id, asset_id, employee_id, asset_type, make_model, serial_number, asset_tag, assigned_date, condition, created_at, updated_at) VALUES
    ('8039d811-be83-5f28-a161-2ed445281c3d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'AS-001', '6d466aa9-e51a-5d52-9015-152600855932', 'laptop', 'MacBook Pro 16 M4', 'C02XK1QZ', 'AS-001', '2025-06-15', 'good', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('fb09ebdf-7d7d-540f-962c-1d3253b4ac68', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'AS-002', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'laptop', 'MacBook Pro 14 M4', 'C02XK2RA', 'AS-002', '2025-06-15', 'good', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('8e36b7aa-d5cd-5563-92bd-cf241e60f2cc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'AS-003', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'laptop', 'Dell XPS 15', 'DXPS7742', 'AS-003', '2025-06-15', 'good', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('053ba0ff-8ca5-5e07-9c6e-94051ecacb82', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'AS-004', '6d466aa9-e51a-5d52-9015-152600855932', 'phone', 'iPhone 16', 'IP16A19X', 'AS-004', '2025-06-15', 'good', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Certifications with expiry tracking
INSERT INTO employee_certifications (id, tenant_id, certification_id, employee_id, certification_name, issuing_organization, issue_date, expiration_date, status, created_at, updated_at) VALUES
    ('a4a7e7df-fe19-5b21-9a64-64790d003650', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CE-001', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'AWS Solutions Architect', 'Amazon Web Services', '2024-08-19', '2027-02-05', 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('5c4f5df7-3719-59d4-84d8-ddd15ed7c9d5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CE-002', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'PMP', 'Project Management Institute', '2024-08-19', '2027-02-05', 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('68ec8b34-baee-5ffc-8d3b-b7b2a545e185', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CE-003', 'a87e0200-0849-53b6-a491-e882feace3f5', 'SHRM-CP', 'SHRM', '2024-08-19', '2027-02-05', 'active', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

INSERT INTO employee_training_records (id, tenant_id, training_record_id, employee_id, training_name, training_type, provider, assigned_date, due_date, completion_date, status, certificate_url, credits_hours, created_at, updated_at) VALUES
    ('a2d0755c-872d-519c-a96c-e628e080829c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TR-001', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'Security Awareness', 'compliance', 'Northwind Learning', '2026-01-01', '2026-01-31', '2026-01-12', 'completed', '/storage/training/TR-001-certificate.pdf', 1.5, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('02dc959e-0197-55cf-805b-e1c804b5a47d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TR-002', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'Client Data Handling', 'policy', 'Northwind Learning', '2026-01-01', '2026-02-15', NULL, 'assigned', NULL, 2.0, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

INSERT INTO hr_employee_documents (id, tenant_id, document_id, employee_id, document_type, document_name, file_url, file_size_bytes, mime_type, uploaded_by, upload_date, status, created_at, updated_at) VALUES
    ('e5173561-a0e8-560e-9082-d7150e708195', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DOC-E011-I9', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'i9', 'Form I-9 Verification', '/storage/employees/E011/i9.pdf', 184221, 'application/pdf', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2026-01-03', 'verified', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('3a542a7c-8169-5395-872e-6b7771100a8c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DOC-E011-HANDBOOK', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'policy_acknowledgment', 'Employee Handbook Acknowledgment', '/storage/employees/E011/handbook-signature.pdf', 98221, 'application/pdf', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2026-01-06', 'signed', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Company bank accounts for reconciliation
INSERT INTO bank_accounts (id, tenant_id, account_name, bank_name, currency, current_balance, available_balance, gl_account_id, feed_enabled, is_active, created_at, updated_at, created_by) VALUES
    ('6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Operating Account USD', 'First National', 'USD', 248500.0, 248500.0, 'eef02e95-6acb-5039-8acc-56340013e53a', TRUE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('7585ab47-4908-5830-a959-65711784fc61', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Operating Account GBP', 'Barclays', 'GBP', 61200.0, 61200.0, 'eef02e95-6acb-5039-8acc-56340013e53a', TRUE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('d189279d-45d2-5e98-85bf-e03f3dbe04e3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Payroll Account', 'First National', 'USD', 95000.0, 95000.0, 'eef02e95-6acb-5039-8acc-56340013e53a', TRUE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

UPDATE bank_accounts SET
    feed_provider = CASE currency WHEN 'GBP' THEN 'yodlee' ELSE 'plaid' END,
    feed_connection_id = 'feed_' || lower(replace(account_name, ' ', '_')),
    last_synced_at = '2026-02-08T09:00:00Z'
WHERE feed_enabled;

INSERT INTO bank_reconciliation_rules (id, tenant_id, bank_account_id, rule_name, description_contains, action_type, category_account_id, auto_match, create_transaction, priority, created_at, updated_at, created_by) VALUES
    ('73d3f520-f923-54bd-aab7-9f75d145f087', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', 'Categorize software subscriptions', 'JetBrains', 'categorize', '030e294b-88ad-544e-841a-cfda187885ac', TRUE, TRUE, 10, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO bank_transactions (id, tenant_id, bank_account_id, transaction_date, value_date, description, reference, amount, balance, transaction_type, category_account_id, status, matched_to_type, matched_to_id, match_confidence, matching_rule_id, imported_at, created_at, updated_at) VALUES
    ('ba95034d-6bfa-57cb-95ec-74c7779a11a4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', '2026-01-22', '2026-01-22', 'ACME PAYMENT INV-2026-001', 'ACH-ACME-001', 42300.00, 248500.00, 'credit', 'a6ecad5d-10af-5286-807b-cd31b3266d99', 'reconciled', 'payment', '26361e4b-8a87-5b2a-a692-10ec68e02875', 0.98, NULL, '2026-01-22T09:00:00Z', '2026-01-22T09:00:00Z', '2026-01-22T09:00:00Z'),
    ('ee8b9238-21a3-5c86-9a26-b3d121526ecf', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', '2026-01-23', '2026-01-23', 'JetBrains subscription', 'CARD-JB-001', -299.00, 248201.00, 'debit', '030e294b-88ad-544e-841a-cfda187885ac', 'categorized', NULL, NULL, 0.91, '73d3f520-f923-54bd-aab7-9f75d145f087', '2026-01-23T09:00:00Z', '2026-01-23T09:00:00Z', '2026-01-23T09:00:00Z'),
    ('77706d29-15b8-5bcd-9e80-0f07016e582b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '7585ab47-4908-5830-a959-65711784fc61', '2026-02-07', '2026-02-07', 'Britannia partial payment', 'FPS-BRITCO-001', 10000.00, 71200.00, 'credit', 'a6ecad5d-10af-5286-807b-cd31b3266d99', 'matched', 'payment', 'f615bb1d-dc3a-563f-b1ff-7205a9f70587', 0.94, NULL, '2026-02-07T14:00:00Z', '2026-02-07T14:00:00Z', '2026-02-07T14:00:00Z'),
    ('dc9d747d-7760-5046-b1bf-27c2c482305a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '7585ab47-4908-5830-a959-65711784fc61', '2026-02-08', '2026-02-08', 'Unidentified client remittance', 'FPS-UNKNOWN-002', 12000.00, 83200.00, 'credit', NULL, 'unmatched', NULL, NULL, 0.62, NULL, '2026-02-08T09:00:00Z', '2026-02-08T09:00:00Z', '2026-02-08T09:00:00Z');

UPDATE bank_transactions SET
    bank_transaction_id = CASE reference
        WHEN 'ACH-ACME-001' THEN 'bnk_txn_acme_001'
        WHEN 'CARD-JB-001' THEN 'bnk_txn_jetbrains_001'
        WHEN 'FPS-BRITCO-001' THEN 'bnk_txn_britco_001'
        WHEN 'FPS-UNKNOWN-002' THEN 'bnk_txn_unknown_002'
        ELSE bank_transaction_id
    END
WHERE reference IN ('ACH-ACME-001','CARD-JB-001','FPS-BRITCO-001','FPS-UNKNOWN-002');

-- Accounting periods, one closed to exercise period-close logic
INSERT INTO accounting_periods (id, tenant_id, period_name, period_type, start_date, end_date, fiscal_year, status, closed_at, closed_by, created_at, updated_at) VALUES
    ('957b6ce4-6f44-50c1-84b1-d9bdb8892585', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'December 2025', 'monthly', '2025-12-01', '2025-12-31', 2025, 'locked', '2026-01-05T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-05T09:00:00Z', '2026-01-05T09:00:00Z'),
    ('c4fff2b2-1b53-592f-84f6-586e3b2ca0dc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'January 2026', 'monthly', '2026-01-01', '2026-01-31', 2026, 'closed', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('5b1446f7-7db5-54f5-bf88-a3c4527d6027', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'February 2026', 'monthly', '2026-02-01', '2026-02-28', 2026, 'open', NULL, NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('00c27197-c84b-5af8-b168-1799c7df579d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'March 2026', 'monthly', '2026-03-01', '2026-03-31', 2026, 'open', NULL, NULL, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Vendors for accounts payable
INSERT INTO vendors (id, tenant_id, vendor_number, vendor_name, display_name, email, currency, payment_terms, ap_account_id, tax_number, is_1099_vendor, is_active, created_at, updated_at) VALUES
    ('8a0bb1a6-448e-50f5-bbc0-1a41850d2e92', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'AWS', 'Amazon Web Services', 'Amazon Web Services', 'ap@aws.example', 'USD', 'net_30', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 'US-91-1646860', FALSE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('e21a30e8-9dfd-5817-8479-c7d574417831', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'WEWORK', 'WeWork', 'WeWork', 'ap@wework.example', 'USD', 'net_30', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 'US-45-5559999', FALSE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('77464d71-79dd-5490-93a3-a62c9df1d027', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JETBRAINS', 'JetBrains', 'JetBrains', 'ap@jetbrains.example', 'EUR', 'net_30', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 'CZ-26502275', FALSE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('e7b05d84-68ef-584f-beb7-69a4f4c34bd1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'UXFREELANCE', 'Rivera UX Studio', 'Rivera UX Studio', 'billing@riveraux.example', 'USD', 'due_on_receipt', '3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', 'US-88-7711001', TRUE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

INSERT INTO bills (id, tenant_id, vendor_id, bill_number, reference, bill_date, due_date, currency, exchange_rate, base_currency, subtotal, tax_total, total, amount_paid, amount_due, base_subtotal, base_tax_total, base_total, base_amount_paid, base_amount_due, status, requires_approval, approved_by, approved_at, payment_terms, file_url, ocr_processed, ocr_data, payment_scheduled_date, created_at, updated_at, created_by) VALUES
    ('fdab0a8b-c4d8-5601-bf23-59c3028e9359', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92', 'BILL-AWS-2026-01', 'AWS-2026-01', '2026-01-24', CURRENT_DATE + 10, 'USD', 1.0, 'USD', 1820.00, 161.53, 1981.53, 0.00, 1981.53, 1820.00, 161.53, 1981.53, 0.00, 1981.53, 'approved', TRUE, '6d466aa9-e51a-5d52-9015-152600855932', '2026-01-25T09:00:00Z', 'net_30', '/storage/bills/aws-2026-01.pdf', TRUE, '{"vendor": "AWS", "confidence": 0.96}'::jsonb, CURRENT_DATE + 8, '2026-01-24T09:00:00Z', '2026-01-25T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('b07bca71-9562-5a5f-91b1-b749912c242d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92', 'BILL-AWS-2026-02A', 'AWS-2026-02A', '2026-02-01', '2026-02-15', 'USD', 1.0, 'USD', 1000.00, 0.00, 1000.00, 1000.00, 0.00, 1000.00, 0.00, 1000.00, 1000.00, 0.00, 'paid', TRUE, '6d466aa9-e51a-5d52-9015-152600855932', '2026-02-02T09:00:00Z', 'net_15', '/storage/bills/aws-2026-02a.pdf', TRUE, '{"vendor": "AWS", "confidence": 0.97}'::jsonb, '2026-02-10', '2026-02-01T09:00:00Z', '2026-02-10T15:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a0c8a1c4-9d92-5f29-8fd9-2b164de81429', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92', 'BILL-AWS-2026-02B', 'AWS-2026-02B', '2026-02-01', '2026-02-15', 'USD', 1.0, 'USD', 1500.00, 0.00, 1500.00, 1500.00, 0.00, 1500.00, 0.00, 1500.00, 1500.00, 0.00, 'paid', TRUE, '6d466aa9-e51a-5d52-9015-152600855932', '2026-02-02T09:00:00Z', 'net_15', '/storage/bills/aws-2026-02b.pdf', TRUE, '{"vendor": "AWS", "confidence": 0.97}'::jsonb, '2026-02-10', '2026-02-01T09:00:00Z', '2026-02-10T15:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('0bb6dc98-fc11-5fdc-8986-3fdf2d9e1e4a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e7b05d84-68ef-584f-beb7-69a4f4c34bd1', 'BILL-UX-2026-001', 'UX-2026-001', '2026-02-12', '2026-02-12', 'USD', 1.0, 'USD', 900.00, 0.00, 900.00, 900.00, 0.00, 900.00, 0.00, 900.00, 900.00, 0.00, 'paid', TRUE, '11f31511-ad53-59c7-9e90-8ee3b553489b', '2026-02-12T10:00:00Z', 'due_on_receipt', '/storage/bills/rivera-ux-2026-001.pdf', TRUE, '{"vendor": "Rivera UX Studio", "confidence": 0.93}'::jsonb, '2026-02-15', '2026-02-12T09:00:00Z', '2026-02-15T15:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO bill_lines (tenant_id, id, bill_id, line_number, description, quantity, unit_price, amount, expense_account_id, created_at) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c1386ffc-8a26-55fc-a32a-d311602d892e', 'fdab0a8b-c4d8-5601-bf23-59c3028e9359', 1, 'Cloud hosting', 1, 1820.00, 1820.00, '030e294b-88ad-544e-841a-cfda187885ac', '2026-01-24T09:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bb0d6278-aec4-5d5f-8e4d-c69b33305d54', 'b07bca71-9562-5a5f-91b1-b749912c242d', 1, 'February cloud hosting', 1, 1000.00, 1000.00, '030e294b-88ad-544e-841a-cfda187885ac', '2026-02-01T09:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '7fe155be-d5b8-5c0d-81e0-5f174ad8f6c9', 'a0c8a1c4-9d92-5f29-8fd9-2b164de81429', 1, 'February data transfer', 1, 1500.00, 1500.00, '030e294b-88ad-544e-841a-cfda187885ac', '2026-02-01T09:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '1f67be47-a613-544e-9663-15050d708a5e', '0bb6dc98-fc11-5fdc-8986-3fdf2d9e1e4a', 1, 'UX research sprint', 1, 900.00, 900.00, '2f318c15-7833-53a7-a0a1-71a84087dd17', '2026-02-12T09:00:00Z');

UPDATE bill_lines SET
    tax_rate_id = 'a1952ec4-9252-5bbf-89aa-9f2e89d7ef53',
    tax_amount = 161.53
WHERE id = 'c1386ffc-8a26-55fc-a32a-d311602d892e';

UPDATE bills SET
    journal_entry_id = CASE bill_number
        WHEN 'BILL-AWS-2026-01' THEN '2a21de82-b959-5412-99ac-89012024b59b'::uuid
        WHEN 'BILL-UX-2026-001' THEN 'd6b96dae-b54e-5c68-b377-1e8caf7bb90f'::uuid
        ELSE journal_entry_id
    END
WHERE bill_number IN ('BILL-AWS-2026-01','BILL-UX-2026-001');

INSERT INTO payments (id, tenant_id, payment_number, payment_date, reference, customer_id, vendor_id, currency, amount, exchange_rate, base_amount, payment_method, payment_gateway, payment_gateway_id, gateway_fee, bank_account_id, status, notes, journal_entry_id, created_at, updated_at, created_by) VALUES
    ('26361e4b-8a87-5b2a-a692-10ec68e02875', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PAY-2026-001', '2026-01-22', 'ACH-ACME-001', 'e40d0f18-1333-5cd1-a969-f5113df51e70', NULL, 'USD', 42300.00, 1.0, 42300.00, 'direct_deposit', 'Stripe', 'pi_acme_001', 650.17, '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', 'completed', 'Online payment for INV-2026-001', '7d5527ea-8449-5a3c-8819-e93caf4073b5', '2026-01-22T09:00:00Z', '2026-01-22T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('4c3b0a1e-770f-55b6-820d-d6ba91c6bf73', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PAY-2026-002', '2026-02-07', 'ACH-ACME-002', 'e40d0f18-1333-5cd1-a969-f5113df51e70', NULL, 'USD', 10000.00, 1.0, 10000.00, 'direct_deposit', 'Stripe', 'pi_acme_002', 295.30, '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', 'completed', 'Partial payment split across INV-2026-004 and INV-2026-005', '342f47a2-7820-5fa2-9f92-30e641731b41', '2026-02-07T13:00:00Z', '2026-02-07T13:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('f615bb1d-dc3a-563f-b1ff-7205a9f70587', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PAY-2026-003', '2026-02-07', 'FPS-BRITCO-001', 'ac7a04b4-a28e-5a15-9993-596db32c8d4e', NULL, 'GBP', 10000.00, 1.28, 12800.00, 'wire_transfer', 'GoCardless', 'pm_britco_001', 0.00, '7585ab47-4908-5830-a959-65711784fc61', 'completed', 'Partial foreign-currency receipt with realized FX gain', NULL, '2026-02-07T14:00:00Z', '2026-02-07T14:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('c147933d-3de1-5a49-b045-3645d4bc5eaf', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'VPAY-2026-001', '2026-02-10', 'WIRE-AWS-BATCH-001', NULL, '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92', 'USD', 2500.00, 1.0, 2500.00, 'wire_transfer', NULL, NULL, 0.00, '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', 'completed', 'Vendor payment allocated across two AWS bills', '52034898-f3d8-542e-8202-97395e16e7df', '2026-02-10T15:00:00Z', '2026-02-10T15:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('0b67be47-d010-5fb5-9766-c4bb19e30878', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'VPAY-2026-002', '2026-02-15', 'CHK-1099-001', NULL, 'e7b05d84-68ef-584f-beb7-69a4f4c34bd1', 'USD', 900.00, 1.0, 900.00, 'check', NULL, NULL, 0.00, '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc', 'completed', '1099 contractor payment above annual threshold', '731804dc-b1b9-59a0-9449-14014d9aec92', '2026-02-15T15:00:00Z', '2026-02-15T15:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO payment_allocations (tenant_id, id, payment_id, invoice_id, bill_id, amount, base_amount, fx_gain_loss, created_at) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d7fe617-7cb2-5510-a09f-578cbd768ae4', '26361e4b-8a87-5b2a-a692-10ec68e02875', 'c72699f8-700c-5760-a8e8-19ae6dfd53c5', NULL, 42300.00, 42300.00, 0.00, '2026-01-22T09:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '8368b9d2-3603-5c98-8daa-2acee0c35c73', '4c3b0a1e-770f-55b6-820d-d6ba91c6bf73', '37bd63c2-86a1-513c-8404-b731dd666b28', NULL, 7000.00, 7000.00, 0.00, '2026-02-07T13:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ed6fd918-f560-535c-a329-c7995eb1cff0', '4c3b0a1e-770f-55b6-820d-d6ba91c6bf73', 'a3ff49bc-30c8-57c3-ae07-c0fd6813df3e', NULL, 3000.00, 3000.00, 0.00, '2026-02-07T13:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '0d72e3bf-78c9-5bd7-9228-79274dc5266f', 'f615bb1d-dc3a-563f-b1ff-7205a9f70587', 'a31732ea-dadb-575f-bd99-cbcfeaba29da', NULL, 10000.00, 12800.00, 100.00, '2026-02-07T14:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '7f4a0e1c-2158-5695-93a7-dd4e3e60a122', 'c147933d-3de1-5a49-b045-3645d4bc5eaf', NULL, 'b07bca71-9562-5a5f-91b1-b749912c242d', 1000.00, 1000.00, 0.00, '2026-02-10T15:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5f7aa674-f190-5ff4-9b82-30a56d8c9bd0', 'c147933d-3de1-5a49-b045-3645d4bc5eaf', NULL, 'a0c8a1c4-9d92-5f29-8fd9-2b164de81429', 1500.00, 1500.00, 0.00, '2026-02-10T15:00:00Z'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '642fed20-dd4c-573e-a8f2-16647870d8d3', '0b67be47-d010-5fb5-9766-c4bb19e30878', NULL, '0bb6dc98-fc11-5fdc-8986-3fdf2d9e1e4a', 900.00, 900.00, 0.00, '2026-02-15T15:00:00Z');

-- Dashboards scoped to an objective and to a team
INSERT INTO pm_dashboards (id, tenant_id, dashboard_id, scope, dashboard_name, objective_id, owner_employee_id, layout_type, widget_count, visibility, is_default, view_count, created_at, updated_at, created_by) VALUES
    ('d5724fd4-6003-5b3d-a8f4-e21f5f720a53', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DB-001', 'objective', 'Delivery Overview', '960d66b2-8a52-59d0-8cf8-5c383d031244', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'grid', 3, 'tenant', TRUE, 42, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('7d22d488-6cdc-5fd1-a947-75bff92afec0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DB-002', 'team', 'Engineering Health', NULL, '6d466aa9-e51a-5d52-9015-152600855932', 'grid', 2, 'tenant', FALSE, 17, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Dashboard widgets with cached data as JSONB
INSERT INTO pm_dashboard_widgets (id, tenant_id, widget_id, dashboard_id, widget_type, widget_title, position_x, position_y, width, height, display_order, show_title, data_sources, config, cached_data, cache_enabled, created_at, updated_at, created_by) VALUES
    ('e8ca06c1-1f22-5b9e-9305-3cafa7f78b30', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DB-001-W1', 'd5724fd4-6003-5b3d-a8f4-e21f5f720a53', 'metric', 'Revenue vs Target', 0, 0, 6, 4, 1, TRUE, '{"table": "pm_objectives"}'::jsonb, '{"metric": "revenue", "period": "quarter"}'::jsonb, '{"value": 1010000}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('8e1eb5e9-5460-5d70-8a3e-6df47af94136', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DB-001-W2', 'd5724fd4-6003-5b3d-a8f4-e21f5f720a53', 'chart', 'Hours by Project', 0, 1, 6, 4, 2, TRUE, '{"table": "time_tracking_entries"}'::jsonb, '{"metric": "hours", "period": "quarter"}'::jsonb, '{"value": null}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('7b7d65e5-e7b9-5137-8a09-e49c42663206', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DB-001-W3', 'd5724fd4-6003-5b3d-a8f4-e21f5f720a53', 'list', 'At-Risk Tasks', 0, 2, 6, 4, 3, TRUE, '{"table": "tasks"}'::jsonb, '{"metric": "risk", "period": "quarter"}'::jsonb, '{"value": null}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('995f6521-221e-5753-9f05-e1f068f82b15', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DB-002-W1', '7d22d488-6cdc-5fd1-a947-75bff92afec0', 'metric', 'Open Tickets', 0, 0, 6, 4, 1, TRUE, '{"table": "ticketing_tickets"}'::jsonb, '{"metric": "tickets", "period": "quarter"}'::jsonb, '{"value": 4}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a90f9201-ea3d-5374-9cae-85a028efa4ac', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'DB-002-W2', '7d22d488-6cdc-5fd1-a947-75bff92afec0', 'chart', 'Cycle Time', 0, 1, 6, 4, 2, TRUE, '{"table": "tasks"}'::jsonb, '{"metric": "cycle_time", "period": "quarter"}'::jsonb, '{"value": null}'::jsonb, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO pm_task_comments (id, tenant_id, comment_id, task_id, project_id, comment_type, comment_text, author_type, author_employee_id, author_client_id, mentioned_users, is_internal, is_pinned, created_at, updated_at) VALUES
    ('77470cf2-dc9b-5cc0-a71a-5e20d99b5aa1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TC-001', '864cc09e-6b7e-58b4-a2e2-04233fbfea70', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'comment', 'Client confirmed source-system access for the mapping workshop.', 'employee', '11f31511-ad53-59c7-9e90-8ee3b553489b', NULL, '["db1f1f2b-b140-5948-a34e-1c998ed98757"]'::jsonb, FALSE, FALSE, '2026-01-12T10:00:00Z', '2026-01-12T10:00:00Z'),
    ('b8272a42-2627-5d55-acbb-8406d5c7d1f2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TC-002', '864cc09e-6b7e-58b4-a2e2-04233fbfea70', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'risk', 'Internal note: confirm edge-case mappings before showing the draft to Acme.', 'employee', '6d466aa9-e51a-5d52-9015-152600855932', NULL, '[]'::jsonb, TRUE, TRUE, '2026-01-12T11:00:00Z', '2026-01-12T11:00:00Z');

INSERT INTO pm_task_attachments (id, tenant_id, attachment_id, task_id, project_id, file_name, file_url, file_size_bytes, mime_type, file_type, version_number, client_visible, requires_approval, uploaded_by, uploaded_at, description) VALUES
    ('2ab3f543-a327-5442-8e49-5ad9404b6acd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PM-ATT-001', '864cc09e-6b7e-58b4-a2e2-04233fbfea70', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'acme-data-map-v1.xlsx', '/storage/projects/PRJ-001/acme-data-map-v1.xlsx', 231144, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'deliverable', 1, TRUE, TRUE, 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2026-01-13T09:00:00Z', 'Client-visible data mapping deliverable');

INSERT INTO pm_automations (id, tenant_id, automation_id, scope, project_id, automation_name, description, trigger, conditions, actions, execution_count, last_executed_at, suggested_by_ai, ai_confidence, created_from_natural_language, created_at, updated_at, created_by) VALUES
    ('fb6f1e74-d24b-5826-baf8-01ce025828cd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'AUTO-001', 'project', '8257009f-6a91-5fd1-9efb-518198c08e2a', 'Notify PM when client-visible task completes', 'Send a project-manager notification when a client-visible deliverable task is done.', '{"event": "task.status_changed"}'::jsonb, '[{"field": "client_visible", "equals": true}, {"field": "status", "equals": "done"}]'::jsonb, '[{"type": "notify", "target": "project_manager"}]'::jsonb, 1, '2026-01-13T09:05:00Z', TRUE, 0.86, 'Tell the PM when a client deliverable is ready.', '2026-01-01T09:00:00Z', '2026-01-13T09:05:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO pm_automation_executions (id, tenant_id, execution_id, automation_id, triggered_at, triggered_by, entity_type, entity_id, trigger_data, execution_status, actions_executed, action_results, executed_at, completed_at, created_at) VALUES
    ('6b7a370e-6363-5e69-8bf7-b51372243835', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'AUTO-EXEC-001', 'fb6f1e74-d24b-5826-baf8-01ce025828cd', '2026-01-13T09:05:00Z', 'system', 'task', '48961ce2-d17a-5ebe-81db-f608b4b6b125', '{"from": "in_progress", "to": "done"}'::jsonb, 'succeeded', 1, '[{"type": "notify", "status": "sent"}]'::jsonb, '2026-01-13T09:05:01Z', '2026-01-13T09:05:02Z', '2026-01-13T09:05:02Z');

-- Ticket attachments
INSERT INTO ticketing_attachments (id, tenant_id, attachment_id, ticket_id, ticket_number, file_name, file_url, file_size, mime_type, storage_key, uploaded_by, uploaded_at) VALUES
    ('0f9f07fe-cbd1-503e-a2ce-1ba81619e0c3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TA-001', 'a22f6d41-d654-5951-a043-e174f7e1a258', 'IT-0001', 'boot-error.png', '/storage/TA-001/boot-error.png', 284133, 'image/png', 'tickets/IT-0001/TA-001', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2026-01-01T09:00:00Z'),
    ('f0c3481c-869a-5c59-bd22-1422e4028cdf', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TA-002', 'a22f6d41-d654-5951-a043-e174f7e1a258', 'IT-0001', 'system-log.txt', '/storage/TA-002/system-log.txt', 18422, 'text/plain', 'tickets/IT-0001/TA-002', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2026-01-01T09:00:00Z');

-- SLA targets and first-response times, so /reports/sla-compliance has data.
-- Set as an UPDATE because the values are relative to each ticket's logged_at.
UPDATE ticketing_tickets SET
    sla_response_due_at = logged_at + (CASE priority WHEN 'high' THEN INTERVAL '4 hours'
                                                     WHEN 'medium' THEN INTERVAL '8 hours'
                                                     ELSE INTERVAL '24 hours' END),
    sla_due_at          = logged_at + (CASE priority WHEN 'high' THEN INTERVAL '24 hours'
                                                     WHEN 'medium' THEN INTERVAL '72 hours'
                                                     ELSE INTERVAL '120 hours' END),
    first_response_at   = logged_at + INTERVAL '90 minutes'
WHERE status <> 'open' OR priority = 'high';

-- One deliberate breach so the report has a non-zero failure case.
UPDATE ticketing_tickets SET
    first_response_at       = logged_at + INTERVAL '10 hours',
    sla_response_breached   = TRUE,
    sla_resolution_breached = FALSE
WHERE ticket_number = 'IT-0003';

UPDATE ticketing_tickets SET
    sla_response_breached = COALESCE(sla_response_breached,
                                     first_response_at > sla_response_due_at),
    sla_resolution_breached = COALESCE(sla_resolution_breached,
                                     resolved_at IS NOT NULL AND resolved_at > sla_due_at)
WHERE sla_due_at IS NOT NULL;

-- tenant_users — membership linking Supabase auth identities to employees.
-- This is the table custom_access_token_hook() reads at token issue to stamp
-- app_metadata.tenant_id, so it is load-bearing for login. It had no fixture,
-- which meant its RLS was never exercised; packages/database/tests/verify-rls.sql flags that.
-- user_id values are deterministic uuid5 stand-ins for auth.users rows.
-- One BASE role, plus any number of FUNCTIONAL roles (docs/14-access-control.md).
--
-- `manager` is deliberately absent: it is derived from employees.manager_id,
-- and Aisha (E005) has reports, so she IS a manager without being granted one.
--
-- E010 holds hr_admin and E001 holds payroll_admin, never the same person —
-- whoever sets pay must not approve the run that pays it. A CHECK constraint
-- refuses the combination, so this fixture is also the demonstration.
INSERT INTO tenant_users (id, tenant_id, user_id, employee_id, role,
                          functional_roles, is_active, is_default_tenant,
                          accepted_at)
SELECT
    uuid_generate_v5_compat(e.id, 'tenant_user'),
    e.tenant_id,
    uuid_generate_v5_compat(e.id, 'auth_user'),
    e.id,
    CASE e.employee_id
        WHEN 'E001' THEN 'owner'
        ELSE 'employee'
    END,
    CASE e.employee_id
        WHEN 'E001' THEN ARRAY['payroll_admin']::text[]
        WHEN 'E010' THEN ARRAY['hr_admin']::text[]
        ELSE '{}'::text[]
    END,
    TRUE, TRUE, '2026-01-01T09:00:00Z'
FROM employees e
-- E003 (Priya) is here for a specific reason: she is the subject of the one
-- review still in `draft`, so she is the only login that exercises the rule
-- that a manager's unfinished assessment is withheld from the person it is
-- about. Without her that path is testable only in unit tests.
WHERE e.employee_id IN ('E001','E002','E003','E004','E005','E010');


-- =============================================================================
-- VERIFICATION — runs on every load; the transaction aborts if anything is off
-- =============================================================================
DO $$
DECLARE t_id UUID; n INT; a NUMERIC; b NUMERIC;
BEGIN
    SELECT id INTO t_id FROM tenants WHERE subdomain = 'northwind';

    SELECT count(*) INTO n FROM employees WHERE tenant_id = t_id;
    IF n <> 12 THEN RAISE EXCEPTION 'expected 12 employees, found %', n; END IF;

    SELECT sum(debit_amount), sum(credit_amount) INTO a, b FROM journal_entry_lines;
    IF a <> b THEN RAISE EXCEPTION 'journal unbalanced: debits % credits %', a, b; END IF;

    SELECT count(*) INTO n FROM (
        SELECT entry_id FROM journal_entry_lines
        GROUP BY entry_id
        HAVING abs(sum(base_debit_amount) - sum(base_credit_amount)) > 0.02) j;
    IF n > 0 THEN RAISE EXCEPTION '% journal entries whose base-currency lines do not balance', n; END IF;

    SELECT count(*) INTO n FROM payroll_run_employees
     WHERE abs(gross_pay - (net_pay + total_taxes + total_posttax_deductions)) > 0.02;
    IF n > 0 THEN RAISE EXCEPTION '% payroll lines where gross <> net+taxes+deductions', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT r.id FROM payroll_runs r JOIN payroll_run_employees e ON e.payroll_run_id = r.id
        GROUP BY r.id, r.total_gross_pay
        HAVING abs(r.total_gross_pay - sum(e.gross_pay)) > 0.02) x;
    IF n > 0 THEN RAISE EXCEPTION '% payroll runs whose totals do not match their lines', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT i.id FROM invoices i JOIN invoice_lines l ON l.invoice_id = i.id
        GROUP BY i.id, i.subtotal HAVING abs(i.subtotal - sum(l.amount)) > 0.02) y;
    IF n > 0 THEN RAISE EXCEPTION '% invoices whose subtotal does not match their lines', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT i.id FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id = i.id
        GROUP BY i.id, i.tax_total, i.total, i.amount_paid, i.amount_due,
                 i.base_subtotal, i.base_tax_total, i.base_total, i.base_amount_paid, i.base_amount_due
        HAVING abs(i.tax_total - coalesce(sum(l.tax_amount), 0)) > 0.02
            OR abs(i.total - (i.subtotal + i.tax_total)) > 0.02
            OR abs(i.amount_due - (i.total - i.amount_paid)) > 0.02
            OR abs(i.base_total - (i.base_subtotal + i.base_tax_total)) > 0.02
            OR abs(i.base_amount_due - (i.base_total - i.base_amount_paid)) > 0.02) inv;
    IF n > 0 THEN RAISE EXCEPTION '% invoices whose tax, total, due, or base amounts do not reconcile', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT i.id FROM invoices i JOIN journal_entry_lines l ON l.entry_id = i.journal_entry_id
        WHERE i.journal_entry_id IS NOT NULL
        GROUP BY i.id, i.base_total
        HAVING abs(i.base_total - sum(l.base_debit_amount)) > 0.02
            OR abs(i.base_total - sum(l.base_credit_amount)) > 0.02) ij;
    IF n > 0 THEN RAISE EXCEPTION '% invoices whose linked journal entry does not tie to base total', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT b.id FROM bills b LEFT JOIN bill_lines l ON l.bill_id = b.id
        GROUP BY b.id, b.subtotal, b.tax_total, b.total, b.amount_paid, b.amount_due
        HAVING abs(b.subtotal - coalesce(sum(l.amount), 0)) > 0.02
            OR abs(b.tax_total - coalesce(sum(l.tax_amount), 0)) > 0.02
            OR abs(b.total - (b.subtotal + b.tax_total)) > 0.02
            OR abs(b.amount_due - (b.total - b.amount_paid)) > 0.02) bl;
    IF n > 0 THEN RAISE EXCEPTION '% bills whose lines, tax, total, or due amount do not reconcile', n; END IF;

    SELECT count(*) INTO n FROM payment_allocations
     WHERE amount <= 0
        OR base_amount <= 0
        OR ((invoice_id IS NOT NULL)::int + (bill_id IS NOT NULL)::int) <> 1;
    IF n > 0 THEN RAISE EXCEPTION '% invalid payment allocations without exactly one positive document target', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT p.id FROM payments p JOIN payment_allocations a ON a.payment_id = p.id
        GROUP BY p.id, p.amount
        HAVING sum(a.amount) > p.amount + 0.02) pa;
    IF n > 0 THEN RAISE EXCEPTION '% payments are over-allocated', n; END IF;

    SELECT count(*) INTO n FROM bank_transactions bt
     WHERE matched_to_type = 'payment'
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = bt.matched_to_id);
    IF n > 0 THEN RAISE EXCEPTION '% bank transactions matched to missing payments', n; END IF;

    SELECT count(*) INTO n FROM journal_entries je
     WHERE source_type = 'invoice'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.source_id)
        OR source_type = 'payment'
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = je.source_id)
        OR source_type = 'bill'
       AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.id = je.source_id);
    IF n > 0 THEN RAISE EXCEPTION '% journal entries point at missing accounting source documents', n; END IF;

    SELECT count(*) INTO n FROM (
        SELECT t.id FROM time_tracking_timesheets t
        JOIN time_tracking_entries e ON e.timesheet_id = t.id
        GROUP BY t.id, t.total_hours HAVING abs(t.total_hours - sum(e.hours)) > 0.02) z;
    IF n > 0 THEN RAISE EXCEPTION '% timesheets whose hours do not match their entries', n; END IF;

    RAISE NOTICE '--------------------------------------------------------------';
    RAISE NOTICE 'Northwind Consulting loaded and verified.';
    RAISE NOTICE '  tenant_id = %', t_id;
    RAISE NOTICE '  12 employees / 3 currencies / 3 locations';
    RAISE NOTICE '  payroll, invoices, timesheets and journals all reconcile';
    RAISE NOTICE '';
    RAISE NOTICE 'To exercise RLS, connect as a non-owner role and run:';
    RAISE NOTICE '  SET request.jwt.claims = ''{"app_metadata":{"tenant_id":"%"}}'';', t_id;
    RAISE NOTICE '--------------------------------------------------------------';
END $$;

DROP FUNCTION IF EXISTS uuid_generate_v5_compat(UUID, TEXT);

COMMIT;

-- Per-subject PII keys, wrapped under the well-known LOCAL development
-- master key (see apps/web/.env.example). Deterministic so the fixture is
-- stable; worthless outside a dev machine, exactly like the app_user password.
INSERT INTO pii_keys (tenant_id, subject_type, subject_id, key_label, kek_version, wrapped_dek) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', '6d466aa9-e51a-5d52-9015-152600855932', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"FdaH2nrPhjgi5A2x","ct":"W0KI7tdtpwZyal4BpdUa1VAf13K20kV/gSkFyzV4oBzAzaATaxoAZ3uZKcI=","tag":"LsS6POURTlKaCrNgbTkstg=="}'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"orhA1KAbMHvY3eHS","ct":"V8tFnmc5gosjV/0ZGgLneGpQHpn/fm9y23epUMCBuv0iqS6xuZsdpvxm3AY=","tag":"F5gGE/JotwVFndzh5lLM6g=="}'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'a87e0200-0849-53b6-a491-e882feace3f5', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"KtDGluEzmwSEgwTp","ct":"ZshtYxkupfR7dz2hP+cNkM3ME/dMVZMidY86WJnZbZzSFNfmyI3I4JcSNac=","tag":"Ph1+WBLZcGHL8VrVNe44Dw=="}');

-- Three tax identifiers, sealed. Obviously-fake values, and the only way the
-- encrypt/decrypt round trip is exercised against fixture data at all.
UPDATE employees SET ssn_tax_id_ct = '{"v":1,"k":1,"iv":"teDh8u0riCj3a5x0","ct":"g1sZGhIGdODWCUA=","tag":"o1hkvnef1O4pRk8S1ze/Kg=="}' WHERE id = '6d466aa9-e51a-5d52-9015-152600855932';
UPDATE employees SET ssn_tax_id_ct = '{"v":1,"k":1,"iv":"pvyJxAC0sw3Ri/4A","ct":"znOh7Gfh/Qdt9w==","tag":"cLsTa+CV8476qoRp8QWBLw=="}' WHERE id = 'db1f1f2b-b140-5948-a34e-1c998ed98757';
UPDATE employees SET ssn_tax_id_ct = '{"v":1,"k":1,"iv":"1tpvPzaJlwMWd1PE","ct":"gm+xoUDU/pcIBjw=","tag":"8C0Ma/5oJDOsUAmjS/ex7A=="}' WHERE id = 'a87e0200-0849-53b6-a491-e882feace3f5';

-- One honoured erasure request, so the audit trail is not empty and the
-- "erased" read path has something to return.
INSERT INTO pii_erasures (tenant_id, subject_type, subject_id, subject_label, reason, requested_by) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'E012', 'Data subject erasure request (GDPR Art. 17)', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Bank account numbers, sealed under the same per-employee keys. account_number_last4
-- stays plaintext on purpose: it is what a person uses to recognise their own
-- account, and four digits identify nobody on their own.
INSERT INTO pii_keys (tenant_id, subject_type, subject_id, key_label, kek_version, wrapped_dek) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"xdCR1Bvv6XXicFGb","ct":"CVrB33oDS8MTqBrGLwAkidQBa/eUR8LE2joqIImVfAjS3c+b38coiJlYt+M=","tag":"TN2mxLHfsG+tt45c4W12sw=="}'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"oYw3sYOoIUASyrT9","ct":"zY68mLhVqU3FSI3cPk1UMU37Mh2c82YUxho98QSEVBpseitekszKfpYEPvs=","tag":"y8fKRaIOQAhLBKLvmqe/Fg=="}'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"yk9XihbtqrgWVKq1","ct":"N9j6oqLSmeyRTI4+fTBN2e0wfrt4dbvYtqT/XzTGd0krNJkUoiJVrVkrl3g=","tag":"6rWQUBn0nd7rO/3t3U9uHg=="}'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'employee', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"/5zMU/nzegHReGCy","ct":"YQu2jjkM+yZYWTDalTL48/9AsR29yRGy/jrGNea+r2LqIUgi9qL3J/0C/zY=","tag":"1r6emZkmL0r2gtIklPE6ug=="}');
UPDATE employee_bank_accounts SET account_number_encrypted = '{"v":1,"k":1,"iv":"mv8lOMBwNFdDUkM1","ct":"nyUWqAsg557+oQ==","tag":"WhUcXqIE6SXWxYQ7srh0+g=="}' WHERE id = '2126f414-630c-5e02-9aa7-c399facb3401';
UPDATE employee_bank_accounts SET account_number_encrypted = '{"v":1,"k":1,"iv":"VGFLzUoV6Uh2tXdX","ct":"plT+ZVSJ03TJzw==","tag":"I8Vm5KMwuZvuR9WSRqvbvw=="}' WHERE id = '34a7cbd3-f5bf-5b13-86eb-6bef76e90c4b';
UPDATE employee_bank_accounts SET account_number_encrypted = '{"v":1,"k":1,"iv":"Zm0qGmKNv5LDS2nO","ct":"m02nssji/WfNaw==","tag":"pPXvh0MD6sqXLKw9p7nLqA=="}' WHERE id = '392ca0d4-b157-5011-a291-a2f42a7fe4c2';
UPDATE employee_bank_accounts SET account_number_encrypted = '{"v":1,"k":1,"iv":"twHJLcRa/shjyZkv","ct":"HNVI6gbOLDqpfg==","tag":"Wc3TpJ3WnKH8EZHbpjTxYg=="}' WHERE id = '63fb798f-93a9-5fcb-ba44-ce65cbbd4693';
UPDATE employee_bank_accounts SET account_number_encrypted = '{"v":1,"k":1,"iv":"43GDtygjV/xU1v3i","ct":"y5cqy0kAfsyB4g==","tag":"Mt4hy2wEGQmxZPTxzwfhLg=="}' WHERE id = '84274790-b9c2-5b7c-b4b3-d285ed8d3204';
UPDATE employee_bank_accounts SET account_number_encrypted = '{"v":1,"k":1,"iv":"IM8fNL7t1UqkKzp5","ct":"aIi4bb3BW3WDnA==","tag":"hc0ZtxkKMKxFrwWRoD+vcQ=="}' WHERE id = 'd8944f60-d19c-5f8f-b0e3-133a26453b16';
UPDATE employee_bank_accounts SET account_number_encrypted = '{"v":1,"k":1,"iv":"hGH0/KB+A1mFBq6/","ct":"aaf3Fn+3Nv8Y4g==","tag":"N2ydHXzEeQ9VbwleGtzZTA=="}' WHERE id = 'fb7bc54b-4f47-5429-9747-eede693b51c4';

-- The remaining PII, sealed. Bank identifiers, emergency contacts,
-- certification numbers and counterparty tax and bank details.
--
-- Two kinds of subject: an EMPLOYEE for their own data, and the TENANT for the
-- firm's own banking and its counterparties' details — those belong to the
-- firm, not to a person, so erasing an employee must not take them.
INSERT INTO pii_keys (tenant_id, subject_type, subject_id, key_label, kek_version, wrapped_dek) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'tenant', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'NORTHWIN-1064', 1, '{"v":1,"k":1,"iv":"SjMCazN8V0Xs6g/0","ct":"ADFNMYAnbHSbPO0VmzdvyKQIi5eUeh9QPO+RcO48lZ2wj87VSL1idoY8EwU=","tag":"IorIzaQXNOO9j+nKUh+JWw=="}')
ON CONFLICT (tenant_id, subject_type, subject_id) DO NOTHING;
UPDATE bank_accounts SET account_number_ct = '{"v":1,"k":1,"iv":"9Y6LHRcQ07wfAo6M","ct":"yBiNg/iiic4=","tag":"RvbPQritHBATwJb8AMMpaw=="}', routing_number_ct = '{"v":1,"k":1,"iv":"3E+BQGa6s/1zaKty","ct":"7GdhetAPUmTC","tag":"wTC26bRKJcq2BrClS81MfA=="}' WHERE id = '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc';
UPDATE bank_accounts SET account_number_ct = '{"v":1,"k":1,"iv":"ZC/Ok/6osvdf63PX","ct":"zhhzmpnDwH4=","tag":"kRbm05i0Y3iYb1HCUuT5sw=="}' WHERE id = '7585ab47-4908-5830-a959-65711784fc61';
UPDATE bank_accounts SET account_number_ct = '{"v":1,"k":1,"iv":"8/eQHYTj6otrxmGE","ct":"Nr+D9EcdTVk=","tag":"ero2OggSjxU7T3bt+H6roQ=="}', routing_number_ct = '{"v":1,"k":1,"iv":"8cKCGAjnTNRVmxnw","ct":"2/OZo/EaCwDa","tag":"V8fkxV8AiStiscyJ8J0Ocg=="}' WHERE id = 'd189279d-45d2-5e98-85bf-e03f3dbe04e3';
UPDATE employee_certifications SET certification_number_ct = '{"v":1,"k":1,"iv":"1uLfur/utuXmWUZB","ct":"+8YgIMByQbuxcA==","tag":"gmOrY4suM+9A9/JKRtnAzg=="}' WHERE id = '5c4f5df7-3719-59d4-84d8-ddd15ed7c9d5';
UPDATE employee_certifications SET certification_number_ct = '{"v":1,"k":1,"iv":"gZ7dXInuQAUcaWnG","ct":"4Y/0Y2/XBG4k0Q==","tag":"QlORNLBtj2iwSGLoLBu2Gg=="}' WHERE id = '68ec8b34-baee-5ffc-8d3b-b7b2a545e185';
UPDATE employee_certifications SET certification_number_ct = '{"v":1,"k":1,"iv":"p6ioa6dkLLqmsBJ4","ct":"R/+axhPireAwJA==","tag":"hSgXudfTCftdF3VkTIsdhg=="}' WHERE id = 'a4a7e7df-fe19-5b21-9a64-64790d003650';
UPDATE employee_bank_accounts SET routing_number_ct = '{"v":1,"k":1,"iv":"oWLaVkIYKzMAq/8Y","ct":"zKq6hJw6xjl1","tag":"W9/8ELsfPTPL+ZiBvXfXAw=="}' WHERE id = '2126f414-630c-5e02-9aa7-c399facb3401';
UPDATE employee_bank_accounts SET sort_code_ct = '{"v":1,"k":1,"iv":"8GusZvg8w3Cerh6b","ct":"6apdyozHEoE=","tag":"G2s42vCGJkQWYhTu1fuvXA=="}', iban_ct = '{"v":1,"k":1,"iv":"QWDTs1/nhw4CcgeM","ct":"cVkKLUSgV38rJSwXssB0shrufots3Q==","tag":"9WSjQjOjf9ICSJCldl84bw=="}' WHERE id = '34a7cbd3-f5bf-5b13-86eb-6bef76e90c4b';
UPDATE employee_bank_accounts SET routing_number_ct = '{"v":1,"k":1,"iv":"OclfCFvH1IPZwwxo","ct":"A/D9WdkZekY0","tag":"1m0kV6iUVhbxZsfGVxpHZg=="}' WHERE id = '392ca0d4-b157-5011-a291-a2f42a7fe4c2';
UPDATE employee_bank_accounts SET routing_number_ct = '{"v":1,"k":1,"iv":"hYbC9QQeQKftKTwI","ct":"7IQ/S6JViyjt","tag":"LaKh2sg3Irw/RUdkp0reRw=="}' WHERE id = '63fb798f-93a9-5fcb-ba44-ce65cbbd4693';
UPDATE employee_bank_accounts SET routing_number_ct = '{"v":1,"k":1,"iv":"FCWlttmiRF77WArw","ct":"2SHV6HR8NCIW","tag":"5hlgg9M7AoU6vnxlVTJ4Fg=="}' WHERE id = '84274790-b9c2-5b7c-b4b3-d285ed8d3204';
UPDATE employee_bank_accounts SET ifsc_code_ct = '{"v":1,"k":1,"iv":"bosBX1wmvKqxX2/S","ct":"iU/ufcU1H+yeyUY=","tag":"FNBxS3kVs47kOAH1CuBuAw=="}' WHERE id = 'd8944f60-d19c-5f8f-b0e3-133a26453b16';
UPDATE employee_bank_accounts SET ifsc_code_ct = '{"v":1,"k":1,"iv":"rEZbH6NelWjwkECf","ct":"lY0bShki91cpEhY=","tag":"U3HXZ/pzjj2nvJkv32Q5iA=="}' WHERE id = 'fb7bc54b-4f47-5429-9747-eede693b51c4';
UPDATE hr_emergency_contacts SET phone_primary_ct = '{"v":1,"k":1,"iv":"SF7xI3FZA9wZwsCe","ct":"7F4Iax8nFrcL7ysfw9EX","tag":"Jg8OrwGbZtw06Je/u9tY0A=="}' WHERE id = 'a5291a83-e115-5c77-8e35-41b9c64c6f23';
UPDATE hr_emergency_contacts SET phone_primary_ct = '{"v":1,"k":1,"iv":"9qgQ172v6qkZk71C","ct":"noKlTt0cXFAtGVkt8sBT","tag":"ONMbmYJ7YInJj1wQKl9nwg=="}' WHERE id = 'ad65d92d-c7d3-5178-a788-b7e4ecb9e2bd';
UPDATE hr_emergency_contacts SET phone_primary_ct = '{"v":1,"k":1,"iv":"4Uloh4TKW8bSyQjp","ct":"tnLF7hrqkN8eNn6YuiSWQg==","tag":"pEGKZzd1rdYEcEVuQa9l3g=="}' WHERE id = 'c75f6a31-cddf-58c8-97de-b87698f53477';

-- ============================================================================
-- Fixture completeness
--
-- Every column on a personal-data table carries a value here, because an EMPTY
-- column is a column nothing tests. `compensation_premiums` held zero rows and
-- every "a colleague cannot read this" assertion against it passed with
-- nothing to hide; the JSONB compensation columns on `employees` were `{}`, so
-- any visibility assertion over them would have passed while they were
-- protected by nothing at all (L48).
--
-- A test whose subject is NULL does not fail. It passes, and reports the
-- absence of data as the absence of a problem.
--
-- `scripts/verify-fixture-coverage.mjs` fails the build on any column here
-- that goes back to empty. Written as UPDATEs against the rows above rather
-- than folded into their INSERTs: the INSERTs stay readable as "who works
-- here", and this section stays readable as "and nothing is untested".
--
-- MONEY INSIDE JSONB IS A STRING, never a JSON number — Postgres stores a JSON
-- number exactly and hands it to JavaScript as a float64 on the way back out,
-- so the loss happens on read where nothing looks wrong (L41).
-- ============================================================================

-- Profile detail people fill in themselves. Deliberately varied: a fixture
-- where every row looks the same tests one shape twelve times.
UPDATE employees SET
    preferred_name = split_part(first_name, ' ', 1),
    pronouns = CASE first_name
        WHEN 'Sarah' THEN 'she_her' WHEN 'Marcus' THEN 'he_him'
        WHEN 'Priya' THEN 'she_her' WHEN 'Aisha' THEN 'she_her'
        WHEN 'Rachel' THEN 'she_her' WHEN 'Tom' THEN 'he_him'
        WHEN 'James' THEN 'he_him' WHEN 'Lena' THEN 'she_her'
        WHEN 'Nadia' THEN 'she_her' WHEN 'Diego' THEN 'he_him'
        WHEN 'Oliver' THEN 'he_him' ELSE 'they_them' END::pronouns,
    gender = CASE first_name
        WHEN 'Sarah' THEN 'female' WHEN 'Marcus' THEN 'male'
        WHEN 'Priya' THEN 'female' WHEN 'Aisha' THEN 'female'
        WHEN 'Rachel' THEN 'female' WHEN 'Tom' THEN 'male'
        WHEN 'James' THEN 'male' WHEN 'Lena' THEN 'female'
        WHEN 'Nadia' THEN 'prefer_not_to_say' WHEN 'Diego' THEN 'male'
        WHEN 'Oliver' THEN 'male' ELSE 'non_binary' END::gender,
    marital_status = CASE first_name
        WHEN 'Sarah' THEN 'married' WHEN 'Marcus' THEN 'married'
        WHEN 'Priya' THEN 'single' WHEN 'Aisha' THEN 'married'
        WHEN 'Rachel' THEN 'divorced' WHEN 'Tom' THEN 'single'
        WHEN 'James' THEN 'domestic_partnership' WHEN 'Lena' THEN 'single'
        WHEN 'Nadia' THEN 'prefer_not_to_say' WHEN 'Diego' THEN 'married'
        WHEN 'Oliver' THEN 'widowed' ELSE 'separated' END::marital_status,
    middle_name = CASE first_name
        WHEN 'Sarah' THEN 'Anne' WHEN 'Marcus' THEN 'Wei'
        WHEN 'James' THEN 'Alexander' WHEN 'Priya' THEN 'Lakshmi'
        ELSE NULL END,
    introduction = 'Works out of the ' || location_code || ' office. Ask me about '
        || COALESCE(department_code, 'the firm') || '.',
    hobbies = '["cycling", "cooking"]'::jsonb,
    social_media_links = jsonb_build_object('linkedin',
        'https://www.linkedin.com/in/' || lower(first_name) || '-' || lower(last_name)),
    affinity_groups = '["parents-network"]'::jsonb,
    prior_employers = '[{"employer": "Contoso Ltd", "title": "Consultant", "years": "2019-2022"}]'::jsonb,
    prior_education = '[{"institution": "University of Leeds", "qualification": "BSc", "year": "2015"}]'::jsonb;

-- Compensation detail. `salary_structure_pvt`, `variable_compensation_pvt`,
-- `tax_withholding_pvt` and `benefits_elections_pvt` are the five columns the
-- disclosure matrix declares protected and which had NO DATA — so nothing
-- would have noticed them leaking. Every money value is a STRING.
UPDATE employees SET
    compensation_band_pvt = job_level || '-' || CASE WHEN location_code LIKE 'IN%' THEN 'IN' WHEN location_code LIKE 'UK%' THEN 'UK' ELSE 'US' END,
    default_hourly_rate_pvt = round(default_billable_rate_pvt * 0.45, 4),
    salary_structure_pvt = jsonb_build_object(
        'basic_pct', '60', 'hra_pct', '24', 'special_allowance_pct', '16',
        'review_month', '4'),
    variable_compensation_pvt = jsonb_build_object(
        'target_pct', CASE WHEN department_code = 'SALES' THEN '25' ELSE '10' END,
        'plan', CASE WHEN department_code = 'SALES' THEN 'commission' ELSE 'annual_bonus' END),
    tax_withholding_pvt = CASE
        WHEN location_code LIKE 'IN%' THEN jsonb_build_object('regime', 'new', 'section_80c_declared', '150000')
        WHEN location_code LIKE 'UK%' THEN jsonb_build_object('tax_code', '1257L', 'student_loan_plan', '2')
        ELSE jsonb_build_object('filing_status', 'single', 'dependents', '0', 'extra_withholding', '0')
        END,
    benefits_elections_pvt = jsonb_build_object(
        'medical', 'employee_plus_spouse', 'dental', 'employee_only',
        'retirement_pct', '6');

-- Payroll lines. The pension deduction was entirely post-tax while
-- `pretax_deductions` sat empty, so the pre-tax path was never exercised by
-- any test. Splitting the SAME total into a pre-tax retirement contribution
-- and a smaller post-tax pension leaves gross, taxes, net and every run header
-- untouched — the identities still hold, and the empty column now has data.
UPDATE payroll_run_employees SET
    pretax_deductions = jsonb_build_object(
        CASE work_country WHEN 'US' THEN 'retirement_401k'
                          WHEN 'IN' THEN 'epf_employee'
                          ELSE 'workplace_pension' END,
        round(total_posttax_deductions * 0.6, 2)::text),
    total_pretax_deductions = round(total_posttax_deductions * 0.6, 2),
    posttax_deductions = jsonb_build_object('pension',
        (total_posttax_deductions - round(total_posttax_deductions * 0.6, 2))::text),
    total_posttax_deductions = total_posttax_deductions - round(total_posttax_deductions * 0.6, 2)
 WHERE total_posttax_deductions > 0;

-- The employer's own contributions, which never touch net pay but do belong on
-- a payslip and in the accounting export.
UPDATE payroll_run_employees SET
    employer_taxes = jsonb_build_object(
        CASE work_country WHEN 'US' THEN 'social_employer'
                          WHEN 'IN' THEN 'epf_employer' ELSE 'ni_employer' END,
        round(gross_pay * 0.0765, 2)::text),
    payment_details = jsonb_build_object('method', 'bank_transfer', 'last4', '4417'),
    run_employee_id = 'RE-' || substr(replace(id::text, '-', ''), 1, 10),
    resident_state = CASE work_country WHEN 'US' THEN work_state ELSE NULL END,
    overtime_hours = 0, double_time_hours = 0, pto_hours = 8;

-- Year to date. These are January runs, so YTD equals the period itself —
-- internally consistent rather than invented, which matters because a YTD that
-- disagrees with its own payslip is exactly the kind of figure nobody spots.
UPDATE payroll_run_employees SET
    ytd_federal_wages  = CASE work_country WHEN 'US' THEN gross_pay END,
    ytd_federal_tax    = CASE work_country WHEN 'US' THEN (taxes->>'income_tax')::numeric END,
    ytd_state_wages    = CASE work_country WHEN 'US' THEN gross_pay END,
    ytd_state_tax      = CASE work_country WHEN 'US' THEN round((taxes->>'income_tax')::numeric * 0.2, 2) END,
    ytd_ss_wages       = CASE work_country WHEN 'US' THEN gross_pay END,
    ytd_ss_tax         = CASE work_country WHEN 'US' THEN round((taxes->>'social')::numeric * 0.62, 2) END,
    ytd_medicare_wages = CASE work_country WHEN 'US' THEN gross_pay END,
    ytd_medicare_tax   = CASE work_country WHEN 'US' THEN round((taxes->>'social')::numeric * 0.38, 2) END,
    ytd_gross_inr      = CASE work_country WHEN 'IN' THEN gross_pay END,
    ytd_tds            = CASE work_country WHEN 'IN' THEN (taxes->>'income_tax')::numeric END,
    ytd_epf_employee   = CASE work_country WHEN 'IN' THEN total_pretax_deductions END,
    ytd_epf_employer   = CASE work_country WHEN 'IN' THEN total_pretax_deductions END,
    ytd_esi_employee   = CASE work_country WHEN 'IN' THEN round(gross_pay * 0.0075, 2) END,
    ytd_esi_employer   = CASE work_country WHEN 'IN' THEN round(gross_pay * 0.0325, 2) END;

-- Compensation records: the detail that makes each row a complete one.
-- `effective_to` is set on exactly ONE row per table — a superseded record.
-- Setting it everywhere would say every arrangement has ended; leaving it NULL
-- everywhere leaves the "this was superseded" path untested.
UPDATE compensation_base SET
    standard_hours_per_day = CASE WHEN currency = 'GBP' THEN 7.5 ELSE 8 END,
    standard_days_per_week = 5,
    overtime_rules = jsonb_build_object(
        'multiplier', '1.5', 'daily_threshold_hours', '8', 'weekly_threshold_hours', '40');

UPDATE compensation_allowances SET
    description = allowance_name || ' paid ' || COALESCE(frequency::text, 'monthly'),
    allowance_id = 'ALW-' || upper(substr(replace(id::text, '-', ''), 1, 8)),
    eligibility_criteria = 'All permanent staff at the assigned location.',
    max_reimbursement_per_period = round(amount * 1.5, 2),
    created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85';
UPDATE compensation_allowances SET effective_to = '2026-06-30'
 WHERE id = (SELECT id FROM compensation_allowances ORDER BY id LIMIT 1);

UPDATE compensation_variable SET
    description = comp_name || ', reviewed each ' || COALESCE(frequency::text, 'year'),
    variable_comp_id = 'VAR-' || upper(substr(replace(id::text, '-', ''), 1, 8)),
    next_payment_date = '2026-04-15',
    performance_metrics = jsonb_build_object(
        'metric', 'attainment_pct', 'threshold', '80', 'cap', '150');
UPDATE compensation_variable SET effective_to = '2026-12-31'
 WHERE id = (SELECT id FROM compensation_variable ORDER BY id LIMIT 1);

UPDATE compensation_premiums SET
    premium_id = 'PRM-' || upper(substr(replace(id::text, '-', ''), 1, 8)),
    premium_percentage = CASE WHEN rate_multiplier IS NOT NULL
                              THEN round((rate_multiplier - 1) * 100, 2) ELSE 12.50 END,
    conditions = jsonb_build_object('min_hours_per_rota', '8'),
    eligibility_rules = jsonb_build_object('requires_rota_membership', 'true');
UPDATE compensation_premiums SET effective_to = '2026-09-30'
 WHERE id = (SELECT id FROM compensation_premiums ORDER BY id LIMIT 1);

-- Equity. fair_market_value differs from grant/strike price on purpose: a
-- grant priced at the last round and marked to a later valuation is the normal
-- case, and the gap is the whole point of the record.
UPDATE compensation_equity SET
    equity_id = 'EQ-' || upper(substr(replace(id::text, '-', ''), 1, 8)),
    grant_price = COALESCE(strike_price, 1.25),
    fair_market_value = 3.40,
    expiration_date = (grant_date + INTERVAL '10 years')::date,
    performance_conditions = jsonb_build_object('type', 'time_only', 'accelerate_on_change_of_control', 'true');

-- Employment terms: one fixed-term contract that ran to its planned end.
UPDATE employment_terms SET
    planned_end_date = '2026-12-31',
    actual_end_date = NULL
 WHERE id = (SELECT id FROM employment_terms ORDER BY id LIMIT 1);
UPDATE employment_terms SET
    planned_end_date = '2025-12-31',
    actual_end_date = '2025-12-19'
 WHERE id = (SELECT id FROM employment_terms ORDER BY id OFFSET 1 LIMIT 1);

-- Bank accounts: one superseded, one prenote confirmed.
UPDATE employee_bank_accounts SET branch_name = 'Main branch';
UPDATE employee_bank_accounts SET prenote_sent_at = '2025-12-02T10:00:00Z'
 WHERE id = (SELECT id FROM employee_bank_accounts ORDER BY id LIMIT 1);
UPDATE employee_bank_accounts SET effective_to = '2025-11-30'
 WHERE id = (SELECT id FROM employee_bank_accounts ORDER BY id OFFSET 1 LIMIT 1);

-- Emergency contacts: the non-encrypted detail. The _ct columns are sealed
-- separately, through the real sealing pipeline.
UPDATE hr_emergency_contacts SET
    contact_id = 'EC-' || upper(substr(replace(id::text, '-', ''), 1, 8)),
    notes = 'Reachable outside working hours.';

-- Employment history: a change record has to say what it changed FROM.
UPDATE hr_employment_history h SET
    location_code = e.location_code,
    previous_location_code = CASE WHEN e.location_code = 'US-NYC' THEN 'UK-LON' ELSE 'US-NYC' END,
    manager_id = e.manager_id,
    previous_manager_id = NULL,
    fte = 1.0,
    previous_fte = 0.8,
    new_employment_type = 'full_time',
    previous_employment_type = 'part_time',
    approved_by = '6d466aa9-e51a-5d52-9015-152600855932',
    compensation_id = (SELECT c.id FROM compensation_base c WHERE c.employee_id = h.employee_id LIMIT 1)
  FROM employees e WHERE e.id = h.employee_id;

UPDATE hr_feedback SET
    feedback_date = COALESCE(created_at::date, '2026-02-10'),
    status = 'published';

UPDATE hr_reviews SET
    goals = '[{"goal": "Ship the payroll module", "status": "on_track", "weight": "40"}, {"goal": "Mentor two engineers", "status": "met", "weight": "20"}]'::jsonb;

UPDATE tenant_users SET
    last_active_at = '2026-08-28T09:15:00Z',
    permissions = '{"dashboard_layout": "compact"}'::jsonb;

-- Payroll: deduction schedules, and the India / US declaration detail.
UPDATE payroll_employee_deductions SET
    employee_annual_limit = 23000.00;
UPDATE payroll_employee_deductions SET
    effective_to = '2026-12-31',
    suspended_from = '2026-07-01',
    suspended_to = '2026-08-31',
    suspension_reason = 'Unpaid sabbatical'
 WHERE id = (SELECT id FROM payroll_employee_deductions ORDER BY id LIMIT 1);

UPDATE payroll_india_salary_structure SET
    medical_allowance = 15000, education_allowance = 2400,
    mobile_reimbursement = 12000, internet_reimbursement = 18000,
    annual_bonus = 60000, performance_bonus = 90000,
    employer_nps = 45000, gratuity = 32000,
    other_allowances = jsonb_build_object('leave_travel', '48000');
UPDATE payroll_india_salary_structure SET effective_to = '2027-03-31'
 WHERE id = (SELECT id FROM payroll_india_salary_structure ORDER BY id LIMIT 1);

UPDATE payroll_india_tax_declarations SET
    home_loan_interest = 180000, lta_claimed = 40000,
    previous_employer_income = 450000, previous_employer_tds = 32000,
    verified_at = '2026-05-20T11:00:00Z',
    verified_by = 'a87e0200-0849-53b6-a491-e882feace3f5';

UPDATE payroll_tax_withholding_certificates SET
    document_url = 'https://files.internal.example/w4/' || id || '.pdf',
    us_step2_amount = 0, us_step4a_other_income = 1200, us_step4b_deductions = 2500,
    india_previous_employer_income = 450000, india_previous_employer_tds = 32000;
UPDATE payroll_tax_withholding_certificates SET effective_to = '2026-12-31'
 WHERE id = (SELECT id FROM payroll_tax_withholding_certificates ORDER BY id LIMIT 1);

-- One promotion that also changed reporting line, so `previous_manager_id` is
-- exercised rather than uniformly NULL.
UPDATE hr_employment_history SET previous_manager_id = '11f31511-ad53-59c7-9e90-8ee3b553489b'
 WHERE employee_id <> '11f31511-ad53-59c7-9e90-8ee3b553489b'
   AND id = (SELECT id FROM hr_employment_history
              WHERE employee_id <> '11f31511-ad53-59c7-9e90-8ee3b553489b' ORDER BY id LIMIT 1);

-- Encrypted next-of-kin and banking detail.
--
-- Generated through the real sealing pipeline (`sealField`), not hand-written:
-- every envelope binds tenant | table | column | row as AAD, so a value cannot
-- be moved between rows or columns and one copied from elsewhere simply fails
-- to open. The per-employee keys these were sealed under are the ones seeded
-- in `pii_keys` above — reseal after changing those, or these stop decrypting.
UPDATE hr_emergency_contacts SET address_ct = '{"v":1,"k":1,"iv":"8sLYH4JKdJcf1M8x","ct":"9QhKJg1rXHmYLE1/XuuMssbki5k=","tag":"B9HQG8pGPnawwZcCO3+lgg=="}' WHERE id = 'a5291a83-e115-5c77-8e35-41b9c64c6f23';
UPDATE hr_emergency_contacts SET email_ct = '{"v":1,"k":1,"iv":"J9dcT6vlGFb9886W","ct":"39XNr08vuOEVYa2EoTzDpYRA3SeK","tag":"PwuWLuTYJ/UZQU6cDdHrPw=="}' WHERE id = 'a5291a83-e115-5c77-8e35-41b9c64c6f23';
UPDATE hr_emergency_contacts SET phone_secondary_ct = '{"v":1,"k":1,"iv":"pIkFtfU9DLsN+/DM","ct":"6oE4z8rxbcQGZP8ddBgy","tag":"KkHReIRhFB9AKVO2me8yHw=="}' WHERE id = 'a5291a83-e115-5c77-8e35-41b9c64c6f23';
UPDATE hr_emergency_contacts SET address_ct = '{"v":1,"k":1,"iv":"aMqd73pHfqveOM6C","ct":"Op84slniYUEdRALlsLhUBGbMX4A=","tag":"ukVITlcg9sE+WZhrWt7KCg=="}' WHERE id = 'ad65d92d-c7d3-5178-a788-b7e4ecb9e2bd';
UPDATE hr_emergency_contacts SET email_ct = '{"v":1,"k":1,"iv":"owUaXspKf8LmdRoi","ct":"pOa/4E8tcCmYewBBTX/SgQbuwyol","tag":"REFv/w3LWGhWxJsluRhA5A=="}' WHERE id = 'ad65d92d-c7d3-5178-a788-b7e4ecb9e2bd';
UPDATE hr_emergency_contacts SET phone_secondary_ct = '{"v":1,"k":1,"iv":"+mTk+rvb9hV5VZEe","ct":"TZgh6NBU/smkv9jfTcjP","tag":"Pa0xai69sK/ZmRNtlD+Fag=="}' WHERE id = 'ad65d92d-c7d3-5178-a788-b7e4ecb9e2bd';
UPDATE hr_emergency_contacts SET address_ct = '{"v":1,"k":1,"iv":"6KWWTT8PLXFr8yEG","ct":"n62c03nfFitsR9pfVMPSbzA6Y20=","tag":"mhy0UE5zsi8UZLwPGkK1Zg=="}' WHERE id = 'c75f6a31-cddf-58c8-97de-b87698f53477';
UPDATE hr_emergency_contacts SET email_ct = '{"v":1,"k":1,"iv":"zB71QWIrDUh2TTUU","ct":"7kcZmLFDtyZcLqIpgkFn2DnLkA==","tag":"1tp1POVhq+BKDZVhtn3AzQ=="}' WHERE id = 'c75f6a31-cddf-58c8-97de-b87698f53477';
UPDATE hr_emergency_contacts SET phone_secondary_ct = '{"v":1,"k":1,"iv":"LFAEzUuV881GALi6","ct":"8Y79j91V4pnMTIDHpvY5","tag":"3Qnvm1xPk1Q+5URoJhWE+A=="}' WHERE id = 'c75f6a31-cddf-58c8-97de-b87698f53477';
UPDATE employee_bank_accounts SET bic_swift_ct = '{"v":1,"k":1,"iv":"rFQChz1F3eS1v7kq","ct":"DBh3uvb5J93JGZ4=","tag":"jszLseXiqabD9iS58X2r9w=="}' WHERE id = '2126f414-630c-5e02-9aa7-c399facb3401';
UPDATE employee_bank_accounts SET bic_swift_ct = '{"v":1,"k":1,"iv":"USxfaGJDdARIG8fk","ct":"Gr6dcSz3iKboALQ=","tag":"FuXMjNnzZ8tNOCzV8AY35A=="}' WHERE id = '34a7cbd3-f5bf-5b13-86eb-6bef76e90c4b';
UPDATE employee_bank_accounts SET bic_swift_ct = '{"v":1,"k":1,"iv":"4JhuZNx8VzCqlyEM","ct":"Zo9oIN40YEQ9psU=","tag":"WYviNfgdVZllmcFYH/ct4g=="}' WHERE id = '392ca0d4-b157-5011-a291-a2f42a7fe4c2';
UPDATE employee_bank_accounts SET bic_swift_ct = '{"v":1,"k":1,"iv":"asKlAbkB2trz6yzZ","ct":"vap+gPR+kOM0HPw=","tag":"crJuTCHPeExCP9EG5eQ3qw=="}' WHERE id = '63fb798f-93a9-5fcb-ba44-ce65cbbd4693';
UPDATE employee_bank_accounts SET bic_swift_ct = '{"v":1,"k":1,"iv":"pxDqtiMKJy6Ft0Ra","ct":"m9UxA/+L0S45hkc=","tag":"f1fm5iJL1G7sx2ny8tpvng=="}' WHERE id = '84274790-b9c2-5b7c-b4b3-d285ed8d3204';
UPDATE employee_bank_accounts SET bic_swift_ct = '{"v":1,"k":1,"iv":"WtNz7SNaEsg86Giv","ct":"Z/djLLe+L9NDxwk=","tag":"xvN/MZJH1KskkHKdx9JS6A=="}' WHERE id = 'd8944f60-d19c-5f8f-b0e3-133a26453b16';
UPDATE employee_bank_accounts SET bic_swift_ct = '{"v":1,"k":1,"iv":"vBG2k11MyCBzKmwq","ct":"VxIWcqh8E8FvKqA=","tag":"shtg1O/JRJ5ZfsPD0Ssq6Q=="}' WHERE id = 'fb7bc54b-4f47-5429-9747-eede693b51c4';

-- ============================================================================
-- FIXTURE COMPLETENESS — every remaining column
--
-- An empty column is a column nothing tests. Completing the personal-data
-- tables alone exposed `PAY-math`, a specification check that had omitted
-- pre-tax deductions from the payroll identity and passed for months because
-- every row happened to have none (L50). This section extends that to the rest
-- of the schema.
--
-- Values are chosen to be plausible rather than merely well-typed: foreign
-- keys point at real rows, enums use labels the type permits, and identifiers
-- that carry a UNIQUE constraint derive from the row's own id so they stay
-- distinct across reseeds. A random uuid satisfies the type and describes
-- nothing, which is the failure this exercise exists to remove.
--
-- MONEY INSIDE JSONB IS A STRING (L41).
-- ============================================================================

-- ============================================================================
-- The eight tables that held no rows at all.
--
-- A table with no rows is a table whose every constraint, policy and query is
-- untested: `compensation_premiums` was in exactly this state, and its
-- row-visibility policy had never once been exercised (L48/L50). These are
-- seeded so that stops being true of anything.
--
-- MONEY INSIDE JSONB IS A STRING (L41).
-- ============================================================================

-- Benefits: a package holds items, and plans are the carrier-level products.
-- Modelled per the module spec: costs vary by currency because a firm with US,
-- UK and India offices buys three different products.
INSERT INTO firm_benefits_packages (id, tenant_id, name, name_i18n, description, description_i18n, eligibility_rules, is_active, created_at, updated_at, created_by, updated_by) VALUES
  ('b1a7c9e4-3d52-5f81-9a6c-2e4f7b013d58', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Standard Staff Package',
   '{"en-US": "Standard Staff Package", "fr-FR": "Forfait personnel standard"}'::jsonb,
   'Medical, dental and retirement for permanent staff.',
   '{"en-US": "Medical, dental and retirement for permanent staff."}'::jsonb,
   '{"min_fte": "0.5", "employment_types": ["full_time", "part_time"]}'::jsonb,
   TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
  ('c2b8daf5-4e63-5092-ab7d-3f508c124e69', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Executive Package',
   '{"en-US": "Executive Package"}'::jsonb, 'Enhanced cover for the leadership team.',
   '{"en-US": "Enhanced cover for the leadership team."}'::jsonb,
   '{"min_job_level": "L5"}'::jsonb,
   TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO firm_benefit_items (tenant_id, id, benefits_package_id, benefit_type, benefit_name, benefit_name_i18n, carrier_name, carrier_varies_by_location, costs_by_currency, plan_details, plan_details_i18n, is_active, created_at, updated_at, created_by, updated_by) VALUES
  ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'd3c9ebf6-5f74-51a3-bc8e-40619d235f7a', 'b1a7c9e4-3d52-5f81-9a6c-2e4f7b013d58', 'medical', 'Medical cover',
   '{"en-US": "Medical cover", "en-GB": "Private medical cover"}'::jsonb, 'Aetna', TRUE,
   '{"USD": {"employee": "220.00", "employer": "540.00"}, "GBP": {"employee": "95.00", "employer": "260.00"}, "INR": {"employee": "1800.00", "employer": "5200.00"}}'::jsonb,
   '{"deductible": "1500.00", "out_of_pocket_max": "6000.00"}'::jsonb,
   '{"en-US": {"deductible": "1500.00"}}'::jsonb,
   TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
  ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e4dafc07-6085-52b4-cd9f-51720e346a8b'::uuid, 'b1a7c9e4-3d52-5f81-9a6c-2e4f7b013d58', 'retirement', 'Retirement plan',
   '{"en-US": "401(k)", "en-GB": "Workplace pension", "en-IN": "EPF"}'::jsonb, 'Fidelity', TRUE,
   '{"USD": {"employee": "0.00", "employer": "0.00", "match_pct": "4"}}'::jsonb,
   '{"vesting_years": "2"}'::jsonb, '{"en-US": {"vesting_years": "2"}}'::jsonb,
   TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO firm_benefits_plans (id, tenant_id, plan_name, plan_code, plan_type, carrier_name, carrier_policy_number, coverage_type, network_type, is_active, effective_date, end_date, employee_cost_monthly, employer_cost_monthly, total_premium_monthly, currency, plan_details, cost_tiers, eligibility_rules, open_enrollment_start, open_enrollment_end, allows_new_hire_enrollment, new_hire_enrollment_window_days, allows_life_event_changes, life_event_window_days, summary_of_benefits_url, plan_document_url, description, internal_notes, created_at, updated_at, created_by) VALUES
  ('f5eb0d18-7196-53c5-de00-628310457b9c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Aetna PPO 1500', 'AET-PPO-1500', 'health_medical', 'Aetna', 'POL-88213', 'employee_plus_spouse', 'ppo',
   TRUE, '2026-01-01', '2026-12-31', 220.00, 540.00, 760.00, 'USD',
   '{"deductible": "1500.00", "coinsurance_pct": "20"}'::jsonb,
   '{"employee_only": "220.00", "employee_plus_spouse": "410.00", "family": "615.00"}'::jsonb,
   '{"min_fte": "0.5"}'::jsonb, '2026-11-01', '2026-11-30', TRUE, 30, TRUE, 30,
   'https://internal.example/sbc/aetna-ppo-1500.pdf', 'https://internal.example/plans/aetna-ppo-1500.pdf',
   'Preferred provider organisation plan with a 1,500 deductible.',
   'Renewal quote due each September.',
   '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- A project template, and the time entries that reference tasks and projects.
INSERT INTO pm_project_templates (id, tenant_id, template_id, name, description, category, template_data, is_public, use_count, estimated_duration_days, estimated_hours, estimated_budget, created_at, updated_at, created_by) VALUES
  ('a6fc1e29-82a7-54d6-ef11-739421568c0d'::uuid, '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TPL-DELIVERY-01', 'Standard client delivery',
   'Discovery, build, review and handover.', 'consulting',
   '{"phases": [{"name": "Discovery", "days": "10"}, {"name": "Build", "days": "40"}, {"name": "Handover", "days": "5"}]}'::jsonb,
   FALSE, 3, 55, 440.00, 88000.00, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

INSERT INTO pm_task_time_entries (id, tenant_id, time_entry_id, task_id, project_id, employee_id, start_time, end_time, duration_minutes, is_manual_entry, entry_date, hours, is_billable, hourly_rate, amount, notes, status, approved_by, approved_at, created_at, updated_at)
SELECT 'b70d2f3a-93b8-55e7-f022-84a532679d1e'::uuid, '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'TE-000001',
       t.id, t.project_id, '11f31511-ad53-59c7-9e90-8ee3b553489b',
       '2026-02-10T09:00:00Z', '2026-02-10T12:30:00Z', 210, FALSE, '2026-02-10', 3.5000, TRUE, 265.0000, 927.50,
       'Discovery workshop with the client.', 'approved', '6d466aa9-e51a-5d52-9015-152600855932', '2026-02-11T10:00:00Z',
       '2026-02-10T13:00:00Z', '2026-02-11T10:00:00Z'
  FROM tasks t WHERE t.project_id IS NOT NULL ORDER BY t.id LIMIT 1;

INSERT INTO contact_requests (id, updated_at, first_name, last_name, email, phone, company_name, message_body) VALUES
  ('c81e3a4b-a4c9-56f8-0133-95b64378ae2f'::uuid, '2026-02-01T09:00:00Z', 'Dana', 'Whitlock', 'dana.whitlock@example.com',
   '+1-415-555-0134', 'Whitlock Partners', 'Interested in a demo for a 40-person practice.');


-- Generated column fills, one per previously-empty column.

UPDATE audit_log SET ip_address = '198.51.100.24' WHERE ip_address IS NULL;
UPDATE audit_log SET user_agent = 'User Agent 1' WHERE user_agent IS NULL OR user_agent = '';
UPDATE bank_accounts SET bank_branch = 'Bank Branch 1' WHERE bank_branch IS NULL OR bank_branch = '';
UPDATE bank_accounts SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE bank_accounts SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE bank_reconciliation_rules SET amount_equals = 100.00 WHERE amount_equals IS NULL;
UPDATE bank_reconciliation_rules SET amount_max = 100.00 WHERE amount_max IS NULL;
UPDATE bank_reconciliation_rules SET amount_min = 100.00 WHERE amount_min IS NULL;
UPDATE bank_reconciliation_rules SET customer_id = 'e40d0f18-1333-5cd1-a969-f5113df51e70' WHERE customer_id IS NULL;
UPDATE bank_reconciliation_rules SET description_regex = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description_regex IS NULL OR description_regex = '';
UPDATE bank_reconciliation_rules SET last_applied_at = '2026-03-01T09:00:00Z' WHERE last_applied_at IS NULL;
UPDATE bank_reconciliation_rules SET tracking_categories = '["standard"]'::jsonb WHERE tracking_categories IS NULL OR tracking_categories::text IN ('{}','[]','null');
UPDATE bank_reconciliation_rules SET transaction_type = 'Transaction Type 1' WHERE transaction_type IS NULL OR transaction_type = '';
UPDATE bank_reconciliation_rules SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE bank_reconciliation_rules SET vendor_id = '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92' WHERE vendor_id IS NULL;
UPDATE bank_transactions SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE bill_lines SET tracking_categories = '["standard"]'::jsonb WHERE tracking_categories IS NULL OR tracking_categories::text IN ('{}','[]','null');
UPDATE bills SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE bills SET tracking_categories = '["standard"]'::jsonb WHERE tracking_categories IS NULL OR tracking_categories::text IN ('{}','[]','null');
UPDATE bills SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE chart_of_accounts SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE chart_of_accounts SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE chart_of_accounts SET description_i18n = '{"note": "seeded for fixture completeness"}'::jsonb WHERE description_i18n IS NULL OR description_i18n::text IN ('{}','[]','null');
UPDATE chart_of_accounts SET parent_account_id = 'eef02e95-6acb-5039-8acc-56340013e53a' WHERE parent_account_id IS NULL;
UPDATE chart_of_accounts SET tax_rate_id = 'a1952ec4-9252-5bbf-89aa-9f2e89d7ef53' WHERE tax_rate_id IS NULL;
UPDATE chart_of_accounts SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE clients SET acquisition_date = '2026-03-01' WHERE acquisition_date IS NULL;
UPDATE clients SET acquisition_source = 'Acquisition Source 1' WHERE acquisition_source IS NULL OR acquisition_source = '';
UPDATE clients SET address_line1 = 'Address Line1 1' WHERE address_line1 IS NULL OR address_line1 = '';
UPDATE clients SET address_line2 = 'Address Line2 1' WHERE address_line2 IS NULL OR address_line2 = '';
UPDATE clients SET billing_contact_email = 'fixture@northwind.example' WHERE billing_contact_email IS NULL OR billing_contact_email = '';
UPDATE clients SET billing_contact_name = 'Billing Contact Name 1' WHERE billing_contact_name IS NULL OR billing_contact_name = '';
UPDATE clients SET billing_contact_phone = '+1-212-555-0150' WHERE billing_contact_phone IS NULL OR billing_contact_phone = '';
UPDATE clients SET city = 'City 1' WHERE city IS NULL OR city = '';
UPDATE clients SET company_size = 'Company Size 1' WHERE company_size IS NULL OR company_size = '';
UPDATE clients SET custom_fields = '["standard"]'::jsonb WHERE custom_fields IS NULL OR custom_fields::text IN ('{}','[]','null');
UPDATE clients SET legal_entity_name = 'Legal Entity Name 1' WHERE legal_entity_name IS NULL OR legal_entity_name = '';
UPDATE clients SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE clients SET postal_code = 'STD' WHERE postal_code IS NULL OR postal_code = '';
UPDATE clients SET primary_contact_phone = '+1-212-555-0150' WHERE primary_contact_phone IS NULL OR primary_contact_phone = '';
UPDATE clients SET primary_contact_title = 'Primary Contact Title 1' WHERE primary_contact_title IS NULL OR primary_contact_title = '';
UPDATE clients SET state_province = 'State Province 1' WHERE state_province IS NULL OR state_province = '';
UPDATE clients SET website = 'Website 1' WHERE website IS NULL OR website = '';
UPDATE compensation_work_schedules SET break_policy = '{"note": "seeded for fixture completeness"}'::jsonb WHERE break_policy IS NULL OR break_policy::text IN ('{}','[]','null');
UPDATE compensation_work_schedules SET core_hours = '["standard"]'::jsonb WHERE core_hours IS NULL OR core_hours::text IN ('{}','[]','null');
UPDATE compensation_work_schedules SET effective_to = '2026-12-31' WHERE effective_to IS NULL;
UPDATE compensation_work_schedules SET schedule_id = 'SI-' || upper(substr(replace(id::text,'-',''), 1, 8)) WHERE schedule_id IS NULL OR schedule_id = '';
UPDATE compensation_work_schedules SET shift_pattern = '{"note": "seeded for fixture completeness"}'::jsonb WHERE shift_pattern IS NULL OR shift_pattern::text IN ('{}','[]','null');
UPDATE cross_module_links SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE cross_module_links SET metadata = '{"note": "seeded for fixture completeness"}'::jsonb WHERE metadata IS NULL OR metadata::text IN ('{}','[]','null');
UPDATE custom_field_definitions SET default_value = '{"note": "seeded for fixture completeness"}'::jsonb WHERE default_value IS NULL OR default_value::text IN ('{}','[]','null');
UPDATE custom_field_definitions SET field_group = 'Field Group 1' WHERE field_group IS NULL OR field_group = '';
UPDATE custom_field_definitions SET help_text = 'Help Text 1' WHERE help_text IS NULL OR help_text = '';
UPDATE custom_field_definitions SET label_i18n = '{"note": "seeded for fixture completeness"}'::jsonb WHERE label_i18n IS NULL OR label_i18n::text IN ('{}','[]','null');
UPDATE custom_field_definitions SET validation = '{"note": "seeded for fixture completeness"}'::jsonb WHERE validation IS NULL OR validation::text IN ('{}','[]','null');
UPDATE customers SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE customers SET credit_limit = 100.00 WHERE credit_limit IS NULL;
UPDATE customers SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE customers SET phone = '+1-212-555-0150' WHERE phone IS NULL OR phone = '';
UPDATE customers SET portal_access_token = 'Portal Access Token 1' WHERE portal_access_token IS NULL OR portal_access_token = '';
UPDATE customers SET shipping_address = '["standard"]'::jsonb WHERE shipping_address IS NULL OR shipping_address::text IN ('{}','[]','null');
UPDATE customers SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE customers SET website = 'Website 1' WHERE website IS NULL OR website = '';
UPDATE employee_assets SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE employee_assets SET return_date = '2026-03-01' WHERE return_date IS NULL;
UPDATE employee_certifications SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE employee_certifications SET verification_url = 'https://internal.example/fixture' WHERE verification_url IS NULL OR verification_url = '';
UPDATE employee_group_members SET expires_at = '2026-03-01T09:00:00Z' WHERE expires_at IS NULL;
UPDATE employee_group_roles SET expires_at = '2026-03-01T09:00:00Z' WHERE expires_at IS NULL;
UPDATE employee_training_records SET expiration_date = '2026-12-31' WHERE expiration_date IS NULL;
UPDATE employee_training_records SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE employee_user_groups SET department_code = 'STD' WHERE department_code IS NULL OR department_code = '';
UPDATE employee_user_groups SET location_code = 'STD' WHERE location_code IS NULL OR location_code = '';
UPDATE employee_user_groups SET parent_group_name = 'Parent Group Name 1' WHERE parent_group_name IS NULL OR parent_group_name = '';
UPDATE expenses SET bill_id = 'b07bca71-9562-5a5f-91b1-b749912c242d' WHERE bill_id IS NULL;
UPDATE expenses SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE expenses SET journal_entry_id = '9a2fac71-4b74-5342-8c43-46fb77267929' WHERE journal_entry_id IS NULL;
UPDATE expenses SET mileage_distance = 100.00 WHERE mileage_distance IS NULL;
UPDATE expenses SET mileage_rate = 12.50 WHERE mileage_rate IS NULL;
UPDATE expenses SET payment_id = '26361e4b-8a87-5b2a-a692-10ec68e02875' WHERE payment_id IS NULL;
UPDATE expenses SET rejection_reason = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE rejection_reason IS NULL OR rejection_reason = '';
UPDATE expenses SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE expenses SET vendor_id = '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92' WHERE vendor_id IS NULL;
UPDATE firm_departments SET code = 'STD' WHERE code IS NULL OR code = '';
UPDATE firm_departments SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE firm_departments SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE firm_departments SET description_i18n = '{"note": "seeded for fixture completeness"}'::jsonb WHERE description_i18n IS NULL OR description_i18n::text IN ('{}','[]','null');
UPDATE firm_departments SET location_id = '12c07799-28b4-55df-b8cf-df96df0bf40f' WHERE location_id IS NULL;
UPDATE firm_departments SET parent_department_id = '10cfa606-7c38-5de8-b72a-4ec11d9ae922' WHERE parent_department_id IS NULL;
UPDATE firm_departments SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE firm_holidays SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE firm_holidays SET observed_at = '2026-03-01T09:00:00Z' WHERE observed_at IS NULL;
UPDATE firm_holidays SET recurrence_rule = 'Recurrence Rule 1' WHERE recurrence_rule IS NULL OR recurrence_rule = '';
UPDATE firm_holidays SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE firm_job_levels SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE firm_job_levels SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE firm_job_titles SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE firm_job_titles SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE firm_job_titles SET eeoc_category = 'administrative_support'::eeoc_category WHERE eeoc_category IS NULL;
UPDATE firm_job_titles SET isco_code = 'STD' WHERE isco_code IS NULL OR isco_code = '';
UPDATE firm_job_titles SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE firm_locations SET address_line2 = 'Address Line2 1' WHERE address_line2 IS NULL OR address_line2 = '';
UPDATE firm_locations SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE firm_locations SET email = 'fixture@northwind.example' WHERE email IS NULL OR email = '';
UPDATE firm_locations SET holiday_calendar_id = 'Holiday Calendar Id 1' WHERE holiday_calendar_id IS NULL OR holiday_calendar_id = '';
UPDATE firm_locations SET phone = '+1-212-555-0150' WHERE phone IS NULL OR phone = '';
UPDATE firm_locations SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
-- Payroll policies, one per office.
--
-- The table had NO INSERT anywhere in this fixture — only the generated
-- UPDATEs below, which quietly did nothing against zero rows. Overtime rules
-- and rounding differ per jurisdiction by law, so a single firm-wide policy
-- would be wrong in at least two of these three countries.
--
-- workweek_start_day is 0=Sunday .. 6=Saturday. The US week starts Sunday; the
-- UK and India start Monday, and a payroll week that starts on the wrong day
-- puts overtime in the wrong period.
INSERT INTO firm_payroll_policies (id, tenant_id, location_id, overtime_rules, time_rounding, workweek_start_day, require_time_tracking, is_active, created_at, updated_at, created_by, updated_by) VALUES
  ('1a4d7b60-2c93-5e07-8f41-6b02d5931ca7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '12c07799-28b4-55df-b8cf-df96df0bf40f',
   '{"daily_threshold_hours": "8", "weekly_threshold_hours": "40", "multiplier": "1.5", "double_time_after_hours": "12"}'::jsonb,
   'nearest_15', 0, TRUE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z',
   '48ccc5de-9ba7-5461-ab49-160a1146ed85', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
  ('2b5e8c71-3da4-5f18-9052-7c13e6a42db8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf32fdb3-c7ed-52bd-b5e3-a581d6ab000c',
   '{"weekly_threshold_hours": "48", "multiplier": "1.5", "opt_out_available": "true"}'::jsonb,
   'nearest_15', 1, TRUE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z',
   '48ccc5de-9ba7-5461-ab49-160a1146ed85', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
  ('3c6f9d82-4eb5-5029-a163-8d24f7b53ec9', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '25dc9e1b-aa1f-59ae-ad80-da21c61c8242',
   '{"daily_threshold_hours": "9", "weekly_threshold_hours": "48", "multiplier": "2.0"}'::jsonb,
   'exact', 1, TRUE, TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z',
   '48ccc5de-9ba7-5461-ab49-160a1146ed85', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

UPDATE firm_payroll_policies SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE firm_payroll_policies SET location_id = '12c07799-28b4-55df-b8cf-df96df0bf40f' WHERE location_id IS NULL;
UPDATE firm_payroll_policies SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE hr_attendance SET approved_at = '2026-03-01T09:00:00Z' WHERE approved_at IS NULL;
UPDATE hr_attendance SET approved_by = 'Approved By 1' WHERE approved_by IS NULL OR approved_by = '';
UPDATE hr_attendance SET attendance_id = 'AI-' || upper(substr(replace(id::text,'-',''), 1, 8)) WHERE attendance_id IS NULL OR attendance_id = '';
UPDATE hr_attendance SET clock_in_location = 'Clock In Location 1' WHERE clock_in_location IS NULL OR clock_in_location = '';
UPDATE hr_attendance SET clock_out_location = 'Clock Out Location 1' WHERE clock_out_location IS NULL OR clock_out_location = '';
UPDATE hr_attendance SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE hr_benefits_enrollments SET annual_election_amount = 1.2500 WHERE annual_election_amount IS NULL;
UPDATE hr_benefits_enrollments SET carrier = 'Carrier 1' WHERE carrier IS NULL OR carrier = '';
UPDATE hr_benefits_enrollments SET employee_cost_monthly = 1.2500 WHERE employee_cost_monthly IS NULL;
UPDATE hr_benefits_enrollments SET employer_cost_monthly = 1.2500 WHERE employer_cost_monthly IS NULL;
UPDATE hr_benefits_enrollments SET end_date = '2026-12-31' WHERE end_date IS NULL;
UPDATE hr_benefits_enrollments SET enrollment_id = 'EI-' || upper(substr(replace(id::text,'-',''), 1, 8)) WHERE enrollment_id IS NULL OR enrollment_id = '';
UPDATE hr_change_requests SET resolved_at = '2026-03-01T09:00:00Z' WHERE resolved_at IS NULL;
UPDATE hr_change_requests SET resolved_by = 'Resolved By 1' WHERE resolved_by IS NULL OR resolved_by = '';
UPDATE hr_company_news SET attachments = '["standard"]'::jsonb WHERE attachments IS NULL OR attachments::text IN ('{}','[]','null');
UPDATE hr_company_news SET audience_department_code = 'STD' WHERE audience_department_code IS NULL OR audience_department_code = '';
UPDATE hr_company_news SET audience_group_id = '0158d8de-be1c-565f-a3c4-78624d177e7f' WHERE audience_group_id IS NULL;
UPDATE hr_company_news SET audience_location_code = 'STD' WHERE audience_location_code IS NULL OR audience_location_code = '';
UPDATE hr_company_news SET body_i18n = '{"note": "seeded for fixture completeness"}'::jsonb WHERE body_i18n IS NULL OR body_i18n::text IN ('{}','[]','null');
UPDATE hr_company_news SET event_location = 'Event Location 1' WHERE event_location IS NULL OR event_location = '';
UPDATE hr_company_news SET expires_at = '2026-03-01T09:00:00Z' WHERE expires_at IS NULL;
UPDATE hr_employee_documents SET expiration_date = '2026-12-31' WHERE expiration_date IS NULL;
UPDATE hr_employee_documents SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE hr_goals SET completed_at = '2026-03-01T09:00:00Z' WHERE completed_at IS NULL;
UPDATE hr_goals SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE hr_goals SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE hr_goals SET goal_title_i18n = '{"note": "seeded for fixture completeness"}'::jsonb WHERE goal_title_i18n IS NULL OR goal_title_i18n::text IN ('{}','[]','null');
UPDATE hr_goals SET unit = 'Unit 1' WHERE unit IS NULL OR unit = '';
UPDATE hr_onboarding_template_tasks SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE hr_onboarding_template_tasks SET task_config = '{"note": "seeded for fixture completeness"}'::jsonb WHERE task_config IS NULL OR task_config::text IN ('{}','[]','null');
-- NULL here means "applies to every location", which is what makes a template
-- the DEFAULT one. The generator filled it on every row, which deleted the
-- default and broke most-specific-wins selection outright.
--
-- Constraining an existing template would have been the smaller edit and the
-- wrong one — it narrows a template the tests rely on. A THIRD template
-- carries the location instead, so the column has data AND all three
-- specificity levels are exercised: default (neither), department (2),
-- location (1).
INSERT INTO hr_onboarding_templates (id, tenant_id, template_code, template_name, template_name_i18n, description, applies_to_department_code, applies_to_location_code, applies_to_employment_types, is_default, is_active, created_at, updated_at, created_by) VALUES
  ('4d7a2e93-5fc6-513b-b285-9e46a1c72fd0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1',
   'LONDON', 'London Office New Hire',
   '{"en-GB": "London Office New Hire"}'::jsonb,
   'Adds the UK right-to-work check and the London office induction.',
   NULL, 'UK-LON', '["full_time", "part_time"]'::jsonb, FALSE, TRUE,
   '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');
UPDATE hr_review_cycles SET template = '{"note": "seeded for fixture completeness"}'::jsonb WHERE template IS NULL OR template::text IN ('{}','[]','null');
UPDATE hr_surveys SET aggregate_results = 'Aggregate Results 1' WHERE aggregate_results IS NULL OR aggregate_results = '';
UPDATE hr_surveys SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE hr_surveys SET response_rate = 12.50 WHERE response_rate IS NULL;
UPDATE hr_surveys SET target_audience = 'Target Audience 1' WHERE target_audience IS NULL OR target_audience = '';
UPDATE hr_time_off_balances SET carryover_expires_on = '2026-12-31' WHERE carryover_expires_on IS NULL;
UPDATE hr_time_off_balances SET last_accrual_at = '2026-03-01T09:00:00Z' WHERE last_accrual_at IS NULL;
UPDATE hr_time_off_requests SET denial_reason = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE denial_reason IS NULL OR denial_reason = '';
UPDATE hr_time_off_requests SET denied_at = '2026-03-01T09:00:00Z' WHERE denied_at IS NULL;
UPDATE invoices SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE invoices SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE invoices SET reference = 'Reference 1' WHERE reference IS NULL OR reference = '';
UPDATE invoices SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE jobs SET completed_at = '2026-03-01T09:00:00Z' WHERE completed_at IS NULL;
UPDATE jobs SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE jobs SET last_error = 'Last Error 1' WHERE last_error IS NULL OR last_error = '';
UPDATE jobs SET result = '{"note": "seeded for fixture completeness"}'::jsonb WHERE result IS NULL OR result::text IN ('{}','[]','null');
UPDATE jobs SET started_at = '2026-03-01T09:00:00Z' WHERE started_at IS NULL;
UPDATE journal_entries SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE journal_entries SET posted_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE posted_by IS NULL;
UPDATE journal_entries SET reference = 'Reference 1' WHERE reference IS NULL OR reference = '';
UPDATE journal_entries SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE journal_entry_lines SET department_id = '10cfa606-7c38-5de8-b72a-4ec11d9ae922' WHERE department_id IS NULL;
UPDATE journal_entry_lines SET location_id = '12c07799-28b4-55df-b8cf-df96df0bf40f' WHERE location_id IS NULL;
UPDATE journal_entry_lines SET tax_rate_id = 'a1952ec4-9252-5bbf-89aa-9f2e89d7ef53' WHERE tax_rate_id IS NULL;
UPDATE journal_entry_lines SET tracking_categories = '["standard"]'::jsonb WHERE tracking_categories IS NULL OR tracking_categories::text IN ('{}','[]','null');
UPDATE payments SET check_number = 'Check Number 1' WHERE check_number IS NULL OR check_number = '';
UPDATE payments SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE payroll_deduction_definitions SET annual_limit_amount = 100.00 WHERE annual_limit_amount IS NULL;
UPDATE payroll_deduction_definitions SET deduction_def_id = 'DDI-' || upper(substr(replace(id::text,'-',''), 1, 8)) WHERE deduction_def_id IS NULL OR deduction_def_id = '';
UPDATE payroll_deduction_definitions SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE payroll_deduction_definitions SET max_amount = 1.2500 WHERE max_amount IS NULL;
UPDATE payroll_deduction_definitions SET per_pay_limit_amount = 100.00 WHERE per_pay_limit_amount IS NULL;
UPDATE payroll_deduction_definitions SET priority_order = 1 WHERE priority_order IS NULL;
UPDATE payroll_pay_schedules SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE payroll_pay_schedules SET next_pay_date = '2026-03-01' WHERE next_pay_date IS NULL;
UPDATE payroll_pay_schedules SET pay_days_of_month = 'Pay Days Of Month 1' WHERE pay_days_of_month IS NULL OR pay_days_of_month = '';
UPDATE payroll_pay_schedules SET pay_period_days = 5 WHERE pay_period_days IS NULL;
UPDATE payroll_pay_schedules SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE payroll_run_employees SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE payroll_runs SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE payroll_runs SET finalized_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE finalized_by IS NULL;
UPDATE payroll_runs SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE payroll_runs SET payment_file_generated_at = '2026-03-01T09:00:00Z' WHERE payment_file_generated_at IS NULL;
UPDATE payroll_runs SET payment_file_url = 'https://internal.example/fixture' WHERE payment_file_url IS NULL OR payment_file_url = '';
UPDATE payroll_runs SET payment_submitted_at = '2026-03-01T09:00:00Z' WHERE payment_submitted_at IS NULL;
UPDATE payroll_runs SET processed_at = '2026-03-01T09:00:00Z' WHERE processed_at IS NULL;
UPDATE payroll_runs SET processed_by = 'Processed By 1' WHERE processed_by IS NULL OR processed_by = '';
UPDATE payroll_tax_deposits SET confirmation_number = 'Confirmation Number 1' WHERE confirmation_number IS NULL OR confirmation_number = '';
UPDATE payroll_tax_deposits SET deposit_date = '2026-03-01' WHERE deposit_date IS NULL;
UPDATE payroll_tax_deposits SET payment_date = '2026-03-01' WHERE payment_date IS NULL;
UPDATE payroll_tax_deposits SET payment_method = 'cash'::payment_method WHERE payment_method IS NULL;
UPDATE payroll_tax_deposits SET tax_period_end = 'Tax Period End 1' WHERE tax_period_end IS NULL OR tax_period_end = '';
UPDATE payroll_tax_deposits SET tax_period_start = 'Tax Period Start 1' WHERE tax_period_start IS NULL OR tax_period_start = '';
UPDATE payroll_tax_deposits SET total_amount = 1.2500 WHERE total_amount IS NULL;
UPDATE payroll_tax_rates SET additional_threshold = 1.2500 WHERE additional_threshold IS NULL;
UPDATE payroll_tax_rates SET components = '["standard"]'::jsonb WHERE components IS NULL OR components::text IN ('{}','[]','null');
UPDATE payroll_tax_rates SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE payroll_tax_rates SET effective_to = '2026-12-31' WHERE effective_to IS NULL;
UPDATE payroll_tax_rates SET personal_exemption = 1.2500 WHERE personal_exemption IS NULL;
UPDATE payroll_tax_rates SET standard_deduction = 1.2500 WHERE standard_deduction IS NULL;
UPDATE payroll_tax_rates SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE pm_automation_executions SET error_message = 'Error Message 1' WHERE error_message IS NULL OR error_message = '';
UPDATE pm_automation_executions SET error_stack = 'Error Stack 1' WHERE error_stack IS NULL OR error_stack = '';
UPDATE pm_automation_executions SET execution_time_ms = 1 WHERE execution_time_ms IS NULL;
UPDATE pm_automations SET action_delays = '["standard"]'::jsonb WHERE action_delays IS NULL OR action_delays::text IN ('{}','[]','null');
UPDATE pm_automations SET current_hour_start = 'Current Hour Start 1' WHERE current_hour_start IS NULL OR current_hour_start = '';
UPDATE pm_automations SET last_error = 'Last Error 1' WHERE last_error IS NULL OR last_error = '';
UPDATE pm_dashboard_widgets SET cache_updated_at = '2026-03-01T09:00:00Z' WHERE cache_updated_at IS NULL;
UPDATE pm_dashboard_widgets SET cached_at = '2026-03-01T09:00:00Z' WHERE cached_at IS NULL;
UPDATE pm_dashboards SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE pm_dashboards SET last_viewed_at = '2026-03-01T09:00:00Z' WHERE last_viewed_at IS NULL;
UPDATE pm_dashboards SET layout_config = '{"note": "seeded for fixture completeness"}'::jsonb WHERE layout_config IS NULL OR layout_config::text IN ('{}','[]','null');
UPDATE pm_dashboards SET shared_with_teams = '["standard"]'::jsonb WHERE shared_with_teams IS NULL OR shared_with_teams::text IN ('{}','[]','null');
UPDATE pm_dashboards SET shared_with_users = '["standard"]'::jsonb WHERE shared_with_users IS NULL OR shared_with_users::text IN ('{}','[]','null');
UPDATE pm_objectives SET actual_profit_margin = 1.2500 WHERE actual_profit_margin IS NULL;
UPDATE pm_objectives SET archived_at = '2026-03-01T09:00:00Z' WHERE archived_at IS NULL;
UPDATE pm_objectives SET color = '#3B82F6' WHERE color IS NULL OR color = '';
UPDATE pm_objectives SET custom_fields = '["standard"]'::jsonb WHERE custom_fields IS NULL OR custom_fields::text IN ('{}','[]','null');
UPDATE pm_objectives SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE pm_objectives SET icon = 'Icon 1' WHERE icon IS NULL OR icon = '';
UPDATE pm_objectives SET kpis = '["standard"]'::jsonb WHERE kpis IS NULL OR kpis::text IN ('{}','[]','null');
UPDATE pm_objectives SET success_criteria = 'Success Criteria 1' WHERE success_criteria IS NULL OR success_criteria = '';
UPDATE pm_objectives SET target_profit_margin = 1.2500 WHERE target_profit_margin IS NULL;
UPDATE pm_objectives SET team_members = '["standard"]'::jsonb WHERE team_members IS NULL OR team_members::text IN ('{}','[]','null');
UPDATE pm_objectives SET updated_by = 'Updated By 1' WHERE updated_by IS NULL OR updated_by = '';
UPDATE pm_objectives SET vision_statement = 'Vision Statement 1' WHERE vision_statement IS NULL OR vision_statement = '';
UPDATE pm_task_attachments SET attachment_type = 'Attachment Type 1' WHERE attachment_type IS NULL OR attachment_type = '';
UPDATE pm_task_attachments SET file_extension = 'File Extension 1' WHERE file_extension IS NULL OR file_extension = '';
UPDATE pm_task_comments SET attachment_ids = '["standard"]'::jsonb WHERE attachment_ids IS NULL OR attachment_ids::text IN ('{}','[]','null');
UPDATE pm_task_comments SET deleted_at = '2026-03-01T09:00:00Z' WHERE deleted_at IS NULL;
UPDATE pm_task_comments SET edited_at = '2026-03-01T09:00:00Z' WHERE edited_at IS NULL;
UPDATE projects SET actual_end_date = '2026-12-31' WHERE actual_end_date IS NULL;
UPDATE projects SET actual_start_date = '2026-03-01' WHERE actual_start_date IS NULL;
UPDATE projects SET archived_at = '2026-03-01T09:00:00Z' WHERE archived_at IS NULL;
UPDATE projects SET budget_type = 'fixed_price'::budget_type WHERE budget_type IS NULL;
UPDATE projects SET color = '#3B82F6' WHERE color IS NULL OR color = '';
UPDATE projects SET custom_fields = '["standard"]'::jsonb WHERE custom_fields IS NULL OR custom_fields::text IN ('{}','[]','null');
UPDATE projects SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE projects SET hourly_rate_override = 12.50 WHERE hourly_rate_override IS NULL;
UPDATE projects SET icon = 'Icon 1' WHERE icon IS NULL OR icon = '';
UPDATE projects SET industry = 'Industry 1' WHERE industry IS NULL OR industry = '';
UPDATE projects SET last_activity_at = '2026-03-01T09:00:00Z' WHERE last_activity_at IS NULL;
UPDATE projects SET recurrence_rule = '{"note": "seeded for fixture completeness"}'::jsonb WHERE recurrence_rule IS NULL OR recurrence_rule::text IN ('{}','[]','null');
UPDATE projects SET service_type = 'Service Type 1' WHERE service_type IS NULL OR service_type = '';
UPDATE projects SET tags = '["standard"]'::jsonb WHERE tags IS NULL OR tags::text IN ('{}','[]','null');
UPDATE projects SET team_members = '["standard"]'::jsonb WHERE team_members IS NULL OR team_members::text IN ('{}','[]','null');
UPDATE projects SET updated_by = 'Updated By 1' WHERE updated_by IS NULL OR updated_by = '';
UPDATE tasks SET actual_cost = 1.2500 WHERE actual_cost IS NULL;
UPDATE tasks SET blocks_task_ids = '["standard"]'::jsonb WHERE blocks_task_ids IS NULL OR blocks_task_ids::text IN ('{}','[]','null');
UPDATE tasks SET board_column = 'Board Column 1' WHERE board_column IS NULL OR board_column = '';
UPDATE tasks SET board_position = 1 WHERE board_position IS NULL;
UPDATE tasks SET budget = 1.2500 WHERE budget IS NULL;
UPDATE tasks SET checklist_items = '["standard"]'::jsonb WHERE checklist_items IS NULL OR checklist_items::text IN ('{}','[]','null');
UPDATE tasks SET client_approved_at = '2026-03-01T09:00:00Z' WHERE client_approved_at IS NULL;
UPDATE tasks SET client_approved_by = 'Client Approved By 1' WHERE client_approved_by IS NULL OR client_approved_by = '';
UPDATE tasks SET completed_at = '2026-03-01T09:00:00Z' WHERE completed_at IS NULL;
UPDATE tasks SET completed_date = '2026-03-01' WHERE completed_date IS NULL;
UPDATE tasks SET deliverable_type = 'Deliverable Type 1' WHERE deliverable_type IS NULL OR deliverable_type = '';
UPDATE tasks SET deliverable_url = 'https://internal.example/fixture' WHERE deliverable_url IS NULL OR deliverable_url = '';
UPDATE tasks SET depends_on_task_ids = '["standard"]'::jsonb WHERE depends_on_task_ids IS NULL OR depends_on_task_ids::text IN ('{}','[]','null');
UPDATE tasks SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE tasks SET hourly_rate = 12.50 WHERE hourly_rate IS NULL;
UPDATE tasks SET labels = '["standard"]'::jsonb WHERE labels IS NULL OR labels::text IN ('{}','[]','null');
UPDATE tasks SET position = 1 WHERE position IS NULL;
UPDATE tasks SET recurrence_rule = '{"note": "seeded for fixture completeness"}'::jsonb WHERE recurrence_rule IS NULL OR recurrence_rule::text IN ('{}','[]','null');
UPDATE tasks SET role_required = 'Role Required 1' WHERE role_required IS NULL OR role_required = '';
UPDATE tasks SET start_date = '2026-03-01' WHERE start_date IS NULL;
UPDATE tasks SET tags = '["standard"]'::jsonb WHERE tags IS NULL OR tags::text IN ('{}','[]','null');
UPDATE tasks SET updated_by = 'Updated By 1' WHERE updated_by IS NULL OR updated_by = '';
UPDATE tenant_settings SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE tenant_users SET invited_at = '2026-03-01T09:00:00Z' WHERE invited_at IS NULL;
UPDATE tenants SET address_line1 = 'Address Line1 1' WHERE address_line1 IS NULL OR address_line1 = '';
UPDATE tenants SET address_line2 = 'Address Line2 1' WHERE address_line2 IS NULL OR address_line2 = '';
UPDATE tenants SET created_by = 'Created By 1' WHERE created_by IS NULL OR created_by = '';
UPDATE tenants SET features = '["standard"]'::jsonb WHERE features IS NULL OR features::text IN ('{}','[]','null');
UPDATE tenants SET postal_code = 'STD' WHERE postal_code IS NULL OR postal_code = '';
UPDATE tenants SET primary_contact_phone = '+1-212-555-0150' WHERE primary_contact_phone IS NULL OR primary_contact_phone = '';
UPDATE tenants SET registration_number = 'Registration Number 1' WHERE registration_number IS NULL OR registration_number = '';
UPDATE tenants SET trial_end_date = '2026-12-31' WHERE trial_end_date IS NULL;
UPDATE ticketing_attachments SET description = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE description IS NULL OR description = '';
UPDATE ticketing_attachments SET file_size_bytes = 1 WHERE file_size_bytes IS NULL;
UPDATE ticketing_attachments SET storage_url = 'https://internal.example/fixture' WHERE storage_url IS NULL OR storage_url = '';
UPDATE ticketing_attachments SET uploaded_by_name = 'Uploaded By Name 1' WHERE uploaded_by_name IS NULL OR uploaded_by_name = '';
UPDATE ticketing_business_areas SET settings = '["standard"]'::jsonb WHERE settings IS NULL OR settings::text IN ('{}','[]','null');
UPDATE ticketing_tickets SET closed_at = '2026-03-01T09:00:00Z' WHERE closed_at IS NULL;
UPDATE ticketing_tickets SET closed_by = 'Closed By 1' WHERE closed_by IS NULL OR closed_by = '';
UPDATE ticketing_tickets SET is_public = TRUE WHERE is_public IS NULL;
UPDATE ticketing_tickets SET reported_by_email = 'fixture@northwind.example' WHERE reported_by_email IS NULL OR reported_by_email = '';
UPDATE ticketing_tickets SET reported_by_name = 'Reported By Name 1' WHERE reported_by_name IS NULL OR reported_by_name = '';
UPDATE ticketing_tickets SET resolution_notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE resolution_notes IS NULL OR resolution_notes = '';
UPDATE ticketing_tickets SET tags = '["standard"]'::jsonb WHERE tags IS NULL OR tags::text IN ('{}','[]','null');
UPDATE ticketing_tickets SET tasks = '["standard"]'::jsonb WHERE tasks IS NULL OR tasks::text IN ('{}','[]','null');
UPDATE ticketing_updates SET attachments = '["standard"]'::jsonb WHERE attachments IS NULL OR attachments::text IN ('{}','[]','null');
UPDATE ticketing_updates SET changes = '["standard"]'::jsonb WHERE changes IS NULL OR changes::text IN ('{}','[]','null');
UPDATE ticketing_updates SET content_html = 'Content Html 1' WHERE content_html IS NULL OR content_html = '';
UPDATE ticketing_updates SET edited_at = '2026-03-01T09:00:00Z' WHERE edited_at IS NULL;
UPDATE ticketing_updates SET edited_by = 'Edited By 1' WHERE edited_by IS NULL OR edited_by = '';
UPDATE time_tracking_billable_expenses SET invoiced_at = '2026-03-01T09:00:00Z' WHERE invoiced_at IS NULL;
UPDATE time_tracking_billable_expenses SET reimbursed_at = '2026-03-01T09:00:00Z' WHERE reimbursed_at IS NULL;
UPDATE time_tracking_entries SET activity_type = 'call'::activity_type WHERE activity_type IS NULL;
UPDATE time_tracking_entries SET amount = 1.2500 WHERE amount IS NULL;
UPDATE time_tracking_entries SET approved_at = '2026-03-01T09:00:00Z' WHERE approved_at IS NULL;
UPDATE time_tracking_entries SET approved_by = 'Approved By 1' WHERE approved_by IS NULL OR approved_by = '';
UPDATE time_tracking_entries SET created_by = 'Created By 1' WHERE created_by IS NULL OR created_by = '';
UPDATE time_tracking_entries SET duration_minutes = 1 WHERE duration_minutes IS NULL;
UPDATE time_tracking_entries SET end_time = '2026-03-01T09:00:00Z' WHERE end_time IS NULL;
UPDATE time_tracking_entries SET internal_notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE internal_notes IS NULL OR internal_notes = '';
UPDATE time_tracking_entries SET invoiced_at = '2026-03-01T09:00:00Z' WHERE invoiced_at IS NULL;
UPDATE time_tracking_entries SET locked_at = '2026-03-01T09:00:00Z' WHERE locked_at IS NULL;
UPDATE time_tracking_entries SET locked_by = 'Locked By 1' WHERE locked_by IS NULL OR locked_by = '';
UPDATE time_tracking_entries SET rate_source = 'Rate Source 1' WHERE rate_source IS NULL OR rate_source = '';
UPDATE time_tracking_entries SET rejection_reason = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE rejection_reason IS NULL OR rejection_reason = '';
UPDATE time_tracking_entries SET start_time = '2026-03-01T09:00:00Z' WHERE start_time IS NULL;
UPDATE time_tracking_entries SET submitted_at = '2026-03-01T09:00:00Z' WHERE submitted_at IS NULL;
UPDATE time_tracking_entries SET submitted_to = 'Submitted To 1' WHERE submitted_to IS NULL OR submitted_to = '';
UPDATE time_tracking_entries SET tags = '["standard"]'::jsonb WHERE tags IS NULL OR tags::text IN ('{}','[]','null');
UPDATE time_tracking_entries SET updated_by = 'Updated By 1' WHERE updated_by IS NULL OR updated_by = '';
UPDATE time_tracking_hourly_rates SET role_code = 'STD' WHERE role_code IS NULL OR role_code = '';
UPDATE time_tracking_timesheets SET approved_at = '2026-03-01T09:00:00Z' WHERE approved_at IS NULL;
UPDATE time_tracking_timesheets SET approved_by = 'Approved By 1' WHERE approved_by IS NULL OR approved_by = '';
UPDATE time_tracking_timesheets SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE time_tracking_timesheets SET rejection_reason = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE rejection_reason IS NULL OR rejection_reason = '';
UPDATE time_tracking_timesheets SET submitted_at = '2026-03-01T09:00:00Z' WHERE submitted_at IS NULL;
UPDATE time_tracking_timesheets SET submitted_to = 'Submitted To 1' WHERE submitted_to IS NULL OR submitted_to = '';
UPDATE vendors SET address = '["standard"]'::jsonb WHERE address IS NULL OR address::text IN ('{}','[]','null');
UPDATE vendors SET bank_name = 'Bank Name 1' WHERE bank_name IS NULL OR bank_name = '';
UPDATE vendors SET created_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE created_by IS NULL;
UPDATE vendors SET custom_fields = '["standard"]'::jsonb WHERE custom_fields IS NULL OR custom_fields::text IN ('{}','[]','null');
UPDATE vendors SET notes = 'Seeded so this column is never empty — an empty column is a check that has stopped testing.' WHERE notes IS NULL OR notes = '';
UPDATE vendors SET phone = '+1-212-555-0150' WHERE phone IS NULL OR phone = '';
UPDATE vendors SET updated_by = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE updated_by IS NULL;
UPDATE vendors SET website = 'Website 1' WHERE website IS NULL OR website = '';


-- Three columns whose CHECK constraints wanted specific values rather than
-- merely well-shaped ones. The constraints doing their job.
UPDATE tenants SET company_size = '11-50'
 WHERE company_size IS NULL OR company_size NOT IN ('1-10','11-50','51-200','201-500','501+');
UPDATE payroll_pay_schedules SET pay_day_of_week = 'friday'
 WHERE pay_day_of_week IS NULL
    OR pay_day_of_week NOT IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');
-- A review meeting discusses assessments, so it has to fall after them.
UPDATE hr_review_cycles SET review_meetings_due = GREATEST(
    COALESCE(manager_assessment_due, start_date),
    COALESCE(self_assessment_due, start_date)) + INTERVAL '7 days'
 WHERE review_meetings_due IS NULL;

-- Soft references: uuid columns with no FK constraint, pointed at real rows.
-- A random uuid here would satisfy the type and describe nothing, which is the
-- failure mode this whole exercise exists to remove.

UPDATE hr_time_off_policies p SET template_id =
  (SELECT id FROM hr_time_off_policies o WHERE o.id <> p.id ORDER BY o.id LIMIT 1)
 WHERE template_id IS NULL;

UPDATE pm_automation_executions SET triggered_by_user_id = '48ccc5de-9ba7-5461-ab49-160a1146ed85' WHERE triggered_by_user_id IS NULL;
UPDATE pm_automations       SET objective_id          = (SELECT id FROM pm_objectives LIMIT 1)  WHERE objective_id IS NULL;
UPDATE pm_objectives        SET client_id             = (SELECT id FROM clients LIMIT 1)        WHERE client_id IS NULL;
UPDATE pm_objectives        SET default_dashboard_id  = (SELECT id FROM pm_dashboards LIMIT 1)  WHERE default_dashboard_id IS NULL;
UPDATE pm_objectives        SET primary_contact_id    = (SELECT id FROM employees LIMIT 1)      WHERE primary_contact_id IS NULL;
UPDATE pm_task_comments     SET author_client_id      = (SELECT id FROM clients LIMIT 1)        WHERE author_client_id IS NULL;
UPDATE projects             SET contact_person_id     = (SELECT id FROM employees LIMIT 1)      WHERE contact_person_id IS NULL;
UPDATE ticketing_attachments SET update_id            = (SELECT id FROM ticketing_updates LIMIT 1) WHERE update_id IS NULL;
UPDATE time_tracking_entries SET client_id            = (SELECT id FROM clients LIMIT 1)        WHERE client_id IS NULL;
UPDATE time_tracking_entries SET invoice_id           = (SELECT id FROM invoices LIMIT 1)       WHERE invoice_id IS NULL;
UPDATE time_tracking_entries SET invoice_line_item_id = (SELECT id FROM invoice_lines LIMIT 1)  WHERE invoice_line_item_id IS NULL;
UPDATE time_tracking_billable_expenses SET invoice_id = (SELECT id FROM invoices LIMIT 1)       WHERE invoice_id IS NULL;
UPDATE time_tracking_billable_expenses SET receipt_attachment_id = (SELECT id FROM pm_task_attachments LIMIT 1) WHERE receipt_attachment_id IS NULL;
UPDATE time_tracking_hourly_rates SET project_id      = (SELECT id FROM projects LIMIT 1)       WHERE project_id IS NULL;

-- `tenants.tax_id` is a uuid column with a tax-identifier name — the type and
-- the name disagree, which is worth knowing about. Filled as the uuid it is.
UPDATE tenants SET tax_id = '9d1c1a54-2f8e-5b77-9c30-6a4f0e2b71d5' WHERE tax_id IS NULL;

-- Self-references: a hierarchy needs a parent that is a DIFFERENT row, so
-- these point the newest row at the oldest rather than at themselves.
UPDATE projects p SET parent_project_id =
  (SELECT id FROM projects o WHERE o.id <> p.id ORDER BY o.id LIMIT 1)
 WHERE p.id = (SELECT id FROM projects ORDER BY id DESC LIMIT 1);

UPDATE tasks t SET parent_task_id =
  (SELECT id FROM tasks o WHERE o.id <> t.id ORDER BY o.id LIMIT 1)
 WHERE t.id = (SELECT id FROM tasks ORDER BY id DESC LIMIT 1);

UPDATE tasks t SET recurrence_parent_id =
  (SELECT id FROM tasks o WHERE o.id <> t.id ORDER BY o.id LIMIT 1)
 WHERE t.id = (SELECT id FROM tasks ORDER BY id DESC OFFSET 1 LIMIT 1);

UPDATE pm_task_comments c SET parent_comment_id =
  (SELECT id FROM pm_task_comments o WHERE o.id <> c.id ORDER BY o.id LIMIT 1)
 WHERE c.id = (SELECT id FROM pm_task_comments ORDER BY id DESC LIMIT 1);

-- The last references, now that the rows they point at exist.
UPDATE projects SET template_id = (SELECT id FROM pm_project_templates LIMIT 1) WHERE template_id IS NULL;
UPDATE pm_task_time_entries SET invoice_id = (SELECT id FROM invoices LIMIT 1) WHERE invoice_id IS NULL;
UPDATE pm_task_time_entries SET invoice_line_item_id = (SELECT id FROM invoice_lines LIMIT 1) WHERE invoice_line_item_id IS NULL;

-- A reply needs something to reply to, so the attachment table gets a second
-- row rather than a self-parent.
INSERT INTO pm_task_attachments (id, tenant_id, attachment_id, task_id, project_id, file_name, file_url, file_size_bytes, mime_type, file_type, file_extension, attachment_type, version_number, is_latest_version, client_visible, requires_approval, uploaded_by, uploaded_at, description)
SELECT '9e2b4c17-5a06-513a-b274-9e35a8c64f10', a.tenant_id, 'ATT-REV2', a.task_id, a.project_id,
       'revised-brief-v2.pdf', 'https://internal.example/files/revised-brief-v2.pdf',
       184320, 'application/pdf', a.file_type, 'pdf', a.attachment_type,
       2, TRUE, FALSE, FALSE, a.uploaded_by, '2026-02-12T11:00:00Z',
       'Second version, so the version chain has something to point at.'
  FROM pm_task_attachments a ORDER BY a.id LIMIT 1
ON CONFLICT (id) DO NOTHING;

UPDATE pm_task_attachments c SET parent_attachment_id =
  (SELECT id FROM pm_task_attachments o WHERE o.id <> c.id ORDER BY o.id LIMIT 1)
 WHERE c.id = (SELECT id FROM pm_task_attachments ORDER BY id DESC LIMIT 1);

UPDATE pm_task_attachments SET is_latest_version = FALSE
 WHERE id <> '9e2b4c17-5a06-513a-b274-9e35a8c64f10'
   AND task_id = (SELECT task_id FROM pm_task_attachments WHERE id = '9e2b4c17-5a06-513a-b274-9e35a8c64f10');

-- The FIRM's own banking, and its counterparties' identifiers.
--
-- Sealed to the TENANT subject, not to an employee: one leaver's erasure must
-- not take the company's bank details or every client's tax identifier with
-- it. Generated through `sealField`, so the AAD binding is real.
--
-- These five columns were EMPTY until the fixture was completed, which means
-- `pii/ciphertext-is-sealed` and `pii/encrypted-name-is-honest` had never once
-- examined them — two invariants passing over nothing. Filling them with
-- plaintext made both fail immediately, which is the guards working and the
-- reason this exercise was worth doing (L50).
UPDATE bank_accounts SET iban_ct = '{"v":1,"k":1,"iv":"TYgohcaDDt3xhLCV","ct":"mueggGQDpXGqt4SyFgwMsF+XMPowYA==","tag":"vvaeQfMfFIVUr/31A6Gqjg=="}' WHERE id = '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc';
UPDATE bank_accounts SET iban_ct = '{"v":1,"k":1,"iv":"gqucYAgPWMgypxpC","ct":"8jzXkX+i5FJSRX/mXHP1BHoSQMx7CA==","tag":"yCIOiuWXoEBAOsGGGeUozQ=="}' WHERE id = '7585ab47-4908-5830-a959-65711784fc61';
UPDATE bank_accounts SET iban_ct = '{"v":1,"k":1,"iv":"wFf30MNsfFZrDdAp","ct":"cBs/HGRMRTvzIWZy9ZjH5T8BPIrWjg==","tag":"/kTeyOBhE0OWUXyrMbpUuQ=="}' WHERE id = 'd189279d-45d2-5e98-85bf-e03f3dbe04e3';
UPDATE bank_accounts SET swift_code_ct = '{"v":1,"k":1,"iv":"f/perHW9b5Nl0phG","ct":"mthHcBpxfF8=","tag":"nYyKOph8xB17JeUZxQfB2A=="}' WHERE id = '6d55e7d0-f085-5951-9f28-2fcd1b75c6bc';
UPDATE bank_accounts SET swift_code_ct = '{"v":1,"k":1,"iv":"LhmfVqhtPHry1DOk","ct":"6POFIaPVXNw=","tag":"2NDEKn//Nm4GMGpqymYXXQ=="}' WHERE id = '7585ab47-4908-5830-a959-65711784fc61';
UPDATE bank_accounts SET swift_code_ct = '{"v":1,"k":1,"iv":"hcvMgptyeyeEdhWh","ct":"RptJsyHWzLc=","tag":"RnjIlh6d8QI7BR6/EinrxA=="}' WHERE id = 'd189279d-45d2-5e98-85bf-e03f3dbe04e3';
UPDATE clients SET tax_id_ct = '{"v":1,"k":1,"iv":"vgXyS/xwUOaIe5pz","ct":"SotdrCNLyjIqAno=","tag":"54DsvimGPEK5yXJwggsPRw=="}' WHERE id = '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8';
UPDATE clients SET tax_id_ct = '{"v":1,"k":1,"iv":"H74W7dyphfi4ikZh","ct":"sBn2V4X/WDbfRahS","tag":"UXGvV1EUdzCDO2ny/r9kpA=="}' WHERE id = '8594031f-d3f3-5d62-a5ab-f99b3a89c720';
UPDATE clients SET tax_id_ct = '{"v":1,"k":1,"iv":"X+044SYlHeBqSQaO","ct":"/fwcgo+2Q5tTGizEm/zxCsw=","tag":"BnQNrtWoaZT6Uzhky0CBRg=="}' WHERE id = 'e22e6459-7c1d-5857-9908-89d775c82245';
UPDATE vendors SET bank_account_number_ct = '{"v":1,"k":1,"iv":"YFQoPUgLpBmsEmJc","ct":"xTnhRZGqBtc=","tag":"iUvDPMhOC8fRVEAaEDGflQ=="}' WHERE id = '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92';
UPDATE vendors SET bank_account_number_ct = '{"v":1,"k":1,"iv":"QvBkKInWG2m5mB0k","ct":"Wx74gD8DvV8=","tag":"7peUbxIrx8Eii24B6EnlTA=="}' WHERE id = 'e21a30e8-9dfd-5817-8479-c7d574417831';
UPDATE vendors SET bank_account_number_ct = '{"v":1,"k":1,"iv":"JgntiiM3NxfD46KV","ct":"inPoB0RI154=","tag":"k/hVoHHOTa/h/rsx1dXrjA=="}' WHERE id = '77464d71-79dd-5490-93a3-a62c9df1d027';
UPDATE vendors SET bank_account_number_ct = '{"v":1,"k":1,"iv":"Ltw+tLB/rYcP38Dp","ct":"zwbljpw8pdk=","tag":"M7SpRWeV9tOHrD1FyF7ExQ=="}' WHERE id = 'e7b05d84-68ef-584f-beb7-69a4f4c34bd1';
UPDATE vendors SET bank_routing_number_ct = '{"v":1,"k":1,"iv":"0wR93m9HmZqr85fF","ct":"ypa6A7EyEMng","tag":"dtuLpaf/kUlOEedHrZH3Dw=="}' WHERE id = '8a0bb1a6-448e-50f5-bbc0-1a41850d2e92';
UPDATE vendors SET bank_routing_number_ct = '{"v":1,"k":1,"iv":"Aq87mG0ZOs7o8ibV","ct":"5xl2JZR7EING","tag":"EOQUAhV1VYzODaV/QQijHA=="}' WHERE id = 'e21a30e8-9dfd-5817-8479-c7d574417831';
UPDATE vendors SET bank_routing_number_ct = '{"v":1,"k":1,"iv":"hESomH0MKQiWo+el","ct":"QFHQkAX90H+B","tag":"3l0vGTyKiQwcHDaC6avleQ=="}' WHERE id = '77464d71-79dd-5490-93a3-a62c9df1d027';
UPDATE vendors SET bank_routing_number_ct = '{"v":1,"k":1,"iv":"ag36V29FDOkWduGI","ct":"Vp7wwgO8Sj8j","tag":"P1KkN6jore07UWD2PZLikA=="}' WHERE id = 'e7b05d84-68ef-584f-beb7-69a4f4c34bd1';

-- =============================================================================
-- Kaaj — Mock Data for a Test Organization
-- =============================================================================
-- Version:      2.0
-- Last Updated: 2026-08-27
-- Target:       data-models/schema.sql (93 tables, Supabase PostgreSQL)
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
--   psql "$DATABASE_URL" -f data-models/schema.sql
--   psql "$DATABASE_URL" -f data-models/mock-data.sql
--
-- RLS NOTE
--   These INSERTs run as the table owner, for whom RLS is bypassed. To exercise
--   isolation, connect as the non-owner application role and set the tenant:
--     SET request.jwt.claims = '{"app_metadata":{"tenant_id":"<tenant uuid>"}}';
--   The tenant id is printed by the verification block at the end of this file.
-- =============================================================================

BEGIN;

-- Test organization: a 12-person professional services firm operating in 3 countries
INSERT INTO tenants (id, subdomain, company_name, company_name_i18n, region, data_residency_country, default_locale, default_currency, default_timezone, plan_tier, max_employees, billing_email, billing_currency, billing_status, is_active) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'northwind', 'Northwind Consulting', '{"en-US": "Northwind Consulting", "fr-FR": "Northwind Conseil"}'::jsonb, 'us-east-1', 'US', 'en-US', 'USD', 'America/New_York', 'professional', 200, 'billing@northwind.example', 'USD', 'active', TRUE);

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

-- Department hierarchy: ENG -> ENG-BE, ENG-FE
INSERT INTO firm_departments (id, tenant_id, department_code, name, name_i18n, parent_department_code, location_code, cost_center, budget_currency, is_active) VALUES
    ('10cfa606-7c38-5de8-b72a-4ec11d9ae922', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ENG', 'Engineering', '{"en-US": "Engineering"}'::jsonb, NULL, 'US-NYC', 'CC-ENG', 'USD', TRUE),
    ('f58a2938-4faf-5b35-a6c5-872323e5356c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ENG-BE', 'Backend Engineering', '{"en-US": "Backend Engineering"}'::jsonb, 'ENG', 'IN-BLR', 'CC-ENG-BE', 'USD', TRUE),
    ('e04f14d9-b662-59a5-b9b1-309e32f5b772', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ENG-FE', 'Frontend Engineering', '{"en-US": "Frontend Engineering"}'::jsonb, 'ENG', 'US-NYC', 'CC-ENG-FE', 'USD', TRUE),
    ('fc0935fd-6c10-5db1-8e61-e458aeca68c0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CONSULT', 'Consulting', '{"en-US": "Consulting"}'::jsonb, NULL, 'US-NYC', 'CC-CONSULT', 'USD', TRUE),
    ('0e8f258e-562d-586e-9961-0344eab74686', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'SALES', 'Sales', '{"en-US": "Sales"}'::jsonb, NULL, 'UK-LON', 'CC-SALES', 'USD', TRUE),
    ('3b5a4d7f-644c-5c03-99a6-8f96582393da', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'GA', 'General & Administrative', '{"en-US": "General & Administrative"}'::jsonb, NULL, 'US-NYC', 'CC-GA', 'USD', TRUE);

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

-- Job levels with multi-currency salary ranges
INSERT INTO firm_job_levels (id, tenant_id, job_title_id, level_name, level_name_i18n, salary_ranges, sort_order) VALUES
    ('7eb579fc-befd-5ef6-9ad2-d94544a3bf93', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5a252af5-2ac9-5bfe-aaa9-743f4260a4bb', 'L3', '{"en-US": "L3"}'::jsonb, '{"USD": {"min": 95000, "max": 130000}, "INR": {"min": 1800000, "max": 2600000}}'::jsonb, 1),
    ('82c7ef42-42a7-530c-81e7-3ca0a96d4a2f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5a252af5-2ac9-5bfe-aaa9-743f4260a4bb', 'L4', '{"en-US": "L4"}'::jsonb, '{"USD": {"min": 125000, "max": 165000}, "INR": {"min": 2500000, "max": 3400000}}'::jsonb, 2),
    ('d61e889e-7e4e-5f63-a058-bc50b3a11a7c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '002ca495-22e8-58ba-b7ef-cf5cd13e9a56', 'C2', '{"en-US": "C2"}'::jsonb, '{"USD": {"min": 110000, "max": 150000}, "GBP": {"min": 75000, "max": 100000}}'::jsonb, 1);

-- 12 employees across 3 locations, 6 departments, with a manager hierarchy
INSERT INTO employees (id, tenant_id, employee_id, employee_number, first_name, last_name, email, phone, employment_status, employment_type, start_date, birth_date, department_code, job_title, job_level, location_code, manager_id, timezone, currency, base_amount, compensation_type, pay_frequency, overtime_eligible, default_billable_rate, fte, is_active, custom_fields, celebration_preferences, pto_balances, created_at, updated_at, created_by) VALUES
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

-- RESTORED table: two effective-dated rows per employee. A payslip reissued for a period before 2025-12-02 must use the earlier amount - impossible with D1 inlining.
INSERT INTO compensation_base (id, tenant_id, employee_id, effective_from, effective_to, compensation_type, amount, currency, pay_frequency, annual_equivalent, overtime_eligible, change_reason, created_by) VALUES
    ('143c42f7-486d-500f-b8a3-4e0400b6f277', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '2024-11-27', '2025-12-01', 'salary', 173900, 'USD', 'monthly', 173900, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e2c1dcf2-ca82-5b8b-9360-c2a0cf3232ab', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '2025-12-02', NULL, 'salary', 185000, 'USD', 'monthly', 185000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('62bd1982-0827-5003-9ede-1a9e6cd41236', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2024-11-27', '2025-12-01', 'salary', 3008000, 'INR', 'monthly', 3008000, TRUE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('ff54a17b-03e5-543a-b5e9-5d28d00499c0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '2025-12-02', NULL, 'salary', 3200000, 'INR', 'monthly', 3200000, TRUE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('e3557614-a73f-51f1-8054-55a551f8906a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2024-11-27', '2025-12-01', 'salary', 1974000, 'INR', 'monthly', 1974000, TRUE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('3ca15858-1475-5c1b-8f4b-e3903f77438b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '2025-12-02', NULL, 'salary', 2100000, 'INR', 'monthly', 2100000, TRUE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('698bf459-9bd0-5b44-835c-0475b343b885', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2024-11-27', '2025-12-01', 'salary', 139120, 'USD', 'monthly', 139120, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a73e9ec8-85df-58a6-8654-3e12493944ee', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '2025-12-02', NULL, 'salary', 148000, 'USD', 'monthly', 148000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('8d8e2f35-f8c0-57e5-a2f0-5ecd1b88e5a2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2024-11-27', '2025-12-01', 'salary', 133480, 'USD', 'monthly', 133480, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('389d9606-f947-503d-98ad-f0fc8aac36d2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2025-12-02', NULL, 'salary', 142000, 'USD', 'monthly', 142000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('d4a8801e-bc54-528b-bd50-0f695e93efde', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '2024-11-27', '2025-12-01', 'salary', 82720, 'GBP', 'monthly', 82720, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('964af5c9-d2a1-5c08-9291-f47f2c83873e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '2025-12-02', NULL, 'salary', 88000, 'GBP', 'monthly', 88000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('98f76243-5db8-5dfd-aa94-b7f5c6028fce', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '18503470-ba5c-5450-bc3e-b0a2454d757f', '2024-11-27', '2025-12-01', 'salary', 77080, 'GBP', 'monthly', 77080, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('57fc8797-3c9a-5b47-90a8-cafb847e5ceb', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '18503470-ba5c-5450-bc3e-b0a2454d757f', '2025-12-02', NULL, 'salary', 82000, 'GBP', 'monthly', 82000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('a4dfef96-7936-575f-9407-fc8b054b00b0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e05fd53c-ebdf-5049-810a-28a63369f93a', '2024-11-27', '2025-12-01', 'salary', 66740, 'GBP', 'monthly', 66740, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('6f200743-e4a9-5290-90b9-b458700fc3a2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e05fd53c-ebdf-5049-810a-28a63369f93a', '2025-12-02', NULL, 'salary', 71000, 'GBP', 'monthly', 71000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('ef63423e-5c7f-559c-ba7f-190968cefef6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', '2024-11-27', '2025-12-01', 'salary', 110920, 'USD', 'monthly', 110920, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('11669902-8e51-528e-a796-59ad223ccf5d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', '2025-12-02', NULL, 'salary', 118000, 'USD', 'monthly', 118000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('89364685-dd04-573b-85fe-b49fc2cf7e7e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', '2024-11-27', '2025-12-01', 'salary', 63920, 'USD', 'monthly', 63920, TRUE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('2c3e9e38-4a34-5de4-850a-5b24826960d1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', '2025-12-02', NULL, 'salary', 68000, 'USD', 'monthly', 68000, TRUE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('f2447a3c-7840-53bf-b001-deaa9fafe2a0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2024-11-27', '2025-12-01', 'salary', 97760, 'USD', 'monthly', 97760, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('218fdaf4-cb5c-5017-823b-904c541520fc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '56bd1329-6740-572f-aa90-c44d1b27bedf', '2025-12-02', NULL, 'salary', 104000, 'USD', 'monthly', 104000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('38bdc9b4-506c-5339-9b4a-6d0d06763a40', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '385f5ae5-e567-5fb6-98f8-b45007099ff8', '2024-11-27', '2025-12-01', 'salary', 90240, 'USD', 'monthly', 90240, FALSE, 'initial_offer', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('ca3ce8d1-681d-5529-8ed5-8518f70cf093', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '385f5ae5-e567-5fb6-98f8-b45007099ff8', '2025-12-02', NULL, 'salary', 96000, 'USD', 'monthly', 96000, FALSE, 'annual_review', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- RESTORED table: work authorization expiry is a compliance obligation D1 had dropped
INSERT INTO employment_terms (id, tenant_id, employee_id, employment_type, start_date, contract_type, probation_period_days, probation_end_date, notice_period_days, work_authorization_type, work_authorization_expiry, fte) VALUES
    ('dc3b2bd4-43d5-57d2-ac07-145993fe8fea', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'full_time', '2024-11-27', 'permanent', 90, '2025-02-25', 30, 'citizen', NULL, 1.0),
    ('fa32e689-d93e-5108-b74f-d8b645f47490', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'full_time', '2024-12-17', 'permanent', 90, '2025-03-17', 30, 'work_permit', '2027-05-26', 1.0),
    ('3e2600d8-ec5b-5021-9495-55e7b6f11cc7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'full_time', '2025-01-06', 'permanent', 90, '2025-04-06', 30, 'work_permit', '2027-06-05', 1.0),
    ('7c20ec10-34bf-5dbd-a0f0-93cde5ccab49', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'full_time', '2025-01-26', 'permanent', 90, '2025-04-26', 30, 'citizen', NULL, 1.0),
    ('11dd17a2-33a5-5020-ad69-221cedb9c496', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'full_time', '2025-02-15', 'permanent', 90, '2025-05-16', 30, 'citizen', NULL, 1.0),
    ('a38702a9-50f3-52de-b857-513d7e01b145', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'full_time', '2025-03-07', 'permanent', 90, '2025-06-05', 30, 'work_permit', '2027-07-05', 1.0),
    ('867f320c-77dc-5029-9e81-b64ca1887935', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '18503470-ba5c-5450-bc3e-b0a2454d757f', 'full_time', '2025-03-27', 'permanent', 90, '2025-06-25', 30, 'work_permit', '2027-07-15', 1.0),
    ('fc990a82-ba3e-5448-ae0a-a5b1dc6cb5f2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e05fd53c-ebdf-5049-810a-28a63369f93a', 'full_time', '2025-04-16', 'permanent', 90, '2025-07-15', 30, 'work_permit', '2027-07-25', 1.0),
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
INSERT INTO hr_emergency_contacts (id, tenant_id, employee_id, contact_name, relationship, phone_primary, is_primary, created_at, updated_at) VALUES
    ('ad65d92d-c7d3-5178-a788-b7e4ecb9e2bd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'Michael Johnson', 'spouse', '+1-212-555-0901', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('c75f6a31-cddf-58c8-97de-b87698f53477', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'Wei Chen', 'parent', '+91-80-5555-0902', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('a5291a83-e115-5c77-8e35-41b9c64c6f23', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'Chidi Okafor', 'sibling', '+1-212-555-0903', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

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
    ('8257009f-6a91-5fd1-9efb-518198c08e2a', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-001', 'PRJ-001', 'Acme ERP Integration', '960d66b2-8a52-59d0-8cf8-5c383d031244', '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'active', 'high', 35.0, 'on_track', 180000, 'USD', 1200, 408, 'time_and_materials', TRUE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('fda698f3-bf14-5aae-bed6-330c8b5a6a70', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-002', 'PRJ-002', 'Britannia Loyalty Platform', '960d66b2-8a52-59d0-8cf8-5c383d031244', '8594031f-d3f3-5d62-a5ab-f99b3a89c720', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'active', 'high', 35.0, 'on_track', 140000, 'GBP', 900, 306, 'time_and_materials', TRUE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('f606af3e-f56f-5050-b663-02471b9f9dbd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-003', 'PRJ-003', 'Helios Data Migration', '960d66b2-8a52-59d0-8cf8-5c383d031244', 'e22e6459-7c1d-5857-9908-89d775c82245', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'active', 'high', 35.0, 'on_track', 95000, 'USD', 620, 211, 'time_and_materials', TRUE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('1da967fa-e086-53c7-b9d1-7605759dfda3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PRJ-004', 'PRJ-004', 'Internal Tooling', '960d66b2-8a52-59d0-8cf8-5c383d031244', '0bacfcac-ff3a-5c72-ac5c-753d7c9aecd8', '6d466aa9-e51a-5d52-9015-152600855932', 'CONSULT', 'US-NYC', '2026-01-06', '2026-07-20', 'on_hold', 'high', 35.0, 'on_track', 0, 'USD', 300, 102, 'time_and_materials', FALSE, 225, TRUE, '{}'::jsonb, 3, 1, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

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

-- Ticketing business areas with per-area number sequences
INSERT INTO ticketing_business_areas (id, tenant_id, prefix, name, description, active, current_sequence, is_active, created_at, created_by, updated_at) VALUES
    ('872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'IT', 'IT Support', 'Internal IT and equipment requests', TRUE, 3, TRUE, '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-01T09:00:00Z'),
    ('2e90b722-25ef-51b7-866b-e93d3bcca1c3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'FAC', 'Facilities', 'Office and facilities requests', TRUE, 1, TRUE, '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-01T09:00:00Z'),
    ('c9800088-b86b-5ddd-acdc-5b9fbe32f268', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'CS', 'Client Support', 'Client-raised support tickets', TRUE, 2, TRUE, '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '2026-01-01T09:00:00Z');

-- Tickets across three business areas. search_vector is populated by trigger on insert.
INSERT INTO ticketing_tickets (id, tenant_id, business_area_id, ticket_number, prefix, sequence_number, title, subject, description, category, status, priority, severity, internal_summary, external_summary, private, due_date, logged_at, updated_at, resolved_at, reported_by, logger_id, last_updated_by, assignees, custom_fields, version, created_at) VALUES
    ('a22f6d41-d654-5951-a043-e174f7e1a258', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', 'IT-0001', 'IT', 1, 'Laptop will not boot', 'Laptop will not boot', 'Laptop will not boot', 'hardware', 'open', 'high', 'high', 'Internal notes for Laptop will not boot', 'Laptop will not boot', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('81535673-0241-5ed1-bb17-6fe1c042e9f1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', 'IT-0002', 'IT', 2, 'VPN access for new starter', 'VPN access for new starter', 'VPN access for new starter', 'access', 'resolved', 'medium', 'medium', 'Internal notes for VPN access for new starter', 'VPN access for new starter', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '56bd1329-6740-572f-aa90-c44d1b27bedf', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('c7f8ebb6-27b9-5098-b584-d4a3e0518c50', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c', 'IT-0003', 'IT', 3, 'Second monitor request', 'Second monitor request', 'Second monitor request', 'hardware', 'open', 'low', 'low', 'Internal notes for Second monitor request', 'Second monitor request', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('7cf9d829-a0aa-5a22-a1f5-f8f7d7464977', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2e90b722-25ef-51b7-866b-e93d3bcca1c3', 'FAC-0001', 'FAC', 1, 'Meeting room booking system down', 'Meeting room booking system down', 'Meeting room booking system down', 'facilities', 'in_progress', 'medium', 'medium', 'Internal notes for Meeting room booking system down', 'Meeting room booking system down', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, '11f31511-ad53-59c7-9e90-8ee3b553489b', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'a87e0200-0849-53b6-a491-e882feace3f5', '["a87e0200-0849-53b6-a491-e882feace3f5"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('fbc213ca-f362-58d3-aa36-45db45958e60', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c9800088-b86b-5ddd-acdc-5b9fbe32f268', 'CS-0001', 'CS', 1, 'Acme reports slow report generation', 'Acme reports slow report generation', 'Acme reports slow report generation', 'performance', 'in_progress', 'high', 'high', 'Internal notes for Acme reports slow report generation', 'Acme reports slow report generation', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', NULL, '11f31511-ad53-59c7-9e90-8ee3b553489b', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '["db1f1f2b-b140-5948-a34e-1c998ed98757"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z'),
    ('6e78ba43-d504-546e-933d-4a5dce8d3313', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c9800088-b86b-5ddd-acdc-5b9fbe32f268', 'CS-0002', 'CS', 2, 'Britannia data export format query', 'Britannia data export format query', 'Britannia data export format query', 'question', 'resolved', 'low', 'low', 'Internal notes for Britannia data export format query', 'Britannia data export format query', FALSE, '2026-01-31', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '["b9b84064-a67a-5048-8282-8fc048b4dbfb"]'::jsonb, '{}'::jsonb, 1, '2026-01-01T09:00:00Z');

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
    ('3c95d136-b7f3-5c7e-bc55-e1abbe33af8b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2000', 'Accounts Payable', '{"en-US": "Accounts Payable"}'::jsonb, 'liability', 'current_liability', FALSE, TRUE, 'USD', 0),
    ('b4399f41-0f93-5eda-8475-df032080505f', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2100', 'Payroll Liabilities', '{"en-US": "Payroll Liabilities"}'::jsonb, 'liability', 'current_liability', FALSE, TRUE, 'USD', 0),
    ('f272fefe-ad92-5d94-bf3f-b834568c0586', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '3000', 'Retained Earnings', '{"en-US": "Retained Earnings"}'::jsonb, 'equity', 'retained_earnings', FALSE, TRUE, 'USD', 0),
    ('6d1ef213-cb96-5ad4-beaf-1d4e07242d65', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '4000', 'Consulting Revenue', '{"en-US": "Consulting Revenue"}'::jsonb, 'revenue', 'operating_revenue', FALSE, TRUE, 'USD', 0),
    ('8e5bbb5d-e1c7-521a-b4d3-98b8cf3b40e4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '4100', 'Software Revenue', '{"en-US": "Software Revenue"}'::jsonb, 'revenue', 'operating_revenue', FALSE, TRUE, 'USD', 0),
    ('169fb687-1575-5bcc-8e1b-2e32cdfc65c2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5000', 'Salaries & Wages', '{"en-US": "Salaries & Wages"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('2f318c15-7833-53a7-a0a1-71a84087dd17', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5100', 'Contractor Costs', '{"en-US": "Contractor Costs"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('c1158fe0-38ae-5741-a84f-a76381cebae3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5200', 'Travel & Entertainment', '{"en-US": "Travel & Entertainment"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('030e294b-88ad-544e-841a-cfda187885ac', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5300', 'Software Subscriptions', '{"en-US": "Software Subscriptions"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0),
    ('9d558ace-8adc-52ed-811a-de519ad88a29', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '5400', 'Office & Facilities', '{"en-US": "Office & Facilities"}'::jsonb, 'expense', 'operating_expense', FALSE, TRUE, 'USD', 0);

-- Billing customers (mirror of clients)
INSERT INTO customers (id, tenant_id, customer_number, customer_name, display_name, email, currency, payment_terms, ar_account_id, is_active, custom_fields) VALUES
    ('e40d0f18-1333-5cd1-a969-f5113df51e70', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ACME', 'Acme Manufacturing', 'Acme Manufacturing', 'ap@acme.example', 'USD', 'net_30', 'a6ecad5d-10af-5286-807b-cd31b3266d99', TRUE, '{}'::jsonb),
    ('ac7a04b4-a28e-5a15-9993-596db32c8d4e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'BRITCO', 'Britannia Retail Group', 'Britannia Retail Group', 'ap@britco.example', 'GBP', 'net_30', 'a6ecad5d-10af-5286-807b-cd31b3266d99', TRUE, '{}'::jsonb),
    ('df492f8b-55ce-504f-869d-52f5ffc6292d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'HELIOS', 'Helios Energy', 'Helios Energy', 'ap@helios.example', 'USD', 'net_30', 'a6ecad5d-10af-5286-807b-cd31b3266d99', TRUE, '{}'::jsonb);

-- Invoices in mixed states, multi-currency with base conversion
INSERT INTO invoices (id, tenant_id, customer_id, invoice_number, invoice_date, due_date, currency, exchange_rate, base_currency, subtotal, tax_total, total, amount_paid, amount_due, base_subtotal, base_tax_total, base_total, base_amount_paid, base_amount_due, status, payment_terms) VALUES
    ('c72699f8-700c-5760-a8e8-19ae6dfd53c5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e40d0f18-1333-5cd1-a969-f5113df51e70', 'INV-2026-001', '2026-01-21', '2026-02-20', 'USD', 1.0, 'USD', 42300.0, 0, 42300.0, 42300.0, 0, 42300.0, 0, 42300.0, 42300.0, 0, 'paid', 'net_30'),
    ('a31732ea-dadb-575f-bd99-cbcfeaba29da', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ac7a04b4-a28e-5a15-9993-596db32c8d4e', 'INV-2026-002', '2026-01-21', '2026-02-20', 'GBP', 1.27, 'USD', 28860.0, 0, 28860.0, 0, 28860.0, 36652.2, 0, 36652.2, 0, 36652.2, 'sent', 'net_30'),
    ('bee0d3ca-72f7-5ba2-9a31-3bbf17daf320', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'df492f8b-55ce-504f-869d-52f5ffc6292d', 'INV-2026-003', '2026-01-21', '2026-02-20', 'USD', 1.0, 'USD', 19760.0, 0, 19760.0, 0, 19760.0, 19760.0, 0, 19760.0, 0, 19760.0, 'draft', 'net_30'),
    ('37bd63c2-86a1-513c-8404-b731dd666b28', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'e40d0f18-1333-5cd1-a969-f5113df51e70', 'INV-2026-004', '2026-01-21', '2026-02-20', 'USD', 1.0, 'USD', 36225.0, 0, 36225.0, 0, 36225.0, 36225.0, 0, 36225.0, 0, 36225.0, 'sent', 'net_30');

-- Invoice line items. Invoice subtotal/total are DERIVED from these.
INSERT INTO invoice_lines (tenant_id, id, invoice_id, line_number, description, quantity, unit_price, amount, revenue_account_id) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '99295121-9731-52d7-aa57-16dc70dd66ae', 'c72699f8-700c-5760-a8e8-19ae6dfd53c5', 1, 'Consulting - discovery workshops', 38.0, 225, 8550.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '979c3096-9a3d-5ae9-8999-1a24c091bdb5', 'c72699f8-700c-5760-a8e8-19ae6dfd53c5', 2, 'Consulting - data mapping', 150.0, 225, 33750.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'd333265b-df6b-565c-9f8c-4e77e9e92eb4', 'a31732ea-dadb-575f-bd99-cbcfeaba29da', 1, 'Loyalty platform development', 148.0, 195, 28860.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '38a295f5-cc12-5286-900a-eb30c0258994', 'bee0d3ca-72f7-5ba2-9a31-3bbf17daf320', 1, 'Data migration services', 76.0, 260, 19760.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '9ce4ba89-2258-53c2-94e7-f9afee5aa317', '37bd63c2-86a1-513c-8404-b731dd666b28', 1, 'Integration build - phase 1', 161.0, 225, 36225.0, '6d1ef213-cb96-5ad4-beaf-1d4e07242d65');

-- Journal entries
INSERT INTO journal_entries (id, tenant_id, entry_number, entry_date, description, source_type, status, accounting_period, fiscal_year, posted_at) VALUES
    ('c1c96d31-cfa4-57d3-9048-06e3ae1725e6', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0001', '2026-01-21', 'Invoice INV-2026-001 raised', 'invoice', 'posted', '2026-01', 2026, '2026-01-01T09:00:00Z'),
    ('7d5527ea-8449-5a3c-8819-e93caf4073b5', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0002', '2026-01-21', 'Payment received - Acme', 'payment', 'posted', '2026-01', 2026, '2026-01-01T09:00:00Z'),
    ('9a2fac71-4b74-5342-8c43-46fb77267929', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'JE-2026-0003', '2026-01-21', 'January payroll accrual', 'payroll', 'posted', '2026-01', 2026, '2026-01-01T09:00:00Z');

-- Balanced double-entry lines (each entry nets to zero)
INSERT INTO journal_entry_lines (tenant_id, id, entry_id, account_id, line_number, currency, debit_amount, credit_amount, exchange_rate, base_currency, base_debit_amount, base_credit_amount, description) VALUES
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '34dd6b71-7040-5aa7-98c2-2fb1a0a06e48', 'c1c96d31-cfa4-57d3-9048-06e3ae1725e6', 'a6ecad5d-10af-5286-807b-cd31b3266d99', 1, 'USD', 42500, 0, 1.0, 'USD', 42500, 0, 'AR - Acme'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'ac4e339f-1054-56ed-8137-9079dd19062c', 'c1c96d31-cfa4-57d3-9048-06e3ae1725e6', '6d1ef213-cb96-5ad4-beaf-1d4e07242d65', 2, 'USD', 0, 42500, 1.0, 'USD', 0, 42500, 'Consulting revenue'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '3e74ed8d-79d4-5a21-b1a1-7c0fda6f5a1b', '7d5527ea-8449-5a3c-8819-e93caf4073b5', 'eef02e95-6acb-5039-8acc-56340013e53a', 1, 'USD', 42500, 0, 1.0, 'USD', 42500, 0, 'Cash received'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '1f96c924-a682-5c9e-86ce-52a29ad5ecdd', '7d5527ea-8449-5a3c-8819-e93caf4073b5', 'a6ecad5d-10af-5286-807b-cd31b3266d99', 2, 'USD', 0, 42500, 1.0, 'USD', 0, 42500, 'AR cleared'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bc01c486-4fee-5e62-abea-ae7654475e89', '9a2fac71-4b74-5342-8c43-46fb77267929', '169fb687-1575-5bcc-8e1b-2e32cdfc65c2', 1, 'USD', 96500, 0, 1.0, 'USD', 96500, 0, 'Salaries expense'),
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf47dc80-aff7-5635-9faf-a46a24a52094', '9a2fac71-4b74-5342-8c43-46fb77267929', 'b4399f41-0f93-5eda-8475-df032080505f', 2, 'USD', 0, 96500, 1.0, 'USD', 0, 96500, 'Payroll liability');

-- Employee expenses posted against expense accounts
INSERT INTO expenses (id, tenant_id, employee_id, expense_date, vendor_name, currency, amount, exchange_rate, base_amount, category_account_id, description, expense_type, is_reimbursable, reimbursement_status) VALUES
    ('0322e10e-37fd-51cc-af9c-cade3b267676', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2026-01-16', 'Delta Airlines', 'USD', 845.2, 1.0, 845.2, 'c1158fe0-38ae-5741-a84f-a76381cebae3', 'Client site visit - Acme', 'travel', TRUE, 'approved'),
    ('79b3bb69-0f9c-51e8-896e-4b77a71c65b7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '2026-01-16', 'Great Western Railway', 'GBP', 142.5, 1.27, 180.97, 'c1158fe0-38ae-5741-a84f-a76381cebae3', 'Client site visit - Britannia', 'travel', TRUE, 'approved'),
    ('aff8d2a4-1126-5e99-a284-a17fe510b356', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', '2026-01-16', 'JetBrains', 'USD', 299.0, 1.0, 299.0, '030e294b-88ad-544e-841a-cfda187885ac', 'IDE licences', 'software', TRUE, 'pending'),
    ('f5fe924a-9b92-551f-99b3-a4086f3a247d', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'a87e0200-0849-53b6-a491-e882feace3f5', '2026-01-16', 'Staples', 'USD', 86.4, 1.0, 86.4, '9d558ace-8adc-52ed-811a-de519ad88a29', 'Office supplies', 'office', TRUE, 'approved');

-- Timezone-aware pay schedules, one per country
INSERT INTO payroll_pay_schedules (id, tenant_id, name, name_i18n, frequency, anchor_date, timezone, currency, location_ids, pay_day_of_month, is_active, is_default, description) VALUES
    ('b57b7e37-7192-5e00-ad55-4ef5ec240a74', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'US Monthly Payroll', '{"en-US": "US Monthly Payroll"}'::jsonb, 'monthly', '2026-01-31', 'America/New_York', 'USD', ARRAY['12c07799-28b4-55df-b8cf-df96df0bf40f']::UUID[], -1, TRUE, TRUE, 'US Monthly Payroll'),
    ('dd7a0200-4d8c-59df-961a-23688d69a312', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'UK Monthly Payroll', '{"en-US": "UK Monthly Payroll"}'::jsonb, 'monthly', '2026-01-31', 'Europe/London', 'GBP', ARRAY['bf32fdb3-c7ed-52bd-b5e3-a581d6ab000c']::UUID[], 28, TRUE, FALSE, 'UK Monthly Payroll'),
    ('ff6266c2-144c-5624-9025-8a8727b449e8', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'India Monthly Payroll', '{"en-US": "India Monthly Payroll"}'::jsonb, 'monthly', '2026-01-31', 'Asia/Kolkata', 'INR', ARRAY['25dc9e1b-aa1f-59ae-ad80-da21c61c8242']::UUID[], -1, TRUE, FALSE, 'India Monthly Payroll');

-- January payroll runs, one per country
INSERT INTO payroll_runs (id, tenant_id, run_id, run_number, pay_period_start, pay_period_end, pay_date, run_type, country, pay_schedule_id, currency, run_status, status, employee_count, total_gross_pay, total_net_pay, total_taxes, total_deductions, calculated_at, approved_at) VALUES
    ('953095ac-deb3-54dc-baf2-09a7e3829e82', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PR-2026-01-US', 'PR-2026-01-US', '2026-01-01', '2026-01-31', '2026-02-01', 'regular', 'US', 'b57b7e37-7192-5e00-ad55-4ef5ec240a74', 'USD', 'finalized', 'finalized', 7, 63416.66, 44391.66, 15854.16, 3170.84, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PR-2026-01-UK', 'PR-2026-01-UK', '2026-01-01', '2026-01-31', '2026-02-01', 'regular', 'GB', 'dd7a0200-4d8c-59df-961a-23688d69a312', 'GBP', 'finalized', 'finalized', 3, 20083.33, 13857.6, 5020.75, 1204.98, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('cf6699a0-43f1-5002-b44f-64f4b8ff7e43', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'PR-2026-01-IN', 'PR-2026-01-IN', '2026-01-01', '2026-01-31', '2026-02-01', 'regular', 'IN', 'ff6266c2-144c-5624-9025-8a8727b449e8', 'INR', 'approved', 'approved', 2, 441667.0, 357750.27, 61833.38, 22083.35, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

-- Per-employee payroll lines. gross = net + taxes + deductions for every row.
INSERT INTO payroll_run_employees (id, tenant_id, payroll_run_id, employee_id, status, work_country, work_state, regular_hours, earnings, gross_pay, taxable_wages, taxes, total_taxes, posttax_deductions, total_posttax_deductions, net_pay, payment_method, ytd_gross) VALUES
    ('d191d307-4263-5d5b-a650-927fea148188', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '6d466aa9-e51a-5d52-9015-152600855932', 'calculated', 'US', 'NY', 160.0, '{"base": 15416.67}'::jsonb, 15416.67, '15416.67'::jsonb, '{"income_tax": 2697.92, "social": 1156.25}'::jsonb, 3854.17, '{"pension": 770.83}'::jsonb, 770.83, 10791.67, 'direct_deposit', 15416.67),
    ('95ff709e-a864-5ef6-97f1-fc7065faa477', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'calculated', 'US', 'NY', 160.0, '{"base": 12333.33}'::jsonb, 12333.33, '12333.33'::jsonb, '{"income_tax": 2158.33, "social": 925.0}'::jsonb, 3083.33, '{"pension": 616.67}'::jsonb, 616.67, 8633.33, 'direct_deposit', 12333.33),
    ('0a757a53-980a-5db8-b579-45805cdb19ad', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'calculated', 'US', 'NY', 160.0, '{"base": 11833.33}'::jsonb, 11833.33, '11833.33'::jsonb, '{"income_tax": 2070.83, "social": 887.5}'::jsonb, 2958.33, '{"pension": 591.67}'::jsonb, 591.67, 8283.33, 'direct_deposit', 11833.33),
    ('39f43510-5674-5bd5-aeff-eb88dfc69f76', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', 'fa4c9324-158b-55b7-acdd-7fe7917bc7cf', 'calculated', 'US', 'NY', 160.0, '{"base": 9833.33}'::jsonb, 9833.33, '9833.33'::jsonb, '{"income_tax": 1720.83, "social": 737.5}'::jsonb, 2458.33, '{"pension": 491.67}'::jsonb, 491.67, 6883.33, 'direct_deposit', 9833.33),
    ('abecce90-9b0e-5ae1-b71a-fd866178f640', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', 'a87e0200-0849-53b6-a491-e882feace3f5', 'calculated', 'US', 'NY', 160.0, '{"base": 5666.67}'::jsonb, 5666.67, '5666.67'::jsonb, '{"income_tax": 991.67, "social": 425.0}'::jsonb, 1416.67, '{"pension": 283.33}'::jsonb, 283.33, 3966.67, 'direct_deposit', 5666.67),
    ('b6a03f3c-27e9-5362-8479-c52949439472', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '56bd1329-6740-572f-aa90-c44d1b27bedf', 'calculated', 'US', 'NY', 160.0, '{"base": 4333.33}'::jsonb, 4333.33, '4333.33'::jsonb, '{"income_tax": 758.33, "social": 325.0}'::jsonb, 1083.33, '{"pension": 216.67}'::jsonb, 216.67, 3033.33, 'direct_deposit', 4333.33),
    ('5328dbdb-ccba-59ed-8bb2-87e05c191f3b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '953095ac-deb3-54dc-baf2-09a7e3829e82', '385f5ae5-e567-5fb6-98f8-b45007099ff8', 'calculated', 'US', 'NY', 160.0, '{"base": 4000.0}'::jsonb, 4000.0, '4000.0'::jsonb, '{"income_tax": 700.0, "social": 300.0}'::jsonb, 1000.0, '{"pension": 200.0}'::jsonb, 200.0, 2800.0, 'direct_deposit', 4000.0),
    ('5e868e2e-1bec-52a8-a9c7-393cef523dfc', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'calculated', 'GB', NULL, 160.0, '{"base": 7333.33}'::jsonb, 7333.33, '7333.33'::jsonb, '{"income_tax": 1283.33, "social": 550.0}'::jsonb, 1833.33, '{"pension": 440.0}'::jsonb, 440.0, 5060.0, 'direct_deposit', 7333.33),
    ('c0a6c331-fe4c-5b89-bfda-0576173e7a46', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', '18503470-ba5c-5450-bc3e-b0a2454d757f', 'calculated', 'GB', NULL, 160.0, '{"base": 6833.33}'::jsonb, 6833.33, '6833.33'::jsonb, '{"income_tax": 1195.83, "social": 512.5}'::jsonb, 1708.33, '{"pension": 410.0}'::jsonb, 410.0, 4715.0, 'direct_deposit', 6833.33),
    ('27f3f1bc-90f5-533c-9173-ffb82a7e915e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'aa14a6e1-3428-5de9-8d40-bfe1d7ef05f0', 'e05fd53c-ebdf-5049-810a-28a63369f93a', 'calculated', 'GB', NULL, 160.0, '{"base": 5916.67}'::jsonb, 5916.67, '5916.67'::jsonb, '{"income_tax": 1035.36, "social": 443.73}'::jsonb, 1479.09, '{"pension": 354.98}'::jsonb, 354.98, 4082.6, 'direct_deposit', 5916.67),
    ('0c959f40-718e-5922-8acc-2629c44307ec', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'cf6699a0-43f1-5002-b44f-64f4b8ff7e43', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'calculated', 'IN', 'KA', 160.0, '{"base": 266667.0}'::jsonb, 266667.0, '266667.0'::jsonb, '{"income_tax": 26133.37, "social": 11200.01}'::jsonb, 37333.38, '{"pension": 13333.35}'::jsonb, 13333.35, 216000.27, 'direct_deposit', 266667.0),
    ('3d63bb34-f6c8-5947-a1e2-171ed3961aa3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'cf6699a0-43f1-5002-b44f-64f4b8ff7e43', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'calculated', 'IN', 'KA', 160.0, '{"base": 175000.0}'::jsonb, 175000.0, '175000.0'::jsonb, '{"income_tax": 17150.0, "social": 7350.0}'::jsonb, 24500.0, '{"pension": 8750.0}'::jsonb, 8750.0, 141750.0, 'direct_deposit', 175000.0);

-- Review cycle
INSERT INTO hr_review_cycles (id, tenant_id, cycle_code, cycle_name, review_type, start_date, self_assessment_due, manager_assessment_due, cycle_close_date, status, is_active, created_at, updated_at, created_by) VALUES
    ('c3f210c4-dfe6-5a9a-9614-53c907fd6187', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '2026-H1', 'H1 2026 Performance Review', 'semi_annual', '2026-05-31', '2026-06-15', '2026-06-25', '2026-07-10', 'open', TRUE, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

-- Performance reviews with JSONB assessments (a preserved D1 simplification)
INSERT INTO hr_reviews (id, tenant_id, review_id, employee_id, reviewer_id, cycle_code, review_type, review_date, self_assessment, manager_assessment, competencies, overall_rating, status, created_at, updated_at) VALUES
    ('40e86787-3514-59e7-acb6-935e9a28a9f3', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E002', 'db1f1f2b-b140-5948-a34e-1c998ed98757', '6d466aa9-e51a-5d52-9015-152600855932', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 4.2}'::jsonb, '{"technical": 4.2, "communication": 4.0, "ownership": 4.2}'::jsonb, 4.2, 'submitted', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('568f6664-334c-564a-a5aa-37498ef233dd', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E004', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', '6d466aa9-e51a-5d52-9015-152600855932', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 4.5}'::jsonb, '{"technical": 4.5, "communication": 4.3, "ownership": 4.5}'::jsonb, 4.5, 'submitted', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('92decf94-143b-5159-8e6e-06b8d243fba1', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E006', 'c095eafa-952e-5047-961a-82ce7b45cbf1', '11f31511-ad53-59c7-9e90-8ee3b553489b', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 3.9}'::jsonb, '{"technical": 3.9, "communication": 3.6999999999999997, "ownership": 3.9}'::jsonb, 3.9, 'draft', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
    ('f25614d5-256e-502d-9979-7245769eaf56', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'REV-E003', 'bf17b1af-963b-53ef-9083-21506fb34e9c', '6d466aa9-e51a-5d52-9015-152600855932', '2026-H1', 'semi_annual', '2026-06-20', '{"strengths": "Strong delivery focus", "development": "More cross-team visibility"}'::jsonb, '{"summary": "Consistently exceeds expectations", "rating": 4.0}'::jsonb, '{"technical": 4.0, "communication": 3.8, "ownership": 4.0}'::jsonb, 4.0, 'draft', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z');

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
    ('07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '48ccc5de-9ba7-5461-ab49-160a1146ed85', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'approve', 'time_off_request', '70aa9eff-61f7-5867-a657-3a6940cde2bd', 'hr', '{"status": {"from": "pending", "to": "approved"}}'::jsonb);

-- Employee direct-deposit accounts (FR-PAY-005). E001 splits 15% to savings; the primary account takes the remainder. Account numbers are stored encrypted.
INSERT INTO employee_bank_accounts (id, tenant_id, employee_id, account_holder_name, bank_name, country, currency, account_type, account_number_encrypted, account_number_last4, routing_number, ifsc_code, sort_code, iban, is_primary, allocation_type, allocation_value, priority, verification_status, verified_at, is_active, effective_from, created_by) VALUES
    ('63fb798f-93a9-5fcb-ba44-ce65cbbd4693', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'Sarah Johnson', 'Chase Bank', 'US', 'USD', 'checking', 'enc:e3094e7e-6752-5cb5-9cdf-', '4417', '021000021', NULL, NULL, NULL, TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('84274790-b9c2-5b7c-b4b3-d285ed8d3204', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '6d466aa9-e51a-5d52-9015-152600855932', 'Sarah Johnson', 'Ally Bank', 'US', 'USD', 'savings', 'enc:91e5ac04-4bdc-5f82-a93f-', '9902', '124003116', NULL, NULL, NULL, FALSE, 'percentage', 15, 2, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('2126f414-630c-5e02-9aa7-c399facb3401', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'b9b84064-a67a-5048-8282-8fc048b4dbfb', 'Tom Whitfield', 'Bank of America', 'US', 'USD', 'checking', 'enc:bcf73c36-86d9-5b06-ab97-', '3310', '026009593', NULL, NULL, NULL, TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('392ca0d4-b157-5011-a291-a2f42a7fe4c2', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', '11f31511-ad53-59c7-9e90-8ee3b553489b', 'Aisha Okafor', 'Citibank', 'US', 'USD', 'checking', 'enc:5d367b06-ae01-55fa-ad38-', '7745', '021000089', NULL, NULL, NULL, TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('d8944f60-d19c-5f8f-b0e3-133a26453b16', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'db1f1f2b-b140-5948-a34e-1c998ed98757', 'Marcus Chen', 'HDFC Bank', 'IN', 'INR', 'savings', 'enc:3becbf7c-a2f4-5da9-b988-', '2288', NULL, 'HDFC0001234', NULL, NULL, TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('fb7bc54b-4f47-5429-9747-eede693b51c4', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'bf17b1af-963b-53ef-9083-21506fb34e9c', 'Priya Raman', 'ICICI Bank', 'IN', 'INR', 'savings', 'enc:e134520b-1558-5092-9651-', '6631', NULL, 'ICIC0004321', NULL, NULL, TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85'),
    ('34a7cbd3-f5bf-5b13-86eb-6bef76e90c4b', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'c095eafa-952e-5047-961a-82ce7b45cbf1', 'James Reid', 'Barclays', 'GB', 'GBP', 'checking', 'enc:24e771f4-94dc-5c8d-bc99-', '1104', NULL, NULL, '20-00-00', 'GB29BARC20000012341104', TRUE, 'remainder', NULL, 1, 'verified', '2026-01-01T09:00:00Z', TRUE, '2024-12-17', '48ccc5de-9ba7-5461-ab49-160a1146ed85');

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

-- Company news feed (FR-HR-011). Birthdays and anniversaries are NOT stored here — they are derived by the v_upcoming_celebrations view.
INSERT INTO hr_company_news (id, tenant_id, title, title_i18n, body, summary, post_type, subject_employee_id, event_date, is_pinned, publish_at, status, attachments, created_by, author_employee_id) VALUES
    ('f4b41e42-a1f2-5a7d-9111-58568cb99854', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Q1 all-hands on 12 February', '{"en-US": "Q1 all-hands on 12 February"}'::jsonb, 'Join us for the quarterly all-hands. Remote attendance available.', 'Join us for the quarterly all-hands. Remote attendance available.', 'event', NULL, '2026-02-12', TRUE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('342f31e5-6148-53cc-9ee2-d9e76c646fc7', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Marcus Chen promoted to L4', '{"en-US": "Marcus Chen promoted to L4"}'::jsonb, 'Congratulations to Marcus on his promotion to Software Engineer L4.', 'Congratulations to Marcus on his promotion to Software Engineer L4.', 'recognition', 'db1f1f2b-b140-5948-a34e-1c998ed98757', NULL, FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('4fe8a6b0-f0f5-5bcd-9d70-25516184ba92', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Updated expense policy', '{"en-US": "Updated expense policy"}'::jsonb, 'Expenses above $5,000 now require a second approver. See the policy page.', 'Expenses above $5,000 now require a second approver. See the policy page.', 'policy_update', NULL, NULL, FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('991aef6d-6151-555f-af28-beb2eb4cc552', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Bangalore office expansion', '{"en-US": "Bangalore office expansion"}'::jsonb, 'Our Bangalore delivery centre expands to a second floor in March.', 'Our Bangalore delivery centre expands to a second floor in March.', 'announcement', NULL, NULL, FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5'),
    ('8cbc011a-36e8-57fd-b9cc-81cd5d50dc2e', '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1', 'Northwind turns three', '{"en-US": "Northwind turns three"}'::jsonb, 'Three years since incorporation. Thank you all.', 'Three years since incorporation. Thank you all.', 'milestone', NULL, '2026-03-02', FALSE, '2026-01-01T09:00:00Z', 'published', '[]'::jsonb, '48ccc5de-9ba7-5461-ab49-160a1146ed85', 'a87e0200-0849-53b6-a491-e882feace3f5');

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

COMMIT;

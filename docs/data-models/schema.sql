-- =============================================================================
-- Kaaj — Unified Business Management Platform
-- Supabase PostgreSQL Schema (AUTHORITATIVE)
-- =============================================================================
-- Version:      7.0
-- Last Updated: 2026-08-27
--
-- Supersedes:
--   data-models.md                        (PostgreSQL, 43 tables, no employees)
--   data-models/d1-schema-clean.sql       (D1/SQLite, 52 tables, db-per-org)
--   data-models/critical-tables-addon.sql (D1/SQLite, 4 tables)
--
-- Every merge decision — including the eight capabilities the D1 "SMB
-- optimization" pass dropped and which were restored — is recorded in
-- SCHEMA-RECONCILIATION.md. Read that before changing anything here.
--
-- AMENDED BY MIGRATIONS. This file remains authoritative for INTENT — the tables,
-- types, indexes and policies below are what the system is meant to contain. It
-- is NOT a description of the deployed database. Four migrations correct defects
-- that only appeared when this file was applied to a real PostgreSQL and used as
-- a non-owner role; see ../api-surface.md for the findings table.
--
--   app/supabase/migrations/
--     ..._initial_schema.sql         this file, verbatim
--     ..._auth_and_grants.sql        adds every GRANT (this file has none, so
--                                    no role can read anything), the
--                                    custom_access_token_hook that ADR-008
--                                    assumes, a policy letting the hook read
--                                    tenant_users at token issue, FORCE RLS on
--                                    exchange_rates, security_invoker on
--                                    v_upcoming_celebrations
--     ..._audit_column_defaults.sql  DEFAULT now() on the 33 tables whose
--                                    created_at/updated_at are NOT NULL with no
--                                    default, and attaches app.set_updated_at()
--                                    which is defined below but wired to nothing
--     ..._harden_tenant_context.sql  app.current_tenant_id() below RAISES on an
--                                    empty or malformed claim; it should return
--                                    no tenant
--
-- Verify any change to this file with: ./scripts/verify-migrations.sh
--
-- Architecture: see ../05-architecture-decisions.md
--   ADR-002  PostgreSQL is the only datastore (search, jobs, cache)
--   ADR-003  Shared-schema tenancy, isolation via RLS
--   ADR-008  Supabase provides Postgres, Auth and Storage
--
-- CONVENTIONS (enforced, not advisory)
--   1. Surrogate UUID primary keys. Human-readable codes are preserved as
--      UNIQUE (tenant_id, <code>) business keys, never as identity.
--   2. tenant_id on every tenant-owned table, including child tables that
--      could infer it via a parent FK. Makes a missing filter lintable.
--   3. Every index leads with tenant_id.
--   4. RLS enabled and FORCED on every tenant-owned table.
--   5. Timestamps are TIMESTAMPTZ. Booleans are BOOLEAN. JSON is JSONB.
--   6. Custom fields are JSONB + custom_field_definitions. Never EAV,
--      never per-tenant DDL. See ../06-customization-model.md
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- composite GIN with tenant_id

CREATE SCHEMA IF NOT EXISTS app;

-- -----------------------------------------------------------------------------
-- Core enumerated types
-- -----------------------------------------------------------------------------
-- Stable, system-defined values that customers cannot change. Tenant-customizable
-- values are reference TABLES instead — see ../06-customization-model.md Tier 1.
-- Values generated from enumerations.json.
-- NOTE: data-models.md referenced these types but never defined them.


-- -----------------------------------------------------------------------------
-- Enumerated types generated from enumerations.json (2026-08-27)
-- -----------------------------------------------------------------------------
-- Native Postgres enums, per https://supabase.com/docs/guides/database/postgres/enums
--
-- Only STABLE, SYSTEM-DEFINED value sets are enums. Postgres has no
-- ALTER TYPE ... DROP VALUE — removed values can persist in index pages — so an
-- enum is a one-way door. Adding is fine:
--     ALTER TYPE employment_status ADD VALUE 'sabbatical';
--
-- Deliberately NOT enums:
--   * tenant-customizable values (benefit_type, time_off_type, expense_type,
--     asset_type, training_type, feedback_type, account_subtype) — these are
--     Tier 1 reference-table candidates, see ../06-customization-model.md
--   * external standards that grow (currency, locale, timezone, country) —
--     ISO/IANA lists change without our involvement

CREATE TYPE account_type AS ENUM (
    'asset',
    'equity',
    'expense',
    'liability',
    'revenue'
);

CREATE TYPE activity_type AS ENUM (
    'call',
    'demo',
    'email',
    'meeting',
    'note',
    'presentation',
    'task'
);

CREATE TYPE billing_method AS ENUM (
    'fixed',
    'hourly',
    'milestone',
    'retainer',
    'value_based'
);

CREATE TYPE billing_status AS ENUM (
    'active',
    'cancelled',
    'past_due',
    'suspended',
    'trial'
);

CREATE TYPE budget_type AS ENUM (
    'fixed_price',
    'milestone_based',
    'not_to_exceed',
    'retainer',
    'time_and_materials'
);

CREATE TYPE change_reason AS ENUM (
    'annual_review',
    'contract_renewal',
    'correction',
    'cost_of_living',
    'demotion',
    'equity_adjustment',
    'market_adjustment',
    'merit_increase',
    'new_hire',
    'promotion',
    'retention',
    'transfer'
);

CREATE TYPE contract_type AS ENUM (
    'licensing',
    'msa',
    'nda',
    'partnership',
    'retainer_agreement',
    'service_agreement',
    'sow'
);

CREATE TYPE coverage_level AS ENUM (
    'employee_children',
    'employee_family',
    'employee_only',
    'employee_spouse'
);

CREATE TYPE eeoc_category AS ENUM (
    'administrative_support',
    'craft_workers',
    'executive_senior_officials_managers',
    'first_mid_level_officials_managers',
    'laborers_helpers',
    'operatives',
    'professionals',
    'sales_workers',
    'service_workers',
    'technicians'
);

CREATE TYPE employment_status AS ENUM (
    'active',
    'deceased',
    'on_leave',
    'retired',
    'suspended',
    'terminated'
);

CREATE TYPE gender AS ENUM (
    'female',
    'male',
    'non_binary',
    'other',
    'prefer_not_to_say'
);

CREATE TYPE group_type AS ENUM (
    'affinity',
    'custom',
    'department',
    'functional',
    'project',
    'team'
);

CREATE TYPE india_tax_regime AS ENUM (
    'new_regime',
    'old_regime'
);

CREATE TYPE marital_status AS ENUM (
    'divorced',
    'domestic_partnership',
    'married',
    'prefer_not_to_say',
    'separated',
    'single',
    'widowed'
);

CREATE TYPE pay_frequency AS ENUM (
    'annually',
    'bi-weekly',
    'monthly',
    'quarterly',
    'semi-monthly',
    'weekly'
);

CREATE TYPE payment_method AS ENUM (
    'cash',
    'check',
    'direct_deposit',
    'mobile_payment',
    'paycard',
    'wire_transfer'
);

CREATE TYPE payment_status AS ENUM (
    'cancelled',
    'completed',
    'failed',
    'pending',
    'processing',
    'refunded'
);

CREATE TYPE period_type AS ENUM (
    'bi_weekly',
    'monthly',
    'weekly'
);

CREATE TYPE plan_tier AS ENUM (
    'custom',
    'enterprise',
    'professional',
    'starter'
);

CREATE TYPE project_type AS ENUM (
    'client_project',
    'internal',
    'marketing_campaign',
    'product_development',
    'research'
);

CREATE TYPE pronouns AS ENUM (
    'he_him',
    'other',
    'prefer_not_to_say',
    'she_her',
    'they_them',
    'ze_hir'
);

CREATE TYPE reimbursement_status AS ENUM (
    'approved',
    'cancelled',
    'paid',
    'pending',
    'rejected'
);

CREATE TYPE task_type AS ENUM (
    'approval',
    'bug',
    'deliverable',
    'feature',
    'milestone',
    'review',
    'task'
);

CREATE TYPE tax_type AS ENUM (
    'customs',
    'excise',
    'gst',
    'none',
    'sales_tax',
    'use_tax',
    'vat'
);

CREATE TYPE work_authorization_type AS ENUM (
    'citizen',
    'ead',
    'h1b',
    'other',
    'permanent_resident',
    'student_visa',
    'tn',
    'work_visa'
);

CREATE TYPE vesting_type AS ENUM (
    'time_based',
    'milestone_based',
    'performance_based',
    'hybrid',
    'cliff_then_monthly',
    'cliff_then_quarterly'
);

CREATE TYPE time_tracking_type AS ENUM (
    'none',
    'hours_only',
    'clock_in_out',
    'task_based',
    'deliverable_based'
);

CREATE TYPE employment_type AS ENUM (
    'full_time',
    'part_time',
    'contractor',
    'intern',
    'temporary',
    'consultant',
    'freelance'
);

CREATE TYPE work_arrangement AS ENUM (
    'standard',
    'flexible',
    'shift_based',
    'on_call',
    'project_based',
    'remote',
    'hybrid'
);

CREATE TYPE compensation_type AS ENUM (
    'salary',
    'hourly',
    'daily',
    'weekly',
    'contract'
);

CREATE TYPE variable_comp_type AS ENUM (
    'commission',
    'bonus',
    'profit_sharing',
    'sales_incentive',
    'performance_bonus',
    'spot_bonus',
    'retention_bonus'
);

CREATE TYPE equity_type AS ENUM (
    'stock_options',
    'iso',
    'nso',
    'rsu',
    'restricted_stock',
    'phantom_stock',
    'sar',
    'espp'
);

CREATE TYPE allowance_type AS ENUM (
    'housing',
    'transportation',
    'meal',
    'phone',
    'internet',
    'education',
    'fitness',
    'childcare',
    'parking',
    'uniform',
    'travel',
    'relocation',
    'car',
    'fuel',
    'other'
);

CREATE TYPE premium_type AS ENUM (
    'shift_differential',
    'weekend',
    'holiday',
    'on_call',
    'hazard_pay',
    'geographic',
    'skill_based',
    'certification'
);


-- -----------------------------------------------------------------------------
-- Tenant context
-- -----------------------------------------------------------------------------
-- The application connects directly to Postgres (not via PostgREST), so it sets
-- the JWT claims itself, once per request, inside the transaction:
--
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"sub":"...","app_metadata":{"tenant_id":"..."}}';
--   ...
--   COMMIT;
--
-- auth.jwt() reads current_setting('request.jwt.claims'), so policies written in
-- the Supabase idiom behave identically whether the query arrives via PostgREST
-- or via the application's own connection.

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT NULLIF(
        current_setting('request.jwt.claims', true)::jsonb
            #>> '{app_metadata,tenant_id}',
        ''
    )::uuid
$$;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


-- =============================================================================
-- SECTION 3 — DOMAIN TABLES (merged from both source schemas)
-- =============================================================================

CREATE TABLE tenants (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subdomain             VARCHAR(100) UNIQUE NOT NULL,
    company_name          VARCHAR(255) NOT NULL,
    company_name_i18n     JSONB,
    region                VARCHAR(50) NOT NULL DEFAULT 'us-east-1',
    data_residency_country VARCHAR(2),
    default_locale        VARCHAR(10) NOT NULL DEFAULT 'en-US',
    supported_locales     VARCHAR(10)[] DEFAULT ARRAY['en-US'],
    default_currency      VARCHAR(3) NOT NULL DEFAULT 'USD',
    supported_currencies  VARCHAR(3)[] DEFAULT ARRAY['USD'],
    default_timezone      VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    date_format           VARCHAR(50) DEFAULT 'MM/DD/YYYY',
    time_format           VARCHAR(10) DEFAULT '12h',
    number_format         VARCHAR(50) DEFAULT 'en-US',
    plan_tier             plan_tier NOT NULL DEFAULT 'starter',
    max_employees         INT DEFAULT 50,
    max_storage_gb        INT DEFAULT 10,
    features              JSONB DEFAULT '{}',
    billing_email         VARCHAR(255),
    billing_currency      VARCHAR(3) DEFAULT 'USD',
    billing_status        billing_status DEFAULT 'active',
    is_active             BOOLEAN DEFAULT TRUE,
    is_suspended          BOOLEAN DEFAULT FALSE,
    gdpr_applicable       BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    legal_entity_name     TEXT,
    fiscal_year_start     TEXT DEFAULT '01-01',
    company_size          TEXT CHECK (company_size IN ('1-10', '11-50', '51-200', '201-500', '501+')),
    industry              TEXT,
    trial_end_date        DATE,
    primary_contact_name  TEXT,
    primary_contact_email TEXT,
    primary_contact_phone TEXT,
    address_line1         TEXT,
    address_line2         TEXT,
    city                  TEXT,
    state_province        TEXT,
    postal_code           TEXT,
    billing_country       TEXT,
    tax_id                UUID,
    registration_number   TEXT,
    created_by            TEXT,
    version               INTEGER DEFAULT 1
);

CREATE TABLE firm_locations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                  VARCHAR(255) NOT NULL,
    name_i18n             JSONB,
    address_line1         VARCHAR(255),
    address_line2         VARCHAR(255),
    city                  VARCHAR(100),
    state                 VARCHAR(100),
    postal_code           VARCHAR(20),
    country               VARCHAR(2) NOT NULL DEFAULT 'US',
    timezone              VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    locale                VARCHAR(10),
    currency              VARCHAR(3),
    phone                 VARCHAR(20),
    email                 VARCHAR(255),
    working_hours         JSONB,
    is_headquarters       BOOLEAN DEFAULT FALSE,
    is_active             BOOLEAN DEFAULT TRUE,
    capacity              INT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID,
    location_code         TEXT,
    holiday_calendar_id   TEXT,
    UNIQUE (tenant_id, location_code)
);

CREATE TABLE firm_departments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_department_id  UUID,
    name                  VARCHAR(255) NOT NULL,
    name_i18n             JSONB,
    code                  VARCHAR(50),
    description           TEXT,
    description_i18n      JSONB,
    location_id           UUID,
    head_employee_id      UUID,
    cost_center           VARCHAR(50),
    budget_currency       VARCHAR(3),
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID,
    department_code       TEXT,
    parent_department_code TEXT,
    location_code         TEXT,
    UNIQUE (tenant_id, department_code)
);

CREATE TABLE firm_job_titles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title                 VARCHAR(255) NOT NULL,
    title_i18n            JSONB,
    description           TEXT,
    description_i18n      JSONB,
    is_exempt             BOOLEAN DEFAULT FALSE,
    eeoc_category         eeoc_category,
    isco_code             VARCHAR(10),
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE firm_job_levels (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_title_id          UUID NOT NULL,
    level_name            VARCHAR(100) NOT NULL,
    level_name_i18n       JSONB,
    salary_ranges         JSONB NOT NULL,
    sort_order            INT DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE employees (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id           TEXT,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    middle_name           TEXT,
    preferred_name        TEXT,
    email                 TEXT NOT NULL,
    phone                 TEXT,
    employee_number       TEXT,
    gender                gender,
    marital_status        marital_status,
    ssn_tax_id            TEXT,
    social_media_links    JSONB DEFAULT '{}'::jsonb,
    timezone              TEXT DEFAULT 'America/New_York',
    employment_status     employment_status NOT NULL DEFAULT 'active',
    employment_type       TEXT NOT NULL DEFAULT 'full_time',
    start_date            DATE NOT NULL,
    end_date              DATE,
    department_code       TEXT,
    job_title             TEXT,
    job_level             TEXT,
    manager_id            UUID,
    location_code         TEXT,
    pay_frequency         pay_frequency DEFAULT 'bi-weekly',
    compensation_band     TEXT,
    pronouns              pronouns,
    profile_picture       TEXT,
    prior_employers       JSONB DEFAULT '[]'::jsonb,
    prior_education       JSONB DEFAULT '[]'::jsonb,
    hobbies               JSONB DEFAULT '[]'::jsonb,
    affinity_groups       JSONB DEFAULT '[]'::jsonb,
    introduction          TEXT,
    birth_date            DATE,
    celebration_preferences JSONB DEFAULT '{}'::jsonb,
    custom_fields         JSONB DEFAULT '{}'::jsonb,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    version               INTEGER DEFAULT 1,
    compensation_type     TEXT,
    base_amount           NUMERIC(18,4),
    currency              TEXT DEFAULT 'USD',
    overtime_eligible     BOOLEAN DEFAULT FALSE,
    default_hourly_rate   NUMERIC(18,4),
    default_billable_rate NUMERIC(18,4),
    pto_balances          JSONB DEFAULT '{}'::jsonb,
    tax_withholding       JSONB DEFAULT '{}'::jsonb,
    salary_structure      JSONB DEFAULT '{}'::jsonb,
    variable_compensation JSONB DEFAULT '[]'::jsonb,
    benefits_elections    JSONB DEFAULT '{}'::jsonb,
    fte                   NUMERIC(18,4) DEFAULT 1.00,
    UNIQUE (tenant_id, employee_id)
);

CREATE TABLE accounting_periods (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_name           VARCHAR(50) NOT NULL,
    period_type           period_type NOT NULL,
    start_date            DATE NOT NULL,
    end_date              DATE NOT NULL,
    fiscal_year           INT NOT NULL,
    status                VARCHAR(50) DEFAULT 'open',
    closed_by             UUID,
    closed_at             TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bank_accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_name          VARCHAR(255) NOT NULL,
    account_number        VARCHAR(255),
    account_number_encrypted VARCHAR(500),
    bank_name             VARCHAR(255) NOT NULL,
    bank_branch           VARCHAR(255),
    routing_number        VARCHAR(255),
    swift_code            VARCHAR(20),
    iban                  VARCHAR(50),
    currency              VARCHAR(3) NOT NULL,
    current_balance       DECIMAL(15, 2) DEFAULT 0,
    available_balance     DECIMAL(15, 2) DEFAULT 0,
    gl_account_id         UUID,
    feed_enabled          BOOLEAN DEFAULT FALSE,
    feed_provider         VARCHAR(50),
    feed_connection_id    VARCHAR(255),
    last_synced_at        TIMESTAMPTZ,
    is_active             BOOLEAN DEFAULT TRUE,
    notes                 TEXT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE bank_reconciliation_rules (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bank_account_id       UUID,
    rule_name             VARCHAR(255) NOT NULL,
    is_active             BOOLEAN DEFAULT TRUE,
    description_contains  VARCHAR(255),
    description_regex     VARCHAR(500),
    amount_equals         DECIMAL(15, 2),
    amount_tolerance      DECIMAL(15, 2) DEFAULT 0,
    amount_min            DECIMAL(15, 2),
    amount_max            DECIMAL(15, 2),
    transaction_type      VARCHAR(50),
    action_type           VARCHAR(50) NOT NULL,
    category_account_id   UUID,
    vendor_id             UUID,
    customer_id           UUID,
    auto_match            BOOLEAN DEFAULT FALSE,
    create_transaction    BOOLEAN DEFAULT FALSE,
    tracking_categories   JSONB,
    priority              INT DEFAULT 0,
    times_applied         INT DEFAULT 0,
    last_applied_at       TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE bank_transactions (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id       UUID NOT NULL,
    transaction_date      DATE NOT NULL,
    value_date            DATE,
    description           TEXT NOT NULL,
    reference             VARCHAR(100),
    amount                DECIMAL(15, 2) NOT NULL,
    balance               DECIMAL(15, 2),
    transaction_type      VARCHAR(50),
    category_account_id   UUID,
    status                VARCHAR(50) DEFAULT 'unmatched',
    matched_to_type       VARCHAR(50),
    matched_to_id         UUID,
    match_confidence      DECIMAL(3, 2),
    matching_rule_id      UUID,
    imported_at           TIMESTAMPTZ,
    bank_transaction_id   VARCHAR(255),
    notes                 TEXT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bill_lines (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id               UUID NOT NULL,
    line_number           INT NOT NULL,
    description           TEXT NOT NULL,
    quantity              DECIMAL(10, 2) NOT NULL DEFAULT 1,
    unit_price            DECIMAL(15, 2) NOT NULL,
    amount                DECIMAL(15, 2) NOT NULL,
    tax_rate_id           UUID,
    tax_amount            DECIMAL(15, 2) DEFAULT 0,
    expense_account_id    UUID NOT NULL,
    tracking_categories   JSONB,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bills (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor_id             UUID NOT NULL,
    bill_number           VARCHAR(50) NOT NULL,
    reference             VARCHAR(100),
    bill_date             DATE NOT NULL,
    due_date              DATE NOT NULL,
    currency              VARCHAR(3) NOT NULL,
    exchange_rate         DECIMAL(12, 6) DEFAULT 1.0,
    base_currency         VARCHAR(3) NOT NULL,
    subtotal              DECIMAL(15, 2) NOT NULL,
    tax_total             DECIMAL(15, 2) DEFAULT 0,
    total                 DECIMAL(15, 2) NOT NULL,
    amount_paid           DECIMAL(15, 2) DEFAULT 0,
    amount_due            DECIMAL(15, 2) NOT NULL,
    base_subtotal         DECIMAL(15, 2) NOT NULL,
    base_tax_total        DECIMAL(15, 2) DEFAULT 0,
    base_total            DECIMAL(15, 2) NOT NULL,
    base_amount_paid      DECIMAL(15, 2) DEFAULT 0,
    base_amount_due       DECIMAL(15, 2) NOT NULL,
    status                VARCHAR(50) DEFAULT 'draft',
    requires_approval     BOOLEAN DEFAULT TRUE,
    approved_by           UUID,
    approved_at           TIMESTAMPTZ,
    payment_terms         VARCHAR(50),
    notes                 TEXT,
    file_url              TEXT,
    ocr_processed         BOOLEAN DEFAULT FALSE,
    ocr_data              JSONB,
    tracking_categories   JSONB,
    payment_scheduled_date DATE,
    journal_entry_id      UUID,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE chart_of_accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_code          VARCHAR(50) NOT NULL,
    account_name          VARCHAR(255) NOT NULL,
    account_name_i18n     JSONB,
    account_type          account_type NOT NULL,
    account_subtype       VARCHAR(50),
    parent_account_id     UUID,
    currency              VARCHAR(3),
    is_bank_account       BOOLEAN DEFAULT FALSE,
    is_active             BOOLEAN DEFAULT TRUE,
    enable_payments       BOOLEAN DEFAULT FALSE,
    tax_rate_id           UUID,
    description           TEXT,
    description_i18n      JSONB,
    current_balance       DECIMAL(15, 2) DEFAULT 0,
    current_balance_base  DECIMAL(15, 2) DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE clients (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_name           TEXT NOT NULL,
    client_code           TEXT,
    legal_entity_name     TEXT,
    client_type           TEXT DEFAULT 'corporate' CHECK (client_type IN ( 'individual', 'small_business', 'corporate', 'enterprise', 'government', 'nonprofit' )),
    industry              TEXT,
    status                TEXT DEFAULT 'active' CHECK (status IN ('prospect', 'active', 'inactive', 'churned')),
    is_active             BOOLEAN DEFAULT TRUE,
    primary_contact_name  TEXT,
    primary_contact_email TEXT,
    primary_contact_phone TEXT,
    primary_contact_title TEXT,
    billing_contact_name  TEXT,
    billing_contact_email TEXT,
    billing_contact_phone TEXT,
    address_line1         TEXT,
    address_line2         TEXT,
    city                  TEXT,
    state_province        TEXT,
    postal_code           TEXT,
    country               TEXT DEFAULT 'US',
    website               TEXT,
    company_size          TEXT,
    currency              TEXT DEFAULT 'USD',
    payment_terms         TEXT DEFAULT 'net_30',
    default_hourly_rate   REAL,
    tax_id                TEXT,
    portal_access_enabled BOOLEAN DEFAULT FALSE,
    account_manager_id    UUID,
    acquisition_date      DATE,
    acquisition_source    TEXT,
    custom_fields         JSONB DEFAULT '{}',
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            TEXT NOT NULL,
    version               INTEGER DEFAULT 1
);

CREATE TABLE compensation_allowances (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    allowance_type        allowance_type NOT NULL,
    allowance_name        VARCHAR(255),
    description           TEXT,
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    amount                DECIMAL(12, 2) NOT NULL,
    currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
    frequency             VARCHAR(50),
    is_taxable            BOOLEAN DEFAULT TRUE,
    is_reimbursement      BOOLEAN DEFAULT FALSE,
    requires_receipts     BOOLEAN DEFAULT FALSE,
    max_reimbursement_per_period DECIMAL(12, 2),
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    allowance_id          TEXT,
    eligibility_criteria  TEXT,
    status                TEXT,
    UNIQUE (tenant_id, allowance_id)
);

CREATE TABLE compensation_base (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    compensation_type     compensation_type NOT NULL,
    amount                DECIMAL(12, 2) NOT NULL,
    currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
    pay_frequency         pay_frequency,
    standard_hours_per_day DECIMAL(5, 2),
    standard_days_per_week DECIMAL(4, 2),
    annual_equivalent     DECIMAL(12, 2),
    overtime_eligible     BOOLEAN DEFAULT FALSE,
    overtime_rules        JSONB,
    change_reason         change_reason,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID
);

CREATE TABLE compensation_equity (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    grant_type            equity_type NOT NULL,
    grant_date            DATE NOT NULL,
    grant_number          VARCHAR(50),
    shares_granted        INT NOT NULL,
    shares_vested         INT DEFAULT 0,
    shares_exercised      INT DEFAULT 0,
    shares_forfeited      INT DEFAULT 0,
    exercise_price        DECIMAL(12, 4),
    grant_price           DECIMAL(12, 4),
    currency              VARCHAR(3) DEFAULT 'USD',
    vesting_type          vesting_type NOT NULL,
    vesting_start_date    DATE NOT NULL,
    vesting_cliff_months  INT,
    vesting_period_months INT,
    vesting_schedule      JSONB,
    performance_conditions JSONB,
    expiration_date       DATE,
    status                VARCHAR(50) DEFAULT 'active',
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    equity_id             TEXT,
    equity_type           TEXT NOT NULL,
    total_shares          INTEGER,
    strike_price          NUMERIC(18,4),
    fair_market_value     NUMERIC(18,4),
    UNIQUE (tenant_id, equity_id)
);

CREATE TABLE compensation_premiums (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    premium_type          premium_type NOT NULL,
    premium_name          VARCHAR(255),
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    calculation_method    VARCHAR(50),
    premium_amount        DECIMAL(12, 2),
    premium_percentage    DECIMAL(5, 2),
    currency              VARCHAR(3) DEFAULT 'USD',
    conditions            JSONB,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    premium_id            TEXT,
    rate_multiplier       NUMERIC(18,4),
    amount                NUMERIC(18,4),
    eligibility_rules     JSONB,
    status                TEXT,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, premium_id)
);

CREATE TABLE compensation_variable (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    component_type        variable_comp_type NOT NULL,
    component_name        VARCHAR(255),
    description           TEXT,
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    target_amount         DECIMAL(12, 2),
    currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
    commission_structure  JSONB,
    quota_structure       JSONB,
    payment_frequency     VARCHAR(50),
    next_payment_date     DATE,
    performance_metrics   JSONB,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    variable_comp_id      TEXT,
    comp_type             TEXT NOT NULL,
    comp_name             TEXT,
    frequency             TEXT,
    status                TEXT,
    UNIQUE (tenant_id, variable_comp_id)
);

CREATE TABLE compensation_work_schedules (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    schedule_name         VARCHAR(255),
    schedule_type         work_arrangement NOT NULL DEFAULT 'standard',
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    standard_hours_per_week DECIMAL(5, 2),
    weekly_schedule       JSONB,
    core_hours            JSONB,
    shift_pattern         JSONB,
    break_policy          JSONB,
    time_tracking_required time_tracking_type NOT NULL DEFAULT 'hours_only',
    timezone              VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    schedule_id           TEXT,
    is_active             BOOLEAN DEFAULT TRUE,
    UNIQUE (tenant_id, schedule_id)
);

CREATE TABLE customers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_number       VARCHAR(50),
    customer_name         VARCHAR(255) NOT NULL,
    display_name          VARCHAR(255),
    email                 VARCHAR(255),
    phone                 VARCHAR(20),
    website               VARCHAR(255),
    billing_address       JSONB,
    shipping_address      JSONB,
    currency              VARCHAR(3) NOT NULL,
    payment_terms         VARCHAR(50) DEFAULT 'Net 30',
    credit_limit          DECIMAL(15, 2),
    tax_number            VARCHAR(100),
    is_tax_exempt         BOOLEAN DEFAULT FALSE,
    tax_rate_id           UUID,
    ar_account_id         UUID,
    is_active             BOOLEAN DEFAULT TRUE,
    portal_enabled        BOOLEAN DEFAULT FALSE,
    portal_access_token   VARCHAR(255),
    notes                 TEXT,
    custom_fields         JSONB,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE employee_assets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id              TEXT,
    employee_id           UUID NOT NULL,
    asset_type            TEXT NOT NULL,
    make_model            TEXT NOT NULL,
    serial_number         TEXT,
    asset_tag             TEXT,
    assigned_date         DATE NOT NULL,
    return_date           DATE,
    condition             TEXT DEFAULT 'good',
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, asset_id)
);

CREATE TABLE employee_certifications (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    certification_id      TEXT,
    employee_id           UUID NOT NULL,
    certification_name    TEXT NOT NULL,
    issuing_organization  TEXT NOT NULL,
    certification_number  TEXT,
    issue_date            DATE NOT NULL,
    expiration_date       DATE,
    status                TEXT NOT NULL DEFAULT 'active',
    verification_url      TEXT,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, certification_id)
);

CREATE TABLE employee_group_members (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_name            TEXT NOT NULL,
    employee_id           UUID NOT NULL,
    role                  TEXT NOT NULL DEFAULT 'member',
    joined_at             TIMESTAMPTZ NOT NULL,
    joined_by             TEXT NOT NULL,
    expires_at            TIMESTAMPTZ
);

CREATE TABLE employee_group_roles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_role_id         TEXT,
    group_name            TEXT NOT NULL,
    role_name             TEXT NOT NULL,
    department_code       TEXT,
    location_code         TEXT,
    granted_at            TIMESTAMPTZ NOT NULL,
    granted_by            TEXT NOT NULL,
    expires_at            TIMESTAMPTZ,
    UNIQUE (tenant_id, group_role_id)
);

CREATE TABLE employee_training_records (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    training_record_id    TEXT,
    employee_id           UUID NOT NULL,
    training_name         TEXT NOT NULL,
    training_type         TEXT NOT NULL,
    provider              TEXT,
    assigned_date         DATE NOT NULL,
    due_date              DATE NOT NULL,
    completion_date       DATE,
    status                TEXT NOT NULL DEFAULT 'not_started',
    certificate_url       TEXT,
    expiration_date       DATE,
    credits_hours         NUMERIC(18,4),
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, training_record_id)
);

CREATE TABLE employee_user_groups (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_name            TEXT,
    display_name          TEXT NOT NULL,
    description           TEXT,
    group_type            group_type NOT NULL DEFAULT 'custom',
    parent_group_name     TEXT,
    department_code       TEXT,
    location_code         TEXT,
    approver_id           UUID NOT NULL,
    backup_approver_id    UUID NOT NULL,
    is_active             BOOLEAN DEFAULT TRUE,
    is_system_group       BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    UNIQUE (tenant_id, group_name)
);

CREATE TABLE employment_terms (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    employment_type       employment_type NOT NULL,
    start_date            DATE NOT NULL,
    planned_end_date      DATE,
    actual_end_date       DATE,
    -- NOT the client `contract_type` enum (MSA/NDA/SOW). Employment contract kind.
    contract_type         TEXT,
        CHECK (contract_type IN ('permanent','fixed_term','probationary','casual','apprenticeship')),
    renewal_option        BOOLEAN DEFAULT FALSE,
    probation_period_days INT DEFAULT 90,
    probation_end_date    DATE,
    notice_period_days    INT,
    work_authorization_type work_authorization_type,
    work_authorization_expiry DATE,
    fte                   DECIMAL(4, 2) DEFAULT 1.00,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exchange_rates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency         VARCHAR(3) NOT NULL,
    to_currency           VARCHAR(3) NOT NULL,
    rate_date             DATE NOT NULL,
    rate                  DECIMAL(12, 6) NOT NULL,
    inverse_rate          DECIMAL(12, 6) NOT NULL,
    source                VARCHAR(50) NOT NULL,
    is_manual             BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID
);

CREATE TABLE expenses (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id           UUID NOT NULL,
    expense_date          DATE NOT NULL,
    vendor_name           VARCHAR(255),
    vendor_id             UUID,
    currency              VARCHAR(3) NOT NULL,
    amount                DECIMAL(15, 2) NOT NULL,
    exchange_rate         DECIMAL(12, 6) DEFAULT 1.0,
    base_amount           DECIMAL(15, 2) NOT NULL,
    category_account_id   UUID NOT NULL,
    receipt_url           TEXT,
    receipt_ocr_data      JSONB,
    description           TEXT,
    expense_type          VARCHAR(50) DEFAULT 'general',
    mileage_distance      DECIMAL(10, 2),
    mileage_rate          DECIMAL(10, 4),
    is_reimbursable       BOOLEAN DEFAULT TRUE,
    reimbursement_status  reimbursement_status DEFAULT 'pending',
    approved_by           UUID,
    approved_at           TIMESTAMPTZ,
    rejection_reason      TEXT,
    bill_id               UUID,
    payment_id            UUID,
    tracking_categories   JSONB,
    department_id         UUID,
    journal_entry_id      UUID,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE firm_benefit_items (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benefits_package_id   UUID NOT NULL,
    benefit_type          VARCHAR(50) NOT NULL,
    benefit_name          VARCHAR(255) NOT NULL,
    benefit_name_i18n     JSONB,
    carrier_name          VARCHAR(255),
    carrier_varies_by_location BOOLEAN DEFAULT FALSE,
    costs_by_currency     JSONB,
    plan_details          JSONB,
    plan_details_i18n     JSONB,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE firm_benefits_packages (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                  VARCHAR(255) NOT NULL,
    name_i18n             JSONB,
    description           TEXT,
    description_i18n      JSONB,
    eligibility_rules     JSONB,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE firm_benefits_plans (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_name             TEXT NOT NULL,
    plan_code             TEXT,
    plan_type             TEXT NOT NULL CHECK (plan_type IN ( 'health_medical', 'health_dental', 'health_vision', 'life_insurance', 'disability_short_term', 'disability_long_term', 'retirement_401k', 'retirement_pension', 'hsa', 'fsa_healthcare', 'fsa_dependent_care', 'supplemental_accident', 'supplemental_critical_illness', 'supplemental_hospital', 'pet_insurance', 'legal_services', 'employee_assistance', 'other' )),
    carrier_name          TEXT,
    carrier_policy_number TEXT,
    coverage_type         TEXT,
    network_type          TEXT,
    is_active             BOOLEAN DEFAULT TRUE,
    effective_date        DATE NOT NULL,
    end_date              DATE,
    employee_cost_monthly REAL,
    employer_cost_monthly REAL,
    total_premium_monthly REAL,
    currency              TEXT DEFAULT 'USD',
    plan_details          JSONB DEFAULT '{}',
    cost_tiers            TEXT DEFAULT '[]',
    eligibility_rules     JSONB DEFAULT '{}',
    open_enrollment_start TEXT,
    open_enrollment_end   TEXT,
    allows_new_hire_enrollment BOOLEAN DEFAULT TRUE,
    new_hire_enrollment_window_days INTEGER DEFAULT 30,
    allows_life_event_changes BOOLEAN DEFAULT TRUE,
    life_event_window_days INTEGER DEFAULT 30,
    summary_of_benefits_url TEXT,
    plan_document_url     TEXT,
    description           TEXT,
    internal_notes        TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            TEXT NOT NULL,
    version               INTEGER DEFAULT 1
);

CREATE TABLE firm_holidays (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id           UUID NOT NULL,
    name                  VARCHAR(255) NOT NULL,
    name_i18n             JSONB,
    date                  DATE NOT NULL,
    observed_at           TIMESTAMPTZ,
    is_recurring          BOOLEAN DEFAULT FALSE,
    recurrence_rule       VARCHAR(100),
    is_paid               BOOLEAN DEFAULT TRUE,
    is_mandatory          BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID,
    holiday_id            TEXT,
    location_code         TEXT NOT NULL,
    UNIQUE (tenant_id, holiday_id)
);

CREATE TABLE firm_payroll_policies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    location_id           UUID,
    overtime_rules        JSONB,
    time_rounding         VARCHAR(20) DEFAULT 'none',
    workweek_start_day    INT DEFAULT 0 CHECK (workweek_start_day BETWEEN 0 AND 6),
    require_time_tracking BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE hr_attendance (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attendance_id         TEXT,
    employee_id           UUID NOT NULL,
    attendance_date       DATE NOT NULL,
    clock_in_time         TIMESTAMPTZ,
    clock_out_time        TIMESTAMPTZ,
    clock_in_location     TEXT,
    clock_out_location    TEXT,
    break_minutes         INTEGER DEFAULT 0,
    total_hours           NUMERIC(18,4),
    regular_hours         NUMERIC(18,4),
    overtime_hours        NUMERIC(18,4),
    status                TEXT NOT NULL DEFAULT 'draft',
    approved_by           TEXT,
    approved_at           TIMESTAMPTZ,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, attendance_id)
);

CREATE TABLE hr_benefits_enrollments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    enrollment_id         TEXT,
    employee_id           UUID NOT NULL,
    plan_year             INTEGER NOT NULL,
    benefit_type          TEXT NOT NULL,
    plan_name             TEXT NOT NULL,
    carrier               TEXT,
    coverage_level        coverage_level,
    employee_cost_monthly NUMERIC(18,4),
    employer_cost_monthly NUMERIC(18,4),
    annual_election_amount NUMERIC(18,4),
    enrollment_date       DATE NOT NULL,
    effective_date        DATE NOT NULL,
    end_date              DATE,
    status                TEXT DEFAULT 'active',
    dependents            JSONB,
    beneficiaries         JSONB,
    election_details      JSONB,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, enrollment_id)
);

CREATE TABLE hr_change_requests (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id            TEXT,
    requested_by          TEXT NOT NULL,
    requested_for         TEXT NOT NULL,
    request_type          TEXT NOT NULL,
    request_details       JSONB NOT NULL,
    approval_chain        JSONB,
    status                TEXT DEFAULT 'pending',
    comments              JSONB,
    attached_documents    JSONB,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    resolved_at           TIMESTAMPTZ,
    resolved_by           TEXT,
    UNIQUE (tenant_id, request_id)
);

CREATE TABLE hr_emergency_contacts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id            TEXT,
    employee_id           UUID NOT NULL,
    contact_name          TEXT NOT NULL,
    relationship          TEXT NOT NULL,
    phone_primary         TEXT NOT NULL,
    phone_secondary       TEXT,
    email                 TEXT,
    address               TEXT,
    is_primary            BOOLEAN DEFAULT FALSE,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, contact_id)
);

CREATE TABLE hr_employee_documents (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id           TEXT,
    employee_id           UUID NOT NULL,
    document_type         TEXT NOT NULL,
    document_name         TEXT NOT NULL,
    file_url              TEXT NOT NULL,
    file_size_bytes       INTEGER,
    mime_type             TEXT,
    uploaded_by           TEXT NOT NULL,
    upload_date           DATE NOT NULL,
    expiration_date       DATE,
    status                TEXT,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, document_id)
);

CREATE TABLE hr_feedback (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feedback_id           TEXT,
    from_employee_id      UUID NOT NULL,
    to_employee_id        UUID NOT NULL,
    feedback_type         TEXT NOT NULL,
    feedback_date         DATE,
    content               TEXT NOT NULL,
    is_anonymous          BOOLEAN DEFAULT FALSE,
    tags                  JSONB,
    visibility            TEXT DEFAULT 'private',
    status                TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, feedback_id)
);

CREATE TABLE hr_onboarding_tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id               TEXT,
    employee_id           UUID NOT NULL,
    task_name             TEXT NOT NULL,
    description           TEXT,
    task_type             task_type NOT NULL,
    assigned_to_employee_id UUID,
    due_date              DATE,
    completion_date       DATE,
    status                TEXT DEFAULT 'pending',
    template_data         JSONB,
    result_data           JSONB,
    priority              TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, task_id)
);

CREATE TABLE hr_review_cycles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cycle_code            TEXT,
    cycle_name            TEXT NOT NULL,
    review_type           TEXT NOT NULL,
    start_date            DATE NOT NULL,
    self_assessment_due   TEXT,
    manager_assessment_due TEXT,
    review_meetings_due   TEXT,
    cycle_close_date      DATE,
    status                TEXT NOT NULL DEFAULT 'draft',
    template              JSONB DEFAULT '{}'::jsonb,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    UNIQUE (tenant_id, cycle_code)
);

CREATE TABLE hr_reviews (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id             TEXT,
    employee_id           UUID NOT NULL,
    reviewer_id           UUID NOT NULL,
    cycle_code            TEXT NOT NULL,
    review_type           TEXT,
    review_date           DATE,
    self_assessment       JSONB DEFAULT '{}'::jsonb,
    manager_assessment    JSONB DEFAULT '{}'::jsonb,
    goals                 JSONB DEFAULT '[]'::jsonb,
    competencies          JSONB DEFAULT '[]'::jsonb,
    overall_rating        NUMERIC(18,4),
    status                TEXT NOT NULL DEFAULT 'not_started',
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, review_id)
);

CREATE TABLE hr_survey_responses (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    response_id           TEXT,
    survey_id             UUID NOT NULL,
    respondent_id         UUID,
    responses             TEXT NOT NULL,
    is_complete           BOOLEAN,
    submitted_at          TIMESTAMPTZ NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, response_id)
);

CREATE TABLE hr_surveys (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    survey_id             TEXT,
    survey_name           TEXT NOT NULL,
    survey_type           TEXT NOT NULL,
    description           TEXT,
    questions             JSONB NOT NULL,
    target_audience       TEXT,
    is_anonymous          BOOLEAN DEFAULT FALSE,
    start_date            DATE NOT NULL,
    end_date              DATE NOT NULL,
    status                TEXT DEFAULT 'draft',
    response_count        INTEGER DEFAULT 0,
    response_rate         NUMERIC(18,4),
    aggregate_results     TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    UNIQUE (tenant_id, survey_id)
);

CREATE TABLE hr_time_off_policies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_code           TEXT,
    template_id           UUID,
    policy_name           TEXT NOT NULL,
    time_off_type         TEXT NOT NULL,
    accrual_rules         JSONB DEFAULT '{}'::jsonb,
    employment_types      JSONB DEFAULT '["full_time"]',
    location_codes        JSONB DEFAULT '[]'::jsonb,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    UNIQUE (tenant_id, policy_code)
);

CREATE TABLE hr_time_off_requests (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_id            TEXT,
    employee_id           UUID NOT NULL,
    policy_code           TEXT NOT NULL,
    start_date            DATE NOT NULL,
    end_date              DATE NOT NULL,
    total_hours           NUMERIC(18,4) NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending',
    reason                TEXT,
    approver_id           UUID,
    approved_at           TIMESTAMPTZ,
    denied_at             TIMESTAMPTZ,
    denial_reason         TEXT,
    submitted_at          TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, request_id)
);

CREATE TABLE invoice_lines (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id            UUID NOT NULL,
    line_number           INT NOT NULL,
    description           TEXT NOT NULL,
    quantity              DECIMAL(10, 2) NOT NULL DEFAULT 1,
    unit_price            DECIMAL(15, 2) NOT NULL,
    amount                DECIMAL(15, 2) NOT NULL,
    discount_percent      DECIMAL(5, 2) DEFAULT 0,
    discount_amount       DECIMAL(15, 2) DEFAULT 0,
    tax_rate_id           UUID,
    tax_amount            DECIMAL(15, 2) DEFAULT 0,
    revenue_account_id    UUID NOT NULL,
    tracking_categories   JSONB,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id           UUID NOT NULL,
    invoice_number        VARCHAR(50) NOT NULL,
    reference             VARCHAR(100),
    invoice_date          DATE NOT NULL,
    due_date              DATE NOT NULL,
    currency              VARCHAR(3) NOT NULL,
    exchange_rate         DECIMAL(12, 6) DEFAULT 1.0,
    base_currency         VARCHAR(3) NOT NULL,
    subtotal              DECIMAL(15, 2) NOT NULL,
    tax_total             DECIMAL(15, 2) DEFAULT 0,
    total                 DECIMAL(15, 2) NOT NULL,
    amount_paid           DECIMAL(15, 2) DEFAULT 0,
    amount_due            DECIMAL(15, 2) NOT NULL,
    base_subtotal         DECIMAL(15, 2) NOT NULL,
    base_tax_total        DECIMAL(15, 2) DEFAULT 0,
    base_total            DECIMAL(15, 2) NOT NULL,
    base_amount_paid      DECIMAL(15, 2) DEFAULT 0,
    base_amount_due       DECIMAL(15, 2) NOT NULL,
    status                VARCHAR(50) DEFAULT 'draft',
    payment_url           VARCHAR(500),
    payment_gateway       VARCHAR(50),
    payment_gateway_id    VARCHAR(100),
    payment_terms         VARCHAR(50),
    notes                 TEXT,
    footer_text           TEXT,
    tracking_categories   JSONB,
    pdf_url               TEXT,
    sent_at               TIMESTAMPTZ,
    viewed_at             TIMESTAMPTZ,
    paid_at               TIMESTAMPTZ,
    journal_entry_id      UUID,
    is_recurring          BOOLEAN DEFAULT FALSE,
    recurring_schedule_id UUID,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE journal_entries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entry_number          VARCHAR(50) NOT NULL,
    entry_date            DATE NOT NULL,
    source_type           VARCHAR(50),
    source_id             UUID,
    description           TEXT NOT NULL,
    reference             VARCHAR(100),
    status                VARCHAR(50) DEFAULT 'posted',
    is_adjusting          BOOLEAN DEFAULT FALSE,
    accounting_period     VARCHAR(20),
    fiscal_year           INT,
    posted_at             TIMESTAMPTZ,
    posted_by             UUID,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE journal_entry_lines (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id              UUID NOT NULL,
    account_id            UUID NOT NULL,
    line_number           INT NOT NULL,
    currency              VARCHAR(3) NOT NULL,
    debit_amount          DECIMAL(15, 2) DEFAULT 0,
    credit_amount         DECIMAL(15, 2) DEFAULT 0,
    exchange_rate         DECIMAL(12, 6) DEFAULT 1.0,
    base_currency         VARCHAR(3) NOT NULL,
    base_debit_amount     DECIMAL(15, 2) DEFAULT 0,
    base_credit_amount    DECIMAL(15, 2) DEFAULT 0,
    department_id         UUID,
    location_id           UUID,
    tracking_categories   JSONB,
    description           TEXT,
    tax_amount            DECIMAL(15, 2) DEFAULT 0,
    tax_rate_id           UUID,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payment_allocations (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id            UUID NOT NULL,
    invoice_id            UUID,
    bill_id               UUID,
    amount                DECIMAL(15, 2) NOT NULL,
    base_amount           DECIMAL(15, 2) NOT NULL,
    fx_gain_loss          DECIMAL(15, 2) DEFAULT 0,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_number        VARCHAR(50),
    payment_date          DATE NOT NULL,
    reference             VARCHAR(100),
    customer_id           UUID,
    vendor_id             UUID,
    currency              VARCHAR(3) NOT NULL,
    amount                DECIMAL(15, 2) NOT NULL,
    exchange_rate         DECIMAL(12, 6) DEFAULT 1.0,
    base_amount           DECIMAL(15, 2) NOT NULL,
    payment_method        payment_method NOT NULL,
    payment_gateway       VARCHAR(50),
    payment_gateway_id    VARCHAR(100),
    gateway_fee           DECIMAL(15, 2) DEFAULT 0,
    bank_account_id       UUID,
    check_number          VARCHAR(50),
    status                VARCHAR(50) DEFAULT 'completed',
    notes                 TEXT,
    journal_entry_id      UUID,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

CREATE TABLE payroll_deduction_definitions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    deduction_code        VARCHAR(50) NOT NULL,
    deduction_name        VARCHAR(255) NOT NULL,
    description           TEXT,
    category              VARCHAR(50) NOT NULL,
    reduces_federal_taxable BOOLEAN DEFAULT FALSE,
    reduces_state_taxable BOOLEAN DEFAULT FALSE,
    reduces_fica_taxable  BOOLEAN DEFAULT FALSE,
    reduces_india_taxable BOOLEAN DEFAULT FALSE,
    has_annual_limit      BOOLEAN DEFAULT FALSE,
    annual_limit_amount   DECIMAL(12, 2),
    has_per_pay_limit     BOOLEAN DEFAULT FALSE,
    per_pay_limit_amount  DECIMAL(12, 2),
    calculation_method    VARCHAR(50),
    default_percentage    DECIMAL(5, 2),
    default_amount        DECIMAL(12, 2),
    has_employer_match    BOOLEAN DEFAULT FALSE,
    employer_match_config JSONB,
    priority_order        INT,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deduction_def_id      TEXT,
    deduction_type        TEXT,
    max_amount            NUMERIC(18,4),
    is_pretax             BOOLEAN,
    UNIQUE (tenant_id, deduction_def_id)
);

CREATE TABLE payroll_employee_deductions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    deduction_id          UUID NOT NULL,
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    deduction_type        VARCHAR(50) NOT NULL,
    percentage            DECIMAL(5, 2),
    amount                DECIMAL(12, 2),
    frequency             VARCHAR(50),
    employee_annual_limit DECIMAL(12, 2),
    ytd_deducted          DECIMAL(12, 2) DEFAULT 0,
    garnishment_case_number VARCHAR(100),
    garnishment_authority VARCHAR(255),
    garnishment_total_amount DECIMAL(12, 2),
    garnishment_amount_remaining DECIMAL(12, 2),
    is_active             BOOLEAN DEFAULT TRUE,
    suspended_from        DATE,
    suspended_to          DATE,
    suspension_reason     TEXT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    employee_deduction_id TEXT,
    deduction_def_id      UUID NOT NULL,
    calculation_method    TEXT,
    UNIQUE (tenant_id, employee_deduction_id)
);

CREATE TABLE payroll_india_salary_structure (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    annual_ctc            DECIMAL(12, 2) NOT NULL,
    currency              VARCHAR(3) DEFAULT 'INR',
    basic_salary          DECIMAL(12, 2) NOT NULL,
    dearness_allowance    DECIMAL(12, 2) DEFAULT 0,
    hra                   DECIMAL(12, 2),
    conveyance_allowance  DECIMAL(12, 2),
    special_allowance     DECIMAL(12, 2),
    medical_allowance     DECIMAL(12, 2),
    education_allowance   DECIMAL(12, 2),
    other_allowances      JSONB,
    performance_bonus     DECIMAL(12, 2),
    annual_bonus          DECIMAL(12, 2),
    mobile_reimbursement  DECIMAL(12, 2),
    internet_reimbursement DECIMAL(12, 2),
    employer_epf          DECIMAL(12, 2),
    employer_esi          DECIMAL(12, 2),
    employer_nps          DECIMAL(12, 2),
    gratuity              DECIMAL(12, 2),
    monthly_gross         DECIMAL(12, 2),
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payroll_india_tax_declarations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    financial_year        VARCHAR(10) NOT NULL,
    tax_regime            VARCHAR(20) NOT NULL,
    section_80c           DECIMAL(12, 2) DEFAULT 0,
    section_80d           DECIMAL(12, 2) DEFAULT 0,
    section_80e           DECIMAL(12, 2) DEFAULT 0,
    section_80g           DECIMAL(12, 2) DEFAULT 0,
    hra_exemption_claimed DECIMAL(12, 2),
    rent_paid_monthly     DECIMAL(12, 2),
    metro_city            BOOLEAN,
    home_loan_interest    DECIMAL(12, 2),
    lta_claimed           DECIMAL(12, 2),
    previous_employer_income DECIMAL(12, 2),
    previous_employer_tds DECIMAL(12, 2),
    documents             JSONB,
    status                VARCHAR(50) DEFAULT 'draft',
    submitted_at          TIMESTAMPTZ,
    verified_by           UUID,
    verified_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payroll_pay_schedules (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                  VARCHAR(255) NOT NULL,
    name_i18n             JSONB,
    frequency             VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'bi-weekly', 'semi-monthly', 'monthly')),
    anchor_date           DATE NOT NULL,
    timezone              VARCHAR(100) NOT NULL DEFAULT 'America/New_York',
    currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
    location_ids          UUID[],
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID,
    pay_day_of_week       TEXT CHECK (pay_day_of_week IN ( 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday' )),
    pay_day_of_month      INTEGER CHECK (pay_day_of_month BETWEEN 1 AND 31 OR pay_day_of_month = -1),
    pay_days_of_month     TEXT,
    adjust_for_holidays   BOOLEAN DEFAULT TRUE,
    holiday_adjustment    TEXT DEFAULT 'before' CHECK (holiday_adjustment IN ('before', 'after')),
    adjust_for_weekends   BOOLEAN DEFAULT TRUE,
    pay_period_days       INTEGER,
    is_default            BOOLEAN DEFAULT FALSE,
    configuration         TEXT DEFAULT '{}',
    next_pay_date         DATE,
    upcoming_pay_dates    TEXT DEFAULT '[]',
    description           TEXT,
    version               INTEGER DEFAULT 1
);

CREATE TABLE payroll_run_employees (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    payroll_run_id        UUID NOT NULL,
    employee_id           UUID NOT NULL,
    status                VARCHAR(50) DEFAULT 'pending',
    work_state            VARCHAR(2),
    work_country          VARCHAR(2) NOT NULL,
    resident_state        VARCHAR(2),
    regular_hours         DECIMAL(10, 2),
    overtime_hours        DECIMAL(10, 2),
    double_time_hours     DECIMAL(10, 2),
    pto_hours             DECIMAL(10, 2),
    earnings              JSONB NOT NULL,
    gross_pay             DECIMAL(12, 2) NOT NULL,
    pretax_deductions     JSONB,
    total_pretax_deductions DECIMAL(12, 2) DEFAULT 0,
    taxable_wages         JSONB NOT NULL,
    taxes                 JSONB NOT NULL,
    total_taxes           DECIMAL(12, 2) NOT NULL,
    employer_taxes        JSONB,
    posttax_deductions    JSONB,
    total_posttax_deductions DECIMAL(12, 2) DEFAULT 0,
    net_pay               DECIMAL(12, 2) NOT NULL,
    payment_method        payment_method,
    payment_details       JSONB,
    ytd_gross             DECIMAL(15, 2),
    ytd_federal_wages     DECIMAL(15, 2),
    ytd_federal_tax       DECIMAL(15, 2),
    ytd_ss_wages          DECIMAL(15, 2),
    ytd_ss_tax            DECIMAL(15, 2),
    ytd_medicare_wages    DECIMAL(15, 2),
    ytd_medicare_tax      DECIMAL(15, 2),
    ytd_state_wages       DECIMAL(15, 2),
    ytd_state_tax         DECIMAL(15, 2),
    ytd_gross_inr         DECIMAL(15, 2),
    ytd_tds               DECIMAL(15, 2),
    ytd_epf_employee      DECIMAL(15, 2),
    ytd_epf_employer      DECIMAL(15, 2),
    ytd_esi_employee      DECIMAL(15, 2),
    ytd_esi_employer      DECIMAL(15, 2),
    pay_stub_url          TEXT,
    pay_stub_generated_at TIMESTAMPTZ,
    calculation_details   JSONB,
    notes                 TEXT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    run_employee_id       TEXT,
    UNIQUE (tenant_id, run_employee_id)
);

-- NOTE: pay_period_id was removed (2026-08-27). It referenced a `pay_periods`
-- table that exists in neither source schema. Pay periods are currently derived
-- from payroll_pay_schedules + period_start/period_end. Revisit if explicit pay
-- period records are needed.
CREATE TABLE payroll_runs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    pay_period_start      DATE NOT NULL,
    pay_period_end        DATE NOT NULL,
    pay_date              DATE NOT NULL,
    run_type              VARCHAR(50) NOT NULL,
    run_status            VARCHAR(50) NOT NULL DEFAULT 'draft',
    country               VARCHAR(2) NOT NULL,
    pay_schedule_id       UUID,
    currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
    employee_count        INT,
    total_gross_pay       DECIMAL(15, 2),
    total_net_pay         DECIMAL(15, 2),
    total_taxes           DECIMAL(15, 2),
    total_deductions      DECIMAL(15, 2),
    calculated_at         TIMESTAMPTZ,
    calculated_by         UUID,
    approved_at           TIMESTAMPTZ,
    approved_by           UUID,
    finalized_at          TIMESTAMPTZ,
    finalized_by          UUID,
    payment_file_generated_at TIMESTAMPTZ,
    payment_file_url      TEXT,
    payment_submitted_at  TIMESTAMPTZ,
    notes                 TEXT,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    run_id                TEXT,
    run_number            TEXT,
    status                TEXT NOT NULL DEFAULT 'draft',
    processed_at          TIMESTAMPTZ,
    processed_by          TEXT,
    UNIQUE (tenant_id, run_id)
);

CREATE TABLE payroll_tax_deposits (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    deposit_type          VARCHAR(50) NOT NULL,
    jurisdiction          VARCHAR(50) NOT NULL,
    tax_period            VARCHAR(50),
    period_start          DATE,
    period_end            DATE,
    amount                DECIMAL(15, 2) NOT NULL,
    currency              VARCHAR(3) NOT NULL,
    due_date              DATE NOT NULL,
    payment_date          DATE,
    payment_method        payment_method,
    confirmation_number   VARCHAR(100),
    payment_status        payment_status,
    tax_breakdown         JSONB,
    related_payroll_runs  UUID[],
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    deposit_id            TEXT,
    deposit_date          DATE,
    tax_period_start      TEXT,
    tax_period_end        TEXT,
    total_amount          NUMERIC(18,4),
    status                TEXT,
    UNIQUE (tenant_id, deposit_id)
);

CREATE TABLE payroll_tax_rates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULLABLE by design: NULL = statutory rate shared by all tenants;
    -- non-NULL = a tenant-specific override. See SCHEMA-RECONCILIATION.md.
    tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,
    tax_name              VARCHAR(255) NOT NULL,
    tax_name_i18n         JSONB,
    tax_type              tax_type NOT NULL,
    rate                  DECIMAL(8, 5) NOT NULL,
    is_compound           BOOLEAN DEFAULT FALSE,
    components            JSONB,
    country_code          VARCHAR(2),
    region                VARCHAR(100),
    jurisdiction          VARCHAR(255),
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    tax_collected_account_id UUID,
    tax_paid_account_id   UUID,
    is_reverse_charge     BOOLEAN DEFAULT FALSE,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID,
    tax_rate_id           TEXT,
    country               TEXT NOT NULL,
    jurisdiction_type     TEXT NOT NULL,
    jurisdiction_code     TEXT,
    tax_year              INTEGER NOT NULL,
    rate_structure        JSONB NOT NULL,
    standard_deduction    NUMERIC(18,4),
    personal_exemption    NUMERIC(18,4),
    additional_threshold  NUMERIC(18,4),
    UNIQUE (tenant_id, tax_rate_id)
);

CREATE TABLE payroll_tax_withholding_certificates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    employee_id           UUID NOT NULL,
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    tax_year              INT NOT NULL,
    country               VARCHAR(2) NOT NULL,
    us_filing_status      VARCHAR(50),
    us_multiple_jobs      BOOLEAN,
    us_step2_amount       DECIMAL(12, 2),
    us_step3_dependents   DECIMAL(12, 2),
    us_step4a_other_income DECIMAL(12, 2),
    us_step4b_deductions  DECIMAL(12, 2),
    us_step4c_extra_withholding DECIMAL(12, 2),
    us_exempt             BOOLEAN DEFAULT FALSE,
    state_withholding     JSONB,
    india_tax_regime      india_tax_regime,
    india_section_declarations JSONB,
    india_previous_employer_income DECIMAL(15, 2),
    india_previous_employer_tds DECIMAL(15, 2),
    document_url          TEXT,
    submitted_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pm_automation_executions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    execution_id          TEXT,
    automation_id         UUID NOT NULL,
    triggered_at          TIMESTAMPTZ,
    execution_time_ms     INTEGER,
    triggered_by          TEXT NOT NULL,
    triggered_by_user_id  UUID,
    entity_type           TEXT NOT NULL,
    entity_id             UUID NOT NULL,
    trigger_data          JSONB DEFAULT '{}'::jsonb,
    execution_status      TEXT NOT NULL,
    actions_executed      INTEGER DEFAULT 0,
    actions_failed        INTEGER DEFAULT 0,
    error_message         TEXT,
    error_stack           TEXT,
    action_results        JSONB DEFAULT '[]'::jsonb,
    executed_at           TIMESTAMPTZ NOT NULL,
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, execution_id)
);

CREATE TABLE pm_automations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    automation_id         TEXT,
    scope                 TEXT NOT NULL,
    project_id            UUID,
    objective_id          UUID,
    automation_name       TEXT NOT NULL,
    description           TEXT,
    trigger               JSONB NOT NULL DEFAULT '{}'::jsonb,
    conditions            JSONB DEFAULT '[]'::jsonb,
    actions               JSONB NOT NULL DEFAULT '[]'::jsonb,
    action_delays         JSONB DEFAULT '[]'::jsonb,
    is_active             BOOLEAN DEFAULT TRUE,
    execution_count       INTEGER DEFAULT 0,
    last_executed_at      TIMESTAMPTZ,
    last_error            TEXT,
    suggested_by_ai       BOOLEAN DEFAULT FALSE,
    ai_confidence         NUMERIC(18,4),
    created_from_natural_language TEXT,
    max_executions_per_hour INTEGER DEFAULT 100,
    current_hour_executions INTEGER DEFAULT 0,
    current_hour_start    TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    UNIQUE (tenant_id, automation_id)
);

CREATE TABLE pm_dashboard_widgets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    widget_id             TEXT,
    dashboard_id          UUID NOT NULL,
    widget_type           TEXT NOT NULL,
    position_x            INTEGER NOT NULL,
    position_y            INTEGER NOT NULL,
    width                 INTEGER NOT NULL DEFAULT 4,
    height                INTEGER NOT NULL DEFAULT 3,
    widget_title          TEXT,
    data_sources          JSONB DEFAULT '{}'::jsonb,
    config                JSONB DEFAULT '{}'::jsonb,
    display_order         INTEGER DEFAULT 0,
    cache_updated_at      TIMESTAMPTZ,
    show_title            BOOLEAN DEFAULT TRUE,
    is_text_widget        BOOLEAN DEFAULT FALSE,
    cache_enabled         BOOLEAN DEFAULT TRUE,
    cached_data           JSONB,
    cached_at             TIMESTAMPTZ,
    cache_ttl_seconds     INTEGER DEFAULT 300,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    UNIQUE (tenant_id, widget_id)
);

CREATE TABLE pm_dashboards (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    dashboard_id          TEXT,
    scope                 TEXT NOT NULL,
    objective_id          UUID,
    dashboard_name        TEXT NOT NULL,
    description           TEXT,
    layout_type           TEXT DEFAULT 'grid',
    layout_config         JSONB DEFAULT '{}'::jsonb,
    widget_count          INTEGER DEFAULT 0,
    max_widgets           INTEGER DEFAULT 30,
    visibility            TEXT DEFAULT 'workspace',
    owner_employee_id     UUID,
    is_public             BOOLEAN DEFAULT FALSE,
    shared_with_users     JSONB DEFAULT '[]'::jsonb,
    shared_with_teams     JSONB DEFAULT '[]'::jsonb,
    auto_refresh_enabled  BOOLEAN DEFAULT TRUE,
    refresh_interval_seconds INTEGER DEFAULT 300,
    is_default            BOOLEAN DEFAULT FALSE,
    is_template           BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    last_viewed_at        TIMESTAMPTZ,
    view_count            INTEGER DEFAULT 0,
    UNIQUE (tenant_id, dashboard_id)
);

CREATE TABLE pm_objectives (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    objective_id          TEXT,
    objective_number      TEXT NOT NULL,
    objective_name        TEXT NOT NULL,
    description           TEXT,
    vision_statement      TEXT,
    objective_type        TEXT NOT NULL DEFAULT 'general',
    client_id             UUID,
    primary_contact_id    UUID,
    department_code       TEXT,
    owner_employee_id     UUID,
    team_members          JSONB DEFAULT '[]'::jsonb,
    start_date            DATE,
    target_end_date       DATE,
    fiscal_year           TEXT,
    quarter               TEXT,
    status                TEXT NOT NULL DEFAULT 'planning',
    health_status         TEXT NOT NULL DEFAULT 'on_track',
    progress_percentage   NUMERIC(18,4) DEFAULT 0.00,
    target_revenue        NUMERIC(18,4),
    actual_revenue        NUMERIC(18,4) DEFAULT 0.00,
    target_profit_margin  NUMERIC(18,4),
    actual_profit_margin  NUMERIC(18,4),
    currency              TEXT DEFAULT 'USD',
    kpis                  JSONB DEFAULT '[]'::jsonb,
    success_criteria      TEXT,
    color                 TEXT,
    icon                  TEXT,
    default_dashboard_id  UUID,
    is_visible_to_clients BOOLEAN DEFAULT FALSE,
    is_archived           BOOLEAN DEFAULT FALSE,
    custom_fields         JSONB DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    updated_by            TEXT,
    archived_at           TIMESTAMPTZ,
    UNIQUE (tenant_id, objective_id)
);

CREATE TABLE pm_project_templates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id           TEXT,
    name                  TEXT NOT NULL,
    description           TEXT,
    category              TEXT,
    template_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_public             BOOLEAN DEFAULT FALSE,
    use_count             INTEGER DEFAULT 0,
    estimated_duration_days INTEGER,
    estimated_hours       NUMERIC(18,4),
    estimated_budget      NUMERIC(18,4),
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    UNIQUE (tenant_id, template_id)
);

CREATE TABLE pm_task_attachments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attachment_id         TEXT,
    task_id               UUID,
    project_id            UUID NOT NULL,
    file_name             TEXT NOT NULL,
    file_url              TEXT NOT NULL,
    file_size_bytes       INTEGER,
    mime_type             TEXT,
    file_type             TEXT,
    file_extension        TEXT,
    attachment_type       TEXT,
    version_number        INTEGER DEFAULT 1,
    parent_attachment_id  UUID,
    is_latest_version     BOOLEAN DEFAULT TRUE,
    client_visible        BOOLEAN DEFAULT FALSE,
    requires_approval     BOOLEAN DEFAULT FALSE,
    uploaded_by           TEXT NOT NULL,
    uploaded_at           TIMESTAMPTZ NOT NULL,
    description           TEXT,
    UNIQUE (tenant_id, attachment_id)
);

CREATE TABLE pm_task_comments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    comment_id            TEXT,
    task_id               UUID NOT NULL,
    project_id            UUID NOT NULL,
    comment_type          TEXT DEFAULT 'comment',
    comment_text          TEXT,
    author_type           TEXT NOT NULL,
    author_employee_id    UUID,
    author_client_id      UUID,
    mentioned_users       JSONB DEFAULT '[]'::jsonb,
    attachment_ids        JSONB DEFAULT '[]'::jsonb,
    parent_comment_id     UUID,
    is_internal           BOOLEAN DEFAULT FALSE,
    is_pinned             BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    edited_at             TIMESTAMPTZ,
    deleted_at            TIMESTAMPTZ,
    UNIQUE (tenant_id, comment_id)
);

CREATE TABLE pm_task_time_entries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    time_entry_id         TEXT,
    task_id               UUID NOT NULL,
    project_id            UUID NOT NULL,
    employee_id           UUID NOT NULL,
    start_time            TIMESTAMPTZ NOT NULL,
    end_time              TIMESTAMPTZ,
    duration_minutes      INTEGER,
    is_manual_entry       BOOLEAN DEFAULT FALSE,
    entry_date            DATE NOT NULL,
    hours                 NUMERIC(18,4),
    is_billable           BOOLEAN DEFAULT TRUE,
    hourly_rate           NUMERIC(18,4),
    amount                NUMERIC(18,4),
    notes                 TEXT,
    status                TEXT DEFAULT 'draft',
    approved_by           TEXT,
    approved_at           TIMESTAMPTZ,
    invoice_id            UUID,
    invoice_line_item_id  UUID,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, time_entry_id)
);

CREATE TABLE projects (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id            TEXT,
    project_number        TEXT NOT NULL,
    project_name          TEXT NOT NULL,
    objective_id          UUID,
    parent_project_id     UUID,
    description           TEXT,
    project_type          project_type NOT NULL DEFAULT 'client_project',
    client_id             UUID,
    contact_person_id     UUID,
    service_type          TEXT,
    industry              TEXT,
    tags                  JSONB DEFAULT '[]'::jsonb,
    project_manager_id    UUID,
    team_members          JSONB DEFAULT '[]'::jsonb,
    department_code       TEXT,
    location_code         TEXT,
    start_date            DATE,
    target_end_date       DATE,
    actual_start_date     DATE,
    actual_end_date       DATE,
    status                TEXT NOT NULL DEFAULT 'draft',
    priority              TEXT NOT NULL DEFAULT 'medium',
    progress_percentage   NUMERIC(18,4) DEFAULT 0.00,
    health_status         TEXT NOT NULL DEFAULT 'on_track',
    budget_type           budget_type,
    budget                NUMERIC(18,4),
    estimated_hours       NUMERIC(18,4),
    actual_hours          NUMERIC(18,4) DEFAULT 0.00,
    actual_cost           NUMERIC(18,4) DEFAULT 0.00,
    currency              TEXT DEFAULT 'USD',
    billing_method        billing_method,
    hourly_rate           NUMERIC(18,4),
    is_billable           BOOLEAN DEFAULT TRUE,
    total_billed          NUMERIC(18,4) DEFAULT 0.00,
    proposal_id           UUID,
    contract_id           UUID,
    is_template           BOOLEAN DEFAULT FALSE,
    template_id           UUID,
    is_recurring          BOOLEAN DEFAULT FALSE,
    recurrence_rule       JSONB DEFAULT '{}'::jsonb,
    client_visible        BOOLEAN DEFAULT FALSE,
    client_can_comment    BOOLEAN DEFAULT FALSE,
    client_approval_required BOOLEAN DEFAULT FALSE,
    notify_on_status_change BOOLEAN DEFAULT TRUE,
    notify_on_task_completion BOOLEAN DEFAULT FALSE,
    color                 TEXT,
    icon                  TEXT,
    default_view          TEXT DEFAULT 'kanban',
    has_custom_columns    BOOLEAN DEFAULT FALSE,
    column_config_version INTEGER DEFAULT 1,
    custom_fields         JSONB DEFAULT '{}'::jsonb,
    hourly_rate_override  NUMERIC(18,4),
    task_count            INTEGER DEFAULT 0,
    completed_task_count  INTEGER DEFAULT 0,
    last_activity_at      TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    updated_by            TEXT,
    archived_at           TIMESTAMPTZ,
    UNIQUE (tenant_id, project_id)
);

CREATE TABLE tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id               TEXT,
    task_number           TEXT NOT NULL,
    project_id            UUID NOT NULL,
    parent_task_id        UUID,
    task_name             TEXT NOT NULL,
    position              INTEGER,
    depth_level           INTEGER DEFAULT 0,
    description           TEXT,
    task_type             task_type DEFAULT 'task',
    status                TEXT NOT NULL DEFAULT 'todo',
    priority              TEXT DEFAULT 'medium',
    assigned_to           TEXT,
    assigned_team_id      UUID,
    role_required         TEXT,
    start_date            DATE,
    due_date              DATE,
    completed_date        DATE,
    estimated_hours       NUMERIC(18,4),
    actual_hours          NUMERIC(18,4) DEFAULT 0.00,
    progress_percentage   NUMERIC(18,4) DEFAULT 0.00,
    budget                NUMERIC(18,4),
    actual_cost           NUMERIC(18,4),
    board_column          TEXT,
    board_position        INTEGER,
    is_billable           BOOLEAN DEFAULT TRUE,
    billable_hours        NUMERIC(18,4) DEFAULT 0.00,
    non_billable_hours    NUMERIC(18,4) DEFAULT 0.00,
    hourly_rate           NUMERIC(18,4),
    depends_on_task_ids   JSONB DEFAULT '[]'::jsonb,
    blocks_task_ids       JSONB DEFAULT '[]'::jsonb,
    has_deliverable       BOOLEAN DEFAULT FALSE,
    deliverable_type      TEXT,
    deliverable_url       TEXT,
    client_visible        BOOLEAN DEFAULT FALSE,
    requires_client_approval BOOLEAN DEFAULT FALSE,
    client_approved_at    TIMESTAMPTZ,
    client_approved_by    TEXT,
    attachment_count      INTEGER DEFAULT 0,
    checklist_items       JSONB DEFAULT '[]'::jsonb,
    is_recurring          BOOLEAN DEFAULT FALSE,
    recurrence_rule       JSONB DEFAULT '{}'::jsonb,
    recurrence_parent_id  UUID,
    tags                  JSONB DEFAULT '[]'::jsonb,
    labels                JSONB DEFAULT '[]'::jsonb,
    custom_fields         JSONB DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    completed_at          TIMESTAMPTZ,
    created_by            TEXT NOT NULL,
    updated_by            TEXT,
    UNIQUE (tenant_id, task_id)
);

CREATE TABLE ticketing_attachments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attachment_id         TEXT,
    ticket_id             UUID,
    ticket_number         TEXT NOT NULL,
    update_id             UUID,
    file_name             TEXT NOT NULL,
    file_url              TEXT NOT NULL,
    file_size_bytes       INTEGER,
    file_size             INTEGER NOT NULL,
    mime_type             TEXT NOT NULL,
    storage_key           TEXT NOT NULL,
    storage_url           TEXT,
    uploaded_by           TEXT NOT NULL,
    uploaded_by_name      TEXT,
    uploaded_at           TIMESTAMPTZ NOT NULL,
    description           TEXT,
    UNIQUE (tenant_id, attachment_id)
);

CREATE TABLE ticketing_business_areas (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    prefix                TEXT,
    name                  TEXT NOT NULL,
    description           TEXT,
    active                BOOLEAN DEFAULT TRUE,
    current_sequence      INTEGER DEFAULT 0,
    -- Defaults were multi-line JSON seed blobs in the D1 source; seed content
    -- belongs in seed data, not in a column default.
    categories            JSONB NOT NULL DEFAULT '[]'::jsonb,
    custom_fields         JSONB NOT NULL DEFAULT '{}'::jsonb,
    roles                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings              JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active             BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, prefix)
);

CREATE TABLE ticketing_tickets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_area_id      UUID,
    ticket_number         TEXT,
    prefix                TEXT NOT NULL,
    sequence_number       INTEGER NOT NULL,
    title                 TEXT NOT NULL,
    description           TEXT,
    subject               TEXT NOT NULL,
    category              TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'Pending',
    priority              TEXT,
    severity              TEXT NOT NULL DEFAULT 'medium',
    request_type          TEXT NOT NULL DEFAULT 'support',
    private               BOOLEAN DEFAULT FALSE,
    due_date              DATE NOT NULL,
    logged_at             TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    resolved_at           TIMESTAMPTZ,
    closed_at             TIMESTAMPTZ,
    reported_by           TEXT,
    reported_by_name      TEXT,
    reported_by_email     TEXT,
    logger_id             UUID NOT NULL,
    last_updated_by       TEXT NOT NULL,
    closed_by             TEXT,
    assignees             JSONB DEFAULT '[]'::jsonb,
    subscribers           JSONB DEFAULT '[]'::jsonb,
    resolution_notes      TEXT,
    is_public             BOOLEAN,
    internal_summary      TEXT,
    external_summary      TEXT,
    custom_fields         JSONB DEFAULT '{}'::jsonb,
    parent_ticket_number  TEXT,
    linked_tickets        JSONB DEFAULT '[]'::jsonb,
    tasks                 JSONB DEFAULT '[]'::jsonb,
    version               INTEGER DEFAULT 1,
    tags                  JSONB DEFAULT '[]'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, ticket_number)
);

CREATE TABLE ticketing_updates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    update_id             TEXT,
    ticket_id             UUID,
    ticket_number         TEXT NOT NULL,
    update_type           TEXT,
    author_employee_id    UUID,
    author_name           TEXT,
    author_id             UUID NOT NULL,
    comment_text          TEXT,
    content_html          TEXT,
    content_text          TEXT,
    visibility            TEXT DEFAULT 'external',
    created_at            TIMESTAMPTZ NOT NULL,
    edited_at             TIMESTAMPTZ,
    edited_by             TEXT,
    changes               JSONB DEFAULT '{}'::jsonb,
    attachments           JSONB,
    is_internal           BOOLEAN DEFAULT FALSE,
    UNIQUE (tenant_id, update_id)
);

CREATE TABLE time_tracking_billable_expenses (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    expense_id            TEXT,
    employee_id           UUID NOT NULL,
    project_id            UUID,
    client_id             UUID,
    expense_date          DATE NOT NULL,
    description           TEXT NOT NULL,
    expense_type          TEXT,
    category              TEXT,
    amount                NUMERIC(18,4) NOT NULL,
    currency              TEXT DEFAULT 'USD',
    markup_percentage     NUMERIC(18,4) DEFAULT 0.00,
    markup_amount         NUMERIC(18,4) DEFAULT 0.00,
    billable_amount       NUMERIC(18,4) NOT NULL,
    has_receipt           BOOLEAN DEFAULT FALSE,
    receipt_url           TEXT,
    receipt_attachment_id UUID,
    is_billable           BOOLEAN DEFAULT TRUE,
    is_reimbursable       BOOLEAN DEFAULT FALSE,
    status                TEXT DEFAULT 'draft',
    approved_by           TEXT,
    approved_at           TIMESTAMPTZ,
    submitted_at          TIMESTAMPTZ,
    invoice_id            UUID,
    invoiced_at           TIMESTAMPTZ,
    reimbursed_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant_id, expense_id)
);

CREATE TABLE time_tracking_entries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entry_id              TEXT,
    employee_id           UUID NOT NULL,
    timesheet_id          UUID,
    project_id            UUID,
    task_id               UUID,
    client_id             UUID,
    entry_date            DATE NOT NULL,
    start_time            TIMESTAMPTZ,
    end_time              TIMESTAMPTZ,
    duration_minutes      INTEGER,
    duration_hours        NUMERIC(18,4),
    hours                 NUMERIC(18,4) NOT NULL,
    entry_type            TEXT DEFAULT 'timer',
    is_running            BOOLEAN DEFAULT FALSE,
    description           TEXT NOT NULL,
    internal_notes        TEXT,
    is_billable           BOOLEAN DEFAULT TRUE,
    hourly_rate           NUMERIC(18,4),
    billable_amount       NUMERIC(18,4),
    amount                NUMERIC(18,4),
    currency              TEXT DEFAULT 'USD',
    rate_source           TEXT,
    activity_type         activity_type,
    tags                  JSONB,
    status                TEXT DEFAULT 'draft',
    submitted_at          TIMESTAMPTZ,
    submitted_to          TEXT,
    approved_by           TEXT,
    approved_at           TIMESTAMPTZ,
    rejection_reason      TEXT,
    invoice_id            UUID,
    invoice_line_item_id  UUID,
    invoiced_at           TIMESTAMPTZ,
    is_locked             BOOLEAN DEFAULT FALSE,
    locked_at             TIMESTAMPTZ,
    locked_by             TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    created_by            TEXT,
    updated_by            TEXT,
    UNIQUE (tenant_id, entry_id)
);

CREATE TABLE time_tracking_timesheets (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timesheet_number      TEXT,
    employee_id           UUID NOT NULL,
    period_type           period_type NOT NULL,
    period_start          TEXT NOT NULL,
    period_end            TEXT NOT NULL,
    total_hours           NUMERIC(18,4) DEFAULT 0.00,
    billable_hours        NUMERIC(18,4) DEFAULT 0.00,
    non_billable_hours    NUMERIC(18,4) DEFAULT 0.00,
    total_amount          NUMERIC(18,4) DEFAULT 0.00,
    entry_count           INTEGER DEFAULT 0,
    status                TEXT DEFAULT 'draft',
    submitted_at          TIMESTAMPTZ,
    submitted_to          TEXT,
    approved_by           TEXT,
    approved_at           TIMESTAMPTZ,
    rejection_reason      TEXT,
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    notes                 TEXT,
    UNIQUE (tenant_id, id)
);

CREATE TABLE vendors (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor_number         VARCHAR(50),
    vendor_name           VARCHAR(255) NOT NULL,
    display_name          VARCHAR(255),
    email                 VARCHAR(255),
    phone                 VARCHAR(20),
    website               VARCHAR(255),
    address               JSONB,
    currency              VARCHAR(3) NOT NULL,
    payment_terms         VARCHAR(50) DEFAULT 'Net 30',
    tax_number            VARCHAR(100),
    is_1099_vendor        BOOLEAN DEFAULT FALSE,
    ap_account_id         UUID,
    bank_account_number   VARCHAR(255),
    bank_routing_number   VARCHAR(255),
    bank_name             VARCHAR(255),
    is_active             BOOLEAN DEFAULT TRUE,
    notes                 TEXT,
    custom_fields         JSONB,
    created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by            UUID,
    updated_by            UUID
);

-- =============================================================================
-- SECTION 2 — PLATFORM TABLES
-- Added after both source schemas were written. See ADR-008 and
-- ../06-customization-model.md
-- =============================================================================

-- Tenant membership. Supabase Auth owns identity (auth.users); this table owns
-- which tenants a user belongs to and in what role. A user may belong to more
-- than one tenant, so an active tenant is tracked and switching re-issues the
-- JWT. This is unpleasant to retrofit, hence its presence from day one.
CREATE TABLE tenant_users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL,          -- auth.users.id
    employee_id           UUID,                   -- FK added after employees
    role                  TEXT NOT NULL DEFAULT 'member',
    permissions           JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    is_default_tenant     BOOLEAN NOT NULL DEFAULT FALSE,
    invited_at            TIMESTAMPTZ,
    accepted_at           TIMESTAMPTZ,
    last_active_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_tenant_users_user ON tenant_users (user_id) WHERE is_active;

-- Tier 2 customization: definitions that make custom_fields JSONB renderable,
-- validatable and reportable. Values live in each entity's custom_fields column.
CREATE TABLE custom_field_definitions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type           TEXT NOT NULL,    -- 'employee' | 'task' | 'project' | 'ticket'
    field_key             TEXT NOT NULL,    -- the JSONB key
    label                 TEXT NOT NULL,
    label_i18n            JSONB,
    help_text             TEXT,
    display_order         INT NOT NULL DEFAULT 0,
    field_group           TEXT,
    data_type             TEXT NOT NULL
        CHECK (data_type IN ('text','number','date','boolean','select','multiselect')),
    options               JSONB,            -- [{value,label,label_i18n}]
    is_required           BOOLEAN NOT NULL DEFAULT FALSE,
    validation            JSONB,            -- {min,max,minLength,maxLength,pattern}
    default_value         JSONB,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, entity_type, field_key)
);
CREATE INDEX idx_cfd_tenant_entity
    ON custom_field_definitions (tenant_id, entity_type, display_order)
    WHERE is_active;

-- Tier 3 customization: behaviour settings, namespaced by module. Defaults live
-- in code; only deviations are stored, so a new setting ships with a sensible
-- value for every existing tenant without a data migration.
CREATE TABLE tenant_settings (
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    namespace             TEXT NOT NULL,    -- 'accounting' | 'expenses' | ...
    key                   TEXT NOT NULL,
    value                 JSONB NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by            UUID,
    PRIMARY KEY (tenant_id, namespace, key)
);

-- Background jobs (ADR-002). Replaces Bull/BullMQ and Redis. Claimed with
-- SELECT ... FOR UPDATE SKIP LOCKED by the worker process.
CREATE TABLE jobs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_type              TEXT NOT NULL,    -- 'payroll_run' | 'export' | ...
    payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
    status                TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','running','succeeded','failed','cancelled')),
    priority              INT NOT NULL DEFAULT 100,
    attempts              INT NOT NULL DEFAULT 0,
    max_attempts          INT NOT NULL DEFAULT 3,
    run_after             TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ,
    last_error            TEXT,
    result                JSONB,
    created_by            UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_claim ON jobs (status, run_after, priority)
    WHERE status = 'pending';
CREATE INDEX idx_jobs_tenant ON jobs (tenant_id, status, created_at DESC);

-- Audit log (product-specification.md: comprehensive audit logging).
CREATE TABLE audit_log (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_user_id         UUID,
    actor_employee_id     UUID,
    action                TEXT NOT NULL,    -- 'create' | 'update' | 'delete' | ...
    entity_type           TEXT NOT NULL,
    entity_id             UUID,
    module                TEXT,
    changes               JSONB,            -- {field: {from, to}}
    ip_address            INET,
    user_agent            TEXT,
    occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_time  ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX idx_audit_tenant_entity ON audit_log (tenant_id, entity_type, entity_id);

-- Database-backed translations (product-specification.md i18n).
-- Read once and cached in process; no Redis.
CREATE TABLE translations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,
    locale                TEXT NOT NULL,
    namespace             TEXT NOT NULL DEFAULT 'app',
    key                   TEXT NOT NULL,
    value                 TEXT NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, locale, namespace, key)
);

-- Polymorphic cross-module links (cross-module-integration-plan.md,
-- "Universal Linking Schema"). Strong links use real FKs; this covers the
-- polymorphic case only.
CREATE TABLE cross_module_links (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_module         TEXT NOT NULL,
    source_entity_type    TEXT NOT NULL,
    source_entity_id      UUID NOT NULL,
    target_module         TEXT NOT NULL,
    target_entity_type    TEXT NOT NULL,
    target_entity_id      UUID NOT NULL,
    link_type             TEXT NOT NULL DEFAULT 'reference',
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by            UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cml_source
    ON cross_module_links (tenant_id, source_entity_type, source_entity_id);
CREATE INDEX idx_cml_target
    ON cross_module_links (tenant_id, target_entity_type, target_entity_id);

-- =============================================================================
-- SECTION 4 — RESTORED TABLES
-- Removed by the D1 v6.0 "SMB optimization" pass and absent from the Postgres
-- source. Each carried real capability. See SCHEMA-RECONCILIATION.md §Restored.
-- =============================================================================

-- RESTORED: hr_time_off_balances
-- D1 inlined this to employees.pto_balances (JSONB), losing per-policy accrual,
-- carryover and expiry tracking. Leave balances are a balance-sheet liability
-- and a common source of dispute; they need a ledger, not a mutable blob.
-- employees.pto_balances is retained as a display cache only.
CREATE TABLE hr_time_off_balances (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id           UUID NOT NULL,
    policy_id             UUID NOT NULL,
    accrual_year          INT  NOT NULL,
    opening_balance       NUMERIC(10,2) NOT NULL DEFAULT 0,
    accrued               NUMERIC(10,2) NOT NULL DEFAULT 0,
    used                  NUMERIC(10,2) NOT NULL DEFAULT 0,
    pending               NUMERIC(10,2) NOT NULL DEFAULT 0,
    adjusted              NUMERIC(10,2) NOT NULL DEFAULT 0,
    carried_over          NUMERIC(10,2) NOT NULL DEFAULT 0,
    carryover_expires_on  DATE,
    forfeited             NUMERIC(10,2) NOT NULL DEFAULT 0,
    current_balance       NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit                  TEXT NOT NULL DEFAULT 'days'
        CHECK (unit IN ('days','hours')),
    last_accrual_at       TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, employee_id, policy_id, accrual_year)
);

-- RESTORED: hr_goals
-- D1 inlined this to hr_reviews.goals (JSONB), which prevents goals from
-- spanning review cycles and severs the link to pm_objectives that
-- cross-module-integration-plan.md treats as an integration point.
CREATE TABLE hr_goals (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id           UUID NOT NULL,
    review_id             UUID,             -- optional: goal may outlive a cycle
    objective_id          UUID,             -- optional: alignment to pm_objectives
    goal_title            TEXT NOT NULL,
    goal_title_i18n       JSONB,
    description           TEXT,
    category              TEXT,             -- 'performance' | 'development' | ...
    measurement_type      TEXT NOT NULL DEFAULT 'percentage'
        CHECK (measurement_type IN ('percentage','numeric','boolean','milestone')),
    target_value          NUMERIC(18,4),
    current_value         NUMERIC(18,4),
    unit                  TEXT,
    weight                NUMERIC(5,2),     -- contribution to overall rating
    status                TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft','active','achieved','missed','cancelled')),
    progress_percentage   NUMERIC(5,2) NOT NULL DEFAULT 0,
    start_date            DATE,
    target_date           DATE,
    completed_at          TIMESTAMPTZ,
    created_by            UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RESTORED: time_tracking_hourly_rates
-- D1 inlined this to employees.default_hourly_rate + projects.hourly_rate_override,
-- losing effective dating and per-client / per-role rate cards. An invoice for
-- January work must bill at January's rate. Professional-services firms (the
-- Phase 1B target) also need per-client rates.
-- The inline defaults on employees/projects remain as fallback.
CREATE TABLE time_tracking_hourly_rates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id           UUID,             -- NULL = applies to a role, not a person
    client_id             UUID,             -- NULL = default for all clients
    project_id            UUID,             -- NULL = all projects for the client
    role_code             TEXT,             -- rate card by role
    cost_rate             NUMERIC(18,4),    -- what the employee costs us
    billable_rate         NUMERIC(18,4),    -- what the client is charged
    currency              VARCHAR(3) NOT NULL DEFAULT 'USD',
    effective_from        DATE NOT NULL,
    effective_to          DATE,
    -- NOT the compensation `change_reason` enum. Free-text rate-card reason.
    change_reason         TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_by            UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX idx_tthr_lookup
    ON time_tracking_hourly_rates (tenant_id, employee_id, client_id, effective_from DESC)
    WHERE is_active;

-- =============================================================================
-- SECTION 9 — MODULE COVERAGE ADDITIONS (2026-08-27)
-- =============================================================================
-- Added after auditing all 13 module specifications against the schema. Each
-- table below closes a gap where a Phase 1 requirement had no storage.
-- Rationale per table; user stories cited where they exist.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee bank accounts — module-payroll.md FR-PAY-005, US-PAY-010
-- -----------------------------------------------------------------------------
-- Gap: the schema had no employee banking at all. bank_accounts holds the
-- COMPANY's accounts (accounting module) and vendors holds vendor banking, so
-- payroll had no way to pay anyone.
--
-- Supports ACH (US), NEFT/RTGS (India) and SEPA, plus split deposits across
-- multiple accounts by percentage or fixed amount.
CREATE TABLE employee_bank_accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id           UUID NOT NULL,

    account_holder_name   TEXT NOT NULL,
    bank_name             TEXT NOT NULL,
    branch_name           TEXT,
    country               VARCHAR(2) NOT NULL,
    currency              VARCHAR(3) NOT NULL,
    -- NOTE: deliberately NOT the accounting `account_type` enum. Same column
    -- name, unrelated concept (bank account kind vs. ledger account class).
    account_type          TEXT NOT NULL DEFAULT 'checking'
        CHECK (account_type IN ('checking','savings','paycard')),

    -- Account identifiers. Store only the encrypted value plus a display mask;
    -- see "Sensitive Data Encryption" in architecture-technical.md.
    account_number_encrypted TEXT NOT NULL,
    account_number_last4  VARCHAR(4),
    routing_number        TEXT,             -- US ABA
    ifsc_code             TEXT,             -- India
    sort_code             TEXT,             -- UK
    iban                  TEXT,             -- SEPA
    bic_swift             TEXT,

    -- Split deposits: exactly one primary; others take a percentage or a fixed
    -- amount, and the primary receives the remainder.
    is_primary            BOOLEAN NOT NULL DEFAULT FALSE,
    allocation_type       TEXT NOT NULL DEFAULT 'remainder'
        CHECK (allocation_type IN ('remainder','percentage','fixed_amount')),
    allocation_value      NUMERIC(12,2),
    priority              INT NOT NULL DEFAULT 1,

    -- Prenote (zero-dollar verification) per FR-PAY-005
    verification_status   TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified','prenote_sent','verified','failed')),
    prenote_sent_at       TIMESTAMPTZ,
    verified_at           TIMESTAMPTZ,

    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from        DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to          DATE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,

    CHECK (allocation_type = 'remainder' OR allocation_value IS NOT NULL),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Exactly one primary account per employee at a time.
CREATE UNIQUE INDEX idx_emp_bank_primary
    ON employee_bank_accounts (tenant_id, employee_id)
    WHERE is_primary AND is_active;
CREATE INDEX idx_emp_bank_employee
    ON employee_bank_accounts (tenant_id, employee_id, priority)
    WHERE is_active;

-- -----------------------------------------------------------------------------
-- Employment history — module-hr.md US-HR-007/008/010/011, FR-HR-003
-- -----------------------------------------------------------------------------
-- Gap: compensation_base gave effective-dated SALARY history, but job title,
-- level, department, manager and location existed only as current values on
-- employees. "Record a job change (promotion, transfer, department change)"
-- and "view my full employment history" had no storage.
--
-- One row per change, holding both sides so the record stays readable even if
-- a department or title is later renamed.
CREATE TABLE hr_employment_history (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id           UUID NOT NULL,

    effective_date        DATE NOT NULL,
    change_type           TEXT NOT NULL
        CHECK (change_type IN ('hire','promotion','lateral_move','demotion',
                               'transfer','title_change','manager_change',
                               'location_change','fte_change','status_change',
                               'compensation_change','rehire','termination')),

    -- Previous state (NULL on hire)
    previous_job_title    TEXT,
    previous_job_level    TEXT,
    previous_department_code TEXT,
    previous_manager_id   UUID,
    previous_location_code TEXT,
    previous_employment_type employment_type,
    previous_fte          NUMERIC(4,2),

    -- New state
    job_title             TEXT,
    job_level             TEXT,
    department_code       TEXT,
    manager_id            UUID,
    location_code         TEXT,
    new_employment_type   employment_type,
    fte                   NUMERIC(4,2),

    -- Compensation at the time of the change. The authoritative record is
    -- compensation_base; this is denormalized for the history view so it can be
    -- rendered without a temporal join.
    compensation_id       UUID,
    compensation_amount   NUMERIC(18,2),
    compensation_currency VARCHAR(3),
    compensation_type     compensation_type,

    -- US-HR-011: reasons drive compensation-trend analysis
    reason                TEXT NOT NULL
        CHECK (reason IN ('new_hire','promotion','cost_of_living','market_adjustment',
                          'merit_increase','reorganization','employee_request',
                          'performance','role_change','relocation','other')),
    reason_notes          TEXT,

    approved_by           UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID
);

CREATE INDEX idx_emp_history_employee
    ON hr_employment_history (tenant_id, employee_id, effective_date DESC);
CREATE INDEX idx_emp_history_type
    ON hr_employment_history (tenant_id, change_type, effective_date DESC);

-- -----------------------------------------------------------------------------
-- Onboarding templates — module-hr.md FR-HR-009
-- -----------------------------------------------------------------------------
-- Gap: hr_onboarding_tasks.template_data held a per-employee COPY of whatever
-- template was applied, so templates could not be maintained centrally.
-- "Onboarding tasks auto-created from template on hire" needs a definition.
CREATE TABLE hr_onboarding_templates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_code         TEXT NOT NULL,
    template_name         TEXT NOT NULL,
    template_name_i18n    JSONB,
    description           TEXT,

    -- Which new hires this template applies to; NULL = all
    applies_to_department_code TEXT,
    applies_to_location_code   TEXT,
    applies_to_employment_types JSONB NOT NULL DEFAULT '[]'::jsonb,

    is_default            BOOLEAN NOT NULL DEFAULT FALSE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,

    UNIQUE (tenant_id, template_code)
);

CREATE TABLE hr_onboarding_template_tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id           UUID NOT NULL,

    task_name             TEXT NOT NULL,
    task_name_i18n        JSONB,
    description           TEXT,

    -- FR-HR-009 task types
    -- NOT the project `task_type` enum (bug/feature/milestone). Onboarding task kind.
    task_type             TEXT NOT NULL
        CHECK (task_type IN ('document_upload','form_completion','training',
                             'meeting','equipment_request','e_signature',
                             'i9_verification','policy_acknowledgment','other')),

    -- FR-HR-009 phases
    phase                 TEXT NOT NULL DEFAULT 'first_day'
        CHECK (phase IN ('pre_boarding','first_day','first_week',
                         'first_30_days','first_60_days','first_90_days')),

    -- Who it lands on; resolved to a person when the template is applied
    assignee_role         TEXT NOT NULL DEFAULT 'employee'
        CHECK (assignee_role IN ('employee','hr','manager','buddy','it','facilities')),

    -- Days relative to start date; negative = before starting
    due_offset_days       INT NOT NULL DEFAULT 0,
    sort_order            INT NOT NULL DEFAULT 0,
    is_required           BOOLEAN NOT NULL DEFAULT TRUE,
    reminder_days_before  INT,
    task_config           JSONB NOT NULL DEFAULT '{}'::jsonb,

    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_tmpl_tasks
    ON hr_onboarding_template_tasks (tenant_id, template_id, phase, sort_order)
    WHERE is_active;

-- -----------------------------------------------------------------------------
-- Company news — module-hr.md FR-HR-011 (Company News Feed widget)
-- -----------------------------------------------------------------------------
-- Note: birthdays and work anniversaries are DERIVED from employees.birth_date
-- and employees.start_date and need no table — see v_upcoming_celebrations
-- below. Privacy controls already live in employees.celebration_preferences.
-- What genuinely had no home was announcements and recognition posts.
CREATE TABLE hr_company_news (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    title                 TEXT NOT NULL,
    title_i18n            JSONB,
    body                  TEXT NOT NULL,
    body_i18n             JSONB,
    summary               TEXT,

    post_type             TEXT NOT NULL DEFAULT 'announcement'
        CHECK (post_type IN ('announcement','recognition','event','policy_update','milestone')),

    -- Audience; NULL means everyone
    audience_department_code TEXT,
    audience_location_code   TEXT,
    audience_group_id     UUID,

    -- Recognition posts reference the person being recognized
    subject_employee_id   UUID,

    -- Events carry a date; announcements do not
    event_date            DATE,
    event_location        TEXT,

    is_pinned             BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at            TIMESTAMPTZ,
    status                TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft','published','archived')),

    attachments           JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    author_employee_id    UUID
);

CREATE INDEX idx_company_news_feed
    ON hr_company_news (tenant_id, publish_at DESC)
    WHERE status = 'published';

-- =============================================================================
-- SECTION 5 — ROW-LEVEL SECURITY (ADR-003)
-- =============================================================================
-- Isolation is enforced by the database, not by remembering to filter.
--
-- FORCE is essential: without it, RLS is silently bypassed by the table owner,
-- which is exactly how a system that "has RLS" turns out not to. The
-- application must connect as a NON-OWNER role.
--
--   CREATE ROLE app_user LOGIN PASSWORD '...';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--

ALTER TABLE firm_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_locations
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_departments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_departments
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_job_titles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_job_titles
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_job_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_job_levels FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_job_levels
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employees
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON accounting_periods
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_accounts
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE bank_reconciliation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_reconciliation_rules
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bank_transactions
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bill_lines
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bills
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chart_of_accounts
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clients
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE compensation_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_allowances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compensation_allowances
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE compensation_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_base FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compensation_base
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE compensation_equity ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_equity FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compensation_equity
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE compensation_premiums ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_premiums FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compensation_premiums
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE compensation_variable ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_variable FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compensation_variable
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE compensation_work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_work_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compensation_work_schedules
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customers
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employee_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_assets
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employee_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_certifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_certifications
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employee_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_group_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_group_members
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employee_group_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_group_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_group_roles
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employee_training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_training_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_training_records
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employee_user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_user_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_user_groups
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE employment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_terms FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employment_terms
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON expenses
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_benefit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_benefit_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_benefit_items
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_benefits_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_benefits_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_benefits_packages
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_benefits_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_benefits_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_benefits_plans
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_holidays FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_holidays
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE firm_payroll_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_payroll_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON firm_payroll_policies
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_attendance
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_benefits_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_benefits_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_benefits_enrollments
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_change_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_change_requests
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_emergency_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_emergency_contacts
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_employee_documents
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_feedback
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_onboarding_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_onboarding_tasks
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_review_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_review_cycles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_review_cycles
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_reviews
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_survey_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_survey_responses
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_surveys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_surveys
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_time_off_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_time_off_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_time_off_policies
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_time_off_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_time_off_requests
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoice_lines
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_entries
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_entry_lines
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_allocations
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payments
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_deduction_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deduction_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_deduction_definitions
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_employee_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employee_deductions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_employee_deductions
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_india_salary_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_india_salary_structure FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_india_salary_structure
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_india_tax_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_india_tax_declarations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_india_tax_declarations
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_pay_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_pay_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_pay_schedules
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_run_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_run_employees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_run_employees
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_runs
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_tax_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_tax_deposits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_tax_deposits
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_tax_rates FORCE ROW LEVEL SECURITY;
-- Statutory rates (tenant_id IS NULL) are visible to every tenant but writable
-- only by the service role; overrides behave like any other tenant-owned row.
CREATE POLICY tenant_isolation ON payroll_tax_rates
    USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_tax_withholding_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_tax_withholding_certificates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_tax_withholding_certificates
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_automation_executions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_automation_executions
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_automations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_automations
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_dashboard_widgets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_dashboard_widgets
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_dashboards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_dashboards
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_objectives FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_objectives
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_project_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_project_templates
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_task_attachments
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_task_comments
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE pm_task_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_task_time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pm_task_time_entries
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE ticketing_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_attachments
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE ticketing_business_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_business_areas FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_business_areas
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE ticketing_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_tickets
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE ticketing_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_updates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_updates
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE time_tracking_billable_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking_billable_expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON time_tracking_billable_expenses
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE time_tracking_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON time_tracking_entries
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE time_tracking_timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking_timesheets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON time_tracking_timesheets
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vendors
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_users
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_field_definitions
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_settings
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON jobs
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations FORCE ROW LEVEL SECURITY;
-- NULL tenant_id = platform-supplied base translations, visible to all tenants.
CREATE POLICY tenant_isolation ON translations
    USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE cross_module_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_module_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cross_module_links
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_time_off_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_time_off_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_time_off_balances
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_goals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_goals
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE time_tracking_hourly_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking_hourly_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON time_tracking_hourly_rates
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());


-- tenants: a user sees only tenants they belong to.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants
    USING (id = app.current_tenant_id());

-- exchange_rates is global reference data: readable by all, written by service role.
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY exchange_rates_read ON exchange_rates FOR SELECT USING (true);



-- RLS for the module-coverage additions (SECTION 9)

ALTER TABLE employee_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_bank_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_bank_accounts
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_employment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_employment_history
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_onboarding_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_onboarding_templates
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_onboarding_template_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_onboarding_template_tasks
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE hr_company_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_company_news FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON hr_company_news
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- =============================================================================
-- SECTION 6 — INDEXES (ADR-003 rule 2: tenant_id LEADS every index)
-- =============================================================================

CREATE INDEX idx_firm_locations_is_active ON firm_locations (tenant_id, is_active);
CREATE INDEX idx_firm_locations_holiday_calendar_id ON firm_locations (tenant_id, holiday_calendar_id);
CREATE INDEX idx_firm_locations_created ON firm_locations (tenant_id, created_at DESC);
CREATE INDEX idx_firm_departments_parent_department_id ON firm_departments (tenant_id, parent_department_id);
CREATE INDEX idx_firm_departments_code ON firm_departments (tenant_id, code);
CREATE INDEX idx_firm_departments_location_id ON firm_departments (tenant_id, location_id);
CREATE INDEX idx_firm_departments_head_employee_id ON firm_departments (tenant_id, head_employee_id);
CREATE INDEX idx_firm_departments_created ON firm_departments (tenant_id, created_at DESC);
CREATE INDEX idx_firm_job_titles_is_active ON firm_job_titles (tenant_id, is_active);
CREATE INDEX idx_firm_job_titles_created ON firm_job_titles (tenant_id, created_at DESC);
CREATE INDEX idx_firm_job_levels_job_title_id ON firm_job_levels (tenant_id, job_title_id);
CREATE INDEX idx_firm_job_levels_created ON firm_job_levels (tenant_id, created_at DESC);
CREATE INDEX idx_employees_employee_id ON employees (tenant_id, employee_id);
CREATE INDEX idx_employees_ssn_tax_id ON employees (tenant_id, ssn_tax_id);
CREATE INDEX idx_employees_employment_status ON employees (tenant_id, employment_status);
CREATE INDEX idx_employees_manager_id ON employees (tenant_id, manager_id);
CREATE INDEX idx_employees_created ON employees (tenant_id, created_at DESC);
CREATE INDEX idx_accounting_periods_status ON accounting_periods (tenant_id, status);
CREATE INDEX idx_accounting_periods_created ON accounting_periods (tenant_id, created_at DESC);
CREATE INDEX idx_bank_accounts_gl_account_id ON bank_accounts (tenant_id, gl_account_id);
CREATE INDEX idx_bank_accounts_feed_connection_id ON bank_accounts (tenant_id, feed_connection_id);
CREATE INDEX idx_bank_accounts_is_active ON bank_accounts (tenant_id, is_active);
CREATE INDEX idx_bank_accounts_created ON bank_accounts (tenant_id, created_at DESC);
CREATE INDEX idx_bank_reconciliation_rules_bank_account_id ON bank_reconciliation_rules (tenant_id, bank_account_id);
CREATE INDEX idx_bank_reconciliation_rules_is_active ON bank_reconciliation_rules (tenant_id, is_active);
CREATE INDEX idx_bank_reconciliation_rules_category_account_id ON bank_reconciliation_rules (tenant_id, category_account_id);
CREATE INDEX idx_bank_reconciliation_rules_vendor_id ON bank_reconciliation_rules (tenant_id, vendor_id);
CREATE INDEX idx_bank_reconciliation_rules_created ON bank_reconciliation_rules (tenant_id, created_at DESC);
CREATE INDEX idx_bank_transactions_bank_account_id ON bank_transactions (tenant_id, bank_account_id);
CREATE INDEX idx_bank_transactions_category_account_id ON bank_transactions (tenant_id, category_account_id);
CREATE INDEX idx_bank_transactions_status ON bank_transactions (tenant_id, status);
CREATE INDEX idx_bank_transactions_matched_to_id ON bank_transactions (tenant_id, matched_to_id);
CREATE INDEX idx_bank_transactions_created ON bank_transactions (tenant_id, created_at DESC);
CREATE INDEX idx_bill_lines_bill_id ON bill_lines (tenant_id, bill_id);
CREATE INDEX idx_bill_lines_tax_rate_id ON bill_lines (tenant_id, tax_rate_id);
CREATE INDEX idx_bill_lines_expense_account_id ON bill_lines (tenant_id, expense_account_id);
CREATE INDEX idx_bill_lines_created ON bill_lines (tenant_id, created_at DESC);
CREATE INDEX idx_bills_vendor_id ON bills (tenant_id, vendor_id);
CREATE INDEX idx_bills_status ON bills (tenant_id, status);
CREATE INDEX idx_bills_journal_entry_id ON bills (tenant_id, journal_entry_id);
CREATE INDEX idx_bills_created ON bills (tenant_id, created_at DESC);
CREATE INDEX idx_chart_of_accounts_parent_account_id ON chart_of_accounts (tenant_id, parent_account_id);
CREATE INDEX idx_chart_of_accounts_is_active ON chart_of_accounts (tenant_id, is_active);
CREATE INDEX idx_chart_of_accounts_tax_rate_id ON chart_of_accounts (tenant_id, tax_rate_id);
CREATE INDEX idx_chart_of_accounts_created ON chart_of_accounts (tenant_id, created_at DESC);
CREATE INDEX idx_clients_status ON clients (tenant_id, status);
CREATE INDEX idx_clients_is_active ON clients (tenant_id, is_active);
CREATE INDEX idx_clients_tax_id ON clients (tenant_id, tax_id);
CREATE INDEX idx_clients_account_manager_id ON clients (tenant_id, account_manager_id);
CREATE INDEX idx_clients_created ON clients (tenant_id, created_at DESC);
CREATE INDEX idx_compensation_allowances_employee_id ON compensation_allowances (tenant_id, employee_id);
CREATE INDEX idx_compensation_allowances_allowance_id ON compensation_allowances (tenant_id, allowance_id);
CREATE INDEX idx_compensation_allowances_status ON compensation_allowances (tenant_id, status);
CREATE INDEX idx_compensation_allowances_created ON compensation_allowances (tenant_id, created_at DESC);
CREATE INDEX idx_compensation_base_employee_id ON compensation_base (tenant_id, employee_id);
CREATE INDEX idx_compensation_base_created ON compensation_base (tenant_id, created_at DESC);
CREATE INDEX idx_compensation_equity_employee_id ON compensation_equity (tenant_id, employee_id);
CREATE INDEX idx_compensation_equity_status ON compensation_equity (tenant_id, status);
CREATE INDEX idx_compensation_equity_equity_id ON compensation_equity (tenant_id, equity_id);
CREATE INDEX idx_compensation_equity_created ON compensation_equity (tenant_id, created_at DESC);
CREATE INDEX idx_compensation_premiums_employee_id ON compensation_premiums (tenant_id, employee_id);
CREATE INDEX idx_compensation_premiums_premium_id ON compensation_premiums (tenant_id, premium_id);
CREATE INDEX idx_compensation_premiums_status ON compensation_premiums (tenant_id, status);
CREATE INDEX idx_compensation_premiums_created ON compensation_premiums (tenant_id, created_at DESC);
CREATE INDEX idx_compensation_variable_employee_id ON compensation_variable (tenant_id, employee_id);
CREATE INDEX idx_compensation_variable_variable_comp_id ON compensation_variable (tenant_id, variable_comp_id);
CREATE INDEX idx_compensation_variable_status ON compensation_variable (tenant_id, status);
CREATE INDEX idx_compensation_variable_created ON compensation_variable (tenant_id, created_at DESC);
CREATE INDEX idx_compensation_work_schedules_employee_id ON compensation_work_schedules (tenant_id, employee_id);
CREATE INDEX idx_compensation_work_schedules_schedule_id ON compensation_work_schedules (tenant_id, schedule_id);
CREATE INDEX idx_compensation_work_schedules_is_active ON compensation_work_schedules (tenant_id, is_active);
CREATE INDEX idx_compensation_work_schedules_created ON compensation_work_schedules (tenant_id, created_at DESC);
CREATE INDEX idx_customers_tax_rate_id ON customers (tenant_id, tax_rate_id);
CREATE INDEX idx_customers_ar_account_id ON customers (tenant_id, ar_account_id);
CREATE INDEX idx_customers_is_active ON customers (tenant_id, is_active);
CREATE INDEX idx_customers_created ON customers (tenant_id, created_at DESC);
CREATE INDEX idx_employee_assets_asset_id ON employee_assets (tenant_id, asset_id);
CREATE INDEX idx_employee_assets_employee_id ON employee_assets (tenant_id, employee_id);
CREATE INDEX idx_employee_assets_created ON employee_assets (tenant_id, created_at DESC);
CREATE INDEX idx_employee_certifications_certification_id ON employee_certifications (tenant_id, certification_id);
CREATE INDEX idx_employee_certifications_employee_id ON employee_certifications (tenant_id, employee_id);
CREATE INDEX idx_employee_certifications_status ON employee_certifications (tenant_id, status);
CREATE INDEX idx_employee_certifications_created ON employee_certifications (tenant_id, created_at DESC);
CREATE INDEX idx_employee_group_members_employee_id ON employee_group_members (tenant_id, employee_id);
CREATE INDEX idx_employee_group_roles_group_role_id ON employee_group_roles (tenant_id, group_role_id);
CREATE INDEX idx_employee_training_records_training_record_id ON employee_training_records (tenant_id, training_record_id);
CREATE INDEX idx_employee_training_records_employee_id ON employee_training_records (tenant_id, employee_id);
CREATE INDEX idx_employee_training_records_status ON employee_training_records (tenant_id, status);
CREATE INDEX idx_employee_training_records_created ON employee_training_records (tenant_id, created_at DESC);
CREATE INDEX idx_employee_user_groups_approver_id ON employee_user_groups (tenant_id, approver_id);
CREATE INDEX idx_employee_user_groups_backup_approver_id ON employee_user_groups (tenant_id, backup_approver_id);
CREATE INDEX idx_employee_user_groups_is_active ON employee_user_groups (tenant_id, is_active);
CREATE INDEX idx_employee_user_groups_created ON employee_user_groups (tenant_id, created_at DESC);
CREATE INDEX idx_employment_terms_employee_id ON employment_terms (tenant_id, employee_id);
CREATE INDEX idx_employment_terms_created ON employment_terms (tenant_id, created_at DESC);
CREATE INDEX idx_expenses_employee_id ON expenses (tenant_id, employee_id);
CREATE INDEX idx_expenses_vendor_id ON expenses (tenant_id, vendor_id);
CREATE INDEX idx_expenses_category_account_id ON expenses (tenant_id, category_account_id);
CREATE INDEX idx_expenses_bill_id ON expenses (tenant_id, bill_id);
CREATE INDEX idx_expenses_created ON expenses (tenant_id, created_at DESC);
CREATE INDEX idx_firm_benefit_items_benefits_package_id ON firm_benefit_items (tenant_id, benefits_package_id);
CREATE INDEX idx_firm_benefit_items_created ON firm_benefit_items (tenant_id, created_at DESC);
CREATE INDEX idx_firm_benefits_packages_is_active ON firm_benefits_packages (tenant_id, is_active);
CREATE INDEX idx_firm_benefits_packages_created ON firm_benefits_packages (tenant_id, created_at DESC);
CREATE INDEX idx_firm_benefits_plans_is_active ON firm_benefits_plans (tenant_id, is_active);
CREATE INDEX idx_firm_benefits_plans_created ON firm_benefits_plans (tenant_id, created_at DESC);
CREATE INDEX idx_firm_holidays_location_id ON firm_holidays (tenant_id, location_id);
CREATE INDEX idx_firm_holidays_holiday_id ON firm_holidays (tenant_id, holiday_id);
CREATE INDEX idx_firm_holidays_created ON firm_holidays (tenant_id, created_at DESC);
CREATE INDEX idx_firm_payroll_policies_location_id ON firm_payroll_policies (tenant_id, location_id);
CREATE INDEX idx_firm_payroll_policies_created ON firm_payroll_policies (tenant_id, created_at DESC);
CREATE INDEX idx_hr_attendance_attendance_id ON hr_attendance (tenant_id, attendance_id);
CREATE INDEX idx_hr_attendance_employee_id ON hr_attendance (tenant_id, employee_id);
CREATE INDEX idx_hr_attendance_status ON hr_attendance (tenant_id, status);
CREATE INDEX idx_hr_attendance_created ON hr_attendance (tenant_id, created_at DESC);
CREATE INDEX idx_hr_benefits_enrollments_enrollment_id ON hr_benefits_enrollments (tenant_id, enrollment_id);
CREATE INDEX idx_hr_benefits_enrollments_employee_id ON hr_benefits_enrollments (tenant_id, employee_id);
CREATE INDEX idx_hr_benefits_enrollments_status ON hr_benefits_enrollments (tenant_id, status);
CREATE INDEX idx_hr_benefits_enrollments_created ON hr_benefits_enrollments (tenant_id, created_at DESC);
CREATE INDEX idx_hr_change_requests_request_id ON hr_change_requests (tenant_id, request_id);
CREATE INDEX idx_hr_change_requests_status ON hr_change_requests (tenant_id, status);
CREATE INDEX idx_hr_change_requests_created ON hr_change_requests (tenant_id, created_at DESC);
CREATE INDEX idx_hr_emergency_contacts_contact_id ON hr_emergency_contacts (tenant_id, contact_id);
CREATE INDEX idx_hr_emergency_contacts_employee_id ON hr_emergency_contacts (tenant_id, employee_id);
CREATE INDEX idx_hr_emergency_contacts_created ON hr_emergency_contacts (tenant_id, created_at DESC);
CREATE INDEX idx_hr_employee_documents_document_id ON hr_employee_documents (tenant_id, document_id);
CREATE INDEX idx_hr_employee_documents_employee_id ON hr_employee_documents (tenant_id, employee_id);
CREATE INDEX idx_hr_employee_documents_status ON hr_employee_documents (tenant_id, status);
CREATE INDEX idx_hr_employee_documents_created ON hr_employee_documents (tenant_id, created_at DESC);
CREATE INDEX idx_hr_feedback_feedback_id ON hr_feedback (tenant_id, feedback_id);
CREATE INDEX idx_hr_feedback_from_employee_id ON hr_feedback (tenant_id, from_employee_id);
CREATE INDEX idx_hr_feedback_to_employee_id ON hr_feedback (tenant_id, to_employee_id);
CREATE INDEX idx_hr_feedback_status ON hr_feedback (tenant_id, status);
CREATE INDEX idx_hr_feedback_created ON hr_feedback (tenant_id, created_at DESC);
CREATE INDEX idx_hr_onboarding_tasks_task_id ON hr_onboarding_tasks (tenant_id, task_id);
CREATE INDEX idx_hr_onboarding_tasks_employee_id ON hr_onboarding_tasks (tenant_id, employee_id);
CREATE INDEX idx_hr_onboarding_tasks_assigned_to_employee_id ON hr_onboarding_tasks (tenant_id, assigned_to_employee_id);
CREATE INDEX idx_hr_onboarding_tasks_status ON hr_onboarding_tasks (tenant_id, status);
CREATE INDEX idx_hr_onboarding_tasks_created ON hr_onboarding_tasks (tenant_id, created_at DESC);
CREATE INDEX idx_hr_review_cycles_status ON hr_review_cycles (tenant_id, status);
CREATE INDEX idx_hr_review_cycles_is_active ON hr_review_cycles (tenant_id, is_active);
CREATE INDEX idx_hr_review_cycles_created ON hr_review_cycles (tenant_id, created_at DESC);
CREATE INDEX idx_hr_reviews_review_id ON hr_reviews (tenant_id, review_id);
CREATE INDEX idx_hr_reviews_employee_id ON hr_reviews (tenant_id, employee_id);
CREATE INDEX idx_hr_reviews_reviewer_id ON hr_reviews (tenant_id, reviewer_id);
CREATE INDEX idx_hr_reviews_status ON hr_reviews (tenant_id, status);
CREATE INDEX idx_hr_reviews_created ON hr_reviews (tenant_id, created_at DESC);
CREATE INDEX idx_hr_survey_responses_response_id ON hr_survey_responses (tenant_id, response_id);
CREATE INDEX idx_hr_survey_responses_survey_id ON hr_survey_responses (tenant_id, survey_id);
CREATE INDEX idx_hr_survey_responses_respondent_id ON hr_survey_responses (tenant_id, respondent_id);
CREATE INDEX idx_hr_survey_responses_created ON hr_survey_responses (tenant_id, created_at DESC);
CREATE INDEX idx_hr_surveys_survey_id ON hr_surveys (tenant_id, survey_id);
CREATE INDEX idx_hr_surveys_status ON hr_surveys (tenant_id, status);
CREATE INDEX idx_hr_surveys_created ON hr_surveys (tenant_id, created_at DESC);
CREATE INDEX idx_hr_time_off_policies_template_id ON hr_time_off_policies (tenant_id, template_id);
CREATE INDEX idx_hr_time_off_policies_is_active ON hr_time_off_policies (tenant_id, is_active);
CREATE INDEX idx_hr_time_off_policies_created ON hr_time_off_policies (tenant_id, created_at DESC);
CREATE INDEX idx_hr_time_off_requests_request_id ON hr_time_off_requests (tenant_id, request_id);
CREATE INDEX idx_hr_time_off_requests_employee_id ON hr_time_off_requests (tenant_id, employee_id);
CREATE INDEX idx_hr_time_off_requests_status ON hr_time_off_requests (tenant_id, status);
CREATE INDEX idx_hr_time_off_requests_approver_id ON hr_time_off_requests (tenant_id, approver_id);
CREATE INDEX idx_invoice_lines_invoice_id ON invoice_lines (tenant_id, invoice_id);
CREATE INDEX idx_invoice_lines_tax_rate_id ON invoice_lines (tenant_id, tax_rate_id);
CREATE INDEX idx_invoice_lines_revenue_account_id ON invoice_lines (tenant_id, revenue_account_id);
CREATE INDEX idx_invoice_lines_created ON invoice_lines (tenant_id, created_at DESC);
CREATE INDEX idx_invoices_customer_id ON invoices (tenant_id, customer_id);
CREATE INDEX idx_invoices_status ON invoices (tenant_id, status);
CREATE INDEX idx_invoices_payment_gateway_id ON invoices (tenant_id, payment_gateway_id);
CREATE INDEX idx_invoices_journal_entry_id ON invoices (tenant_id, journal_entry_id);
CREATE INDEX idx_invoices_created ON invoices (tenant_id, created_at DESC);
CREATE INDEX idx_journal_entries_source_id ON journal_entries (tenant_id, source_id);
CREATE INDEX idx_journal_entries_status ON journal_entries (tenant_id, status);
CREATE INDEX idx_journal_entries_created ON journal_entries (tenant_id, created_at DESC);
CREATE INDEX idx_journal_entry_lines_entry_id ON journal_entry_lines (tenant_id, entry_id);
CREATE INDEX idx_journal_entry_lines_account_id ON journal_entry_lines (tenant_id, account_id);
CREATE INDEX idx_journal_entry_lines_department_id ON journal_entry_lines (tenant_id, department_id);
CREATE INDEX idx_journal_entry_lines_location_id ON journal_entry_lines (tenant_id, location_id);
CREATE INDEX idx_journal_entry_lines_created ON journal_entry_lines (tenant_id, created_at DESC);
CREATE INDEX idx_payment_allocations_payment_id ON payment_allocations (tenant_id, payment_id);
CREATE INDEX idx_payment_allocations_invoice_id ON payment_allocations (tenant_id, invoice_id);
CREATE INDEX idx_payment_allocations_bill_id ON payment_allocations (tenant_id, bill_id);
CREATE INDEX idx_payment_allocations_created ON payment_allocations (tenant_id, created_at DESC);
CREATE INDEX idx_payments_customer_id ON payments (tenant_id, customer_id);
CREATE INDEX idx_payments_vendor_id ON payments (tenant_id, vendor_id);
CREATE INDEX idx_payments_payment_gateway_id ON payments (tenant_id, payment_gateway_id);
CREATE INDEX idx_payments_bank_account_id ON payments (tenant_id, bank_account_id);
CREATE INDEX idx_payments_created ON payments (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_deduction_definitions_is_active ON payroll_deduction_definitions (tenant_id, is_active);
CREATE INDEX idx_payroll_deduction_definitions_deduction_def_id ON payroll_deduction_definitions (tenant_id, deduction_def_id);
CREATE INDEX idx_payroll_deduction_definitions_created ON payroll_deduction_definitions (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_employee_deductions_employee_id ON payroll_employee_deductions (tenant_id, employee_id);
CREATE INDEX idx_payroll_employee_deductions_deduction_id ON payroll_employee_deductions (tenant_id, deduction_id);
CREATE INDEX idx_payroll_employee_deductions_is_active ON payroll_employee_deductions (tenant_id, is_active);
CREATE INDEX idx_payroll_employee_deductions_employee_deduction_id ON payroll_employee_deductions (tenant_id, employee_deduction_id);
CREATE INDEX idx_payroll_employee_deductions_created ON payroll_employee_deductions (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_india_salary_structure_employee_id ON payroll_india_salary_structure (tenant_id, employee_id);
CREATE INDEX idx_payroll_india_salary_structure_created ON payroll_india_salary_structure (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_india_tax_declarations_employee_id ON payroll_india_tax_declarations (tenant_id, employee_id);
CREATE INDEX idx_payroll_india_tax_declarations_status ON payroll_india_tax_declarations (tenant_id, status);
CREATE INDEX idx_payroll_india_tax_declarations_created ON payroll_india_tax_declarations (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_pay_schedules_is_active ON payroll_pay_schedules (tenant_id, is_active);
CREATE INDEX idx_payroll_pay_schedules_created ON payroll_pay_schedules (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_run_employees_payroll_run_id ON payroll_run_employees (tenant_id, payroll_run_id);
CREATE INDEX idx_payroll_run_employees_employee_id ON payroll_run_employees (tenant_id, employee_id);
CREATE INDEX idx_payroll_run_employees_status ON payroll_run_employees (tenant_id, status);
CREATE INDEX idx_payroll_run_employees_run_employee_id ON payroll_run_employees (tenant_id, run_employee_id);
CREATE INDEX idx_payroll_run_employees_created ON payroll_run_employees (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_runs_pay_schedule_id ON payroll_runs (tenant_id, pay_schedule_id);
CREATE INDEX idx_payroll_runs_run_id ON payroll_runs (tenant_id, run_id);
CREATE INDEX idx_payroll_runs_status ON payroll_runs (tenant_id, status);
CREATE INDEX idx_payroll_runs_created ON payroll_runs (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_tax_deposits_deposit_id ON payroll_tax_deposits (tenant_id, deposit_id);
CREATE INDEX idx_payroll_tax_deposits_status ON payroll_tax_deposits (tenant_id, status);
CREATE INDEX idx_payroll_tax_deposits_created ON payroll_tax_deposits (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_tax_rates_tax_collected_account_id ON payroll_tax_rates (tenant_id, tax_collected_account_id);
CREATE INDEX idx_payroll_tax_rates_tax_paid_account_id ON payroll_tax_rates (tenant_id, tax_paid_account_id);
CREATE INDEX idx_payroll_tax_rates_is_active ON payroll_tax_rates (tenant_id, is_active);
CREATE INDEX idx_payroll_tax_rates_tax_rate_id ON payroll_tax_rates (tenant_id, tax_rate_id);
CREATE INDEX idx_payroll_tax_rates_created ON payroll_tax_rates (tenant_id, created_at DESC);
CREATE INDEX idx_payroll_tax_withholding_certificates_employee_id ON payroll_tax_withholding_certificates (tenant_id, employee_id);
CREATE INDEX idx_payroll_tax_withholding_certificates_created ON payroll_tax_withholding_certificates (tenant_id, created_at DESC);
CREATE INDEX idx_pm_automation_executions_execution_id ON pm_automation_executions (tenant_id, execution_id);
CREATE INDEX idx_pm_automation_executions_automation_id ON pm_automation_executions (tenant_id, automation_id);
CREATE INDEX idx_pm_automation_executions_triggered_by_user_id ON pm_automation_executions (tenant_id, triggered_by_user_id);
CREATE INDEX idx_pm_automation_executions_entity_id ON pm_automation_executions (tenant_id, entity_id);
CREATE INDEX idx_pm_automation_executions_created ON pm_automation_executions (tenant_id, created_at DESC);
CREATE INDEX idx_pm_automations_automation_id ON pm_automations (tenant_id, automation_id);
CREATE INDEX idx_pm_automations_project_id ON pm_automations (tenant_id, project_id);
CREATE INDEX idx_pm_automations_objective_id ON pm_automations (tenant_id, objective_id);
CREATE INDEX idx_pm_automations_is_active ON pm_automations (tenant_id, is_active);
CREATE INDEX idx_pm_automations_created ON pm_automations (tenant_id, created_at DESC);
CREATE INDEX idx_pm_dashboard_widgets_widget_id ON pm_dashboard_widgets (tenant_id, widget_id);
CREATE INDEX idx_pm_dashboard_widgets_dashboard_id ON pm_dashboard_widgets (tenant_id, dashboard_id);
CREATE INDEX idx_pm_dashboard_widgets_created ON pm_dashboard_widgets (tenant_id, created_at DESC);
CREATE INDEX idx_pm_dashboards_dashboard_id ON pm_dashboards (tenant_id, dashboard_id);
CREATE INDEX idx_pm_dashboards_objective_id ON pm_dashboards (tenant_id, objective_id);
CREATE INDEX idx_pm_dashboards_owner_employee_id ON pm_dashboards (tenant_id, owner_employee_id);
CREATE INDEX idx_pm_dashboards_created ON pm_dashboards (tenant_id, created_at DESC);
CREATE INDEX idx_pm_objectives_objective_id ON pm_objectives (tenant_id, objective_id);
CREATE INDEX idx_pm_objectives_client_id ON pm_objectives (tenant_id, client_id);
CREATE INDEX idx_pm_objectives_primary_contact_id ON pm_objectives (tenant_id, primary_contact_id);
CREATE INDEX idx_pm_objectives_owner_employee_id ON pm_objectives (tenant_id, owner_employee_id);
CREATE INDEX idx_pm_objectives_created ON pm_objectives (tenant_id, created_at DESC);
CREATE INDEX idx_pm_project_templates_template_id ON pm_project_templates (tenant_id, template_id);
CREATE INDEX idx_pm_project_templates_created ON pm_project_templates (tenant_id, created_at DESC);
CREATE INDEX idx_pm_task_attachments_attachment_id ON pm_task_attachments (tenant_id, attachment_id);
CREATE INDEX idx_pm_task_attachments_task_id ON pm_task_attachments (tenant_id, task_id);
CREATE INDEX idx_pm_task_attachments_project_id ON pm_task_attachments (tenant_id, project_id);
CREATE INDEX idx_pm_task_attachments_parent_attachment_id ON pm_task_attachments (tenant_id, parent_attachment_id);
CREATE INDEX idx_pm_task_comments_comment_id ON pm_task_comments (tenant_id, comment_id);
CREATE INDEX idx_pm_task_comments_task_id ON pm_task_comments (tenant_id, task_id);
CREATE INDEX idx_pm_task_comments_project_id ON pm_task_comments (tenant_id, project_id);
CREATE INDEX idx_pm_task_comments_author_employee_id ON pm_task_comments (tenant_id, author_employee_id);
CREATE INDEX idx_pm_task_comments_created ON pm_task_comments (tenant_id, created_at DESC);
CREATE INDEX idx_pm_task_time_entries_time_entry_id ON pm_task_time_entries (tenant_id, time_entry_id);
CREATE INDEX idx_pm_task_time_entries_task_id ON pm_task_time_entries (tenant_id, task_id);
CREATE INDEX idx_pm_task_time_entries_project_id ON pm_task_time_entries (tenant_id, project_id);
CREATE INDEX idx_pm_task_time_entries_employee_id ON pm_task_time_entries (tenant_id, employee_id);
CREATE INDEX idx_pm_task_time_entries_created ON pm_task_time_entries (tenant_id, created_at DESC);
CREATE INDEX idx_projects_project_id ON projects (tenant_id, project_id);
CREATE INDEX idx_projects_objective_id ON projects (tenant_id, objective_id);
CREATE INDEX idx_projects_parent_project_id ON projects (tenant_id, parent_project_id);
CREATE INDEX idx_projects_client_id ON projects (tenant_id, client_id);
CREATE INDEX idx_projects_created ON projects (tenant_id, created_at DESC);
CREATE INDEX idx_tasks_task_id ON tasks (tenant_id, task_id);
CREATE INDEX idx_tasks_project_id ON tasks (tenant_id, project_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks (tenant_id, parent_task_id);
CREATE INDEX idx_tasks_status ON tasks (tenant_id, status);
CREATE INDEX idx_tasks_created ON tasks (tenant_id, created_at DESC);
CREATE INDEX idx_ticketing_attachments_attachment_id ON ticketing_attachments (tenant_id, attachment_id);
CREATE INDEX idx_ticketing_attachments_ticket_id ON ticketing_attachments (tenant_id, ticket_id);
CREATE INDEX idx_ticketing_attachments_update_id ON ticketing_attachments (tenant_id, update_id);
CREATE INDEX idx_ticketing_business_areas_is_active ON ticketing_business_areas (tenant_id, is_active);
CREATE INDEX idx_ticketing_business_areas_created ON ticketing_business_areas (tenant_id, created_at DESC);
CREATE INDEX idx_ticketing_tickets_business_area_id ON ticketing_tickets (tenant_id, business_area_id);
CREATE INDEX idx_ticketing_tickets_status ON ticketing_tickets (tenant_id, status);
CREATE INDEX idx_ticketing_tickets_logger_id ON ticketing_tickets (tenant_id, logger_id);
CREATE INDEX idx_ticketing_tickets_created ON ticketing_tickets (tenant_id, created_at DESC);
CREATE INDEX idx_ticketing_updates_update_id ON ticketing_updates (tenant_id, update_id);
CREATE INDEX idx_ticketing_updates_ticket_id ON ticketing_updates (tenant_id, ticket_id);
CREATE INDEX idx_ticketing_updates_author_employee_id ON ticketing_updates (tenant_id, author_employee_id);
CREATE INDEX idx_ticketing_updates_author_id ON ticketing_updates (tenant_id, author_id);
CREATE INDEX idx_ticketing_updates_created ON ticketing_updates (tenant_id, created_at DESC);
CREATE INDEX idx_time_tracking_billable_expenses_expense_id ON time_tracking_billable_expenses (tenant_id, expense_id);
CREATE INDEX idx_time_tracking_billable_expenses_employee_id ON time_tracking_billable_expenses (tenant_id, employee_id);
CREATE INDEX idx_time_tracking_billable_expenses_project_id ON time_tracking_billable_expenses (tenant_id, project_id);
CREATE INDEX idx_time_tracking_billable_expenses_client_id ON time_tracking_billable_expenses (tenant_id, client_id);
CREATE INDEX idx_time_tracking_billable_expenses_created ON time_tracking_billable_expenses (tenant_id, created_at DESC);
CREATE INDEX idx_time_tracking_entries_entry_id ON time_tracking_entries (tenant_id, entry_id);
CREATE INDEX idx_time_tracking_entries_employee_id ON time_tracking_entries (tenant_id, employee_id);
CREATE INDEX idx_time_tracking_entries_timesheet_id ON time_tracking_entries (tenant_id, timesheet_id);
CREATE INDEX idx_time_tracking_entries_project_id ON time_tracking_entries (tenant_id, project_id);
CREATE INDEX idx_time_tracking_entries_created ON time_tracking_entries (tenant_id, created_at DESC);
CREATE INDEX idx_time_tracking_timesheets_employee_id ON time_tracking_timesheets (tenant_id, employee_id);
CREATE INDEX idx_time_tracking_timesheets_status ON time_tracking_timesheets (tenant_id, status);
CREATE INDEX idx_time_tracking_timesheets_created ON time_tracking_timesheets (tenant_id, created_at DESC);
CREATE INDEX idx_vendors_ap_account_id ON vendors (tenant_id, ap_account_id);
CREATE INDEX idx_vendors_is_active ON vendors (tenant_id, is_active);
CREATE INDEX idx_vendors_created ON vendors (tenant_id, created_at DESC);
CREATE INDEX idx_tenant_users_user_id ON tenant_users (tenant_id, user_id);
CREATE INDEX idx_tenant_users_employee_id ON tenant_users (tenant_id, employee_id);
CREATE INDEX idx_tenant_users_is_active ON tenant_users (tenant_id, is_active);
CREATE INDEX idx_tenant_users_created ON tenant_users (tenant_id, created_at DESC);
CREATE INDEX idx_custom_field_definitions_is_active ON custom_field_definitions (tenant_id, is_active);
CREATE INDEX idx_custom_field_definitions_created ON custom_field_definitions (tenant_id, created_at DESC);
CREATE INDEX idx_jobs_status ON jobs (tenant_id, status);
CREATE INDEX idx_jobs_created ON jobs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_actor_user_id ON audit_log (tenant_id, actor_user_id);
CREATE INDEX idx_audit_log_actor_employee_id ON audit_log (tenant_id, actor_employee_id);
CREATE INDEX idx_audit_log_entity_id ON audit_log (tenant_id, entity_id);
CREATE INDEX idx_cross_module_links_source_entity_id ON cross_module_links (tenant_id, source_entity_id);
CREATE INDEX idx_cross_module_links_target_entity_id ON cross_module_links (tenant_id, target_entity_id);
CREATE INDEX idx_cross_module_links_created ON cross_module_links (tenant_id, created_at DESC);
CREATE INDEX idx_hr_time_off_balances_employee_id ON hr_time_off_balances (tenant_id, employee_id);
CREATE INDEX idx_hr_time_off_balances_policy_id ON hr_time_off_balances (tenant_id, policy_id);
CREATE INDEX idx_hr_time_off_balances_created ON hr_time_off_balances (tenant_id, created_at DESC);
CREATE INDEX idx_hr_goals_employee_id ON hr_goals (tenant_id, employee_id);
CREATE INDEX idx_hr_goals_review_id ON hr_goals (tenant_id, review_id);
CREATE INDEX idx_hr_goals_objective_id ON hr_goals (tenant_id, objective_id);
CREATE INDEX idx_hr_goals_status ON hr_goals (tenant_id, status);
CREATE INDEX idx_hr_goals_created ON hr_goals (tenant_id, created_at DESC);
CREATE INDEX idx_time_tracking_hourly_rates_employee_id ON time_tracking_hourly_rates (tenant_id, employee_id);
CREATE INDEX idx_time_tracking_hourly_rates_client_id ON time_tracking_hourly_rates (tenant_id, client_id);
CREATE INDEX idx_time_tracking_hourly_rates_project_id ON time_tracking_hourly_rates (tenant_id, project_id);
CREATE INDEX idx_time_tracking_hourly_rates_is_active ON time_tracking_hourly_rates (tenant_id, is_active);
CREATE INDEX idx_time_tracking_hourly_rates_created ON time_tracking_hourly_rates (tenant_id, created_at DESC);
-- =============================================================================
-- SECTION 7 — FULL-TEXT SEARCH (ADR-002)
-- =============================================================================
-- Replaces the D1 schema's FTS5 virtual tables (tickets_fts, updates_fts) and
-- their six sync triggers.
--
-- Note: the D1 definitions carried a latent bug — they declared
-- content='tickets' and content='ticket_updates', but the real tables are named
-- ticketing_tickets and ticketing_updates. The external-content configuration
-- pointed at tables that do not exist. Corrected here.
--
-- tenant_id is part of every search predicate. Search is the most likely place
-- for a cross-tenant leak to reach a user's screen.

ALTER TABLE ticketing_tickets  ADD COLUMN search_vector tsvector;
ALTER TABLE ticketing_updates  ADD COLUMN search_vector tsvector;

CREATE OR REPLACE FUNCTION ticketing_tickets_search_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.subject,'')),           'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.internal_summary,'')),  'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.external_summary,'')),  'B');
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_ticketing_tickets_search
    BEFORE INSERT OR UPDATE OF subject, internal_summary, external_summary
    ON ticketing_tickets
    FOR EACH ROW EXECUTE FUNCTION ticketing_tickets_search_update();

CREATE OR REPLACE FUNCTION ticketing_updates_search_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple', coalesce(NEW.content_text,''));
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_ticketing_updates_search
    BEFORE INSERT OR UPDATE OF content_text
    ON ticketing_updates
    FOR EACH ROW EXECUTE FUNCTION ticketing_updates_search_update();

-- btree_gin lets tenant_id lead a GIN index, keeping ADR-003 rule 2 intact.
CREATE INDEX idx_ticketing_tickets_search
    ON ticketing_tickets USING GIN (tenant_id, search_vector);
CREATE INDEX idx_ticketing_updates_search
    ON ticketing_updates USING GIN (tenant_id, search_vector);

-- Custom field containment queries (../06-customization-model.md).
CREATE INDEX idx_employees_custom_fields ON employees USING GIN (custom_fields jsonb_path_ops);
CREATE INDEX idx_tasks_custom_fields     ON tasks     USING GIN (custom_fields jsonb_path_ops);
CREATE INDEX idx_projects_custom_fields  ON projects  USING GIN (custom_fields jsonb_path_ops);

-- -----------------------------------------------------------------------------
-- Tenant-scoped uniqueness corrections
-- -----------------------------------------------------------------------------
-- These three were GLOBALLY unique in the D1 schema, which assumed one database
-- per organization. Under shared tenancy the first was a hard failure: only one
-- tenant in the entire system could have a headquarters.

CREATE UNIQUE INDEX idx_firm_locations_hq
    ON firm_locations (tenant_id) WHERE is_headquarters;
CREATE UNIQUE INDEX idx_pm_objectives_number
    ON pm_objectives (tenant_id, objective_number);
CREATE UNIQUE INDEX idx_projects_number
    ON projects (tenant_id, project_number);

-- Accounting business documents must be uniquely addressable inside a tenant.
-- Without these, duplicate invoice/payment/journal numbers make audit trails,
-- reconciliation, and external filings ambiguous.
CREATE UNIQUE INDEX idx_chart_of_accounts_code
    ON chart_of_accounts (tenant_id, account_code);
CREATE UNIQUE INDEX idx_customers_number
    ON customers (tenant_id, customer_number);
CREATE UNIQUE INDEX idx_invoices_number
    ON invoices (tenant_id, invoice_number);
CREATE UNIQUE INDEX idx_journal_entries_number
    ON journal_entries (tenant_id, entry_number);
CREATE UNIQUE INDEX idx_payments_number
    ON payments (tenant_id, payment_number)
    WHERE payment_number IS NOT NULL;
CREATE UNIQUE INDEX idx_vendors_number
    ON vendors (tenant_id, vendor_number)
    WHERE vendor_number IS NOT NULL;
CREATE UNIQUE INDEX idx_bills_vendor_number
    ON bills (tenant_id, vendor_id, bill_number);
CREATE UNIQUE INDEX idx_bank_transactions_external_id
    ON bank_transactions (tenant_id, bank_account_id, bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX idx_exchange_rates_pair_date_source
    ON exchange_rates (from_currency, to_currency, rate_date, source);

-- Statutory tax rates are global (tenant_id IS NULL); tenant overrides are not.
CREATE UNIQUE INDEX idx_payroll_tax_rates_statutory
    ON payroll_tax_rates (jurisdiction, tax_type, effective_from)
    WHERE tenant_id IS NULL;

-- =============================================================================
-- SECTION 8 — FOREIGN KEYS
-- =============================================================================
-- Added after all tables exist. With 98 tables there is no practical
-- topological order, so constraints are applied here rather than inline.

ALTER TABLE firm_departments ADD CONSTRAINT fk_firm_departments_parent_department_id FOREIGN KEY (parent_department_id) REFERENCES firm_departments(id);
ALTER TABLE firm_departments ADD CONSTRAINT fk_firm_departments_location_id FOREIGN KEY (location_id) REFERENCES firm_locations(id);
ALTER TABLE firm_job_levels ADD CONSTRAINT fk_firm_job_levels_job_title_id FOREIGN KEY (job_title_id) REFERENCES firm_job_titles(id) ON DELETE CASCADE;
ALTER TABLE bank_accounts ADD CONSTRAINT fk_bank_accounts_gl_account_id FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE bank_reconciliation_rules ADD CONSTRAINT fk_bank_reconciliation_rules_bank_account_id FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
ALTER TABLE bank_reconciliation_rules ADD CONSTRAINT fk_bank_reconciliation_rules_category_account_id FOREIGN KEY (category_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE bank_reconciliation_rules ADD CONSTRAINT fk_bank_reconciliation_rules_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE bank_reconciliation_rules ADD CONSTRAINT fk_bank_reconciliation_rules_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE bank_transactions ADD CONSTRAINT fk_bank_transactions_bank_account_id FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE;
ALTER TABLE bank_transactions ADD CONSTRAINT fk_bank_transactions_category_account_id FOREIGN KEY (category_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE bill_lines ADD CONSTRAINT fk_bill_lines_bill_id FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
ALTER TABLE bill_lines ADD CONSTRAINT fk_bill_lines_tax_rate_id FOREIGN KEY (tax_rate_id) REFERENCES payroll_tax_rates(id);
ALTER TABLE bill_lines ADD CONSTRAINT fk_bill_lines_expense_account_id FOREIGN KEY (expense_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE bills ADD CONSTRAINT ck_bills_amounts_reconcile CHECK (
    subtotal >= 0
    AND tax_total >= 0
    AND total >= 0
    AND amount_paid >= 0
    AND amount_due >= 0
    AND total = subtotal + tax_total
    AND amount_due = total - amount_paid
);
ALTER TABLE bills ADD CONSTRAINT fk_bills_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE bills ADD CONSTRAINT fk_bills_journal_entry_id FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
ALTER TABLE chart_of_accounts ADD CONSTRAINT fk_chart_of_accounts_parent_account_id FOREIGN KEY (parent_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE chart_of_accounts ADD CONSTRAINT fk_chart_of_accounts_tax_rate_id FOREIGN KEY (tax_rate_id) REFERENCES payroll_tax_rates(id);
ALTER TABLE compensation_allowances ADD CONSTRAINT fk_compensation_allowances_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE compensation_base ADD CONSTRAINT fk_compensation_base_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE compensation_equity ADD CONSTRAINT fk_compensation_equity_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE compensation_premiums ADD CONSTRAINT fk_compensation_premiums_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE compensation_variable ADD CONSTRAINT fk_compensation_variable_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE compensation_work_schedules ADD CONSTRAINT fk_compensation_work_schedules_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE customers ADD CONSTRAINT fk_customers_tax_rate_id FOREIGN KEY (tax_rate_id) REFERENCES payroll_tax_rates(id);
ALTER TABLE customers ADD CONSTRAINT fk_customers_ar_account_id FOREIGN KEY (ar_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE employment_terms ADD CONSTRAINT fk_employment_terms_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_category_account_id FOREIGN KEY (category_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_bill_id FOREIGN KEY (bill_id) REFERENCES bills(id);
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_payment_id FOREIGN KEY (payment_id) REFERENCES payments(id);
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_department_id FOREIGN KEY (department_id) REFERENCES firm_departments(id);
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_journal_entry_id FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
ALTER TABLE firm_benefit_items ADD CONSTRAINT fk_firm_benefit_items_benefits_package_id FOREIGN KEY (benefits_package_id) REFERENCES firm_benefits_packages(id) ON DELETE CASCADE;
ALTER TABLE firm_holidays ADD CONSTRAINT fk_firm_holidays_location_id FOREIGN KEY (location_id) REFERENCES firm_locations(id) ON DELETE CASCADE;
ALTER TABLE firm_payroll_policies ADD CONSTRAINT fk_firm_payroll_policies_location_id FOREIGN KEY (location_id) REFERENCES firm_locations(id);
ALTER TABLE invoice_lines ADD CONSTRAINT fk_invoice_lines_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE invoice_lines ADD CONSTRAINT fk_invoice_lines_tax_rate_id FOREIGN KEY (tax_rate_id) REFERENCES payroll_tax_rates(id);
ALTER TABLE invoice_lines ADD CONSTRAINT fk_invoice_lines_revenue_account_id FOREIGN KEY (revenue_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE invoices ADD CONSTRAINT ck_invoices_amounts_reconcile CHECK (
    subtotal >= 0
    AND tax_total >= 0
    AND total >= 0
    AND amount_paid >= 0
    AND amount_due >= 0
    AND base_subtotal >= 0
    AND base_tax_total >= 0
    AND base_total >= 0
    AND base_amount_paid >= 0
    AND base_amount_due >= 0
    AND total = subtotal + tax_total
    AND amount_due = total - amount_paid
    AND base_total = base_subtotal + base_tax_total
    AND base_amount_due = base_total - base_amount_paid
);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_journal_entry_id FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
ALTER TABLE journal_entry_lines ADD CONSTRAINT fk_journal_entry_lines_entry_id FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE;
ALTER TABLE journal_entry_lines ADD CONSTRAINT fk_journal_entry_lines_account_id FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE journal_entry_lines ADD CONSTRAINT ck_journal_entry_lines_one_sided_positive CHECK (
    debit_amount >= 0
    AND credit_amount >= 0
    AND base_debit_amount >= 0
    AND base_credit_amount >= 0
    AND (
        (debit_amount > 0 AND credit_amount = 0)
        OR (credit_amount > 0 AND debit_amount = 0)
    )
    AND (
        (base_debit_amount > 0 AND base_credit_amount = 0)
        OR (base_credit_amount > 0 AND base_debit_amount = 0)
    )
);
ALTER TABLE journal_entry_lines ADD CONSTRAINT fk_journal_entry_lines_department_id FOREIGN KEY (department_id) REFERENCES firm_departments(id);
ALTER TABLE journal_entry_lines ADD CONSTRAINT fk_journal_entry_lines_location_id FOREIGN KEY (location_id) REFERENCES firm_locations(id);
ALTER TABLE journal_entry_lines ADD CONSTRAINT fk_journal_entry_lines_tax_rate_id FOREIGN KEY (tax_rate_id) REFERENCES payroll_tax_rates(id);
ALTER TABLE payment_allocations ADD CONSTRAINT ck_payment_allocations_one_document CHECK (
    amount > 0
    AND base_amount > 0
    AND ((invoice_id IS NOT NULL)::int + (bill_id IS NOT NULL)::int) = 1
);
ALTER TABLE payment_allocations ADD CONSTRAINT fk_payment_allocations_payment_id FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;
ALTER TABLE payment_allocations ADD CONSTRAINT fk_payment_allocations_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE payment_allocations ADD CONSTRAINT fk_payment_allocations_bill_id FOREIGN KEY (bill_id) REFERENCES bills(id);
ALTER TABLE payments ADD CONSTRAINT ck_payments_positive_amounts CHECK (
    amount > 0
    AND base_amount > 0
    AND gateway_fee >= 0
);
ALTER TABLE payments ADD CONSTRAINT fk_payments_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE payments ADD CONSTRAINT fk_payments_vendor_id FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE payments ADD CONSTRAINT fk_payments_bank_account_id FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
ALTER TABLE payments ADD CONSTRAINT fk_payments_journal_entry_id FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id);
ALTER TABLE payroll_employee_deductions ADD CONSTRAINT fk_payroll_employee_deductions_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE payroll_employee_deductions ADD CONSTRAINT fk_payroll_employee_deductions_deduction_id FOREIGN KEY (deduction_id) REFERENCES payroll_deduction_definitions(id);
ALTER TABLE payroll_india_salary_structure ADD CONSTRAINT fk_payroll_india_salary_structure_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE payroll_india_tax_declarations ADD CONSTRAINT fk_payroll_india_tax_declarations_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE payroll_run_employees ADD CONSTRAINT fk_payroll_run_employees_payroll_run_id FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE;
ALTER TABLE payroll_run_employees ADD CONSTRAINT fk_payroll_run_employees_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE payroll_runs ADD CONSTRAINT fk_payroll_runs_pay_schedule_id FOREIGN KEY (pay_schedule_id) REFERENCES payroll_pay_schedules(id);
ALTER TABLE payroll_tax_rates ADD CONSTRAINT fk_payroll_tax_rates_tax_collected_account_id FOREIGN KEY (tax_collected_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE payroll_tax_rates ADD CONSTRAINT fk_payroll_tax_rates_tax_paid_account_id FOREIGN KEY (tax_paid_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE payroll_tax_withholding_certificates ADD CONSTRAINT fk_payroll_tax_withholding_certificates_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE vendors ADD CONSTRAINT fk_vendors_ap_account_id FOREIGN KEY (ap_account_id) REFERENCES chart_of_accounts(id);

-- Foreign keys re-established after the key strategy changed from natural
-- codes to surrogate ids. These references were present in the source schema
-- but pointed at the old natural keys.
ALTER TABLE ticketing_updates ADD CONSTRAINT fk_ticketing_updates_ticket_id FOREIGN KEY (ticket_id) REFERENCES ticketing_tickets(id);
ALTER TABLE pm_automation_executions ADD CONSTRAINT fk_pm_automation_executions_automation_id FOREIGN KEY (automation_id) REFERENCES pm_automations(id);
ALTER TABLE pm_task_comments ADD CONSTRAINT fk_pm_task_comments_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE pm_task_attachments ADD CONSTRAINT fk_pm_task_attachments_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE pm_task_time_entries ADD CONSTRAINT fk_pm_task_time_entries_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE employee_training_records ADD CONSTRAINT fk_employee_training_records_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE employee_certifications ADD CONSTRAINT fk_employee_certifications_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE hr_survey_responses ADD CONSTRAINT fk_hr_survey_responses_survey_id FOREIGN KEY (survey_id) REFERENCES hr_surveys(id);
ALTER TABLE hr_employee_documents ADD CONSTRAINT fk_hr_employee_documents_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE pm_dashboard_widgets ADD CONSTRAINT fk_pm_dashboard_widgets_dashboard_id FOREIGN KEY (dashboard_id) REFERENCES pm_dashboards(id);
ALTER TABLE employee_group_members ADD CONSTRAINT fk_employee_group_members_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE employee_assets ADD CONSTRAINT fk_employee_assets_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE ticketing_attachments ADD CONSTRAINT fk_ticketing_attachments_ticket_id FOREIGN KEY (ticket_id) REFERENCES ticketing_tickets(id);

-- Foreign keys for the module-coverage additions (SECTION 9)
ALTER TABLE employee_bank_accounts ADD CONSTRAINT fk_eba_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE hr_employment_history ADD CONSTRAINT fk_heh_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE hr_employment_history ADD CONSTRAINT fk_heh_manager
    FOREIGN KEY (manager_id) REFERENCES employees(id);
ALTER TABLE hr_employment_history ADD CONSTRAINT fk_heh_prev_manager
    FOREIGN KEY (previous_manager_id) REFERENCES employees(id);
ALTER TABLE hr_employment_history ADD CONSTRAINT fk_heh_compensation
    FOREIGN KEY (compensation_id) REFERENCES compensation_base(id);
ALTER TABLE hr_onboarding_template_tasks ADD CONSTRAINT fk_hott_template
    FOREIGN KEY (template_id) REFERENCES hr_onboarding_templates(id) ON DELETE CASCADE;
ALTER TABLE hr_company_news ADD CONSTRAINT fk_hcn_subject
    FOREIGN KEY (subject_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE hr_company_news ADD CONSTRAINT fk_hcn_author
    FOREIGN KEY (author_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE hr_company_news ADD CONSTRAINT fk_hcn_group
    FOREIGN KEY (audience_group_id) REFERENCES employee_user_groups(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Celebrations — module-hr.md FR-HR-012, US-HR-070/075
-- -----------------------------------------------------------------------------
-- Birthdays and work anniversaries are derived, not stored: a table would
-- duplicate employees.birth_date and employees.start_date and immediately drift.
-- Privacy controls read from employees.celebration_preferences, e.g.
--   {"show_birthday": true, "show_age": false, "show_anniversary": true}
CREATE OR REPLACE VIEW v_upcoming_celebrations AS
SELECT
    e.tenant_id,
    e.id            AS employee_id,
    e.first_name,
    e.last_name,
    e.preferred_name,
    e.department_code,
    e.location_code,
    'birthday'      AS celebration_type,
    -- this year's occurrence, rolling to next year once it has passed
    (date_trunc('year', CURRENT_DATE)
       + (date_trunc('day', e.birth_date) - date_trunc('year', e.birth_date)))::date
       + CASE WHEN (date_trunc('year', CURRENT_DATE)
                     + (date_trunc('day', e.birth_date) - date_trunc('year', e.birth_date)))::date
                   < CURRENT_DATE
              THEN INTERVAL '1 year' ELSE INTERVAL '0' END AS celebration_date,
    NULL::int       AS years,
    coalesce((e.celebration_preferences ->> 'show_age')::boolean, false) AS show_detail
  FROM employees e
 WHERE e.is_active
   AND e.birth_date IS NOT NULL
   AND coalesce((e.celebration_preferences ->> 'show_birthday')::boolean, true)

UNION ALL

SELECT
    e.tenant_id, e.id, e.first_name, e.last_name, e.preferred_name,
    e.department_code, e.location_code,
    'work_anniversary',
    (date_trunc('year', CURRENT_DATE)
       + (date_trunc('day', e.start_date) - date_trunc('year', e.start_date)))::date
       + CASE WHEN (date_trunc('year', CURRENT_DATE)
                     + (date_trunc('day', e.start_date) - date_trunc('year', e.start_date)))::date
                   < CURRENT_DATE
              THEN INTERVAL '1 year' ELSE INTERVAL '0' END,
    (EXTRACT(YEAR FROM age(CURRENT_DATE, e.start_date)))::int + 1,
    coalesce((e.celebration_preferences ->> 'show_anniversary')::boolean, true)
  FROM employees e
 WHERE e.is_active
   AND e.start_date IS NOT NULL
   AND coalesce((e.celebration_preferences ->> 'show_anniversary')::boolean, true);

-- The view inherits RLS from employees, so it is tenant-safe by construction.

-- -----------------------------------------------------------------------------
-- Ticketing SLA — module-ticketing.md, /reports/sla-compliance
-- -----------------------------------------------------------------------------
-- Gap: the spec configures slaHours per category and exposes an SLA compliance
-- report, but due_date was DATE (too coarse for a 4-hour SLA) and there was
-- nothing to measure first response against.
ALTER TABLE ticketing_tickets
    ADD COLUMN sla_due_at             TIMESTAMPTZ,
    ADD COLUMN sla_response_due_at    TIMESTAMPTZ,
    ADD COLUMN first_response_at      TIMESTAMPTZ,
    ADD COLUMN sla_paused_seconds     INT NOT NULL DEFAULT 0,
    ADD COLUMN sla_resolution_breached BOOLEAN,
    ADD COLUMN sla_response_breached  BOOLEAN;

-- due_date was DATE NOT NULL, which forced a due date onto every ticket and
-- could not express an hours-based SLA.
ALTER TABLE ticketing_tickets ALTER COLUMN due_date DROP NOT NULL;

CREATE INDEX idx_tickets_sla_open
    ON ticketing_tickets (tenant_id, sla_due_at)
    WHERE status NOT IN ('resolved','closed');

COMMENT ON COLUMN ticketing_tickets.sla_paused_seconds IS
    'Time spent in a paused state (e.g. awaiting customer), excluded from SLA elapsed time.';

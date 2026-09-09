-- =============================================================================
-- Kaaj — Fenwick Robotics: the demo tenant provisioned onto a DEDICATED
-- database (ADR-009 tier B), loaded by
-- packages/database/scripts/provision-dedicated-db.sh
-- =============================================================================
-- This file is loaded into the DEDICATED cluster, never the shared one — it
-- has no tenant_registry row, no tenant_users row, and no auth.users row,
-- because those stay in the control-plane database regardless of tier (see
-- apps/web/src/lib/server/db/tenant.ts's withControlPlane). The provisioning
-- script inserts those separately, against the shared database.
--
-- Deliberately small: this fixture only needs to be visibly real in a demo,
-- not exercise every column the way mock-data.sql does for Northwind — this
-- database is outside ./check's fixture-completeness scope by design (see
-- scripts/verify-fixture-coverage.mjs, which only ever looks at DATABASE_URL,
-- the shared database).
-- =============================================================================

INSERT INTO tenants (id, subdomain, company_name, region, default_locale, default_currency, default_timezone, plan_tier, is_active)
VALUES (
    'da5b0beb-7418-496b-95ef-6b982defcb76',
    'fenwick',
    'Fenwick Robotics',
    'us-east-1',
    'en-US',
    'USD',
    'America/Los_Angeles',
    'professional',
    TRUE
);

INSERT INTO employees (id, tenant_id, first_name, last_name, email, employment_status, employment_type, start_date, job_title, is_active, created_at, updated_at, created_by)
VALUES
    ('3640322e-b637-4f1f-ad52-ad491bc9132d',
     'da5b0beb-7418-496b-95ef-6b982defcb76',
     'Priya', 'Desai', 'priya.desai@fenwick.example',
     'active', 'full_time', '2025-01-06', 'Founder & CEO', TRUE, now(), now(),
     '3640322e-b637-4f1f-ad52-ad491bc9132d'),
    (gen_random_uuid(),
     'da5b0beb-7418-496b-95ef-6b982defcb76',
     'Marcus', 'Webb', 'marcus.webb@fenwick.example',
     'active', 'full_time', '2025-02-10', 'Robotics Engineer', TRUE, now(), now(),
     '3640322e-b637-4f1f-ad52-ad491bc9132d');

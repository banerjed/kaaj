-- =============================================================================
-- Kaaj — did the migrations land, and is the mock data there?
-- =============================================================================
-- READ-ONLY. Paste into the Supabase dashboard SQL Editor and run.
--
-- This exists so you do not need the database password to check your work. The
-- SQL Editor authenticates with your dashboard session, so there is nothing to
-- look up and nothing to reset.
--
-- It runs as `postgres`, which BYPASSES RLS. Every structural check below is
-- valid from that role; tenant isolation is NOT, and is deliberately reported
-- as "not testable here" rather than given a passing tick. To verify isolation
-- you need a connection as app_user:
--     ./scripts/verify-remote.sh "postgresql://app_user:<pw>@db.<ref>.supabase.co:5432/postgres"
-- =============================================================================

WITH checks(sort, name, got, want) AS (
    VALUES
    -- structure -------------------------------------------------------------
    (1, 'tables in public',
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'), 98),

    (2, 'tables WITHOUT forced RLS (want 0)',
        (SELECT count(*) FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
            AND NOT c.relforcerowsecurity), 0),

    (3, 'NOT NULL timestamps missing a default (want 0)',
        (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name IN ('created_at', 'updated_at')
            AND is_nullable = 'NO' AND column_default IS NULL), 0),

    (4, 'updated_at triggers attached',
        (SELECT count(*) FROM pg_trigger
          WHERE NOT tgisinternal AND tgname LIKE '%\_updated\_at'), 82),

    -- auth --------------------------------------------------------------------
    (5, 'custom_access_token_hook exists',
        (SELECT count(*) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = 'custom_access_token_hook' AND n.nspname = 'public'), 1),

    (6, 'hook can read tenant_users (the deadlock fix)',
        (SELECT count(*) FROM pg_policies
          WHERE tablename = 'tenant_users'
            AND policyname = 'auth_admin_reads_memberships'), 1),

    (7, 'app_user role exists',
        (SELECT count(*) FROM pg_roles WHERE rolname = 'app_user'), 1),

    (8, 'app_user has USAGE on schema app',
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')
                     THEN has_schema_privilege('app_user', 'app', 'USAGE')::int
                     ELSE 0 END), 1),

    (9, 'app_user can SELECT employees',
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')
                     THEN has_table_privilege('app_user', 'employees', 'SELECT')::int
                     ELSE 0 END), 1),

    -- ADR-008: the Data API is meant to stay shut ------------------------------
    (10, 'grants to anon/authenticated (want 0, per ADR-008)',
        (SELECT count(*) FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')), 0),

    -- mock data ---------------------------------------------------------------
    (11, 'Northwind tenant',
        (SELECT count(*) FROM tenants WHERE subdomain = 'northwind'), 1),

    (12, 'Northwind employees',
        (SELECT count(*) FROM employees
          WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1'), 12),

    (13, 'Northwind invoices',
        (SELECT count(*) FROM invoices
          WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1'), 5),

    (14, 'Northwind payroll runs',
        (SELECT count(*) FROM payroll_runs
          WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1'), 4),

    (15, 'Northwind journal lines',
        (SELECT count(*) FROM journal_entry_lines
          WHERE tenant_id = '07fb03f8-1521-5ef4-9c2d-25fcfa297ac1'), 17)
)
SELECT status, check_name, got, want FROM (

SELECT
    CASE WHEN got = want THEN 'pass' ELSE 'FAIL' END AS status,
    name  AS check_name,
    got,
    want
FROM checks

UNION ALL

-- Which migrations the CLI recorded. Absent means the schema was applied some
-- other way (pasted SQL), not necessarily that it is wrong.
SELECT
    CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
         THEN 'NOTE' ELSE 'pass' END,
    CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
         THEN 'no CLI migration history — schema was not applied by db push'
         ELSE 'migrations recorded by db push' END,
    NULL, NULL

UNION ALL

SELECT 'skip',
       'tenant isolation — not testable as postgres (it bypasses RLS)',
       NULL, NULL

) AS r
-- FAIL first: a passing run should be scannable, a failing one unmissable.
ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'NOTE' THEN 1
                     WHEN 'skip' THEN 2 ELSE 3 END,
         check_name;

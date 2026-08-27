-- =============================================================================
-- Kaaj — privileges, the access-token hook, and two schema corrections
-- =============================================================================
-- 20260827000001 creates 98 tables with RLS FORCEd on every one, and grants
-- nothing. On its own it is a database no role can read. This migration makes
-- it reachable. Four independent things go wrong without it, and they fail at
-- different layers, which is why each is called out separately below.
--
-- References: ADR-003 (RLS), ADR-008 (Supabase, tenant claim), ADR-009 (tiers).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The application role
-- -----------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY is bypassed by the table OWNER. The application must
-- therefore connect as a non-owner, or the isolation the schema advertises is
-- decorative. schema.sql says this in a comment (SECTION 5); this makes it real.
--
-- The password is set out of band — never in a migration. After applying:
--   ALTER ROLE app_user WITH PASSWORD '<from your secret store>';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN NOINHERIT;
    END IF;
END
$$;

-- Schema USAGE, which is the failure nobody expects.
-- A freshly CREATEd schema grants nothing to PUBLIC — only its owner has USAGE.
-- Every one of the 98 policies calls app.current_tenant_id(), which lives in the
-- `app` schema, so without this line app_user gets
--     ERROR: permission denied for schema app
-- on every query, before RLS is ever evaluated.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA app    TO app_user;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO app_user;

-- Table privileges. RLS NARROWS access that a GRANT has already given; it never
-- grants. With no GRANT, every request is 42501 regardless of policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Tables added by later migrations must not silently lose their grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;


-- -----------------------------------------------------------------------------
-- 2. Stamp tenant_id into the access token
-- -----------------------------------------------------------------------------
-- ADR-008: "tenant_id is stamped into the JWT by a custom_access_token_hook
-- Postgres function." The function was specified in architecture-technical.md
-- but never created. Without it app.current_tenant_id() reads a claim nobody
-- wrote, returns NULL, `tenant_id = NULL` is never true, and all 98 policies
-- deny every row — for app_user and the Data API alike.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    claims     jsonb := event->'claims';
    membership RECORD;
BEGIN
    SELECT tu.tenant_id, tu.role
      INTO membership
      FROM tenant_users tu
     WHERE tu.user_id = (event->>'user_id')::uuid
       AND tu.is_active
     ORDER BY tu.is_default_tenant DESC, tu.last_active_at DESC NULLS LAST
     LIMIT 1;

    IF membership.tenant_id IS NOT NULL THEN
        claims := jsonb_set(claims, '{app_metadata,tenant_id}',
                            to_jsonb(membership.tenant_id::text));
        claims := jsonb_set(claims, '{app_metadata,role}',
                            to_jsonb(membership.role));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Break the chicken-and-egg deadlock on tenant_users
-- -----------------------------------------------------------------------------
-- The hook above reads tenant_users. But tenant_users carries
--     CREATE POLICY tenant_isolation ON tenant_users
--         USING (tenant_id = app.current_tenant_id())
-- with no TO clause, so it applies to every role including supabase_auth_admin,
-- which is who runs the hook. At token issue there is no JWT yet, so
-- app.current_tenant_id() is NULL, the policy matches nothing, the SELECT finds
-- no membership, and the hook stamps no claim — the exact failure it exists to
-- prevent. It fails silently: login succeeds, and every later query returns zero
-- rows.
--
-- SECURITY DEFINER does NOT fix this. Under FORCE ROW LEVEL SECURITY even the
-- owner is subject to policies. The fix is an explicit permissive policy for the
-- auth role; permissive policies are OR'd, so this widens access for
-- supabase_auth_admin alone and leaves tenant_isolation untouched for everyone
-- else.

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON tenant_users TO supabase_auth_admin;

CREATE POLICY auth_admin_reads_memberships ON tenant_users
    FOR SELECT TO supabase_auth_admin
    USING (true);

-- The hook must not be callable by users — it is invoked by GoTrue, not by the
-- application, and it reads membership across every tenant.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
    FROM authenticated, anon, public;

-- REGISTRATION IS A DASHBOARD STEP, NOT SQL. Creating the function is not
-- enough — Supabase will not call it until it is selected under
--     Authentication > Hooks > Customize Access Token (JWT) Claims
-- Self-hosted, the equivalent is
--     GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/public/custom_access_token_hook


-- -----------------------------------------------------------------------------
-- 4. Two corrections to the schema as written
-- -----------------------------------------------------------------------------

-- exchange_rates is the only one of the 98 tables that ENABLEs RLS without
-- FORCEing it, which leaves the owner able to read every tenant's rates.
ALTER TABLE exchange_rates FORCE ROW LEVEL SECURITY;

-- v_upcoming_celebrations selects from employees and carries no tenant
-- predicate of its own. Without security_invoker it runs with the definer's
-- rights, so employees' RLS does not apply and the view returns every tenant's
-- birthdays. With it, the caller's RLS filters the underlying rows.
ALTER VIEW v_upcoming_celebrations SET (security_invoker = on);
GRANT SELECT ON v_upcoming_celebrations TO app_user;


-- -----------------------------------------------------------------------------
-- 5. The Data API is deliberately left unreachable
-- -----------------------------------------------------------------------------
-- ADR-008 rejects PostgREST as the primary API and scopes it to "simple
-- administrative reads only"; ADR-009 adds that a PostgREST URL is bound to one
-- Supabase project and so cannot serve tier-B or tier-C customers at all.
-- No GRANT to `authenticated` or `anon` is issued here, so /rest/v1/* returns
-- 42501 for every table. That is the intended state.
--
-- To open one table for administrative reads, do it explicitly and narrowly:
--     GRANT SELECT ON <table> TO authenticated;
-- Never `ON ALL TABLES` — that is how the rejected surface becomes the real one
-- by accident.

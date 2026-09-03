-- =============================================================================
-- Kaaj — privileges, the access-token hook, and two schema corrections
-- =============================================================================
-- 20260827000001 grants nothing, so on its own no role can read the database.
-- This migration makes it reachable.
--
-- Assumes a Supabase-provisioned project (supabase_auth_admin, authenticated,
-- anon roles already exist). On vanilla Postgres, create those first —
-- scripts/verify-migrations.sh does this.
--
-- References: ADR-003 (RLS), ADR-008 (Supabase, tenant claim), ADR-009 (tiers).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The application role
-- -----------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY is bypassed by the table owner, so the app must
-- connect as a non-owner or isolation is decorative.
--
-- Password set out of band, never in a migration:
--   ALTER ROLE app_user WITH PASSWORD '<from your secret store>';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN NOINHERIT;
    END IF;
END
$$;

-- A freshly created schema grants nothing to PUBLIC. Every policy calls
-- app.current_tenant_id(), so without USAGE on `app`, every query fails with
-- "permission denied for schema app" before RLS is ever evaluated.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA app    TO app_user;
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO app_user;

-- RLS narrows access a GRANT already gave; it never grants on its own.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Tables added by later migrations must not silently lose their grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;


-- -----------------------------------------------------------------------------
-- 2. Stamp tenant_id into the access token (ADR-008)
-- -----------------------------------------------------------------------------
-- Without this hook, app.current_tenant_id() reads a claim nobody wrote,
-- returns NULL, and every policy denies every row.

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
-- tenant_isolation on tenant_users applies to every role, including
-- supabase_auth_admin running the hook — but at token issue there's no JWT
-- yet, so app.current_tenant_id() is NULL and the hook silently stamps no
-- claim (login succeeds; every later query returns zero rows). SECURITY
-- DEFINER doesn't help under FORCE RLS, so we add an explicit permissive
-- policy for the auth role instead.

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

-- Registration is a dashboard step, not SQL — Supabase won't call the hook
-- until it's selected under Authentication > Hooks > Customize Access Token
-- (JWT) Claims. Self-hosted: GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/public/custom_access_token_hook


-- -----------------------------------------------------------------------------
-- 4. Two corrections to the schema as written
-- -----------------------------------------------------------------------------

-- exchange_rates enabled RLS but never forced it, leaving the owner able to
-- read every tenant's rates.
ALTER TABLE exchange_rates FORCE ROW LEVEL SECURITY;

-- Without security_invoker, this view runs with the definer's rights and
-- employees' RLS does not apply.
ALTER VIEW v_upcoming_celebrations SET (security_invoker = on);
GRANT SELECT ON v_upcoming_celebrations TO app_user;


-- -----------------------------------------------------------------------------
-- 5. The Data API is deliberately left unreachable (ADR-008, ADR-009)
-- -----------------------------------------------------------------------------
-- No GRANT to `authenticated`/`anon`, so /rest/v1/* returns 42501 for every
-- table — intended. To open one table, grant it explicitly; never
-- `ON ALL TABLES`, or the rejected surface becomes the real one by accident.

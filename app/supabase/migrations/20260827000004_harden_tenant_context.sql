-- =============================================================================
-- Kaaj — make app.current_tenant_id() fail closed instead of raising
-- =============================================================================
-- Found by running the tenant-isolation checks as app_user against a real
-- Postgres 17. The function as written in schema.sql is:
--
--     SELECT NULLIF(
--         current_setting('request.jwt.claims', true)::jsonb
--             #>> '{app_metadata,tenant_id}', '')::uuid
--
-- current_setting(..., true) returns NULL when the setting was never set, and
-- ''::jsonb raises. So the three reachable states behave differently:
--
--   claim never set    -> NULL       -> 0 rows          (correct, fails closed)
--   claim set to ''    -> ERROR      invalid input syntax for type json
--   claim malformed    -> ERROR      invalid input syntax for type json
--
-- The second case is not hypothetical. ADR-009 keeps long-lived connection pools
-- and sets the claim per transaction, so any path that clears the setting rather
-- than resetting it — a pooled connection handed back, an unauthenticated
-- request, a failed token parse — turns every subsequent query in that
-- transaction into a database error rather than an empty result.
--
-- An error is not a safe substitute for isolation: it converts "this user sees
-- nothing" into a 500, and it makes the no-tenant case untestable. All three
-- states should mean the same thing — no tenant, therefore no rows.
--
-- Rewritten in plpgsql because SQL has no way to recover from a bad cast. The
-- function stays STABLE, so it is evaluated once per query rather than per row.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    raw       text := current_setting('request.jwt.claims', true);
    tenant    text;
BEGIN
    -- never set, or explicitly cleared
    IF raw IS NULL OR raw = '' THEN
        RETURN NULL;
    END IF;

    BEGIN
        tenant := raw::jsonb #>> '{app_metadata,tenant_id}';
    EXCEPTION WHEN others THEN
        RETURN NULL;              -- malformed claims: no tenant, not an error
    END;

    IF tenant IS NULL OR tenant = '' THEN
        RETURN NULL;
    END IF;

    BEGIN
        RETURN tenant::uuid;
    EXCEPTION WHEN others THEN
        RETURN NULL;              -- claim present but not a uuid
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO app_user;

-- Deliberate trade: a malformed claim now yields an empty result rather than a
-- loud failure, which could mask a misconfigured token. That belongs in the
-- application layer, where hooks.server.ts already has to verify that the
-- subdomain and the token agree (architecture-technical.md) and can reject the
-- request outright. The database's job is to be un-bypassable, not to diagnose.

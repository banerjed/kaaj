-- =============================================================================
-- Kaaj — make app.current_tenant_id() fail closed instead of raising
-- =============================================================================
-- The original SQL cast (`::jsonb`) raises on an empty or malformed claim
-- instead of returning NULL, turning "no tenant" into a 500 rather than an
-- empty result — and pooled connections can leave a cleared claim behind
-- (ADR-009). Rewritten in plpgsql, the only way to catch a bad cast; all three
-- states (unset, empty, malformed) now return NULL, therefore no rows.
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

-- Diagnosing a misconfigured token is hooks.server.ts's job; the database's
-- job is to be un-bypassable, not to diagnose.

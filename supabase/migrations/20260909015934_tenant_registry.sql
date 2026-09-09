-- =============================================================================
-- Kaaj — tenant_registry: the control plane for subdomain-routed database
-- targets (ADR-009, docs/05-architecture-decisions.md)
-- =============================================================================
-- Lives in the shared database, which doubles as the control plane for this
-- demo (a real deployment might separate them; ADR-009 only requires the
-- registry be "small, central, cached aggressively", not physically
-- separate). Every tenant gets exactly one row here, regardless of tier —
-- 'shared' tenants simply carry no connection_secret_ref, since getConnection
-- already has a home for them.
--
-- tenant_users is deliberately NOT part of what moves to a dedicated
-- database — see apps/web/src/lib/server/db/tenant.ts's withControlPlane.
-- This table only decides WHICH DATABASE a tenant's business data lives in.
-- =============================================================================

CREATE TABLE tenant_registry (
    tenant_id             UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    subdomain             TEXT NOT NULL UNIQUE,
    tier                  TEXT NOT NULL DEFAULT 'shared'
                            CHECK (tier IN ('shared', 'dedicated')),
    -- A pointer into a secret store, never the DSN itself (ADR-009). NULL for
    -- 'shared' tenants — they resolve through the app's existing shared pool.
    connection_secret_ref TEXT,
    CONSTRAINT dedicated_tenant_has_a_secret_ref
        CHECK (tier = 'shared' OR connection_secret_ref IS NOT NULL),
    region                TEXT NOT NULL DEFAULT 'us-east-1',
    schema_version        TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('provisioning', 'active', 'suspended', 'migrating', 'unreachable')),
    last_health_check_at  TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tenant_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_registry FORCE ROW LEVEL SECURITY;

-- Read-only from app_user, and only your own row: the router needs to resolve
-- its own tenant's target, never enumerate every tenant's connection
-- reference from a live request.
CREATE POLICY tenant_registry_self ON tenant_registry
    FOR SELECT
    TO app_user
    USING (tenant_id = app.current_tenant_id());

GRANT SELECT ON tenant_registry TO app_user;

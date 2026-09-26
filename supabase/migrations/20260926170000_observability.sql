-- Production debugging infrastructure: a queryable error log and a
-- feature-flags table for gradual rollout. Both are control-plane data
-- (ADR-009) — reached the same way as tenant_registry, regardless of which
-- physical database a tenant's business data lives in, so an engineer
-- debugging production has one place to query rather than N.

-- One row per unexpected server or client error inside a KNOWN tenant. An
-- error with no resolvable tenant (a broken marketing page, a failed login
-- before a tenant claim exists) is deliberately not persisted here — it
-- still reaches stdout via the existing structured log. tenant_id is
-- therefore NOT NULL: this table only ever needs the standard tenant_isolation
-- shape, with no null-tenant edge case to carry.
CREATE TABLE app_error_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    error_id      UUID NOT NULL,
    request_id    UUID,
    scope         TEXT NOT NULL CHECK (scope IN ('server', 'client')),
    route         TEXT,
    status        INT,
    -- name/message/code are already the safeError() allowlist ($lib/errors.ts)
    -- by the time they reach this table — never a raw error.
    name          TEXT,
    message       TEXT,
    code          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_error_log_tenant_time ON app_error_log (tenant_id, created_at DESC);

ALTER TABLE app_error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_error_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app_error_log
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- Small, admin-authored config for gradual per-tenant rollout. NULL tenant_id
-- is the platform default; a tenant-specific row overrides it. Modelled on
-- translations' asymmetric read policy (initial_schema.sql).
--
-- Deliberately no INSERT/UPDATE policy for app_user: a flag is toggled with
-- the database OWNER connection (psql "$DATABASE_URL"), the same class of
-- access already used to create the first beta tenant by hand
-- (12-beta-deployment.md) — not through the application.
CREATE TABLE feature_flags (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
    flag_key      TEXT NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT false,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (tenant_id, flag_key)
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;

-- app.current_tenant_id() IS NOT NULL is required explicitly (ADR-003 rule
-- 5, "no claim = no tenant, fails closed"): without it, a session with NO
-- claim at all (a bug, or an attack) would still satisfy `tenant_id IS NULL`
-- and see the platform-default rows. A missing/malformed claim must see
-- nothing, not just "nothing tenant-specific."
CREATE POLICY tenant_isolation ON feature_flags
    FOR SELECT
    USING (
        app.current_tenant_id() IS NOT NULL
        AND (tenant_id IS NULL OR tenant_id = app.current_tenant_id())
    );

-- Enterprise SSO control-plane columns (ADR-010), plus the one genuinely new
-- access pattern this needs: resolving a tenant from the request's subdomain
-- BEFORE any session exists, so tenant_registry's existing
-- `tenant_id = app.current_tenant_id()` policy cannot apply yet.
ALTER TABLE tenant_registry
    ADD COLUMN sso_provider_type TEXT CHECK (sso_provider_type IN ('saml', 'oidc')),
    -- SAML: Supabase's own sso_provider_id (uuid, stored as text).
    -- OIDC: the identifier we chose at registration (e.g. "custom:acme").
    ADD COLUMN sso_provider_ref TEXT,
    ADD COLUMN sso_required BOOLEAN NOT NULL DEFAULT false,
    -- SAML registration metadata only — Supabase requires `domains` when a
    -- provider is registered. Never used for OUR OWN routing: ADR-010 is
    -- explicit that the subdomain is the authority, domain matching is only
    -- Supabase's own convenience path.
    ADD COLUMN sso_permitted_domains TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE tenant_registry
    ADD CONSTRAINT sso_provider_type_and_ref_together
        CHECK ((sso_provider_type IS NULL) = (sso_provider_ref IS NULL)),
    ADD CONSTRAINT sso_required_needs_provider
        CHECK (NOT sso_required OR sso_provider_ref IS NOT NULL);

-- Returns only the routing-safe columns — never connection_secret_ref —
-- so a pre-auth lookup can't leak infrastructure secrets even in principle.
CREATE FUNCTION app.resolve_tenant_by_subdomain(p_subdomain text)
RETURNS TABLE(
    tenant_id uuid,
    sso_provider_type text,
    sso_provider_ref text,
    sso_required boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT tenant_id, sso_provider_type, sso_provider_ref, sso_required
      FROM public.tenant_registry
     WHERE subdomain = p_subdomain
$$;

REVOKE ALL ON FUNCTION app.resolve_tenant_by_subdomain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_tenant_by_subdomain(text) TO app_user;

-- The custom_access_token_hook chicken-and-egg problem, same shape as the
-- existing auth_admin_reads_memberships/auth_admin_reads_contacts policies:
-- GoTrue runs the hook as supabase_auth_admin before any JWT exists.
GRANT SELECT ON tenant_registry TO supabase_auth_admin;

CREATE POLICY auth_admin_reads_registry ON tenant_registry
    FOR SELECT TO supabase_auth_admin
    USING (true);

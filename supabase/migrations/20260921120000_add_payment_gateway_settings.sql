-- =============================================================================
-- Kaaj — per-tenant Stripe payment link configuration (US-ACC-002)
-- =============================================================================
-- Bring-your-own-key, not Stripe Connect: each tenant pastes their OWN Stripe
-- secret key, used only to create a Payment Link for that tenant's own
-- invoices against that tenant's own Stripe account. A separate table, not
-- columns on `tenants` (unlike logo_storage_key) — `tenants` is a broadly
-- readable row and a Stripe secret key needs the SAME finance-only
-- row-visibility this schema already gives `bank_accounts` and
-- `recurring_schedules`, not a per-column carve-out `employees` needs
-- because its row can't be split.
-- =============================================================================

CREATE TABLE payment_gateway_settings (
    tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    -- Sealed via $lib/server/pii, subjectType "tenant" — the same mechanism
    -- `bank_accounts`' _ct columns are meant to use, just the first live
    -- write path to actually exercise it.
    secret_key_ct       TEXT,
    -- Non-secret display metadata, so the settings page can show which key
    -- is configured without ever re-displaying the secret itself.
    secret_key_last4    VARCHAR(4),
    is_live_mode        BOOLEAN,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_by          UUID,
    updated_by          UUID
);

ALTER TABLE payment_gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_gateway_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_gateway_settings
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- Finance-only, same shape as recurring_schedules (20260920221330) — reusing
-- app.reads_all_accounting()/app.writes_accounting() rather than redefining.
CREATE POLICY accounting_read ON public.payment_gateway_settings AS RESTRICTIVE
    FOR SELECT TO public USING ((SELECT app.reads_all_accounting()));

CREATE POLICY accounting_insert ON public.payment_gateway_settings AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_update ON public.payment_gateway_settings AS RESTRICTIVE
    FOR UPDATE TO public USING ((SELECT app.writes_accounting()))
    WITH CHECK ((SELECT app.writes_accounting()));

CREATE POLICY accounting_delete ON public.payment_gateway_settings AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_accounting()));

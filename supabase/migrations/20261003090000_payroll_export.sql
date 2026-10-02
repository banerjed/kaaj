-- =============================================================================
-- Kaaj — export hours to the customer's payroll provider (docs/37)
-- =============================================================================
-- Kaaj does not calculate pay. For a pay period it writes each hourly
-- employee's approved hours and everyone's time off in the import format of
-- the provider the tenant uses. These tables hold only what that file needs:
-- which provider, the tenant's company code there, which provider code each
-- kind of hours goes under, and each employee's id in the provider.
--
-- All three are keyed by provider, so a tenant that changes provider keeps
-- the codes and ids it entered for the previous one.
-- =============================================================================

CREATE TABLE payroll_export_settings (
    tenant_id     UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL
                  CONSTRAINT payroll_export_settings_provider_is_known
                  CHECK (provider IN ('adp_run', 'adp_wfn', 'gusto', 'paychex_flex')),
    -- RUN: Company Code (IID). Workforce Now: Co Code. Paychex: Client ID.
    -- Gusto has none.
    company_code  VARCHAR(20),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by    UUID
);

-- One row per provider and source of hours. `source` is a Kaaj hour type, or
-- `time_off:` and the policy_code an approved request refers to
-- (hr_time_off_requests.policy_code is text, not a key, so this is too).
-- A NULL code is a decision: these hours are not exported (unpaid leave). An
-- ABSENT row is no decision, and the export refuses until there is one.
CREATE TABLE payroll_export_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider    TEXT NOT NULL
                CONSTRAINT payroll_export_codes_provider_is_known
                CHECK (provider IN ('adp_run', 'adp_wfn', 'gusto', 'paychex_flex')),
    source      TEXT NOT NULL
                CONSTRAINT payroll_export_codes_source_is_known
                CHECK (source IN ('regular', 'overtime', 'double_time')
                       OR source ~ '^time_off:.+$'),
    code        VARCHAR(50),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID,
    CONSTRAINT payroll_export_codes_one_per_source UNIQUE (tenant_id, provider, source)
);

-- The employee's id in the provider: RUN employee id, Workforce Now File #,
-- Paychex Worker ID. Text, because they keep leading zeros. NULL once
-- cleared: application code never deletes.
CREATE TABLE payroll_employee_ids (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL
                 CONSTRAINT payroll_employee_ids_provider_is_known
                 CHECK (provider IN ('adp_run', 'adp_wfn', 'gusto', 'paychex_flex')),
    external_id  VARCHAR(20),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID,
    CONSTRAINT payroll_employee_ids_one_per_employee UNIQUE (tenant_id, provider, employee_id),
    CONSTRAINT payroll_employee_ids_external_id_taken UNIQUE (tenant_id, provider, external_id)
);

ALTER TABLE payroll_export_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_export_settings
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_export_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_export_codes
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE payroll_employee_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employee_ids FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_employee_ids
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- Read tenant-wide (no secret, and an employee id in a provider is not a
-- national identifier); written only by the roles that run payroll, as the
-- other payroll tables are.
CREATE POLICY payroll_write_insert ON payroll_export_settings AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_update ON payroll_export_settings AS RESTRICTIVE
    FOR UPDATE TO public USING ((SELECT app.writes_payroll_tier1()))
    WITH CHECK ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_delete ON payroll_export_settings AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_insert ON payroll_export_codes AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_update ON payroll_export_codes AS RESTRICTIVE
    FOR UPDATE TO public USING ((SELECT app.writes_payroll_tier1()))
    WITH CHECK ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_delete ON payroll_export_codes AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_insert ON payroll_employee_ids AS RESTRICTIVE
    FOR INSERT TO public WITH CHECK ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_update ON payroll_employee_ids AS RESTRICTIVE
    FOR UPDATE TO public USING ((SELECT app.writes_payroll_tier1()))
    WITH CHECK ((SELECT app.writes_payroll_tier1()));
CREATE POLICY payroll_write_delete ON payroll_employee_ids AS RESTRICTIVE
    FOR DELETE TO public USING ((SELECT app.writes_payroll_tier1()));

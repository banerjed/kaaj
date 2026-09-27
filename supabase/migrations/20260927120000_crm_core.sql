-- CRM core (docs/service-provider-modules-overview.md, prioritized against real
-- usage data over docs/pending-modules-spec.md's ranking): a deal pipeline and
-- an activity timeline, both hanging off the EXISTING customers/customer_contacts
-- tables rather than a new company/contact schema — customers already carries
-- relationship_status ('prospect'|'active'|'inactive'|'churned'), account_manager_id,
-- industry, company_size, acquisition_source (added 20260926180000).

-- Small, admin-authored config: the Kanban columns. stage_type carries "won"/"lost"
-- so a deal's terminal state IS which column it sits in, never a separate field
-- that could disagree with the board (same reasoning as projects' TASK_STATUSES).
CREATE TABLE crm_pipeline_stages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sort_order  INT NOT NULL,
    stage_type  TEXT NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open', 'won', 'lost')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_pipeline_stages_tenant ON crm_pipeline_stages (tenant_id, sort_order);

ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_stages FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON crm_pipeline_stages
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

-- One row per potential sale. customer_contact_id is nullable — a deal can be
-- company-level, not always tied to one named person. value_amount is
-- NUMERIC(15,2), never a float (money rules).
CREATE TABLE crm_deals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id         UUID NOT NULL REFERENCES customers(id),
    customer_contact_id UUID REFERENCES customer_contacts(id),
    stage_id            UUID NOT NULL REFERENCES crm_pipeline_stages(id),
    name                TEXT NOT NULL,
    value_amount        NUMERIC(15,2),
    currency            TEXT,
    probability_percent INT CHECK (probability_percent BETWEEN 0 AND 100),
    expected_close_date DATE,
    owner_id            UUID NOT NULL REFERENCES employees(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_deals_tenant_customer ON crm_deals (tenant_id, customer_id);
CREATE INDEX idx_crm_deals_tenant_stage ON crm_deals (tenant_id, stage_id);
CREATE INDEX idx_crm_deals_tenant_owner ON crm_deals (tenant_id, owner_id);

ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON crm_deals
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER trg_crm_deals_updated_at
    BEFORE UPDATE ON crm_deals
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Calls, emails, meetings and notes — the shared activity timeline. Same
-- "actor + timestamp + body" shape as ticketing_updates/pm_task_comments,
-- not the unused cross_module_links table (zero consumers anywhere in this
-- codebase; a direct FK is simpler and no riskier for a known, small set of
-- parent types). Always tied to a customer (every lead has one, per the
-- create-both-rows-together rule); the contact/deal are the optional detail.
CREATE TABLE crm_activities (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id         UUID NOT NULL REFERENCES customers(id),
    customer_contact_id UUID REFERENCES customer_contacts(id),
    deal_id             UUID REFERENCES crm_deals(id),
    activity_type       TEXT NOT NULL CHECK (activity_type IN ('call', 'email', 'meeting', 'note')),
    subject             TEXT,
    body                TEXT,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID NOT NULL REFERENCES employees(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_activities_tenant_customer ON crm_activities (tenant_id, customer_id, occurred_at DESC);
CREATE INDEX idx_crm_activities_tenant_contact ON crm_activities (tenant_id, customer_contact_id, occurred_at DESC);
CREATE INDEX idx_crm_activities_tenant_deal ON crm_activities (tenant_id, deal_id, occurred_at DESC);

ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON crm_activities
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

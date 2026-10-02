-- =============================================================================
-- Kaaj — messaging: outbound and inbound SMS and email through Bird
-- =============================================================================
-- docs/37-messaging.md. Conversations between the firm and a customer
-- contact (or any outside address), on a channel Bird carries. Every table is
-- messaging_* so that a later customer-portal chat (17§4's chat_*) and the
-- internal team_chat_* never share a name with it.
--
-- Bird owns the endpoint (the phone number, the catch-all inbound domain);
-- Kaaj owns the mapping from endpoint to tenant. messaging_endpoints is that
-- mapping, and app.messaging_route() is the one read of it that happens
-- BEFORE a tenant is known — the webhook arrives with no session, so the
-- resolver is SECURITY DEFINER and returns only the tenant id. Everything the
-- webhook then writes goes through tenant_isolation with a claim whose role
-- is 'system'.
--
-- Every policy below is AS RESTRICTIVE on top of the PERMISSIVE
-- tenant_isolation, the same shape as team_chat (20260923050000).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Who may read and write messaging rows
-- -----------------------------------------------------------------------------
-- Mirrors messaging.read / messaging.write in @kaaj/authz: the firm's admins,
-- sales and marketing. auditor reads (it holds every .read permission) and
-- writes nothing. 'system' is the claim the Bird webhook route runs under —
-- there is no person behind an inbound message.

CREATE OR REPLACE FUNCTION app.reads_all_messaging() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin', 'system')
        OR (claims #> '{app_metadata,functional_roles}')
             ?| ARRAY['sales_admin', 'marketing_admin', 'auditor'],
        false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.reads_all_messaging() TO app_user;

CREATE OR REPLACE FUNCTION app.writes_messaging() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin', 'system')
        OR (claims #> '{app_metadata,functional_roles}')
             ?| ARRAY['sales_admin', 'marketing_admin'],
        false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.writes_messaging() TO app_user;


-- -----------------------------------------------------------------------------
-- 2. Endpoints — the addresses this tenant receives on
-- -----------------------------------------------------------------------------
-- An SMS endpoint is a number Bird provisioned into the Kaaj workspace. An
-- email endpoint is a local-part at the catch-all inbound domain; the
-- local-part is a random token, because the catch-all accepts anything and a
-- guessable slug would let a stranger file mail into another tenant.

CREATE TABLE messaging_endpoints (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    channel             TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    -- E.164 for sms; a full lower-case address for email.
    address             VARCHAR(255) NOT NULL,
    label               VARCHAR(120) NOT NULL,

    provider            TEXT NOT NULL DEFAULT 'bird' CHECK (provider = 'bird'),
    -- Bird's own id for the number (nda_…); NULL for an email endpoint.
    provider_ref        VARCHAR(80),
    country_code        CHAR(2),
    -- 'none' (email, or a number outside the registration regimes),
    -- 'pending' (10DLC / toll-free verification filed), 'verified'.
    registration_status TEXT NOT NULL DEFAULT 'none'
        CHECK (registration_status IN ('none', 'pending', 'verified')),

    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,

    UNIQUE (tenant_id, channel, address)
);

-- Inbound routing is by address alone — the webhook has no tenant yet. One
-- live address belongs to exactly one tenant; an archived one may be re-issued.
CREATE UNIQUE INDEX idx_messaging_endpoints_route
    ON messaging_endpoints (channel, address) WHERE is_active;

ALTER TABLE messaging_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_endpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging_endpoints
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY messaging_endpoint_visibility ON messaging_endpoints AS RESTRICTIVE FOR SELECT
USING (NOT (SELECT app.is_portal_contact()) AND (SELECT app.reads_all_messaging()));
CREATE POLICY messaging_endpoint_insert ON messaging_endpoints AS RESTRICTIVE FOR INSERT
WITH CHECK ((SELECT app.writes_messaging()));
CREATE POLICY messaging_endpoint_update ON messaging_endpoints AS RESTRICTIVE FOR UPDATE
USING ((SELECT app.writes_messaging()))
WITH CHECK ((SELECT app.writes_messaging()));

-- The one cross-tenant read: which tenant does this address belong to?
-- Returns only the id; the caller then opens a normal tenant-scoped
-- transaction and reads the endpoint row under RLS like everything else.
CREATE OR REPLACE FUNCTION app.messaging_route(p_channel TEXT, p_address TEXT) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT tenant_id
      FROM public.messaging_endpoints
     WHERE channel = p_channel
       AND address = lower(p_address)
       AND is_active
     LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION app.messaging_route(TEXT, TEXT) TO app_user;


-- -----------------------------------------------------------------------------
-- 3. Opt-outs — a STOP, a Bird preference event, or a note by staff
-- -----------------------------------------------------------------------------
-- Every outbound send checks this before it leaves. Revoking is a column,
-- never a DELETE (20260830120000_append_only.sql).

CREATE TABLE messaging_opt_outs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    channel         TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    address         VARCHAR(255) NOT NULL,
    reason          TEXT NOT NULL CHECK (reason IN ('stop', 'preference', 'bounce', 'manual')),
    noted_by        UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,

    UNIQUE (tenant_id, channel, address)
);

ALTER TABLE messaging_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_opt_outs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging_opt_outs
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY messaging_opt_out_visibility ON messaging_opt_outs AS RESTRICTIVE FOR SELECT
USING (NOT (SELECT app.is_portal_contact()) AND (SELECT app.reads_all_messaging()));
CREATE POLICY messaging_opt_out_insert ON messaging_opt_outs AS RESTRICTIVE FOR INSERT
WITH CHECK ((SELECT app.writes_messaging()));
CREATE POLICY messaging_opt_out_update ON messaging_opt_outs AS RESTRICTIVE FOR UPDATE
USING ((SELECT app.writes_messaging()))
WITH CHECK ((SELECT app.writes_messaging()));


-- -----------------------------------------------------------------------------
-- 4. Conversations — one thread per (endpoint, outside address)
-- -----------------------------------------------------------------------------
-- A composite target, so a conversation's endpoint is checked against the
-- same tenant by the foreign key itself (L109).
ALTER TABLE messaging_endpoints ADD CONSTRAINT uq_messaging_endpoints_tenant_id_id UNIQUE (tenant_id, id);

CREATE TABLE messaging_conversations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    channel                 TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    endpoint_id             UUID NOT NULL,
    counterparty_address    VARCHAR(255) NOT NULL,
    counterparty_name       VARCHAR(200),
    -- Matched by address at the time the thread opened; NULL when nobody in
    -- the CRM has that number or address.
    customer_contact_id     UUID,
    customer_id             UUID,
    -- Email only: the first subject on the thread. Replies carry "Re: ".
    subject                 VARCHAR(998),

    status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    -- TRUE from the moment an inbound message lands until someone opens the
    -- thread. Tenant-wide, not per reader: an inbox, not a chat.
    has_unread              BOOLEAN NOT NULL DEFAULT FALSE,
    last_message_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_direction          TEXT NOT NULL CHECK (last_direction IN ('inbound', 'outbound')),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at             TIMESTAMPTZ,

    CONSTRAINT fk_messaging_conversations_endpoint
        FOREIGN KEY (tenant_id, endpoint_id)
        REFERENCES messaging_endpoints (tenant_id, id),
    CONSTRAINT fk_messaging_conversations_contact
        FOREIGN KEY (tenant_id, customer_contact_id)
        REFERENCES customer_contacts (tenant_id, id),
    CONSTRAINT fk_messaging_conversations_customer
        FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers (tenant_id, id),
    CONSTRAINT uq_messaging_conversations_thread
        UNIQUE (tenant_id, channel, endpoint_id, counterparty_address)
);

-- The inbox: newest activity first, within a tenant.
CREATE INDEX idx_messaging_conversations_inbox
    ON messaging_conversations (tenant_id, last_message_at DESC);

ALTER TABLE messaging_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging_conversations
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY messaging_conversation_visibility ON messaging_conversations AS RESTRICTIVE FOR SELECT
USING (NOT (SELECT app.is_portal_contact()) AND (SELECT app.reads_all_messaging()));
CREATE POLICY messaging_conversation_insert ON messaging_conversations AS RESTRICTIVE FOR INSERT
WITH CHECK ((SELECT app.writes_messaging()));
CREATE POLICY messaging_conversation_update ON messaging_conversations AS RESTRICTIVE FOR UPDATE
USING ((SELECT app.writes_messaging()))
WITH CHECK ((SELECT app.writes_messaging()));


-- -----------------------------------------------------------------------------
-- 5. Messages
-- -----------------------------------------------------------------------------
-- Bird keeps a message for 30 days. This row is the copy Kaaj keeps for as
-- long as the tenant does; the body lives here, never only at Bird.
ALTER TABLE messaging_conversations ADD CONSTRAINT uq_messaging_conversations_tenant_id_id UNIQUE (tenant_id, id);

CREATE TABLE messaging_messages (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id         UUID NOT NULL,

    direction               TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_address            VARCHAR(255) NOT NULL,
    to_address              VARCHAR(255) NOT NULL,
    subject                 VARCHAR(998),
    body_text               TEXT NOT NULL,
    body_html               TEXT,

    -- Outbound: queued -> accepted -> sent -> delivered | failed.
    -- Inbound: received.
    status                  TEXT NOT NULL
        CHECK (status IN ('queued', 'accepted', 'sent', 'delivered', 'failed', 'received')),
    status_detail           VARCHAR(500),

    provider                TEXT NOT NULL DEFAULT 'bird' CHECK (provider = 'bird'),
    -- Bird's id: sms_… / em_… / rem_…. The dedupe key for a webhook retry.
    provider_message_id     VARCHAR(80),
    -- Email only: the RFC 5322 Message-ID, so a reply can thread in the
    -- recipient's mail client.
    rfc_message_id          VARCHAR(998),
    rfc_in_reply_to         VARCHAR(998),
    -- Inbound email only; NULL means Bird recorded no result.
    spf_pass                BOOLEAN,
    dkim_pass               BOOLEAN,

    -- Outbound only: who pressed send.
    author_employee_id      UUID,
    occurred_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_messaging_messages_conversation
        FOREIGN KEY (tenant_id, conversation_id)
        REFERENCES messaging_conversations (tenant_id, id),
    CONSTRAINT fk_messaging_messages_author
        FOREIGN KEY (author_employee_id) REFERENCES employees (id),
    CONSTRAINT ck_messaging_messages_direction_fields CHECK (
        (direction = 'outbound' AND author_employee_id IS NOT NULL AND status <> 'received')
        OR (direction = 'inbound' AND author_employee_id IS NULL AND status = 'received')
    )
);

-- Keyset pagination, newest-first, per thread (SCALE_SENSITIVE).
CREATE INDEX idx_messaging_messages_thread
    ON messaging_messages (tenant_id, conversation_id, occurred_at DESC);

-- A webhook retry (Bird redelivers for ~27 hours) must not file a message
-- twice; a status event must find the message it describes.
CREATE UNIQUE INDEX idx_messaging_messages_provider_id
    ON messaging_messages (tenant_id, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

ALTER TABLE messaging_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messaging_messages
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY messaging_message_visibility ON messaging_messages AS RESTRICTIVE FOR SELECT
USING (NOT (SELECT app.is_portal_contact()) AND (SELECT app.reads_all_messaging()));
CREATE POLICY messaging_message_insert ON messaging_messages AS RESTRICTIVE FOR INSERT
WITH CHECK ((SELECT app.writes_messaging()));
CREATE POLICY messaging_message_update ON messaging_messages AS RESTRICTIVE FOR UPDATE
USING ((SELECT app.writes_messaging()))
WITH CHECK ((SELECT app.writes_messaging()));

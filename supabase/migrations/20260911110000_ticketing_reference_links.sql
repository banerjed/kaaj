-- =============================================================================
-- Kaaj — ticketing: reference links (label + URL), not file attachments
-- =============================================================================
-- Real file attachments need real storage, which this codebase has
-- deliberately not built yet (see docs/18-document-repository.md and
-- docs/module-ticketing-plan.md) — ticketing_attachments exists but is
-- unused, and stays that way for now. This is a smaller, separate thing: a
-- staff member pasting a URL to something relevant (a vendor's spec page, an
-- internal wiki article, a doc that lives somewhere else already) — no
-- upload, no storage_key, no file_size to fake for something that was never
-- a file. It is meant to survive the real attachments feature landing later
-- rather than be replaced by it: "here's a useful link" and "here's an
-- uploaded file" are different things even once both exist.
--
-- Visibility is inherited, the same pattern as ticketing_ticket_tasks
-- (20260909140000): the EXISTS subquery against ticketing_tickets is itself
-- subject to that table's own RLS, so a link is visible only to someone who
-- can already see its ticket.
-- =============================================================================

CREATE TABLE ticketing_ticket_reference_links (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_id      UUID NOT NULL REFERENCES ticketing_tickets(id),
    label          TEXT NOT NULL,
    url            TEXT NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    display_order  INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     TEXT NOT NULL
);

ALTER TABLE ticketing_ticket_reference_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_ticket_reference_links FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ticketing_ticket_reference_links
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY staff_reference_link_visibility ON ticketing_ticket_reference_links AS RESTRICTIVE FOR SELECT
USING (
    EXISTS (SELECT 1 FROM ticketing_tickets t WHERE t.id = ticketing_ticket_reference_links.ticket_id)
);

CREATE INDEX idx_ticketing_ticket_reference_links_ticket_id
    ON ticketing_ticket_reference_links (tenant_id, ticket_id);

-- =============================================================================
-- Kaaj — ticketing: real parent/link graph, real assignee/subscriber rows
-- =============================================================================
-- Replaces three JSONB/text fields that couldn't be filtered, joined, or
-- FK-checked: parent_ticket_number (text, no FK), linked_tickets (JSONB array
-- of ticket numbers), assignees/subscribers (JSONB arrays of employee ids).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Parent ticket — a real FK, same business area only
-- -----------------------------------------------------------------------------
-- "Same business area" is enforced in the app layer
-- (ticketing.repo's parentInSameBusinessArea), the same choice as the
-- category-depth guard in the previous migration — a CHECK can't join back to
-- the parent row to compare business_area_id.

ALTER TABLE ticketing_tickets ADD COLUMN parent_ticket_id UUID REFERENCES ticketing_tickets(id);

UPDATE ticketing_tickets t
   SET parent_ticket_id = p.id
  FROM ticketing_tickets p
 WHERE p.tenant_id = t.tenant_id
   AND p.ticket_number = t.parent_ticket_number;

ALTER TABLE ticketing_tickets DROP COLUMN parent_ticket_number;

CREATE INDEX idx_ticketing_tickets_parent_ticket_id ON ticketing_tickets (tenant_id, parent_ticket_id);


-- -----------------------------------------------------------------------------
-- 2. Linked tickets — undirected, no relationship subtype (the user asked
--    for "a list of other tickets", not typed blocks/duplicates)
-- -----------------------------------------------------------------------------

-- No table here may DELETE (20260830120000_append_only.sql revokes it by
-- default for every future table) — "remove" is `is_active = FALSE`, and
-- re-adding the same pair reactivates the existing row via ON CONFLICT
-- rather than colliding with its own UNIQUE constraint.
CREATE TABLE ticketing_ticket_links (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_id         UUID NOT NULL REFERENCES ticketing_tickets(id),
    linked_ticket_id  UUID NOT NULL REFERENCES ticketing_tickets(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        TEXT NOT NULL,
    CHECK (ticket_id <> linked_ticket_id)
);

-- One row represents the link either way round; stored once, in the lesser
-- id first, so the app never has to de-duplicate a reversed pair.
CREATE UNIQUE INDEX uq_ticketing_ticket_links_pair
    ON ticketing_ticket_links (tenant_id, LEAST(ticket_id, linked_ticket_id), GREATEST(ticket_id, linked_ticket_id));

ALTER TABLE ticketing_ticket_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_ticket_links FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ticketing_ticket_links
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX idx_ticketing_ticket_links_ticket_id ON ticketing_ticket_links (tenant_id, ticket_id);
CREATE INDEX idx_ticketing_ticket_links_linked_ticket_id ON ticketing_ticket_links (tenant_id, linked_ticket_id);

INSERT INTO ticketing_ticket_links (tenant_id, ticket_id, linked_ticket_id, created_at, created_by)
SELECT DISTINCT t.tenant_id,
       least(t.id, l.id),
       greatest(t.id, l.id),
       now(),
       'migration:20260909110000'
  FROM ticketing_tickets t,
       jsonb_array_elements_text(coalesce(t.linked_tickets, '[]'::jsonb)) linked_number,
       ticketing_tickets l
 WHERE l.tenant_id = t.tenant_id
   AND l.ticket_number = linked_number
   AND l.id <> t.id
ON CONFLICT DO NOTHING;

ALTER TABLE ticketing_tickets DROP COLUMN linked_tickets;


-- -----------------------------------------------------------------------------
-- 3. Assignees and subscribers — rows, not JSONB arrays of ids. This is what
--    turns "tickets I'm assigned to" from a `@>` containment scan into a
--    real indexed join, and what a per-ticket viewer grant (next migration)
--    is modelled on.
-- -----------------------------------------------------------------------------

CREATE TABLE ticketing_ticket_assignees (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_id    UUID NOT NULL REFERENCES ticketing_tickets(id),
    employee_id  UUID NOT NULL REFERENCES employees(id),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by     TEXT NOT NULL,
    UNIQUE (tenant_id, ticket_id, employee_id)
);

CREATE TABLE ticketing_ticket_subscribers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_id    UUID NOT NULL REFERENCES ticketing_tickets(id),
    employee_id  UUID NOT NULL REFERENCES employees(id),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by     TEXT NOT NULL,
    UNIQUE (tenant_id, ticket_id, employee_id)
);

ALTER TABLE ticketing_ticket_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_ticket_assignees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_ticket_assignees
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE ticketing_ticket_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_ticket_subscribers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_ticket_subscribers
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX idx_ticketing_ticket_assignees_ticket_id ON ticketing_ticket_assignees (tenant_id, ticket_id);
CREATE INDEX idx_ticketing_ticket_assignees_employee_id ON ticketing_ticket_assignees (tenant_id, employee_id);
CREATE INDEX idx_ticketing_ticket_subscribers_ticket_id ON ticketing_ticket_subscribers (tenant_id, ticket_id);
CREATE INDEX idx_ticketing_ticket_subscribers_employee_id ON ticketing_ticket_subscribers (tenant_id, employee_id);

INSERT INTO ticketing_ticket_assignees (tenant_id, ticket_id, employee_id, added_at, added_by)
SELECT DISTINCT t.tenant_id, t.id, (elem)::uuid, t.logged_at, 'migration:20260909110000'
  FROM ticketing_tickets t, jsonb_array_elements_text(coalesce(t.assignees, '[]'::jsonb)) elem
 WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id = (elem)::uuid)
ON CONFLICT DO NOTHING;

INSERT INTO ticketing_ticket_subscribers (tenant_id, ticket_id, employee_id, added_at, added_by)
SELECT DISTINCT t.tenant_id, t.id, (elem)::uuid, t.logged_at, 'migration:20260909110000'
  FROM ticketing_tickets t, jsonb_array_elements_text(coalesce(t.subscribers, '[]'::jsonb)) elem
 WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id = (elem)::uuid)
ON CONFLICT DO NOTHING;

ALTER TABLE ticketing_tickets DROP COLUMN assignees;
ALTER TABLE ticketing_tickets DROP COLUMN subscribers;

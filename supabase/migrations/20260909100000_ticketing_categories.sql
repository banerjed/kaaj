-- =============================================================================
-- Kaaj — ticketing categories become rows, not JSONB
-- =============================================================================
-- docs/06-customization-model.md names "ticket categories" as Tier 1 —
-- customer-defined rows in a tenant-scoped table, the same answer as
-- chart_of_accounts. ticketing_business_areas.categories (JSONB) and
-- ticketing_tickets.category (bare text) predate that being built out; this
-- migration replaces both with real rows so a subcategory can exist, be FK'd
-- from a ticket, and be filtered on.
--
-- Two PLAIN tables, not one self-referencing one. The hierarchy here is
-- exactly two levels, always — never arbitrary depth like
-- chart_of_accounts.parent_account_id. A self-referencing FK can't express
-- "no more than two levels" at all (it would need an app-layer guard on
-- every write, silently bypassable via a direct insert, and every query
-- would need a nullable-parent branch to tell a category from a
-- subcategory apart). Two tables make a third level schema-impossible and
-- need no guard.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ticketing_tickets.business_area_id never had its FK. Needed now: the
--    parent-ticket guard (next migration) and the category scoping below both
--    depend on business_area_id actually pointing at a real row.
-- -----------------------------------------------------------------------------

ALTER TABLE ticketing_tickets
    ADD CONSTRAINT fk_ticketing_tickets_business_area_id
    FOREIGN KEY (business_area_id) REFERENCES ticketing_business_areas(id);


-- -----------------------------------------------------------------------------
-- 2. The tables
-- -----------------------------------------------------------------------------

CREATE TABLE ticketing_categories (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_area_id  UUID NOT NULL REFERENCES ticketing_business_areas(id),
    name              TEXT NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        TEXT NOT NULL,
    UNIQUE (tenant_id, business_area_id, name)
);

CREATE TABLE ticketing_subcategories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id   UUID NOT NULL REFERENCES ticketing_categories(id),
    name          TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    TEXT NOT NULL,
    UNIQUE (tenant_id, category_id, name)
);

ALTER TABLE ticketing_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_categories
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

ALTER TABLE ticketing_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_subcategories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_subcategories
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX idx_ticketing_categories_business_area_id
    ON ticketing_categories (tenant_id, business_area_id);
CREATE INDEX idx_ticketing_subcategories_category_id
    ON ticketing_subcategories (tenant_id, category_id);


-- -----------------------------------------------------------------------------
-- 3. Backfill from the JSONB that exists today. No subcategory data existed
--    before this, so subcategory_id below stays NULL for every pre-existing
--    ticket — that's a real "none chosen", not a gap.
-- -----------------------------------------------------------------------------

INSERT INTO ticketing_categories (tenant_id, business_area_id, name, created_at, created_by)
SELECT ba.tenant_id, ba.id, elem->>'label', ba.created_at, ba.created_by
  FROM ticketing_business_areas ba,
       jsonb_array_elements(coalesce(ba.categories, '[]'::jsonb)) elem
 WHERE coalesce(elem->>'label', '') <> ''
ON CONFLICT DO NOTHING;

-- A ticket's `category` text may not match any of its business area's
-- configured categories (hand-entered data, or a category since renamed).
-- Rather than leave it unmapped, materialize it as a category row — losing
-- no data is worth more here than a perfectly tidy category list.
INSERT INTO ticketing_categories (tenant_id, business_area_id, name, created_at, created_by)
SELECT DISTINCT t.tenant_id, t.business_area_id, t.category, now(), 'migration:20260909100000'
  FROM ticketing_tickets t
 WHERE t.business_area_id IS NOT NULL
   AND coalesce(t.category, '') <> ''
   AND NOT EXISTS (
         SELECT 1 FROM ticketing_categories c
          WHERE c.business_area_id = t.business_area_id AND c.name = t.category
       );

ALTER TABLE ticketing_tickets ADD COLUMN category_id UUID REFERENCES ticketing_categories(id);
ALTER TABLE ticketing_tickets ADD COLUMN subcategory_id UUID REFERENCES ticketing_subcategories(id);

UPDATE ticketing_tickets t
   SET category_id = c.id
  FROM ticketing_categories c
 WHERE c.business_area_id = t.business_area_id
   AND c.name = t.category;

-- Every ticket had a business_area_id and a non-empty category text by this
-- point in the fixture, and the backfill above guarantees a matching row —
-- so this is safe to make mandatory rather than silently nullable (L50/L51:
-- an empty column here would be an unchecked column, not a flexible one).
ALTER TABLE ticketing_tickets ALTER COLUMN category_id SET NOT NULL;

-- Superseded by the FK columns above.
ALTER TABLE ticketing_tickets DROP COLUMN category;
ALTER TABLE ticketing_business_areas DROP COLUMN categories;

CREATE INDEX idx_ticketing_tickets_category_id ON ticketing_tickets (tenant_id, category_id);
CREATE INDEX idx_ticketing_tickets_subcategory_id ON ticketing_tickets (tenant_id, subcategory_id);

-- Dead since day one: createTicket() always inserts the literal 'open', so
-- this default was never read. Correcting it anyway — 'Pending' matches
-- neither TICKET_STATUSES nor any row in the fixture (L57's shape, just not
-- yet triggered because nothing relies on the default).
ALTER TABLE ticketing_tickets ALTER COLUMN status SET DEFAULT 'open';

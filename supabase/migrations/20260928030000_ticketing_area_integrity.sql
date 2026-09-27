-- A ticket always belongs to a business area, its category to that same area,
-- and its subcategory to that category — held by the schema, not only by
-- createTicket, because every feature that uses tickets as a backing store
-- writes this table.
--
-- The composite keys include tenant_id: a plain foreign key is checked by
-- Postgres with its own query that bypasses RLS, so it would accept another
-- tenant's category id.

DO $$
DECLARE
    no_area int;
    wrong_category int;
    wrong_subcategory int;
BEGIN
    SELECT count(*) INTO no_area FROM ticketing_tickets WHERE business_area_id IS NULL;

    SELECT count(*) INTO wrong_category
      FROM ticketing_tickets t
      JOIN ticketing_categories c ON c.id = t.category_id
     WHERE c.business_area_id IS DISTINCT FROM t.business_area_id
        OR c.tenant_id <> t.tenant_id;

    SELECT count(*) INTO wrong_subcategory
      FROM ticketing_tickets t
      JOIN ticketing_subcategories s ON s.id = t.subcategory_id
     WHERE s.category_id <> t.category_id
        OR s.tenant_id <> t.tenant_id;

    -- Refuse rather than repair: which area or category a ticket should
    -- have been filed under is a decision for a person, not a migration.
    IF no_area + wrong_category + wrong_subcategory > 0 THEN
        RAISE EXCEPTION 'ticketing_tickets: % with no business area, % with a category from another area, % with a subcategory from another category — correct these rows first',
            no_area, wrong_category, wrong_subcategory;
    END IF;
END $$;

ALTER TABLE ticketing_tickets ALTER COLUMN business_area_id SET NOT NULL;

ALTER TABLE ticketing_categories
    ADD CONSTRAINT uq_ticketing_categories_tenant_id_area
        UNIQUE (tenant_id, id, business_area_id);

ALTER TABLE ticketing_subcategories
    ADD CONSTRAINT uq_ticketing_subcategories_tenant_id_category
        UNIQUE (tenant_id, id, category_id);

ALTER TABLE ticketing_tickets
    DROP CONSTRAINT ticketing_tickets_category_id_fkey,
    ADD CONSTRAINT fk_ticketing_tickets_category_in_area
        FOREIGN KEY (tenant_id, category_id, business_area_id)
        REFERENCES ticketing_categories (tenant_id, id, business_area_id);

-- MATCH SIMPLE: a ticket with no subcategory is not checked, which is right —
-- subcategory is optional.
ALTER TABLE ticketing_tickets
    DROP CONSTRAINT ticketing_tickets_subcategory_id_fkey,
    ADD CONSTRAINT fk_ticketing_tickets_subcategory_in_category
        FOREIGN KEY (tenant_id, subcategory_id, category_id)
        REFERENCES ticketing_subcategories (tenant_id, id, category_id);

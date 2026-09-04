-- =============================================================================
-- Kaaj — ticketing, portal-side (docs/17-customer-portal.md §2)
-- =============================================================================
-- Builds on 20260904090000's identity: a customer contact reading/writing
-- their own tickets, scoped by app.current_customer_id()/is_portal_contact().
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A fourth identity-resolution function — the contact's own id, not just
--    their customer's. current_customer_id()/is_portal_contact() (previous
--    migration) answer "which customer" and "is this a portal contact at
--    all"; the INSERT checks below need "is this THEIR OWN row", which needs
--    the contact id itself.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_customer_contact_id() RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN nullif(claims #>> '{app_metadata,customer_contact_id}', '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION app.current_customer_contact_id() TO app_user;


-- -----------------------------------------------------------------------------
-- 2. ticketing_tickets: which customer, and who logged it
-- -----------------------------------------------------------------------------
-- Denormalized customer_id — RLS filters directly, no join needed for every
-- read, same reasoning as the documents/chat_threads design in the spec.

ALTER TABLE ticketing_tickets ADD COLUMN customer_id UUID REFERENCES customers(id);

-- RENAME, not a new column — the 6 existing fixture rows keep their values
-- with no backfill; a rename changes the name, not the data.
ALTER TABLE ticketing_tickets RENAME COLUMN logger_id TO logger_employee_id;
ALTER TABLE ticketing_tickets ALTER COLUMN logger_employee_id DROP NOT NULL;
ALTER TABLE ticketing_tickets ADD COLUMN logger_contact_id UUID REFERENCES customer_contacts(id);

-- A ticket was logged by staff OR by a portal contact, never both and never
-- neither — same shape as tenant_users.employee_id/customer_contact_id.
ALTER TABLE ticketing_tickets ADD CONSTRAINT ck_ticketing_tickets_one_logger
    CHECK (num_nonnulls(logger_employee_id, logger_contact_id) = 1);


-- -----------------------------------------------------------------------------
-- 3. ticketing_updates: who wrote it
-- -----------------------------------------------------------------------------
-- author_employee_id already exists (nullable) alongside author_id (NOT
-- NULL, generic — every seeded row already has author_id = author_employee_id,
-- so nothing here changes existing rows). Add the missing contact-side twin.

ALTER TABLE ticketing_updates ADD COLUMN author_contact_id UUID REFERENCES customer_contacts(id);

ALTER TABLE ticketing_updates ADD CONSTRAINT ck_ticketing_updates_one_author
    CHECK (num_nonnulls(author_employee_id, author_contact_id) = 1);


-- -----------------------------------------------------------------------------
-- 4. Portal visibility — reuses the functions above and from the identity
--    migration, not reinvented. Reinventing this exact check is what
--    produced L74 last time.
-- -----------------------------------------------------------------------------

CREATE POLICY portal_visibility ON ticketing_tickets AS RESTRICTIVE FOR SELECT
USING (
    NOT (SELECT app.is_portal_contact())
    OR customer_id = (SELECT app.current_customer_id())
);

-- A portal contact never sees an internal-only update, even on a ticket they
-- can otherwise see in full — resolved in SQL, not after the query
-- (CLAUDE.md's disclosure rule).
CREATE POLICY portal_updates_visibility ON ticketing_updates AS RESTRICTIVE FOR SELECT
USING (
    NOT (SELECT app.is_portal_contact())
    OR (
      visibility <> 'internal'
      AND EXISTS (
        SELECT 1 FROM ticketing_tickets t
         WHERE t.id = ticketing_updates.ticket_id
           AND t.customer_id = (SELECT app.current_customer_id())
      )
    )
);

-- A portal contact may create a ticket only in a business area marked
-- portal-visible, only for their own customer, only self-attributed.
CREATE POLICY portal_ticket_insert ON ticketing_tickets AS RESTRICTIVE FOR INSERT
WITH CHECK (
    NOT (SELECT app.is_portal_contact())
    OR (
      customer_id = (SELECT app.current_customer_id())
      AND logger_contact_id = (SELECT app.current_customer_contact_id())
      AND EXISTS (
        SELECT 1 FROM ticketing_business_areas ba
         WHERE ba.id = ticketing_tickets.business_area_id
           AND ba.settings->>'portalVisible' = 'true'
      )
    )
);

-- A portal contact may only add an EXTERNAL update to a ticket on their own
-- customer, self-attributed — never an internal note.
CREATE POLICY portal_update_insert ON ticketing_updates AS RESTRICTIVE FOR INSERT
WITH CHECK (
    NOT (SELECT app.is_portal_contact())
    OR (
      author_contact_id = (SELECT app.current_customer_contact_id())
      AND visibility = 'external'
      AND EXISTS (
        SELECT 1 FROM ticketing_tickets t
         WHERE t.id = ticketing_updates.ticket_id
           AND t.customer_id = (SELECT app.current_customer_id())
      )
    )
);

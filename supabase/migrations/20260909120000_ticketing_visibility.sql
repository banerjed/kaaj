-- =============================================================================
-- Kaaj — ticketing: business-area-scoped visibility
-- =============================================================================
-- Until now, RLS on ticketing_tickets was tenant_isolation only — any
-- employee could SELECT any staff-side ticket; ticketing.read.own/.all only
-- changed what the LIST QUERY defaulted to, not what the database allowed.
-- `private` existed on the table and was read by nothing (an L39 shape).
--
-- This migration makes visibility real: a business area has a default
-- member list, and `private` narrows a ticket to
-- logger/assignee/subscriber only — BA membership stops being sufficient
-- once a ticket is marked private. "A ticket can add extra users" (the
-- product requirement) is simply adding them as a subscriber — a separate
-- per-ticket viewer grant would duplicate exactly what subscribers already
-- do, for no new capability.
--
-- RESTRICTIVE, additive to 20260905090000's portal_visibility /
-- portal_updates_visibility (AS RESTRICTIVE policies on the same table AND
-- together — CLAUDE.md's row-policy rule). Both new policies open with
-- `(SELECT app.is_portal_contact()) OR (...)` — the portal is handled
-- entirely by its own policy, so this one must not narrow a portal
-- contact's rows at all, the mirror image of how the portal policies open
-- with `NOT is_portal_contact() OR (...)`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Business-area default membership
-- -----------------------------------------------------------------------------

-- is_active, not DELETE — every future table is DELETE-revoked by default
-- (20260830120000_append_only.sql); "remove" is a flag, "re-add" an
-- ON CONFLICT reactivation.
CREATE TABLE ticketing_business_area_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_area_id  UUID NOT NULL REFERENCES ticketing_business_areas(id),
    employee_id       UUID NOT NULL REFERENCES employees(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by          TEXT NOT NULL,
    UNIQUE (tenant_id, business_area_id, employee_id)
);

ALTER TABLE ticketing_business_area_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_business_area_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_business_area_members
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX idx_ticketing_ba_members_business_area_id ON ticketing_business_area_members (tenant_id, business_area_id);
CREATE INDEX idx_ticketing_ba_members_employee_id ON ticketing_business_area_members (tenant_id, employee_id);


-- -----------------------------------------------------------------------------
-- 2. Who reads every ticket regardless of membership — mirrors
--    ticketing.read.all in @kaaj/authz (owner/firm_admin as base roles;
--    it_admin/auditor as functional roles). A conformance test asserts they
--    agree, deliberately without sharing an implementation — same pattern as
--    app.reads_all_employees().
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.reads_all_tickets() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['it_admin', 'auditor'],
        false);
EXCEPTION WHEN OTHERS THEN
    -- A malformed claim means "reads nobody's", never "reads everybody's".
    RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.reads_all_tickets() TO app_user;


-- -----------------------------------------------------------------------------
-- 3. The policies
-- -----------------------------------------------------------------------------

CREATE POLICY staff_ticket_visibility ON ticketing_tickets AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.is_portal_contact())
    OR (SELECT app.reads_all_tickets())
    OR logger_employee_id = (SELECT app.current_employee_id())
    OR EXISTS (
         SELECT 1 FROM ticketing_ticket_assignees a
          WHERE a.ticket_id = ticketing_tickets.id
            AND a.employee_id = (SELECT app.current_employee_id())
            AND a.is_active
       )
    OR EXISTS (
         SELECT 1 FROM ticketing_ticket_subscribers s
          WHERE s.ticket_id = ticketing_tickets.id
            AND s.employee_id = (SELECT app.current_employee_id())
            AND s.is_active
       )
    OR (
         NOT private
         AND EXISTS (
               SELECT 1 FROM ticketing_business_area_members m
                WHERE m.business_area_id = ticketing_tickets.business_area_id
                  AND m.employee_id = (SELECT app.current_employee_id())
                  AND m.is_active
             )
       )
);

-- Same shape for updates: internal/external is orthogonal to this — a
-- portal contact's internal/external split stays exactly as
-- portal_updates_visibility already enforces it; this only adds the
-- staff-side "can you see the ticket at all" gate, via the ticket row's own
-- (freshly-restricted) visibility. The subquery is itself subject to
-- ticketing_tickets' RLS, so this doesn't restate staff_ticket_visibility.
CREATE POLICY staff_update_visibility ON ticketing_updates AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.is_portal_contact())
    OR EXISTS (
         SELECT 1 FROM ticketing_tickets t WHERE t.id = ticketing_updates.ticket_id
       )
);


-- -----------------------------------------------------------------------------
-- 4. The index the efficient-updates read actually needs — "latest 3" and
--    "the first one" both currently sort the whole ticket's update set.
-- -----------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_ticketing_updates_ticket_id;
CREATE INDEX idx_ticketing_updates_ticket_id ON ticketing_updates (tenant_id, ticket_id, created_at);

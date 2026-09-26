-- =============================================================================
-- Kaaj — user groups, wired for real (docs/28-user-groups.md)
-- =============================================================================
-- employee_user_groups/employee_group_members were scaffolded wholesale in
-- the initial schema pass (like pm_task_attachments before it — L101): zero
-- real consumers, and linked to each other only by a `group_name` TEXT
-- string with no FK — the naming-convention shape L100 warns about.
--
-- This migration makes them real (a proper group_id FK, is_active removal
-- instead of DELETE) and uses them to permission two existing surfaces:
-- ticketing business areas (additive to the individual membership
-- 20260909120000 already built) and projects (which have had no visibility
-- mechanism at all — "the board is firm-wide" — until now).
--
-- Project visibility is opt-in per project (`is_restricted`, default
-- FALSE), the same shape as ticketing_tickets.private: every existing
-- project stays visible to everyone until an admin restricts it, so this is
-- additive — no fixture rewrite forced by default behavior change.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. employee_user_groups — drop the approval workflow nothing uses
-- -----------------------------------------------------------------------------

ALTER TABLE employee_user_groups ALTER COLUMN approver_id DROP NOT NULL;
ALTER TABLE employee_user_groups ALTER COLUMN backup_approver_id DROP NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. employee_group_members — replace the naming-convention link with a
--    real FK, and make removal a flag (no DELETE grant, 20260830120000).
-- -----------------------------------------------------------------------------

ALTER TABLE employee_group_members ADD COLUMN group_id UUID;
UPDATE employee_group_members m
   SET group_id = g.id
  FROM employee_user_groups g
 WHERE g.tenant_id = m.tenant_id AND g.group_name = m.group_name;
DELETE FROM employee_group_members WHERE group_id IS NULL;
ALTER TABLE employee_group_members ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE employee_group_members
    ADD CONSTRAINT fk_employee_group_members_group_id
    FOREIGN KEY (group_id) REFERENCES employee_user_groups(id) ON DELETE CASCADE;
ALTER TABLE employee_group_members DROP COLUMN group_name;

ALTER TABLE employee_group_members ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE employee_group_members
    ADD CONSTRAINT employee_group_members_tenant_id_group_id_employee_id_key
    UNIQUE (tenant_id, group_id, employee_id);

CREATE INDEX idx_employee_group_members_group_id ON employee_group_members (tenant_id, group_id);


-- -----------------------------------------------------------------------------
-- 3. projects — opt-in restriction flag; drop the dead team_members column
--    (never read or written by app code — confirmed by grep before this
--    migration was written; docs/27 already predicted its removal here).
-- -----------------------------------------------------------------------------

ALTER TABLE projects ADD COLUMN is_restricted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects DROP COLUMN team_members;


-- -----------------------------------------------------------------------------
-- 4. Group-grant tables — same shape as ticketing_business_area_members
--    (20260909120000): is_active instead of DELETE, replace-whole-list from
--    the app, reactivated via ON CONFLICT.
-- -----------------------------------------------------------------------------

CREATE TABLE ticketing_business_area_group_grants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_area_id  UUID NOT NULL REFERENCES ticketing_business_areas(id),
    group_id          UUID NOT NULL REFERENCES employee_user_groups(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by          TEXT NOT NULL,
    UNIQUE (tenant_id, business_area_id, group_id)
);

ALTER TABLE ticketing_business_area_group_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_business_area_group_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ticketing_business_area_group_grants
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX idx_ticketing_ba_group_grants_business_area_id ON ticketing_business_area_group_grants (tenant_id, business_area_id);
CREATE INDEX idx_ticketing_ba_group_grants_group_id ON ticketing_business_area_group_grants (tenant_id, group_id);

CREATE TABLE project_group_grants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id        UUID NOT NULL REFERENCES projects(id),
    group_id          UUID NOT NULL REFERENCES employee_user_groups(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by          TEXT NOT NULL,
    UNIQUE (tenant_id, project_id, group_id)
);

ALTER TABLE project_group_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_group_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON project_group_grants
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX idx_project_group_grants_project_id ON project_group_grants (tenant_id, project_id);
CREATE INDEX idx_project_group_grants_group_id ON project_group_grants (tenant_id, group_id);


-- -----------------------------------------------------------------------------
-- 5. Project visibility — new to this table. Mirrors app.reads_all_tickets()
--    (20260909120000) exactly, for the roles that already hold
--    projects.write firm-wide in @kaaj/authz.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.reads_all_projects() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['project_manager'],
        false);
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION app.reads_all_projects() TO app_user;

-- FOR SELECT only — a bare `AS RESTRICTIVE USING(...)` also gates
-- INSERT/UPDATE and Postgres reuses USING as WITH CHECK, which would refuse
-- `INSERT ... RETURNING id` for a freshly created project (no group grants
-- yet) even from a projects.write holder (CLAUDE.md's own row-policy rule).
CREATE POLICY project_visibility ON projects AS RESTRICTIVE FOR SELECT
USING (
    (SELECT app.reads_all_projects())
    OR NOT is_restricted
    OR project_manager_id = (SELECT app.current_employee_id())
    OR EXISTS (
         SELECT 1 FROM project_group_grants g
          JOIN employee_group_members m ON m.group_id = g.group_id
         WHERE g.project_id = projects.id AND g.is_active
           AND m.employee_id = (SELECT app.current_employee_id()) AND m.is_active
       )
);

-- A task is visible exactly when its parent project is — reads only
-- `projects`, never the other way, so this pair can't recurse (L92 is about
-- a table's policy re-querying the SAME table; a cross-table read is fine,
-- but a projects policy reading tasks here WOULD make the pair circular).
-- Same acyclic shape as ticketing_updates -> ticketing_tickets.
CREATE POLICY task_visibility ON tasks AS RESTRICTIVE FOR SELECT
USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = tasks.project_id)
);


-- -----------------------------------------------------------------------------
-- 6. Ticketing — additive group-grant arm on the existing staff visibility
--    policy. A CREATE OR REPLACE isn't available for policies; this restates
--    every existing arm (CLAUDE.md's DROP/CREATE-must-restate-everything rule).
-- -----------------------------------------------------------------------------

DROP POLICY staff_ticket_visibility ON ticketing_tickets;

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
    OR (
         NOT private
         AND EXISTS (
               SELECT 1 FROM ticketing_business_area_group_grants g
                JOIN employee_group_members m ON m.group_id = g.group_id
               WHERE g.business_area_id = ticketing_tickets.business_area_id
                 AND g.is_active
                 AND m.employee_id = (SELECT app.current_employee_id())
                 AND m.is_active
             )
       )
);

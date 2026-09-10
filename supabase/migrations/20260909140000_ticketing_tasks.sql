-- =============================================================================
-- Kaaj — ticketing: a real task checklist per ticket
-- =============================================================================
-- `ticketing_tickets.tasks` was JSONB from the original schema and read by
-- nothing — the same dead-column shape `custom_fields` was in before
-- 20260909130000. This replaces it with a real table so a checklist item can
-- be assigned, dated and completed like any other row, not an opaque blob.
--
-- Visibility is inherited, not restated: `staff_task_visibility` mirrors
-- 20260909120000's `staff_update_visibility` exactly — the EXISTS subquery
-- against ticketing_tickets is itself subject to that table's own RLS
-- (staff_ticket_visibility, portal_visibility), so a task is visible only to
-- someone who can already see its ticket. Nothing here restates who that is.
-- =============================================================================

CREATE TABLE ticketing_ticket_tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ticket_id             UUID NOT NULL REFERENCES ticketing_tickets(id),
    title                 TEXT NOT NULL,
    assignee_employee_id  UUID REFERENCES employees(id),
    due_date              DATE,
    is_done               BOOLEAN NOT NULL DEFAULT FALSE,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    display_order         INTEGER NOT NULL DEFAULT 0,
    done_at               TIMESTAMPTZ,
    done_by               TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            TEXT NOT NULL
);

ALTER TABLE ticketing_ticket_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_ticket_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ticketing_ticket_tasks
    USING (tenant_id = app.current_tenant_id())
    WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY staff_task_visibility ON ticketing_ticket_tasks AS RESTRICTIVE FOR SELECT
USING (
    EXISTS (SELECT 1 FROM ticketing_tickets t WHERE t.id = ticketing_ticket_tasks.ticket_id)
);

CREATE INDEX idx_ticketing_ticket_tasks_ticket_id ON ticketing_ticket_tasks (tenant_id, ticket_id);
CREATE INDEX idx_ticketing_ticket_tasks_assignee_id ON ticketing_ticket_tasks (tenant_id, assignee_employee_id);

ALTER TABLE ticketing_tickets DROP COLUMN tasks;

-- The list page's default sort (`ORDER BY t.logged_at DESC`) had no
-- supporting index — every page of a paginated, tens-of-thousands-of-rows
-- list would otherwise sort the whole table.
CREATE INDEX idx_ticketing_tickets_logged_at ON ticketing_tickets (tenant_id, logged_at DESC);

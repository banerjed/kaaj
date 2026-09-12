-- =============================================================================
-- Kaaj — ticketing: simplify the per-ticket checklist to a plain to-do list
-- =============================================================================
-- Product decision: a ticket's checklist is a TODO list, not a mini work-item
-- tracker — no per-item assignee, no per-item due date. Both columns are
-- dropped rather than left unused; nothing downstream (verify-stories.sql's
-- TIX-tasks check only reads is_done) depends on either.
-- =============================================================================

ALTER TABLE ticketing_ticket_tasks
    DROP COLUMN assignee_employee_id,
    DROP COLUMN due_date;

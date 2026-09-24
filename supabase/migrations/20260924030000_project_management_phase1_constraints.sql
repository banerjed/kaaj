-- Project Management Phase 1 (docs/23-project-management-phase1.md) makes
-- three relationships load-bearing that were, until now, plain unenforced
-- columns: subtask nesting, same-project task dependencies, and a project's
-- objective. Neither `tasks` nor `projects` carries a single FK today — the
-- migration that shipped the v2 schema dropped every `REFERENCES` from the
-- spec when translating its arrays to JSONB, apparently as a side effect
-- rather than a decision. This migration does not retrofit that gap
-- wholesale (client_id, project_manager_id, contact_person_id and others
-- stay as they are — untouched by this phase); it adds exactly the
-- relationships Phase 1 writes.

-- A subtask is exactly one level deep: `parent_task_id` set implies
-- `depth_level = 1`, and a subtask cannot itself be a parent (there is no
-- row whose parent has a non-null parent_task_id, enforced structurally by
-- this CHECK rather than by application code alone).
ALTER TABLE tasks ADD CONSTRAINT tasks_depth_matches_parent CHECK (
  (parent_task_id IS NULL AND depth_level = 0) OR
  (parent_task_id IS NOT NULL AND depth_level = 1)
);

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_parent_task_id
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- `depends_on_task_ids` cannot itself be foreign-keyed (it's a JSONB array,
-- like `assigned_to`'s TEXT-with-no-FK precedent) but a task naming itself
-- is a data invariant worth a CHECK regardless of the JSONB shape.
ALTER TABLE tasks ADD CONSTRAINT no_self_dependency
  CHECK (NOT (depends_on_task_ids @> to_jsonb(id::text)));

ALTER TABLE projects
  ADD CONSTRAINT fk_projects_objective_id
  FOREIGN KEY (objective_id) REFERENCES pm_objectives(id) ON DELETE SET NULL;

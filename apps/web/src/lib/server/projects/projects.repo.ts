import type { Tx } from "../db/tenant"
import * as objectives from "../objectives/objectives.repo"

/**
 * projects + tasks — money is a string and sums happen in SQL. `task_count`
 * and `completed_task_count` are denormalised counters; this repository also
 * counts the tasks directly, so a drifted counter is visible, not believed.
 *
 * No row-visibility policy — a project is firm business, every employee may
 * see the board. `client_visible` is a different boundary; see `clientVisibleOnly`.
 *
 * Phase 1 additions (docs/23-project-management-phase1.md): a project may
 * belong to one objective (`objective_id`), whose rollup is refreshed here,
 * in the same transaction, whenever a project write could change it — same
 * discipline as `refreshTaskCounters` below. A task may have one subtask
 * level (`parent_task_id`/`depth_level`) and same-project dependencies
 * (`depends_on_task_ids`, with `blocks_task_ids` its recomputed reverse
 * index — see `refreshDependencyIndex`).
 */

export type ProjectRow = {
  id: string
  project_number: string | null
  project_name: string
  status: string | null
  health_status: string | null
  priority: string | null
  progress_percentage: string | null
  /** As stored on the project row. */
  task_count: number
  completed_task_count: number
  /** Counted from `tasks`, so a stale counter is visible. */
  actual_task_count: number
  actual_completed_count: number
  budget: string | null
  actual_cost: string | null
  total_billed: string | null
  /** numeric(18,4) — the rate work on this project is billed at. */
  hourly_rate: string | null
  currency: string | null
  estimated_hours: string | null
  actual_hours: string | null
  start_date: string | null
  target_end_date: string | null
  client_name: string | null
  manager_name: string | null
  is_billable: boolean | null
  overdue_task_count: number
  objective_id: string | null
  objective_name: string | null
}

const SELECT = `
  SELECT p.id, p.project_number, p.project_name, p.status, p.health_status,
         p.priority,
         p.progress_percentage::text AS progress_percentage,
         p.task_count, p.completed_task_count,
         p.budget::text          AS budget,
         p.actual_cost::text     AS actual_cost,
         p.total_billed::text    AS total_billed,
         p.hourly_rate::text     AS hourly_rate,
         p.currency,
         p.estimated_hours::text AS estimated_hours,
         p.actual_hours::text    AS actual_hours,
         to_char(p.start_date,'YYYY-MM-DD')      AS start_date,
         to_char(p.target_end_date,'YYYY-MM-DD') AS target_end_date,
         c.client_name,
         m.first_name || ' ' || m.last_name AS manager_name,
         p.is_billable,
         p.objective_id::text AS objective_id,
         o.objective_name,
         (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id)
           AS actual_task_count,
         (SELECT count(*)::int FROM tasks t
           WHERE t.project_id = p.id AND t.status = 'done')
           AS actual_completed_count,
         -- Past due AND not finished — a done task past its date was just delivered.
         (SELECT count(*)::int FROM tasks t
           WHERE t.project_id = p.id
             AND t.due_date < CURRENT_DATE
             AND t.status <> 'done')
           AS overdue_task_count
    FROM projects p
    LEFT JOIN clients c        ON c.id = p.client_id
    LEFT JOIN employees m      ON m.id = p.project_manager_id
    LEFT JOIN pm_objectives o  ON o.id = p.objective_id
`

/**
 * Same columns as `SELECT`, minus the three `tasks` correlated subqueries —
 * fine for `byId`'s single row but a full scan of `tasks` PER PROJECT ROW on
 * the list as it grows. `list` fetches this instead and merges in
 * `taskCountsFor`'s one batched aggregate query — same shape as
 * `accounting.repo.ts`'s `invoiceLineTotalsFor`.
 */
const LIST_SELECT = `
  SELECT p.id, p.project_number, p.project_name, p.status, p.health_status,
         p.priority,
         p.progress_percentage::text AS progress_percentage,
         p.task_count, p.completed_task_count,
         p.budget::text          AS budget,
         p.actual_cost::text     AS actual_cost,
         p.total_billed::text    AS total_billed,
         p.hourly_rate::text     AS hourly_rate,
         p.currency,
         p.estimated_hours::text AS estimated_hours,
         p.actual_hours::text    AS actual_hours,
         to_char(p.start_date,'YYYY-MM-DD')      AS start_date,
         to_char(p.target_end_date,'YYYY-MM-DD') AS target_end_date,
         c.client_name,
         m.first_name || ' ' || m.last_name AS manager_name,
         p.is_billable,
         p.objective_id::text AS objective_id,
         o.objective_name
    FROM projects p
    LEFT JOIN clients c        ON c.id = p.client_id
    LEFT JOIN employees m      ON m.id = p.project_manager_id
    LEFT JOIN pm_objectives o  ON o.id = p.objective_id
`

/** `actual_task_count`/`actual_completed_count`/`overdue_task_count` for a set of projects, in one query — see `LIST_SELECT`. */
async function taskCountsFor(
  tx: Tx,
  projectIds: string[],
): Promise<
  Record<
    string,
    {
      actual_task_count: number
      actual_completed_count: number
      overdue_task_count: number
    }
  >
> {
  if (projectIds.length === 0) return {}
  const rows = await tx<
    {
      project_id: string
      actual_task_count: number
      actual_completed_count: number
      overdue_task_count: number
    }[]
  >`
    SELECT project_id::text AS project_id,
           count(*)::int AS actual_task_count,
           count(*) FILTER (WHERE status = 'done')::int AS actual_completed_count,
           count(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done')::int
             AS overdue_task_count
      FROM tasks
     WHERE project_id = ANY(${projectIds}::uuid[])
     GROUP BY project_id
  `
  const out: Record<
    string,
    {
      actual_task_count: number
      actual_completed_count: number
      overdue_task_count: number
    }
  > = {}
  for (const { project_id, ...counts } of rows) out[project_id] = counts
  return out
}

export async function list(
  tx: Tx,
  filters: { status?: string; health?: string; clientId?: string } = {},
): Promise<ProjectRow[]> {
  const { status = "", health = "" } = filters
  // NULL rather than '' for the uuid cast (L37).
  const clientId = filters.clientId || null
  const rows = await tx<
    Omit<
      ProjectRow,
      "actual_task_count" | "actual_completed_count" | "overdue_task_count"
    >[]
  >`
    ${tx.unsafe(LIST_SELECT)}
     WHERE p.archived_at IS NULL
       AND (${status} = '' OR p.status = ${status})
       AND (${health} = '' OR p.health_status = ${health})
       AND (${clientId}::uuid IS NULL OR p.client_id = ${clientId}::uuid)
     ORDER BY p.project_number
  `
  const counts = await taskCountsFor(
    tx,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    ...r,
    actual_task_count: counts[r.id]?.actual_task_count ?? 0,
    actual_completed_count: counts[r.id]?.actual_completed_count ?? 0,
    overdue_task_count: counts[r.id]?.overdue_task_count ?? 0,
  }))
}

export async function byId(tx: Tx, id: string): Promise<ProjectRow | null> {
  const [row] = await tx<
    ProjectRow[]
  >`${tx.unsafe(SELECT)} WHERE p.id = ${id}::uuid`
  return row ?? null
}

/** Projects whose stored counters disagree with the tasks they count. */
export async function staleCounters(
  tx: Tx,
): Promise<
  { project_number: string | null; claimed: number; actual: number }[]
> {
  return tx`
    SELECT p.project_number,
           p.task_count AS claimed,
           (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS actual
      FROM projects p
     WHERE p.task_count IS DISTINCT FROM
           (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id)
     ORDER BY p.project_number
  ` as never
}

export type TaskLink = {
  id: string
  task_number: string | null
  task_name: string
  status: string
}

export type TaskRow = {
  id: string
  task_number: string | null
  task_name: string
  status: string | null
  priority: string | null
  assignee_name: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: string | null
  actual_hours: string | null
  progress_percentage: string | null
  is_billable: boolean | null
  is_overdue: boolean
  parent_task_id: string | null
  depth_level: number
  /** What this task depends on — an incomplete one renders as "Blocked by" (annotation only, never writes `status`). */
  depends_on: TaskLink[]
  /** What depends on this task — the recomputed reverse index, see `refreshDependencyIndex`. */
  blocks: TaskLink[]
}

/**
 * A board's task count is bounded by what a team actually manages at once,
 * not by tenure — unlike `tasks`'s own SCALE_SENSITIVE classification, which
 * is about the table as a whole across every project. A cap here is defense
 * against one pathological project (a bad import, a bug elsewhere), not a
 * real business limit.
 */
const BOARD_TASK_CAP = 500

export async function tasksFor(tx: Tx, projectId: string): Promise<TaskRow[]> {
  return tx<TaskRow[]>`
    SELECT t.id, t.task_number, t.task_name, t.status, t.priority,
           e.first_name || ' ' || e.last_name AS assignee_name,
           to_char(t.start_date,'YYYY-MM-DD') AS start_date,
           to_char(t.due_date,'YYYY-MM-DD')   AS due_date,
           t.estimated_hours::text     AS estimated_hours,
           t.actual_hours::text        AS actual_hours,
           t.progress_percentage::text AS progress_percentage,
           t.is_billable,
           -- Decided against the DATABASE's date, not the viewer's clock.
           (t.due_date < CURRENT_DATE AND t.status <> 'done') AS is_overdue,
           t.parent_task_id::text AS parent_task_id,
           t.depth_level,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', d.id, 'task_number', d.task_number,
                      'task_name', d.task_name, 'status', d.status
                    ) ORDER BY d.task_number)
               FROM tasks d
              WHERE d.id::text IN (
                      SELECT jsonb_array_elements_text(t.depends_on_task_ids)
                    )
           ), '[]'::jsonb) AS depends_on,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', b.id, 'task_number', b.task_number,
                      'task_name', b.task_name, 'status', b.status
                    ) ORDER BY b.task_number)
               FROM tasks b
              WHERE b.id::text IN (
                      SELECT jsonb_array_elements_text(t.blocks_task_ids)
                    )
           ), '[]'::jsonb) AS blocks
      FROM tasks t
      -- assigned_to is TEXT with no FK; cast employees.id to text (not the
      -- reverse) so a malformed value just matches nothing instead of raising.
      LEFT JOIN employees e ON e.id::text = t.assigned_to
      -- A subtask's PRIMARY sort key is its parent's own key, so it sorts
      -- adjacent to it without disturbing the existing top-level ordering
      -- (for a top-level task, pt is NULL and COALESCE falls back to its
      -- own values — unchanged from before subtasks existed).
      LEFT JOIN tasks pt ON pt.id = t.parent_task_id
     WHERE t.project_id = ${projectId}::uuid
     ORDER BY COALESCE(pt.board_position, t.board_position) NULLS LAST,
              COALESCE(pt.due_date, t.due_date) NULLS LAST,
              COALESCE(pt.task_number, t.task_number),
              t.depth_level,
              t.board_position NULLS LAST, t.due_date NULLS LAST, t.task_number
     LIMIT ${BOARD_TASK_CAP}
  `
}

/** The true count behind `tasksFor`'s capped list, so a truncated board can say so. */
export async function countTasksFor(
  tx: Tx,
  projectId: string,
): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM tasks WHERE project_id = ${projectId}::uuid
  `
  return n
}

/**
 * The client-facing slice, filtered in SQL — not used yet (no Client Portal),
 * but the boundary is resolved here where the data is read, not left to a page (L39).
 */
export async function clientVisibleOnly(
  tx: Tx,
  clientId: string,
): Promise<ProjectRow[]> {
  return tx<ProjectRow[]>`
    ${tx.unsafe(SELECT)}
     WHERE p.archived_at IS NULL
       AND p.client_id = ${clientId}::uuid
       AND p.client_visible = TRUE
     ORDER BY p.project_number
  `
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
//
// status/priority/health are plain `text`, no enum or CHECK — these lists ARE
// the constraint. Exported so pages import them rather than keeping a second copy.

/** The values `tasks.status` may hold. `done` is what "completed" counts. */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const

/** The values `projects.status` may hold. `draft` is the column default — omitting it made new projects unreachable from every filter (L57). */
export const PROJECT_STATUSES = [
  "draft",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const

export const PROJECT_HEALTHS = ["on_track", "at_risk", "off_track"] as const
export const PROJECT_PRIORITIES = ["low", "medium", "high", "urgent"] as const

/** A write refused for a reason the page can put on a field — same shape as `RaiseRefused` in compensation. */
export class ProjectWriteRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_project"
      | "no_such_task"
      | "number_taken"
      | "unknown_status"
      | "invalid_parent"
      | "no_such_dependency"
      | "cross_project_dependency"
      | "self_dependency"
      | "dependency_cycle"
      | "no_such_objective",
  ) {
    super(reason)
    this.name = "ProjectWriteRefused"
  }
}

/**
 * Bring `task_count` and `completed_task_count` back in line with the tasks —
 * recomputed, never incremented (L58). `status = 'done'` here must match
 * `actual_completed_count` in SELECT above, or the two disagree silently
 * (caught by `staleCounters()`). Always called in the same transaction as the task write.
 */
async function refreshTaskCounters(tx: Tx, projectId: string): Promise<void> {
  await tx`
    UPDATE projects p
       SET task_count =
             (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id),
           completed_task_count =
             (SELECT count(*)::int FROM tasks t
               WHERE t.project_id = p.id AND t.status = 'done'),
           last_activity_at = now(),
           updated_at       = now()
     WHERE p.id = ${projectId}::uuid
  `
}

/**
 * The next `T-nnn` / `PRJ-nnn`, from the numbers already in use. A race
 * between two writers hits the UNIQUE constraint — a refusal, not two tasks
 * sharing a number — and the caller turns it into `number_taken`.
 */
async function nextNumber(
  tx: Tx,
  table: "tasks" | "projects",
  prefix: string,
): Promise<string> {
  const column = table === "tasks" ? "task_number" : "project_number"
  const [row] = await tx<{ n: number }[]>`
    SELECT coalesce(
             max(nullif(substring(${tx.unsafe(column)} from '[0-9]+$'), '')::int),
             0
           ) + 1 AS n
      FROM ${tx.unsafe(table)}
  `
  return `${prefix}-${String(row.n).padStart(3, "0")}`
}

export type NewTask = {
  project_id: string
  task_name: string
  status: TaskStatus
  priority: string | null
  assigned_to: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: string | null
  is_billable: boolean
  description: string | null
  /** A subtask's parent — must be a top-level (`depth_level = 0`) task in the SAME project. */
  parent_task_id?: string | null
}

/**
 * Add a task to a project, and keep the project's counters true.
 * `created_at`/`updated_at` have no DEFAULT — must be set explicitly.
 * `depth_level` is computed here, never taken from the caller — see
 * `tasks_depth_matches_parent` (docs/23-project-management-phase1.md).
 */
export async function createTask(
  tx: Tx,
  tenantId: string,
  input: NewTask,
  actorId: string,
): Promise<{ id: string; task_number: string }> {
  const [project] = await tx<{ id: string }[]>`
    SELECT id FROM projects WHERE id = ${input.project_id}::uuid
  `
  if (!project) throw new ProjectWriteRefused("no_such_project")

  const parentId = input.parent_task_id || null
  let depthLevel = 0
  if (parentId) {
    const [parent] = await tx<{ depth_level: number }[]>`
      SELECT depth_level FROM tasks
       WHERE id = ${parentId}::uuid AND project_id = ${input.project_id}::uuid
    `
    // Not found, in a different project, or itself already a subtask —
    // a subtask cannot have a subtask (one level deep, enforced again by
    // the CHECK below as the backstop for a direct POST).
    if (!parent || parent.depth_level !== 0) {
      throw new ProjectWriteRefused("invalid_parent")
    }
    depthLevel = 1
  }

  const number = await nextNumber(tx, "tasks", "T")
  const done = input.status === "done"

  try {
    const [row] = await tx<{ id: string; task_number: string }[]>`
      INSERT INTO tasks (
        tenant_id, task_id, task_number, project_id, parent_task_id, depth_level,
        task_name, description,
        status, priority, assigned_to, start_date, due_date,
        estimated_hours, is_billable, progress_percentage,
        completed_date, completed_at,
        created_at, updated_at, created_by
      ) VALUES (
        ${tenantId}::uuid, ${number}, ${number}, ${input.project_id}::uuid,
        ${parentId}::uuid, ${depthLevel},
        ${input.task_name}, ${input.description},
        ${input.status}, ${input.priority}, ${input.assigned_to},
        ${input.start_date}::date, ${input.due_date}::date,
        ${input.estimated_hours}::numeric, ${input.is_billable},
        ${done ? "100" : "0"}::numeric,
        ${done ? tx`CURRENT_DATE` : null}, ${done ? tx`now()` : null},
        now(), now(), ${actorId}
      )
      RETURNING id, task_number
    `
    await refreshTaskCounters(tx, input.project_id)
    return row
  } catch (e) {
    if (isUniqueViolation(e)) throw new ProjectWriteRefused("number_taken")
    throw e
  }
}

/** Move a task to another status — status, completed_date and progress move together, or a task can read as both open and finished. */
export async function setTaskStatus(
  tx: Tx,
  taskId: string,
  status: TaskStatus,
  actorId: string,
): Promise<{ project_id: string; from: string; task_name: string }> {
  if (!TASK_STATUSES.includes(status)) {
    throw new ProjectWriteRefused("unknown_status")
  }

  const [current] = await tx<
    { project_id: string; status: string; task_name: string }[]
  >`
    SELECT project_id, status, task_name FROM tasks WHERE id = ${taskId}::uuid
  `
  if (!current) throw new ProjectWriteRefused("no_such_task")

  const done = status === "done"
  await tx`
    UPDATE tasks
       SET status              = ${status},
           completed_date      = ${done ? tx`CURRENT_DATE` : null},
           completed_at        = ${done ? tx`now()` : null},
           progress_percentage = ${done ? tx`100` : tx`progress_percentage`},
           updated_at          = now(),
           updated_by          = ${actorId}
     WHERE id = ${taskId}::uuid
  `
  await refreshTaskCounters(tx, current.project_id)
  return {
    project_id: current.project_id,
    from: current.status,
    task_name: current.task_name,
  }
}

/**
 * `blocks_task_ids` is never written directly — it's the reverse index of
 * every task in the project whose `depends_on_task_ids` names this one,
 * recomputed for the WHOLE project in one statement (never a loop) whenever
 * an edge changes anywhere in it. Same "recompute, don't increment"
 * discipline as `refreshTaskCounters`, applied to a derived array instead of
 * a number.
 */
async function refreshDependencyIndex(tx: Tx, projectId: string) {
  await tx`
    UPDATE tasks t SET blocks_task_ids = COALESCE(
      (SELECT jsonb_agg(o.id::text) FROM tasks o
        WHERE o.project_id = t.project_id
          AND o.depends_on_task_ids @> to_jsonb(t.id::text)),
      '[]'::jsonb
    )
    WHERE t.project_id = ${projectId}::uuid
  `
}

/**
 * Add "taskId depends on dependsOnId" — same project only (Phase 1; a
 * cross-project dependency is Monday.com's "Connect Boards" column, part of
 * the typed-column system this phase defers). Refused on: a missing task, a
 * different project, depending on itself (the CHECK is the backstop), or a
 * cycle — checked with one recursive CTE that walks the graph FORWARD from
 * `dependsOnId` along existing edges: if it can already reach `taskId`,
 * `dependsOnId` transitively depends on `taskId`, and adding this edge would
 * close the loop.
 */
export async function addDependency(
  tx: Tx,
  taskId: string,
  dependsOnId: string,
  actorId: string,
) {
  if (taskId === dependsOnId) throw new ProjectWriteRefused("self_dependency")

  const [[task], [dependsOn]] = await Promise.all([
    tx<{ project_id: string; depends_on_task_ids: string[] }[]>`
      SELECT project_id, depends_on_task_ids FROM tasks WHERE id = ${taskId}::uuid
    `,
    tx<{ project_id: string }[]>`
      SELECT project_id FROM tasks WHERE id = ${dependsOnId}::uuid
    `,
  ])
  if (!task || !dependsOn) throw new ProjectWriteRefused("no_such_dependency")
  if (task.project_id !== dependsOn.project_id) {
    throw new ProjectWriteRefused("cross_project_dependency")
  }

  const [{ cycle }] = await tx<{ cycle: boolean }[]>`
    WITH RECURSIVE reachable(id) AS (
      SELECT ${dependsOnId}::uuid
      UNION
      SELECT jsonb_array_elements_text(t.depends_on_task_ids)::uuid
        FROM tasks t
        JOIN reachable r ON t.id = r.id
       WHERE t.project_id = ${task.project_id}::uuid
    )
    SELECT EXISTS (SELECT 1 FROM reachable WHERE id = ${taskId}::uuid) AS cycle
  `
  if (cycle) throw new ProjectWriteRefused("dependency_cycle")

  const nextEdges = Array.from(
    new Set([...(task.depends_on_task_ids ?? []), dependsOnId]),
  )
  await tx`
    UPDATE tasks
       SET depends_on_task_ids = ${tx.json(nextEdges as never)},
           updated_at          = now(),
           updated_by          = ${actorId}
     WHERE id = ${taskId}::uuid
  `
  await refreshDependencyIndex(tx, task.project_id)
}

export async function removeDependency(
  tx: Tx,
  taskId: string,
  dependsOnId: string,
  actorId: string,
) {
  const [task] = await tx<
    { project_id: string; depends_on_task_ids: string[] }[]
  >`
    SELECT project_id, depends_on_task_ids FROM tasks WHERE id = ${taskId}::uuid
  `
  if (!task) throw new ProjectWriteRefused("no_such_task")

  const nextEdges = (task.depends_on_task_ids ?? []).filter(
    (id) => id !== dependsOnId,
  )
  await tx`
    UPDATE tasks
       SET depends_on_task_ids = ${tx.json(nextEdges as never)},
           updated_at          = now(),
           updated_by          = ${actorId}
     WHERE id = ${taskId}::uuid
  `
  await refreshDependencyIndex(tx, task.project_id)
}

export type NewProject = {
  project_name: string
  client_id: string | null
  project_manager_id: string | null
  status: string
  priority: string
  health_status: string
  start_date: string | null
  target_end_date: string | null
  budget: string | null
  currency: string
  estimated_hours: string | null
  is_billable: boolean
  hourly_rate: string | null
  description: string | null
  objective_id: string | null
}

async function assertObjectiveExists(tx: Tx, objectiveId: string | null) {
  if (!objectiveId) return
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM pm_objectives WHERE id = ${objectiveId}::uuid
  `
  if (!row) throw new ProjectWriteRefused("no_such_objective")
}

/** Create a project. `budget`/`hourly_rate` arrive as strings, cast in SQL. Counters start at 0; only `refreshTaskCounters` writes them after. */
export async function createProject(
  tx: Tx,
  tenantId: string,
  input: NewProject,
  actorId: string,
): Promise<{ id: string; project_number: string }> {
  await assertObjectiveExists(tx, input.objective_id)
  const number = await nextNumber(tx, "projects", "PRJ")
  try {
    const [row] = await tx<{ id: string; project_number: string }[]>`
      INSERT INTO projects (
        tenant_id, project_id, project_number, project_name, description,
        client_id, project_manager_id, objective_id,
        status, priority, health_status,
        start_date, target_end_date,
        budget, currency, estimated_hours, is_billable, hourly_rate,
        task_count, completed_task_count,
        created_at, updated_at, created_by
      ) VALUES (
        ${tenantId}::uuid, ${number}, ${number}, ${input.project_name},
        ${input.description},
        ${input.client_id}::uuid, ${input.project_manager_id}::uuid,
        ${input.objective_id}::uuid,
        ${input.status}, ${input.priority}, ${input.health_status},
        ${input.start_date}::date, ${input.target_end_date}::date,
        ${input.budget}::numeric, ${input.currency},
        ${input.estimated_hours}::numeric, ${input.is_billable},
        ${input.hourly_rate}::numeric,
        0, 0,
        now(), now(), ${actorId}
      )
      RETURNING id, project_number
    `
    // The objective this project just joined may have a rollup to update
    // even on its very first project (0 -> 1 changes progress_percentage).
    await objectives.refreshRollup(tx, input.objective_id)
    return row
  } catch (e) {
    if (isUniqueViolation(e)) throw new ProjectWriteRefused("number_taken")
    throw e
  }
}

/** The fields an edit may move, and the values they had before it. */
export type ProjectEdit = {
  project_name: string
  status: string
  priority: string
  health_status: string
  target_end_date: string | null
  budget: string | null
  currency: string
  is_billable: boolean
  hourly_rate: string | null
  objective_id: string | null
}

/** Update a project, returning what the audited fields WERE — read inside this transaction, not by the caller beforehand, to avoid a race. */
export async function updateProject(
  tx: Tx,
  id: string,
  input: ProjectEdit,
  actorId: string,
): Promise<ProjectEdit> {
  await assertObjectiveExists(tx, input.objective_id)
  const [before] = await tx<ProjectEdit[]>`
    SELECT project_name, status, priority, health_status,
           to_char(target_end_date,'YYYY-MM-DD') AS target_end_date,
           budget::text      AS budget,
           currency,
           is_billable,
           hourly_rate::text AS hourly_rate,
           objective_id::text AS objective_id
      FROM projects WHERE id = ${id}::uuid
  `
  if (!before) throw new ProjectWriteRefused("no_such_project")

  await tx`
    UPDATE projects
       SET project_name    = ${input.project_name},
           status          = ${input.status},
           priority        = ${input.priority},
           health_status   = ${input.health_status},
           target_end_date = ${input.target_end_date}::date,
           budget          = ${input.budget}::numeric,
           currency        = ${input.currency},
           is_billable     = ${input.is_billable},
           hourly_rate     = ${input.hourly_rate}::numeric,
           objective_id    = ${input.objective_id}::uuid,
           updated_at      = now(),
           updated_by      = ${actorId}
     WHERE id = ${id}::uuid
  `

  // Refresh both sides of a move — the objective this project left, and the
  // one it joined, since either rollup can change (L58: recomputed, not
  // incremented). A no-op when they're the same objective or both null.
  if (before.objective_id !== input.objective_id) {
    await objectives.refreshRollup(tx, before.objective_id)
  }
  await objectives.refreshRollup(tx, input.objective_id)

  return before
}

/** postgres.js surfaces the SQLSTATE on the error; 23505 is unique_violation. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && e.code === "23505"
  )
}

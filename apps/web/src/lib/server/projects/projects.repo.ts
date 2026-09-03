import type { Tx } from "../db/tenant"

/**
 * projects + tasks — money is a string and sums happen in SQL. `task_count`
 * and `completed_task_count` are denormalised counters; this repository also
 * counts the tasks directly, so a drifted counter is visible, not believed.
 *
 * No row-visibility policy — a project is firm business, every employee may
 * see the board. `client_visible` is a different boundary; see `clientVisibleOnly`.
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
    LEFT JOIN clients c   ON c.id = p.client_id
    LEFT JOIN employees m ON m.id = p.project_manager_id
`

export async function list(
  tx: Tx,
  filters: { status?: string; health?: string; clientId?: string } = {},
): Promise<ProjectRow[]> {
  const { status = "", health = "" } = filters
  // NULL rather than '' for the uuid cast (L37).
  const clientId = filters.clientId || null
  return tx<ProjectRow[]>`
    ${tx.unsafe(SELECT)}
     WHERE p.archived_at IS NULL
       AND (${status} = '' OR p.status = ${status})
       AND (${health} = '' OR p.health_status = ${health})
       AND (${clientId}::uuid IS NULL OR p.client_id = ${clientId}::uuid)
     ORDER BY p.project_number
  `
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
}

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
           (t.due_date < CURRENT_DATE AND t.status <> 'done') AS is_overdue
      FROM tasks t
      -- assigned_to is TEXT with no FK; cast employees.id to text (not the
      -- reverse) so a malformed value just matches nothing instead of raising.
      LEFT JOIN employees e ON e.id::text = t.assigned_to
     WHERE t.project_id = ${projectId}::uuid
     ORDER BY t.board_position NULLS LAST, t.due_date NULLS LAST, t.task_number
  `
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
      "no_such_project" | "no_such_task" | "number_taken" | "unknown_status",
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
}

/** Add a task to a project, and keep the project's counters true. `created_at`/`updated_at` have no DEFAULT — must be set explicitly. */
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

  const number = await nextNumber(tx, "tasks", "T")
  const done = input.status === "done"

  try {
    const [row] = await tx<{ id: string; task_number: string }[]>`
      INSERT INTO tasks (
        tenant_id, task_id, task_number, project_id, task_name, description,
        status, priority, assigned_to, start_date, due_date,
        estimated_hours, is_billable, progress_percentage,
        completed_date, completed_at,
        created_at, updated_at, created_by
      ) VALUES (
        ${tenantId}::uuid, ${number}, ${number}, ${input.project_id}::uuid,
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
}

/** Create a project. `budget`/`hourly_rate` arrive as strings, cast in SQL. Counters start at 0; only `refreshTaskCounters` writes them after. */
export async function createProject(
  tx: Tx,
  tenantId: string,
  input: NewProject,
  actorId: string,
): Promise<{ id: string; project_number: string }> {
  const number = await nextNumber(tx, "projects", "PRJ")
  try {
    const [row] = await tx<{ id: string; project_number: string }[]>`
      INSERT INTO projects (
        tenant_id, project_id, project_number, project_name, description,
        client_id, project_manager_id,
        status, priority, health_status,
        start_date, target_end_date,
        budget, currency, estimated_hours, is_billable, hourly_rate,
        task_count, completed_task_count,
        created_at, updated_at, created_by
      ) VALUES (
        ${tenantId}::uuid, ${number}, ${number}, ${input.project_name},
        ${input.description},
        ${input.client_id}::uuid, ${input.project_manager_id}::uuid,
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
}

/** Update a project, returning what the audited fields WERE — read inside this transaction, not by the caller beforehand, to avoid a race. */
export async function updateProject(
  tx: Tx,
  id: string,
  input: ProjectEdit,
  actorId: string,
): Promise<ProjectEdit> {
  const [before] = await tx<ProjectEdit[]>`
    SELECT project_name, status, priority, health_status,
           to_char(target_end_date,'YYYY-MM-DD') AS target_end_date,
           budget::text      AS budget,
           currency,
           is_billable,
           hourly_rate::text AS hourly_rate
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
           updated_at      = now(),
           updated_by      = ${actorId}
     WHERE id = ${id}::uuid
  `
  return before
}

/** postgres.js surfaces the SQLSTATE on the error; 23505 is unique_violation. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && e.code === "23505"
  )
}

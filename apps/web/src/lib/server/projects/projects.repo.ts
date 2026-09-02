import type { Tx } from "../db/tenant"

/**
 * projects + tasks — module-project-management-v2.md.
 *
 * **Money is a string and every sum happens in SQL.** `budget`, `actual_cost`,
 * `total_billed` and `hourly_rate` are NUMERIC; adding them in JavaScript is
 * the float64 round trip, and once they are correctly typed as strings it
 * becomes silent concatenation with no type error.
 *
 * `task_count` and `completed_task_count` are DENORMALISED counters kept on
 * the project row. This repository reads them AND counts the tasks, so a
 * project claiming more tasks than it has is visible rather than believed —
 * the same shape as `payroll_runs.employee_count` against its lines. A counter
 * nobody checks drifts, and it drifts into a progress bar that looks fine.
 *
 * These tables carry no row-visibility policy: a project is firm business
 * data, not data about a person, and every employee may see the board. The
 * `client_visible` flag is a DIFFERENT boundary — it governs what a client
 * sees through the portal, which is not built. See `clientVisibleOnly` below.
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
         -- Overdue means past its date AND not finished. A done task with a
         -- date in the past is simply a task that was delivered.
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
  // NULL rather than '' for the uuid: SQL does not short-circuit, so
  // `'' = '' OR id = ''::uuid` evaluates the cast anyway and raises
  // `invalid input syntax for type uuid` (L37).
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
           -- Decided in SQL, against the DATABASE's date. Computing it in the
           -- browser would use the viewer's clock, so the same task would be
           -- overdue in Auckland and not in New York.
           (t.due_date < CURRENT_DATE AND t.status <> 'done') AS is_overdue
      FROM tasks t
      -- tasks.assigned_to is TEXT holding a uuid, not a uuid column, and it
      -- carries no foreign key. Casting employees.id to text rather than
      -- assigned_to to uuid keeps a malformed value from raising
      -- 'invalid input syntax for type uuid' and taking the whole board down;
      -- it simply matches nothing, and the task shows as unassigned.
      --
      -- (No backticks in SQL comments here: this is inside a JS template
      -- literal, where a backtick ends the string.)
      LEFT JOIN employees e ON e.id::text = t.assigned_to
     WHERE t.project_id = ${projectId}::uuid
     ORDER BY t.board_position NULLS LAST, t.due_date NULLS LAST, t.task_number
  `
}

/**
 * The client-facing slice, filtered in SQL.
 *
 * Not used yet — the Client Portal is not built — but written here so the
 * boundary exists before a caller needs it. `client_visible` governs
 * disclosure, so it is resolved WHERE THE DATA IS READ and never handed to a
 * page to honour: a repository that fetches everything and filters afterwards
 * has already put the private rows in a result set, a log line and a heap
 * dump (L39).
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
// `projects` and `tasks` are plain `text` for status, priority and health —
// no enum, no CHECK constraint. The database will accept any string at all, so
// these lists are the only thing standing between a crafted POST and a board
// column nobody can render. They are exported so the pages read them from here
// rather than keeping a second copy that drifts.

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

/**
 * The values `projects.status` may hold.
 *
 * `draft` is here because it is the COLUMN DEFAULT, and a created project
 * lands on it. The filter list omitted it while nothing could create a
 * project, which was harmless right up until something could — a new project
 * would have been unreachable from every filter on the list page.
 */
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

/**
 * A write refused for a reason the page can put on a field.
 *
 * Same shape as `RaiseRefused` in compensation: a domain refusal is not an
 * exception the user should see as a 500, and it is not a validation failure
 * the FormReader could have caught either.
 */
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
 * Bring `task_count` and `completed_task_count` back in line with the tasks.
 *
 * **Recomputed, never incremented.** An increment is correct only if every
 * writer remembers it and no write ever fails halfway; a recount is correct
 * whatever happened before it, so a counter that has already drifted is
 * repaired by the next write rather than carried forward. The cost is one
 * extra scan of a handful of rows per task write, which is nothing at SMB
 * scale and is the reason this cannot be the source of a wrong progress bar.
 *
 * `status = 'done'` must stay IDENTICAL to the definition of
 * `actual_completed_count` in `SELECT` above. If the two ever disagree the
 * page shows a project as both complete and not, and `staleCounters()` — which
 * is what `projects.test.ts` asserts is empty — is what catches it.
 *
 * Called inside the SAME transaction as the task write, always. Written
 * afterwards it is a second transaction that can be lost, and the counter is
 * then wrong until someone notices a progress bar that looks fine.
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
 * The next `T-nnn` / `PRJ-nnn`, from the numbers already in use.
 *
 * Two writers racing here both read the same maximum and the second INSERT
 * hits `UNIQUE (tenant_id, task_id)`. That is the right outcome — a refusal,
 * not two tasks sharing a number — and the caller turns it into
 * `number_taken` rather than a 500.
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

/**
 * Add a task to a project, and keep the project's counters true.
 *
 * `created_at` and `updated_at` are `NOT NULL` with **no DEFAULT** on this
 * table, so both are set explicitly. Omitting them is a null-violation at
 * runtime rather than a row with a sensible timestamp — worth knowing before
 * writing the next INSERT here.
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

/**
 * Move a task to another status.
 *
 * The three fields that describe completion move TOGETHER — status, the date,
 * and the progress figure. Leaving `completed_date` set on a task pulled back
 * out of `done` is how a board ends up with a task that is open and finished
 * at once, and it is the sort of thing no error reports.
 */
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

/**
 * Create a project.
 *
 * `budget` and `hourly_rate` arrive as STRINGS and are cast in SQL. They are
 * `numeric(18,4)`, they reach an invoice, and a float64 round trip on the way
 * in cannot be recovered downstream by any amount of rounding.
 *
 * Counters start at 0 and are then the business of `refreshTaskCounters`
 * alone — nothing else writes them.
 */
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

/**
 * Update a project, returning what the audited fields WERE.
 *
 * The old values are read inside this transaction rather than by the caller
 * beforehand: a trail that records only what a value became has lost the half
 * an auditor asks about, and reading it in a separate query is a window in
 * which it can change.
 */
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

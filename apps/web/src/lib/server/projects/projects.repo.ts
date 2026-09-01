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

import type { Tx } from "../db/tenant"
import type { ROUNDING } from "../firm-profile/firm_payroll_policies.repo"

/** `nearest_N` -> N minutes. Keyed off `ROUNDING` so a new rounding value added there is a type error here until given an increment. */
const ROUNDING_MINUTES: Record<
  Exclude<(typeof ROUNDING)[number], "none">,
  number
> = { nearest_5: 5, nearest_6: 6, nearest_15: 15 }

/**
 * time_tracking_entries — logged hours against a project/task, billed at a
 * snapshotted rate. No row-visibility policy: like `projects`, this is firm
 * business every employee may see (`projects.repo.ts`'s reasoning applies
 * unchanged — a colleague's logged hours are attendance-shaped, not
 * compensation-shaped).
 *
 * Two different numbers are snapshotted at two different moments, on purpose:
 * `hourly_rate` is resolved at CREATE time from `time_tracking_hourly_rates`
 * (effective-dated on `entry_date` — the rate the work was actually billed
 * at does not move later). `billable_amount` is resolved at APPROVAL time,
 * because rounding depends on the office's CURRENT `firm_payroll_policies`
 * row, which can change between when hours are logged and when they are
 * approved. `hours` itself is never rounded or rewritten — only the money
 * derived from it is, so effort tracking (`tasks.actual_hours`) always
 * reflects what was actually logged.
 */

export const TIME_ENTRY_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
] as const
export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number]

export class TimeEntryWriteRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_project"
      | "no_such_task"
      | "not_draft"
      | "not_submitted"
      | "self_approval"
      | "number_taken",
  ) {
    super(reason)
    this.name = "TimeEntryWriteRefused"
  }
}

export type TimeEntryRow = {
  id: string
  entry_id: string | null
  employee_id: string
  employee_name: string
  project_id: string | null
  project_name: string | null
  task_id: string | null
  task_name: string | null
  entry_date: string
  hours: string
  is_billable: boolean
  description: string
  status: string
  currency: string | null
  hourly_rate: string | null
  billable_amount: string | null
  submitted_at: string | null
  approved_by_name: string | null
  approved_at: string | null
  rejection_reason: string | null
}

const SELECT = `
  SELECT te.id, te.entry_id, te.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         te.project_id, p.project_name,
         te.task_id, t.task_name,
         to_char(te.entry_date,'YYYY-MM-DD') AS entry_date,
         te.hours::text AS hours,
         te.is_billable, te.description, te.status, te.currency,
         te.hourly_rate::text     AS hourly_rate,
         te.billable_amount::text AS billable_amount,
         te.submitted_at,
         a.first_name || ' ' || a.last_name AS approved_by_name,
         te.approved_at, te.rejection_reason
    FROM time_tracking_entries te
    JOIN employees e ON e.id = te.employee_id
    LEFT JOIN projects p ON p.id = te.project_id
    LEFT JOIN tasks t    ON t.id = te.task_id
    -- approved_by is TEXT with no FK; cast employees.id to text (not the
    -- reverse) so a malformed value just matches nothing instead of raising.
    LEFT JOIN employees a ON a.id::text = te.approved_by
`

export async function list(
  tx: Tx,
  filters: { employeeId?: string; projectId?: string; status?: string } = {},
): Promise<TimeEntryRow[]> {
  const { status = "" } = filters
  // NULL rather than '' for the uuid cast (L37).
  const employeeId = filters.employeeId || null
  const projectId = filters.projectId || null
  return tx<TimeEntryRow[]>`
    ${tx.unsafe(SELECT)}
     WHERE (${employeeId}::uuid IS NULL OR te.employee_id = ${employeeId}::uuid)
       AND (${projectId}::uuid IS NULL OR te.project_id = ${projectId}::uuid)
       AND (${status} = '' OR te.status = ${status})
     ORDER BY te.entry_date DESC, te.created_at DESC
  `
}

export async function byId(tx: Tx, id: string): Promise<TimeEntryRow | null> {
  const [row] = await tx<
    TimeEntryRow[]
  >`${tx.unsafe(SELECT)} WHERE te.id = ${id}::uuid`
  return row ?? null
}

/** For the create form's project -> task cascade. Not a `projects.repo.ts`
 * concern — this is time tracking's own view (id/name/project only, no
 * board fields), across every open project rather than one at a time. */
export async function tasksForActiveProjects(
  tx: Tx,
): Promise<{ id: string; task_name: string; project_id: string }[]> {
  return tx`
    SELECT t.id, t.task_name, t.project_id
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
     WHERE p.archived_at IS NULL
     ORDER BY t.task_name
  ` as never
}

/** Drift readers, mirroring `staleCounters()` — a disagreement is visible, not believed. */
export async function staleHours(
  tx: Tx,
): Promise<{ task_name: string; claimed: string; actual: string }[]> {
  return tx`
    SELECT t.task_name,
           t.actual_hours::text AS claimed,
           coalesce((SELECT sum(te.hours) FROM time_tracking_entries te
                      WHERE te.task_id = t.id AND te.status <> 'rejected'), 0)::text
             AS actual
      FROM tasks t
     WHERE t.actual_hours IS DISTINCT FROM
           coalesce((SELECT sum(te.hours) FROM time_tracking_entries te
                      WHERE te.task_id = t.id AND te.status <> 'rejected'), 0)
     ORDER BY t.task_name
  ` as never
}

/**
 * Recompute `tasks.actual_hours`/`billable_hours`/`non_billable_hours` and
 * `projects.actual_hours` from the entries that reference them — never
 * incremented (L58). Rejected entries are excluded: effort that was refused
 * did not happen. Always called in the same transaction as an entries write.
 */
async function refreshHours(
  tx: Tx,
  projectId: string | null,
  taskId: string | null,
): Promise<void> {
  if (taskId) {
    await tx`
      UPDATE tasks t SET
        actual_hours = coalesce((SELECT sum(te.hours) FROM time_tracking_entries te
                                   WHERE te.task_id = t.id AND te.status <> 'rejected'), 0),
        billable_hours = coalesce((SELECT sum(te.hours) FROM time_tracking_entries te
                                     WHERE te.task_id = t.id AND te.status <> 'rejected'
                                       AND te.is_billable), 0),
        non_billable_hours = coalesce((SELECT sum(te.hours) FROM time_tracking_entries te
                                         WHERE te.task_id = t.id AND te.status <> 'rejected'
                                           AND NOT te.is_billable), 0)
       WHERE t.id = ${taskId}::uuid
    `
  }
  if (projectId) {
    await tx`
      UPDATE projects p SET
        actual_hours = coalesce((SELECT sum(te.hours) FROM time_tracking_entries te
                                   WHERE te.project_id = p.id AND te.status <> 'rejected'), 0),
        last_activity_at = now()
       WHERE p.id = ${projectId}::uuid
    `
  }
}

export type NewTimeEntry = {
  employee_id: string
  project_id: string
  task_id: string | null
  entry_date: string
  hours: string
  is_billable: boolean
  description: string
}

/**
 * The effective billable rate for this employee, on this project's client,
 * on the day the work was done — `time_tracking_hourly_rates` is
 * effective-dated, so a January rate increase must not apply to December
 * work. Falls back to the project's own `hourly_rate` when no rate-card row
 * matches; falls back to NULL (unbilled until someone sets a rate by hand)
 * rather than the employee's `default_billable_rate_pvt` — that column is
 * `_pvt` (restricted), and a billing lookup is not a context that should
 * read it.
 */
async function effectiveRate(
  tx: Tx,
  employeeId: string,
  projectId: string,
  entryDate: string,
): Promise<{ rate: string | null; currency: string }> {
  const [project] = await tx<
    { client_id: string | null; hourly_rate: string | null; currency: string }[]
  >`SELECT client_id, hourly_rate::text AS hourly_rate, currency FROM projects WHERE id = ${projectId}::uuid`
  if (!project) throw new TimeEntryWriteRefused("no_such_project")

  const [card] = await tx<{ billable_rate: string }[]>`
    SELECT billable_rate::text AS billable_rate
      FROM time_tracking_hourly_rates
     WHERE employee_id = ${employeeId}::uuid
       AND (client_id = ${project.client_id}::uuid OR client_id IS NULL)
       AND is_active
       AND effective_from <= ${entryDate}::date
       AND (effective_to IS NULL OR effective_to >= ${entryDate}::date)
     ORDER BY (client_id IS NOT NULL) DESC, effective_from DESC
     LIMIT 1
  `
  return {
    rate: card?.billable_rate ?? project.hourly_rate,
    currency: project.currency ?? "USD",
  }
}

/** Log time against a project (and optionally a task) as a draft. */
export async function create(
  tx: Tx,
  tenantId: string,
  input: NewTimeEntry,
  actorId: string,
): Promise<{ id: string }> {
  if (input.task_id) {
    const [task] = await tx<
      { id: string }[]
    >`SELECT id FROM tasks WHERE id = ${input.task_id}::uuid AND project_id = ${input.project_id}::uuid`
    if (!task) throw new TimeEntryWriteRefused("no_such_task")
  }

  const { rate, currency } = await effectiveRate(
    tx,
    input.employee_id,
    input.project_id,
    input.entry_date,
  )

  // Next `TE-nnn`, same idea as `projects.repo.ts`'s `nextNumber` — a race
  // hits the UNIQUE constraint, not two entries sharing a number.
  const [numbered] = await tx<{ n: number }[]>`
    SELECT coalesce(
             max(nullif(substring(entry_id from '[0-9]+$'), '')::int), 0
           ) + 1 AS n
      FROM time_tracking_entries WHERE tenant_id = ${tenantId}::uuid
  `
  const entryId = `TE-${String(numbered.n).padStart(3, "0")}`

  let row: { id: string }
  try {
    ;[row] = await tx<{ id: string }[]>`
      INSERT INTO time_tracking_entries (
        tenant_id, entry_id, employee_id, project_id, task_id,
        entry_date, hours, is_billable, hourly_rate, currency,
        description, status, created_at, updated_at, created_by
      ) VALUES (
        ${tenantId}::uuid, ${entryId}, ${input.employee_id}::uuid, ${input.project_id}::uuid,
        ${input.task_id}::uuid,
        ${input.entry_date}::date, ${input.hours}::numeric, ${input.is_billable},
        ${rate}::numeric, ${currency},
        ${input.description}, 'draft', now(), now(), ${actorId}
      )
      RETURNING id
    `
  } catch (e) {
    if (isUniqueViolation(e)) throw new TimeEntryWriteRefused("number_taken")
    throw e
  }
  await refreshHours(tx, input.project_id, input.task_id)
  return row
}

/** postgres.js surfaces the SQLSTATE on the error; 23505 is unique_violation. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && e.code === "23505"
  )
}

/** draft -> submitted. Only the logging employee or an admin should reach this; enforced by the caller's `requireCan`. */
export async function submit(
  tx: Tx,
  id: string,
  actorId: string,
): Promise<void> {
  const [current] = await tx<{ status: string }[]>`
    SELECT status FROM time_tracking_entries WHERE id = ${id}::uuid
  `
  if (!current || current.status !== "draft") {
    throw new TimeEntryWriteRefused("not_draft")
  }
  await tx`
    UPDATE time_tracking_entries
       SET status = 'submitted', submitted_at = now(), updated_at = now(),
           updated_by = ${actorId}
     WHERE id = ${id}::uuid
  `
}

export type Decision = "approved" | "rejected"

/**
 * Approve or reject. Approval resolves the office's CURRENT rounding policy
 * (`firm_payroll_policies.time_rounding`, by the employee's `location_code`,
 * falling back to no rounding if the office has no policy row) and snapshots
 * `billable_amount` from it — `hours` itself is untouched. Refuses a
 * non-submitted entry (double-decide) and self-approval, the same guards as
 * `hr_time_off_requests.decide`.
 */
export async function decide(
  tx: Tx,
  id: string,
  decision: Decision,
  approverId: string,
  rejectionReason: string | null,
): Promise<{ project_id: string | null; task_id: string | null }> {
  const [current] = await tx<
    {
      employee_id: string
      project_id: string | null
      task_id: string | null
      status: string
      hours: string
      is_billable: boolean
      hourly_rate: string | null
    }[]
  >`
    SELECT employee_id, project_id, task_id, status,
           hours::text AS hours, is_billable, hourly_rate::text AS hourly_rate
      FROM time_tracking_entries WHERE id = ${id}::uuid
  `
  if (!current || current.status !== "submitted") {
    throw new TimeEntryWriteRefused("not_submitted")
  }
  if (current.employee_id === approverId) {
    throw new TimeEntryWriteRefused("self_approval")
  }

  if (decision === "rejected") {
    await tx`
      UPDATE time_tracking_entries
         SET status = 'rejected', approved_by = ${approverId}, approved_at = now(),
             rejection_reason = ${rejectionReason}, updated_at = now(),
             updated_by = ${approverId}
       WHERE id = ${id}::uuid
    `
  } else {
    const [rounding] = await tx<{ time_rounding: string | null }[]>`
      SELECT p.time_rounding
        FROM employees e
        LEFT JOIN firm_locations l    ON l.location_code = e.location_code
        LEFT JOIN firm_payroll_policies p ON p.location_id = l.id
       WHERE e.id = ${current.employee_id}::uuid
       ORDER BY (p.location_id IS NOT NULL) DESC
       LIMIT 1
    `
    const step =
      ROUNDING_MINUTES[rounding?.time_rounding as keyof typeof ROUNDING_MINUTES]

    await tx`
      UPDATE time_tracking_entries
         SET status = 'approved', approved_by = ${approverId}, approved_at = now(),
             rejection_reason = NULL, updated_at = now(), updated_by = ${approverId},
             billable_amount = CASE
               WHEN is_billable AND hourly_rate IS NOT NULL THEN
                 round(
                   (CASE WHEN ${step}::int IS NULL THEN hours
                         ELSE round(hours * 60 / ${step}::int) * ${step}::int / 60.0
                    END) * hourly_rate,
                   2
                 )
               ELSE NULL
             END
       WHERE id = ${id}::uuid
    `
  }

  await refreshHours(tx, current.project_id, current.task_id)
  return { project_id: current.project_id, task_id: current.task_id }
}

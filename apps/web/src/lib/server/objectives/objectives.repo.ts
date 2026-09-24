import type { Tx } from "../db/tenant"

/**
 * Objectives — the strategic layer above projects
 * (docs/23-project-management-phase1.md). `progress_percentage`,
 * `health_status` and `actual_revenue` are ROLLUPS from linked projects,
 * recomputed in the same transaction as any write that could invalidate
 * them, never incremented — same discipline as `refreshTaskCounters` in
 * projects.repo.ts. `status` is NOT a rollup: it is set by the objective's
 * owner, the same way a project's own `status` is (the spec's
 * `updateObjectiveStatus` auto-derives it from child projects, which
 * overwrites a deliberate "on hold" the moment one project moves — not
 * reproduced here).
 *
 * No row-visibility policy, matching `projects.repo.ts`: an objective is
 * firm business, every employee may see it. Writes are gated on
 * `projects.write` — objectives are the same trust boundary as projects, not
 * a separate one.
 */

export type ObjectiveRow = {
  id: string
  objective_number: string | null
  objective_name: string
  description: string | null
  objective_type: string
  status: string
  health_status: string
  progress_percentage: string | null
  target_revenue: string | null
  actual_revenue: string | null
  currency: string | null
  start_date: string | null
  target_end_date: string | null
  fiscal_year: string | null
  quarter: string | null
  owner_name: string | null
  client_name: string | null
  project_count: number
  archived_at: string | null
}

const SELECT = `
  SELECT o.id, o.objective_number, o.objective_name, o.description,
         o.objective_type, o.status, o.health_status,
         o.progress_percentage::text AS progress_percentage,
         o.target_revenue::text      AS target_revenue,
         o.actual_revenue::text      AS actual_revenue,
         o.currency,
         to_char(o.start_date,'YYYY-MM-DD')      AS start_date,
         to_char(o.target_end_date,'YYYY-MM-DD') AS target_end_date,
         o.fiscal_year, o.quarter,
         e.first_name || ' ' || e.last_name AS owner_name,
         c.client_name,
         to_char(o.archived_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS archived_at,
         (SELECT count(*)::int FROM projects p
           WHERE p.objective_id = o.id AND p.archived_at IS NULL) AS project_count
    FROM pm_objectives o
    LEFT JOIN employees e ON e.id = o.owner_employee_id
    LEFT JOIN clients c   ON c.id = o.client_id
`

export async function list(tx: Tx): Promise<ObjectiveRow[]> {
  return tx<ObjectiveRow[]>`
    ${tx.unsafe(SELECT)}
   WHERE o.archived_at IS NULL
   ORDER BY o.objective_number
  `
}

export async function byId(tx: Tx, id: string): Promise<ObjectiveRow | null> {
  const [row] = await tx<
    ObjectiveRow[]
  >`${tx.unsafe(SELECT)} WHERE o.id = ${id}::uuid`
  return row ?? null
}

export type ObjectiveProjectRow = {
  id: string
  project_number: string | null
  project_name: string
  status: string | null
  health_status: string | null
  progress_percentage: string | null
  total_billed: string | null
  currency: string | null
}

/** The projects linked to one objective — same trust boundary, no gate beyond tenant isolation. */
export async function projectsFor(
  tx: Tx,
  objectiveId: string,
): Promise<ObjectiveProjectRow[]> {
  return tx<ObjectiveProjectRow[]>`
    SELECT p.id, p.project_number, p.project_name, p.status, p.health_status,
           p.progress_percentage::text AS progress_percentage,
           p.total_billed::text        AS total_billed,
           p.currency
      FROM projects p
     WHERE p.objective_id = ${objectiveId}::uuid AND p.archived_at IS NULL
     ORDER BY p.project_number
  `
}

// ---------------------------------------------------------------------------
// Vocabulary — plain `text` columns, no Postgres enum or CHECK behind them,
// so this module IS the constraint (L57). `enumerations.json`'s own
// `objectives`-adjacent entries are not authoritative here — see
// docs/23-project-management-phase1.md.

export const OBJECTIVE_TYPES = [
  "client",
  "department",
  "service_line",
  "initiative",
  "internal",
  // Matches the fixture's own OBJ-001 ("Grow consulting revenue 30% in
  // FY26") — a revenue target that isn't tied to one client or department.
  "revenue",
  "general",
] as const

/** `planning` is the column default (L57: never omit the default from a filter list). */
export const OBJECTIVE_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const

export const OBJECTIVE_HEALTHS = ["on_track", "at_risk", "off_track"] as const

export class ObjectiveWriteRefused extends Error {
  constructor(readonly reason: "no_such_objective" | "number_taken") {
    super(reason)
    this.name = "ObjectiveWriteRefused"
  }
}

/**
 * The next `OBJ-nnn`, from the numbers already in use — same approach as
 * projects.repo.ts's `nextNumber`.
 */
async function nextNumber(tx: Tx): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT coalesce(
             max(nullif(substring(objective_number from '[0-9]+$'), '')::int),
             0
           ) + 1 AS n
      FROM pm_objectives
  `
  return `OBJ-${String(row.n).padStart(3, "0")}`
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && e.code === "23505"
  )
}

export type NewObjective = {
  objective_name: string
  description: string | null
  objective_type: string
  status: string
  client_id: string | null
  owner_employee_id: string | null
  start_date: string | null
  target_end_date: string | null
  fiscal_year: string | null
  quarter: string | null
  target_revenue: string | null
  currency: string
}

export async function createObjective(
  tx: Tx,
  tenantId: string,
  input: NewObjective,
  actorId: string,
): Promise<{ id: string; objective_number: string }> {
  const number = await nextNumber(tx)
  try {
    const [row] = await tx<{ id: string; objective_number: string }[]>`
      INSERT INTO pm_objectives (
        tenant_id, objective_id, objective_number, objective_name, description,
        objective_type, status, health_status,
        client_id, owner_employee_id,
        start_date, target_end_date, fiscal_year, quarter,
        target_revenue, actual_revenue, currency, progress_percentage,
        created_at, updated_at, created_by
      ) VALUES (
        ${tenantId}::uuid, ${number}, ${number}, ${input.objective_name},
        ${input.description},
        ${input.objective_type}, ${input.status}, 'on_track',
        ${input.client_id}::uuid, ${input.owner_employee_id}::uuid,
        ${input.start_date}::date, ${input.target_end_date}::date,
        ${input.fiscal_year}, ${input.quarter},
        ${input.target_revenue}::numeric, 0, ${input.currency}, 0,
        now(), now(), ${actorId}
      )
      RETURNING id, objective_number
    `
    return row
  } catch (e) {
    if (isUniqueViolation(e)) throw new ObjectiveWriteRefused("number_taken")
    throw e
  }
}

export type ObjectiveEdit = {
  objective_name: string
  description: string | null
  objective_type: string
  status: string
  owner_employee_id: string | null
  target_end_date: string | null
  target_revenue: string | null
  currency: string
}

/** Update an objective, returning what the audited fields WERE — read inside this transaction (L40). */
export async function updateObjective(
  tx: Tx,
  id: string,
  input: ObjectiveEdit,
  actorId: string,
): Promise<ObjectiveEdit> {
  const [before] = await tx<ObjectiveEdit[]>`
    SELECT objective_name, description, objective_type, status,
           owner_employee_id::text AS owner_employee_id,
           to_char(target_end_date,'YYYY-MM-DD') AS target_end_date,
           target_revenue::text AS target_revenue,
           currency
      FROM pm_objectives WHERE id = ${id}::uuid
  `
  if (!before) throw new ObjectiveWriteRefused("no_such_objective")

  await tx`
    UPDATE pm_objectives
       SET objective_name    = ${input.objective_name},
           description       = ${input.description},
           objective_type    = ${input.objective_type},
           status            = ${input.status},
           owner_employee_id = ${input.owner_employee_id}::uuid,
           target_end_date   = ${input.target_end_date}::date,
           target_revenue    = ${input.target_revenue}::numeric,
           currency          = ${input.currency},
           updated_at        = now(),
           updated_by        = ${actorId}
     WHERE id = ${id}::uuid
  `
  return before
}

/**
 * Bring `progress_percentage`, `health_status` and `actual_revenue` back in
 * line with the objective's linked, non-archived projects — recomputed,
 * never incremented (L58). A no-op is not an error: an objective can be
 * unlinked from its last project and still needs its rollup reset to zero.
 * Always called in the same transaction as a write that could change the
 * answer (projects.repo.ts calls this after create/update when a project
 * carries — or carried — an objective_id).
 */
export async function refreshRollup(tx: Tx, objectiveId: string | null) {
  if (!objectiveId) return
  const [row] = await tx<
    {
      total: number
      completed: number
      off_track: number
      at_risk: number
      revenue: string
    }[]
  >`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'completed')::int AS completed,
           count(*) FILTER (WHERE health_status = 'off_track')::int AS off_track,
           count(*) FILTER (WHERE health_status = 'at_risk')::int AS at_risk,
           coalesce(sum(total_billed), 0)::text AS revenue
      FROM projects
     WHERE objective_id = ${objectiveId}::uuid AND archived_at IS NULL
  `

  const progress = row.total === 0 ? 0 : (row.completed / row.total) * 100
  const health =
    row.total > 0 && row.off_track > 0
      ? "off_track"
      : row.total > 0 && row.at_risk / row.total > 0.3
        ? "at_risk"
        : "on_track"

  await tx`
    UPDATE pm_objectives
       SET progress_percentage = ${progress},
           health_status       = ${health},
           actual_revenue      = ${row.revenue}::numeric,
           updated_at          = now()
     WHERE id = ${objectiveId}::uuid
  `
}

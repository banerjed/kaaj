import type { Tx } from "../db/tenant"

/**
 * payroll_runs — a pay period, and what each person was paid in it.
 *
 * **Every figure is a string, and every sum happens in SQL.** These columns are
 * `numeric(15,2)`; the JSONB breakdowns hold strings deliberately
 * (20260831140000), because a JSON number is exact in Postgres and a float64
 * the moment a driver reads it. Adding them up in JavaScript would be the
 * float round trip this codebase exists to avoid — and once the fields are
 * correctly typed as strings it becomes silent concatenation instead, with no
 * type error.
 *
 * Row visibility is the database's job: an employee sees only their own line
 * (20260831110000). This repository does not filter by person.
 */

export type PayrollRun = {
  id: string
  run_id: string | null
  run_number: string | null
  country: string | null
  currency: string
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  run_type: string | null
  run_status: string
  employee_count: number
  total_gross_pay: string | null
  total_net_pay: string | null
  total_taxes: string | null
  total_deductions: string | null
  calculated_at: Date | null
  approved_at: Date | null
  finalized_at: Date | null
  calculated_by_name: string | null
  approved_by_name: string | null
  /** Lines actually present, so a run that claims more is visible as such. */
  line_count: number
}

const RUN_SELECT = `
  SELECT r.id, r.run_id, r.run_number, r.country, r.currency,
         to_char(r.pay_period_start,'YYYY-MM-DD') AS pay_period_start,
         to_char(r.pay_period_end,'YYYY-MM-DD')   AS pay_period_end,
         to_char(r.pay_date,'YYYY-MM-DD')         AS pay_date,
         r.run_type, r.run_status, r.employee_count,
         r.total_gross_pay::text  AS total_gross_pay,
         r.total_net_pay::text    AS total_net_pay,
         r.total_taxes::text      AS total_taxes,
         r.total_deductions::text AS total_deductions,
         r.calculated_at, r.approved_at, r.finalized_at,
         c.first_name || ' ' || c.last_name AS calculated_by_name,
         a.first_name || ' ' || a.last_name AS approved_by_name,
         (SELECT count(*)::int FROM payroll_run_employees pe
           WHERE pe.payroll_run_id = r.id) AS line_count
    FROM payroll_runs r
    LEFT JOIN employees c ON c.id = r.calculated_by
    LEFT JOIN employees a ON a.id = r.approved_by
`

export async function list(
  tx: Tx,
  filters: { country?: string; status?: string } = {},
): Promise<PayrollRun[]> {
  const country = filters.country || null
  const status = filters.status || null
  return tx<PayrollRun[]>`
    ${tx.unsafe(RUN_SELECT)}
     WHERE (${country}::text IS NULL OR r.country = ${country}::text)
       AND (${status}::text IS NULL OR r.run_status = ${status}::text)
     ORDER BY r.pay_date DESC, r.run_id ASC
  `
}

export async function byId(tx: Tx, id: string): Promise<PayrollRun | null> {
  const [row] = await tx<PayrollRun[]>`
    ${tx.unsafe(RUN_SELECT)} WHERE r.id = ${id}
  `
  return row ?? null
}

/** One person's line — the payslip. */
export type PayslipLine = {
  id: string
  employee_id: string
  employee_name: string
  work_country: string | null
  work_state: string | null
  status: string | null
  regular_hours: string | null
  overtime_hours: string | null
  /** All JSONB, all string values. Never JSON numbers — see the header. */
  earnings: Record<string, string> | null
  taxes: Record<string, string> | null
  employer_taxes: Record<string, string> | null
  pretax_deductions: Record<string, string> | null
  posttax_deductions: Record<string, string> | null
  gross_pay: string
  total_taxes: string | null
  total_pretax_deductions: string | null
  total_posttax_deductions: string | null
  /** Pre-tax + post-tax, summed in SQL. */
  total_deductions: string | null
  net_pay: string
  payment_method: string | null
  ytd_gross: string | null
}

const LINE_SELECT = `
  SELECT pe.id, pe.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         pe.work_country, pe.work_state, pe.status,
         pe.regular_hours::text   AS regular_hours,
         pe.overtime_hours::text  AS overtime_hours,
         pe.earnings, pe.taxes, pe.employer_taxes,
         pe.pretax_deductions, pe.posttax_deductions,
         pe.gross_pay::text                 AS gross_pay,
         pe.total_taxes::text               AS total_taxes,
         pe.total_pretax_deductions::text   AS total_pretax_deductions,
         pe.total_posttax_deductions::text  AS total_posttax_deductions,
         -- Summed HERE, in NUMERIC, because a payslip shows one Deductions
         -- subtotal. Adding the two strings in JavaScript is the float64 round
         -- trip, and once they are correctly typed as strings it is silent
         -- concatenation instead, with no type error.
         (pe.total_pretax_deductions + pe.total_posttax_deductions)::text
           AS total_deductions,
         pe.net_pay::text                   AS net_pay,
         pe.payment_method, pe.ytd_gross::text AS ytd_gross
    FROM payroll_run_employees pe
    JOIN employees e ON e.id = pe.employee_id
`

export async function linesFor(tx: Tx, runId: string): Promise<PayslipLine[]> {
  return tx<PayslipLine[]>`
    ${tx.unsafe(LINE_SELECT)}
     WHERE pe.payroll_run_id = ${runId}
     ORDER BY employee_name ASC
  `
}

/** Every line for one person, newest pay date first — their payslip history. */
/** A line plus the run context a payslip has to show on its own. */
export type Payslip = PayslipLine & {
  pay_date: string
  currency: string
  run_id: string | null
}

/**
 * One person's payslip history, newest first.
 *
 * The three run-level columns are selected explicitly rather than inherited
 * from the join. `LINE_SELECT` names only `pe.*`, so a widened return type over
 * it describes a shape the query does not produce — and the page then renders
 * `undefined` beside a real amount, with no error anywhere (L45).
 */
export async function forEmployee(
  tx: Tx,
  employeeId: string,
): Promise<Payslip[]> {
  // LINE_SELECT ends its own select list, so the run columns are added by
  // wrapping it rather than by appending to it.
  return tx<Payslip[]>`
    SELECT line.*,
           to_char(r.pay_date,'YYYY-MM-DD') AS pay_date,
           r.currency,
           r.run_id
      FROM (${tx.unsafe(LINE_SELECT)}) AS line
      JOIN payroll_run_employees pe ON pe.id = line.id
      JOIN payroll_runs r ON r.id = pe.payroll_run_id
     WHERE line.employee_id = ${employeeId}
     ORDER BY r.pay_date DESC
  `
}

/**
 * Lines whose own figures do not add up.
 *
 *   net = gross - taxes - pretax deductions - posttax deductions
 *
 * Nothing enforces it, and this is the number that reaches a bank. A line that
 * drifts is invisible until someone is paid the wrong amount — and by then the
 * payment has left.
 */
export async function inconsistentLines(
  tx: Tx,
): Promise<
  { id: string; employee_name: string; stored: string; computed: string }[]
> {
  return tx`
    SELECT pe.id, e.first_name || ' ' || e.last_name AS employee_name,
           pe.net_pay::text AS stored,
           (pe.gross_pay
            - coalesce(pe.total_taxes, 0)
            - coalesce(pe.total_pretax_deductions, 0)
            - coalesce(pe.total_posttax_deductions, 0))::text AS computed
      FROM payroll_run_employees pe
      JOIN employees e ON e.id = pe.employee_id
     WHERE pe.net_pay IS DISTINCT FROM (
             pe.gross_pay
             - coalesce(pe.total_taxes, 0)
             - coalesce(pe.total_pretax_deductions, 0)
             - coalesce(pe.total_posttax_deductions, 0))
  `
}

/**
 * Runs whose header totals disagree with the lines beneath them.
 *
 * The header is what a finance lead reads and what gets reported; the lines are
 * what people are actually paid. A run claiming an employee it has no line for
 * says it paid someone it cannot name — which the fixture did, until
 * 20260831140000.
 */
export async function inconsistentRuns(tx: Tx): Promise<
  {
    run_id: string | null
    claimed_count: number
    actual_count: number
    claimed_gross: string | null
    actual_gross: string | null
  }[]
> {
  return tx`
    SELECT r.run_id,
           r.employee_count            AS claimed_count,
           count(pe.id)::int           AS actual_count,
           r.total_gross_pay::text     AS claimed_gross,
           coalesce(sum(pe.gross_pay), 0)::text AS actual_gross
      FROM payroll_runs r
      LEFT JOIN payroll_run_employees pe ON pe.payroll_run_id = r.id
     GROUP BY r.id, r.run_id, r.employee_count, r.total_gross_pay
    HAVING r.employee_count IS DISTINCT FROM count(pe.id)::int
        OR r.total_gross_pay IS DISTINCT FROM coalesce(sum(pe.gross_pay), 0)
  `
}

// ---------------------------------------------------------------------------
// Writes — the run LIFECYCLE, deliberately not the calculation
// ---------------------------------------------------------------------------
//
// **What this does not do: compute anybody's pay.** Gross, taxes and net per
// person need per-jurisdiction tax tables that do not exist in this database,
// and inventing them would produce a correct-LOOKING number on a payslip —
// the exact failure mode this codebase keeps being bitten by. `payroll_tax_rates`
// is unpopulated and the India structures are untouched; until they are real,
// the lines come from the fixture and nothing here writes one.
//
// What this DOES own is the state a run moves through and the header totals
// that describe it. Both are things a person is later asked to justify, and
// both were previously unwritable.
//
// Three CHECK constraints back these writes, and each was observed refusing a
// bad write before being relied on (20260831140000, 20260902040128):
//
//   payroll_runs_status_is_known            the vocabulary is closed
//   payroll_runs_stages_have_timestamps     a stage implies its timestamps
//   payroll_runs_calculator_is_not_approver one person cannot do both
//   payroll_runs_status_columns_agree       run_status and status move together
//
// What no CHECK gives is DIRECTION — `payroll_runs_status_is_known` is equally
// happy with finalized → draft — nor the case where `calculated_by` is NULL,
// which slips past separation of duties because that constraint only fires
// when both columns are set. Both are enforced below.

export const RUN_STATUSES = [
  "draft",
  "calculating",
  "calculated",
  "approved",
  "finalized",
  "paid",
  "cancelled",
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

/**
 * Where a run may go from where it is. One way, and cancellation stops.
 *
 * A pay run that can go backwards can be un-approved after someone has been
 * paid, and the trail then describes a state the money does not agree with.
 */
const NEXT: Record<RunStatus, readonly RunStatus[]> = {
  // draft goes straight to `calculated` because the calculation here is
  // synchronous — the header is recomputed from the lines in the same
  // transaction. `calculating` is the state a background job would occupy and
  // nothing enters it today; it stays in the map because the column's
  // vocabulary has it and a job runner will, and because a status that exists
  // in the database but not in this map is a run nothing can move.
  draft: ["calculating", "calculated", "cancelled"],
  calculating: ["calculated", "cancelled"],
  calculated: ["approved", "cancelled"],
  approved: ["finalized", "cancelled"],
  finalized: ["paid"],
  paid: [],
  cancelled: [],
}

export class RunRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_run"
      | "wrong_status"
      | "no_lines"
      | "self_approval"
      | "never_calculated"
      | "number_taken",
    readonly detail?: string,
  ) {
    super(reason)
    this.name = "RunRefused"
  }
}

/**
 * Recompute the header from the lines beneath it.
 *
 * `employee_count` and the four totals are the denormalised half of this
 * table; `payroll_run_employees` is the truth. Recomputed rather than
 * incremented, for the reason in CLAUDE.md and L58 — a header that has already
 * drifted is repaired by the next write instead of carried forward. The
 * fixture shipped a run claiming an employee it had no line for.
 *
 * Every sum is NUMERIC in Postgres. Adding these in JavaScript is the float64
 * round trip, and once the columns are correctly typed as strings it becomes
 * silent concatenation with no type error.
 *
 * `total_deductions` is pre-tax PLUS post-tax, which is the same definition
 * `LINE_SELECT` uses for a payslip's Deductions subtotal. Two definitions of a
 * total is one definition that will disagree.
 */
export async function refreshRunTotals(tx: Tx, runId: string): Promise<void> {
  await tx`
    UPDATE payroll_runs r
       SET employee_count =
             (SELECT count(*)::int FROM payroll_run_employees pe
               WHERE pe.payroll_run_id = r.id),
           total_gross_pay =
             (SELECT coalesce(sum(pe.gross_pay), 0)
                FROM payroll_run_employees pe
               WHERE pe.payroll_run_id = r.id),
           total_net_pay =
             (SELECT coalesce(sum(pe.net_pay), 0)
                FROM payroll_run_employees pe
               WHERE pe.payroll_run_id = r.id),
           total_taxes =
             (SELECT coalesce(sum(pe.total_taxes), 0)
                FROM payroll_run_employees pe
               WHERE pe.payroll_run_id = r.id),
           total_deductions =
             (SELECT coalesce(sum(pe.total_pretax_deductions
                                + pe.total_posttax_deductions), 0)
                FROM payroll_run_employees pe
               WHERE pe.payroll_run_id = r.id),
           updated_at = now()
     WHERE r.id = ${runId}::uuid
  `
}

async function currentRun(
  tx: Tx,
  runId: string,
): Promise<{
  run_status: RunStatus
  calculated_by: string | null
  line_count: number
}> {
  const [row] = await tx<
    {
      run_status: RunStatus
      calculated_by: string | null
      line_count: number
    }[]
  >`
    SELECT r.run_status, r.calculated_by,
           (SELECT count(*)::int FROM payroll_run_employees pe
             WHERE pe.payroll_run_id = r.id) AS line_count
      FROM payroll_runs r WHERE r.id = ${runId}::uuid
  `
  if (!row) throw new RunRefused("no_such_run")
  return row
}

function requireTransition(from: RunStatus, to: RunStatus): void {
  if (!NEXT[from].includes(to)) {
    throw new RunRefused("wrong_status", `${from} cannot become ${to}`)
  }
}

/**
 * Move a run to `calculated`: the lines are in, and the header now describes
 * them.
 *
 * Refused with no lines. A run calculated over nothing reports zero gross and
 * looks like a finished pay period in which nobody happened to be paid — which
 * is indistinguishable, on the page, from one where the lines failed to load.
 */
export async function markCalculated(
  tx: Tx,
  runId: string,
  actorId: string,
): Promise<{ from: RunStatus }> {
  const current = await currentRun(tx, runId)
  requireTransition(current.run_status, "calculated")
  if (current.line_count === 0) throw new RunRefused("no_lines")

  // The header BEFORE the status moves, so the CHECK that a calculated run has
  // totals is satisfied by figures that describe the lines.
  await refreshRunTotals(tx, runId)
  await tx`
    UPDATE payroll_runs
       SET run_status    = 'calculated',
           status        = 'calculated',
           calculated_at = now(),
           calculated_by = ${actorId}::uuid,
           updated_at    = now()
     WHERE id = ${runId}::uuid
  `
  return { from: current.run_status }
}

/**
 * Approve a run. The money is committed from here.
 *
 * Two refusals the database cannot make on its own:
 *
 * - **Self-approval where nobody calculated.**
 *   `payroll_runs_calculator_is_not_approver` fires only when BOTH columns are
 *   set, so approving a run with a NULL `calculated_by` passes it. That is the
 *   hole this closes — an approval with no calculation behind it is one person
 *   doing the whole thing, which is what separation of duties exists to stop.
 * - **Self-approval where somebody did.** The CHECK catches it, but as a 500
 *   with a constraint name in it. Refused here so the page can say why.
 */
export async function approve(
  tx: Tx,
  runId: string,
  actorId: string,
): Promise<{ from: RunStatus }> {
  const current = await currentRun(tx, runId)
  requireTransition(current.run_status, "approved")
  if (current.calculated_by === null) throw new RunRefused("never_calculated")
  if (current.calculated_by === actorId) throw new RunRefused("self_approval")

  await refreshRunTotals(tx, runId)
  await tx`
    UPDATE payroll_runs
       SET run_status  = 'approved',
           status      = 'approved',
           approved_at = now(),
           approved_by = ${actorId}::uuid,
           updated_at  = now()
     WHERE id = ${runId}::uuid
  `
  return { from: current.run_status }
}

/** Finalize an approved run — the payment file is cut from here. */
export async function finalize(
  tx: Tx,
  runId: string,
  actorId: string,
): Promise<{ from: RunStatus }> {
  const current = await currentRun(tx, runId)
  requireTransition(current.run_status, "finalized")

  await refreshRunTotals(tx, runId)
  await tx`
    UPDATE payroll_runs
       SET run_status   = 'finalized',
           status       = 'finalized',
           finalized_at = now(),
           finalized_by = ${actorId}::uuid,
           updated_at   = now()
     WHERE id = ${runId}::uuid
  `
  return { from: current.run_status }
}

/**
 * Cancel a run before it is finalized.
 *
 * There is no route back from `finalized` or `paid`, and none from `cancelled`
 * either: a cancelled run is corrected by raising another, the same way an
 * audit entry is corrected by a new row rather than an edit.
 */
export async function cancel(
  tx: Tx,
  runId: string,
  actorId: string,
  reason: string | null,
): Promise<{ from: RunStatus }> {
  const current = await currentRun(tx, runId)
  requireTransition(current.run_status, "cancelled")

  // `notes` is APPENDED to, not replaced: it already carries whatever the run
  // was opened with, and overwriting it destroys that to record something the
  // audit entry holds anyway. `processed_by` is deliberately left alone — it
  // means "who processed this run", and a cancellation is the opposite of
  // processing; who cancelled it is in the trail, which is the durable record.
  await tx`
    UPDATE payroll_runs
       SET run_status = 'cancelled',
           status     = 'cancelled',
           notes      = concat_ws(E'\n', nullif(notes, ''),
                                  'Cancelled: ' || ${reason}),
           updated_at = now()
     WHERE id = ${runId}::uuid
  `
  return { from: current.run_status }
}

export type NewRun = {
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  country: string
  currency: string
  run_type: string
  pay_schedule_id: string | null
}

/**
 * Open a draft run for a period.
 *
 * The run number follows the fixture's shape — `PR-YYYY-MM-<COUNTRY>` — so a
 * person reading a bank file can tell which period and which country it
 * belongs to without opening anything. A second run for the same period and
 * country collides on `UNIQUE (tenant_id, run_id)`, which is the right answer:
 * two runs for one period is how somebody gets paid twice.
 */
export async function createRun(
  tx: Tx,
  tenantId: string,
  input: NewRun,
  actorId: string,
): Promise<{ id: string; run_id: string }> {
  const period = input.pay_period_start.slice(0, 7).replace("-", "-")
  const base = `PR-${period}-${input.country.toUpperCase()}`
  const runId = input.run_type === "regular" ? base : `${base}-OFF`

  try {
    const [row] = await tx<{ id: string; run_id: string }[]>`
      INSERT INTO payroll_runs (
        tenant_id, run_id, run_number,
        pay_period_start, pay_period_end, pay_date,
        run_type, run_status, status, country, currency, pay_schedule_id,
        employee_count, total_gross_pay, total_net_pay,
        total_taxes, total_deductions,
        notes, created_at, updated_at, created_by
      ) VALUES (
        ${tenantId}::uuid, ${runId}, ${runId},
        ${input.pay_period_start}::date, ${input.pay_period_end}::date,
        ${input.pay_date}::date,
        ${input.run_type}, 'draft', 'draft',
        ${input.country.toUpperCase()}, ${input.currency.toUpperCase()},
        ${input.pay_schedule_id}::uuid,
        0, 0, 0, 0, 0,
        'Opened from the payroll runs page.', now(), now(), ${actorId}::uuid
      )
      RETURNING id, run_id
    `
    return row
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      e.code === "23505"
    ) {
      throw new RunRefused("number_taken", runId)
    }
    throw e
  }
}

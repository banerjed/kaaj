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

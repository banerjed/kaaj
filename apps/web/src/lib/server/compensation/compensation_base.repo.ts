import type { Tx } from "../db/tenant"

export type { Tx }

/**
 * compensation_base — what someone is paid, effective-dated. A raise is a new
 * row with a later effective_from, never an edit — history must stay
 * reproducible. Nothing in the schema stops overlapping windows, so it's
 * enforced here at write time, not just asserted in a test.
 */

export type CompensationBase = {
  id: string
  employee_id: string
  effective_from: string
  effective_to: string | null
  compensation_type: string | null
  amount: string
  currency: string
  pay_frequency: string | null
  annual_equivalent: string | null
  overtime_eligible: boolean | null
  change_reason: string | null
}

/** Why a write was refused, so the action can point at the right field. */
export type RaiseRejection =
  "duplicate_date" | "would_overlap" | "amount_out_of_range"

export class RaiseRefused extends Error {
  constructor(readonly reason: RaiseRejection) {
    super(reason)
    this.name = "RaiseRefused"
  }
}

/** numeric(12,2) allows ten integer digits; beyond that Postgres raises a 500. */
const MAX_INTEGER_DIGITS = 10

export async function listForEmployee(
  tx: Tx,
  employeeId: string,
): Promise<CompensationBase[]> {
  return tx<CompensationBase[]>`
    SELECT id, employee_id,
           to_char(effective_from,'YYYY-MM-DD') AS effective_from,
           to_char(effective_to,'YYYY-MM-DD') AS effective_to,
           compensation_type, amount::text AS amount, currency,
           pay_frequency::text AS pay_frequency,
           annual_equivalent::text AS annual_equivalent,
           overtime_eligible, change_reason
      FROM compensation_base
     WHERE employee_id = ${employeeId}
     ORDER BY effective_from DESC
  `
}

export type RaiseInput = {
  employee_id: string
  effective_from: string
  compensation_type: string
  amount: string
  currency: string
  pay_frequency: string
  annual_equivalent: string | null
  overtime_eligible: boolean
  change_reason: string | null
}

/**
 * Record a new compensation row, closing whatever it supersedes. Refuses a
 * duplicate date (that's a correction — use `correct()`), a backdate, or a
 * date after an already-existing future row. `overlaps()` is re-checked
 * inside the transaction as a backstop for any case missed above.
 */
export async function addRaise(
  tx: Tx,
  tenantId: string,
  input: RaiseInput,
  actorId: string,
): Promise<void> {
  const integerDigits = input.amount.split(".")[0].replace(/^0+(?=\d)/, "")
  if (integerDigits.length > MAX_INTEGER_DIGITS) {
    throw new RaiseRefused("amount_out_of_range")
  }

  const [counts] = await tx<{ same: number; later: number }[]>`
    SELECT
      count(*) FILTER (
        WHERE effective_from = ${input.effective_from}::date)::int AS same,
      count(*) FILTER (
        WHERE effective_from > ${input.effective_from}::date)::int AS later
      FROM compensation_base
     WHERE employee_id = ${input.employee_id}
  `
  if (counts.same > 0) throw new RaiseRefused("duplicate_date")
  if (counts.later > 0) throw new RaiseRefused("would_overlap")

  // effective_to is inclusive, so close the day BEFORE the new row starts.
  await tx`
    UPDATE compensation_base
       SET effective_to = (${input.effective_from}::date - INTERVAL '1 day')
     WHERE employee_id = ${input.employee_id}
       AND effective_to IS NULL
       AND effective_from < ${input.effective_from}::date
  `

  // Carry forward fields the form doesn't ask about, so a raise doesn't drop them.
  const [prev] = await tx<
    {
      annual_equivalent: string | null
      overtime_eligible: boolean | null
      standard_hours_per_day: string | null
      standard_days_per_week: string | null
    }[]
  >`
    SELECT annual_equivalent::text AS annual_equivalent, overtime_eligible,
           standard_hours_per_day::text AS standard_hours_per_day,
           standard_days_per_week::text AS standard_days_per_week
      FROM compensation_base
     WHERE employee_id = ${input.employee_id}
     ORDER BY effective_from DESC
     LIMIT 1
  `

  await tx`
    INSERT INTO compensation_base (
      tenant_id, employee_id, effective_from, effective_to,
      compensation_type, amount, currency, pay_frequency,
      annual_equivalent, overtime_eligible,
      standard_hours_per_day, standard_days_per_week,
      change_reason, created_by
    ) VALUES (
      ${tenantId}, ${input.employee_id}, ${input.effective_from}::date, NULL,
      ${input.compensation_type}, ${input.amount}::numeric, ${input.currency},
      ${input.pay_frequency}::pay_frequency,
      ${input.annual_equivalent ?? prev?.annual_equivalent ?? null}::numeric,
      ${input.overtime_eligible ?? prev?.overtime_eligible ?? false},
      ${prev?.standard_hours_per_day ?? null}::numeric,
      ${prev?.standard_days_per_week ?? null}::numeric,
      ${input.change_reason}::change_reason, ${actorId}
    )
  `

  const overlapping = await overlaps(tx, input.employee_id)
  if (overlapping.length > 0) throw new RaiseRefused("would_overlap")

  await syncCache(tx, input.employee_id)
}

/**
 * Sync the denormalised columns on `employees` to whichever row is CURRENT,
 * not whichever was written last. `round()` matches the numeric(12,2) cast on
 * the authoritative column so the wider cache column agrees with it (L25).
 */
export async function syncCache(tx: Tx, employeeId: string): Promise<void> {
  await tx`
    UPDATE employees e
       SET base_amount_pvt   = round(c.amount, 2),
           currency      = c.currency,
           pay_frequency = c.pay_frequency,
           updated_at    = now()
      FROM (
        SELECT amount, currency, pay_frequency
          FROM compensation_base
         WHERE employee_id = ${employeeId}
           AND effective_from <= CURRENT_DATE
           AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
         ORDER BY effective_from DESC
         LIMIT 1
      ) c
     WHERE e.id = ${employeeId}
  `
}

/** Rows whose windows overlap — should always be empty; no CHECK backs this, so `addRaise` verifies it. */
export async function overlaps(
  tx: Tx,
  employeeId: string,
): Promise<{ a: string; b: string }[]> {
  return tx<{ a: string; b: string }[]>`
    SELECT to_char(x.effective_from,'YYYY-MM-DD') AS a,
           to_char(y.effective_from,'YYYY-MM-DD') AS b
      FROM compensation_base x
      JOIN compensation_base y
        ON x.employee_id = y.employee_id
       AND x.id <> y.id
       AND x.effective_from <= COALESCE(y.effective_to, 'infinity'::date)
       AND y.effective_from <= COALESCE(x.effective_to, 'infinity'::date)
     WHERE x.employee_id = ${employeeId}
  `
}

/** Fix an existing record — a typo, not a raise; moves no dates. Re-syncs the cache (L25). */
export async function correct(
  tx: Tx,
  id: string,
  patch: { amount: string; currency: string; change_reason: string | null },
): Promise<void> {
  const [row] = await tx<{ employee_id: string }[]>`
    UPDATE compensation_base
       SET amount        = ${patch.amount}::numeric,
           currency      = ${patch.currency},
           change_reason = ${patch.change_reason}::change_reason
     WHERE id = ${id}
    RETURNING employee_id
  `
  if (row) await syncCache(tx, row.employee_id)
}

/** Current base pay with the person's name, for everyone the caller may see. */
export type CurrentPay = {
  employee_id: string
  first_name: string
  last_name: string
  job_title: string | null
  department_code: string | null
  location_code: string | null
  amount: string
  currency: string
  pay_frequency: string | null
  effective_from: string
  compensation_type: string | null
}

/**
 * Everyone's current base pay — as far as the row policy allows. Deliberately
 * does not filter by person; the RLS policy on compensation_base is the rule.
 * Never reads employees.base_amount_pvt, the unprotected cache (L47).
 */
export async function currentForAll(tx: Tx): Promise<CurrentPay[]> {
  return tx<CurrentPay[]>`
    SELECT c.employee_id,
           e.first_name, e.last_name, e.job_title,
           e.department_code, e.location_code,
           c.amount::text AS amount,
           c.currency, c.pay_frequency,
           to_char(c.effective_from,'YYYY-MM-DD') AS effective_from,
           c.compensation_type
      FROM compensation_base c
      JOIN employees e ON e.id = c.employee_id
     WHERE c.effective_from <= CURRENT_DATE
       AND (c.effective_to IS NULL OR c.effective_to >= CURRENT_DATE)
     ORDER BY e.last_name, e.first_name
  `
}

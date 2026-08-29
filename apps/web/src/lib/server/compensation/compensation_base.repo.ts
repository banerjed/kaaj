import type { Tx } from "../db/tenant"

export type { Tx }

/**
 * compensation_base — what someone is paid, effective-dated.
 *
 * A raise is a NEW ROW with a later `effective_from`, never an edit. The
 * history is the point: payroll for March must be reproducible in December,
 * and overwriting the figure destroys the only record of what was true then.
 *
 * Nothing in the schema prevents two rows covering the same day. When that
 * happens the directory's `DISTINCT ON (employee_id) ... ORDER BY
 * effective_from DESC` picks one arbitrarily, so the same person shows a
 * different salary on different page loads — and the detail page, which keys
 * its history rows on `effective_from`, throws outright and stops rendering.
 * Keeping the windows disjoint is therefore enforced HERE, at write time, and
 * not merely asserted in a test.
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

/**
 * `compensation_base.amount` is numeric(12,2): ten integer digits. Beyond that
 * Postgres raises `numeric field overflow`, which without this check reaches
 * the user as an unhandled 500 rather than a field error.
 */
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
 * Record a new compensation record, closing whatever it supersedes.
 *
 * Refuses rather than corrupting, in three cases the first version got wrong:
 *
 *  - **Same date.** The likeliest path in practice: record a change, notice the
 *    amount was wrong, record it again for the same date. `effective_from <
 *    new` closes nothing, so two open rows result. That is a correction, and it
 *    belongs in `correct()`.
 *  - **Backdating.** An effective date before the open row's start leaves both
 *    open and overlapping.
 *  - **A future row already exists.** A row starting later is not closed by one
 *    starting earlier, so the new open-ended row swallows it.
 *
 * `overlaps()` is then re-checked inside the same transaction, so any case not
 * anticipated above aborts the write rather than being discovered later by a
 * page that will not render.
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

  // Close the open row the day BEFORE the new one starts: `effective_to` is
  // inclusive, so closing on the start date leaves both covering it.
  await tx`
    UPDATE compensation_base
       SET effective_to = (${input.effective_from}::date - INTERVAL '1 day')
     WHERE employee_id = ${input.employee_id}
       AND effective_to IS NULL
       AND effective_from < ${input.effective_from}::date
  `

  // Carry forward what the superseded row held. Without this, a raise silently
  // drops the annual equivalent, the overtime flag and the standard hours —
  // fields the form does not ask about and the person still has.
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
 * Bring the denormalised columns on `employees` in line with whichever row is
 * CURRENT — not with whichever row was written last.
 *
 * The directory falls back to these when no dated row covers today. Writing a
 * future-dated raise straight into them showed tomorrow's salary as today's pay
 * for anyone in that state.
 *
 * `round()` matches what the `::numeric(12,2)` cast does on the authoritative
 * column, so the cache — numeric(18,4), and able to hold more — agrees with it
 * (L25).
 */
export async function syncCache(tx: Tx, employeeId: string): Promise<void> {
  await tx`
    UPDATE employees e
       SET base_amount   = round(c.amount, 2),
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

/**
 * Rows whose windows overlap. Should always be empty; `addRaise` checks it
 * before committing, because the invariant has no constraint behind it.
 */
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

/**
 * Fix an existing record — a typo, not a raise. Moves no dates.
 *
 * Re-syncs the cache afterwards: this is the SECOND writer of
 * `compensation_base.amount`, and leaving `employees.base_amount` stale would
 * reintroduce exactly the divergence L25 exists to prevent.
 */
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

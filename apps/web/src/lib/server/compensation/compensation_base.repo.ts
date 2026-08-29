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
 * effective_from DESC` picks one arbitrarily, and the same person shows a
 * different salary depending on nothing. Closing the open row is therefore
 * part of writing the new one, in the same transaction — see `addRaise`.
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
 * Both statements run in the caller's transaction, so there is never an instant
 * where two rows are open — which a check-then-write from the action could not
 * guarantee under concurrency.
 *
 * The previous row is closed the day BEFORE the new one starts, not on the same
 * day: `effective_to` is inclusive, and closing on the start date would leave
 * both rows covering it.
 */
export async function addRaise(
  tx: Tx,
  tenantId: string,
  input: RaiseInput,
  actorId: string,
): Promise<void> {
  // Postgres truncates silently to the column scale, so what comes back is not
  // necessarily what went in — see the note on the employees UPDATE below.
  await tx`
    UPDATE compensation_base
       SET effective_to = (${input.effective_from}::date - INTERVAL '1 day')
     WHERE employee_id = ${input.employee_id}
       AND effective_to IS NULL
       AND effective_from < ${input.effective_from}::date
  `

  await tx`
    INSERT INTO compensation_base (
      tenant_id, employee_id, effective_from, effective_to,
      compensation_type, amount, currency, pay_frequency,
      annual_equivalent, overtime_eligible, change_reason, created_by
    ) VALUES (
      ${tenantId}, ${input.employee_id}, ${input.effective_from}::date, NULL,
      ${input.compensation_type}, ${input.amount}::numeric, ${input.currency},
      ${input.pay_frequency}::pay_frequency,
      ${input.annual_equivalent}::numeric, ${input.overtime_eligible},
      ${input.change_reason}, ${actorId}
    )
  `

  // Keep the denormalised columns on `employees` in step. The directory falls
  // back to them when no effective-dated row is current, so letting them drift
  // means two answers to the same question.
  //
  // ROUNDED TO THE AUTHORITATIVE COLUMN'S SCALE. The two disagree in the
  // schema: compensation_base.amount is numeric(12,2) while
  // employees.base_amount is numeric(18,4), so the cache can hold precision the
  // source of truth cannot. Writing the raw value to both stores 12345678.9012
  // in one and 12345678.90 in the other, and the directory then shows a
  // different figure depending on whether a dated row happens to be current.
  // Rounding here makes them agree; see L25.
  await tx`
    UPDATE employees
       SET base_amount = round(${input.amount}::numeric, 2),
           currency    = ${input.currency},
           pay_frequency = ${input.pay_frequency}::pay_frequency,
           updated_at  = now()
     WHERE id = ${input.employee_id}
  `
}

/**
 * Rows whose windows overlap. Should always be empty; a test asserts it after
 * `addRaise`, because the invariant has no constraint behind it.
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

/** A correction to an existing record — a typo, not a raise. */
export async function correct(
  tx: Tx,
  id: string,
  patch: { amount: string; currency: string; change_reason: string | null },
): Promise<void> {
  await tx`
    UPDATE compensation_base
       SET amount        = ${patch.amount}::numeric,
           currency      = ${patch.currency},
           change_reason = ${patch.change_reason}
     WHERE id = ${id}
  `
}

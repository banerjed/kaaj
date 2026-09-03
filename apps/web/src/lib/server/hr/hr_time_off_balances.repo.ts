import type { Tx } from "../db/tenant"

/**
 * hr_time_off_balances — how much leave someone has left.
 *
 *     current_balance = opening_balance + accrued + adjusted
 *                       - used - pending - forfeited
 *
 * Two traps: `carried_over` is already folded into `opening_balance` — do not
 * add it again. `pending` is already deducted, so `current_balance` (not
 * opening + accrued) is what must be checked before booking a new request.
 * Stored, not computed on read, since accrual runs as a scheduled job.
 */

export type TimeOffBalance = {
  id: string
  employee_id: string
  policy_id: string
  policy_code: string
  policy_name: string
  time_off_type: string
  accrual_year: number
  opening_balance: string
  accrued: string
  used: string
  pending: string
  adjusted: string
  carried_over: string
  forfeited: string
  current_balance: string
  unit: string | null
}

export async function forEmployee(
  tx: Tx,
  employeeId: string,
  year?: number,
): Promise<TimeOffBalance[]> {
  return tx<TimeOffBalance[]>`
    SELECT b.id, b.employee_id, b.policy_id,
           p.policy_code, p.policy_name, p.time_off_type,
           b.accrual_year,
           b.opening_balance::text AS opening_balance,
           b.accrued::text AS accrued, b.used::text AS used,
           b.pending::text AS pending, b.adjusted::text AS adjusted,
           b.carried_over::text AS carried_over,
           b.forfeited::text AS forfeited,
           b.current_balance::text AS current_balance, b.unit
      FROM hr_time_off_balances b
      JOIN hr_time_off_policies p ON p.id = b.policy_id
     WHERE b.employee_id = ${employeeId}
       AND (${year ?? null}::int IS NULL OR b.accrual_year = ${year ?? null}::int)
     ORDER BY p.policy_name
  `
}

/** Rows where the stored balance disagrees with the identity above. */
export async function inconsistent(
  tx: Tx,
): Promise<
  { employee_id: string; policy_id: string; stored: string; computed: string }[]
> {
  return tx<
    {
      employee_id: string
      policy_id: string
      stored: string
      computed: string
    }[]
  >`
    SELECT employee_id, policy_id,
           current_balance::text AS stored,
           (opening_balance + accrued + adjusted
            - used - pending - forfeited)::text AS computed
      FROM hr_time_off_balances
     WHERE current_balance <> opening_balance + accrued + adjusted
                              - used - pending - forfeited
  `
}

import type { Tx } from "../db/tenant"

/**
 * compensation_equity — option and RSU grants.
 *
 * Shares are INTEGERS, not money: you cannot hold a third of an option. The
 * prices attached to them are money and follow the usual rules.
 *
 * `shares_vested` is stored rather than derived. A vesting schedule can be
 * amended, accelerated on an exit, or paused during leave, so recomputing it
 * from the grant date would quietly contradict what the person was told.
 */

export type EquityGrant = {
  id: string
  employee_id: string
  grant_type: string
  grant_date: string
  shares_granted: number
  shares_vested: number
  shares_exercised: number | null
  shares_forfeited: number | null
  exercise_price: string | null
  currency: string | null
  vesting_cliff_months: number | null
  vesting_period_months: number | null
  expiration_date: string | null
  status: string | null
}

export async function forEmployee(
  tx: Tx,
  employeeId: string,
): Promise<EquityGrant[]> {
  return tx<EquityGrant[]>`
    SELECT id, employee_id, grant_type::text AS grant_type,
           to_char(grant_date,'YYYY-MM-DD') AS grant_date,
           shares_granted, shares_vested, shares_exercised, shares_forfeited,
           exercise_price::text AS exercise_price, currency,
           vesting_cliff_months, vesting_period_months,
           to_char(expiration_date,'YYYY-MM-DD') AS expiration_date, status
      FROM compensation_equity
     WHERE employee_id = ${employeeId}
     ORDER BY grant_date DESC
  `
}

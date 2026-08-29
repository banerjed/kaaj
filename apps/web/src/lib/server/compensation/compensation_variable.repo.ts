import type { Tx } from "../db/tenant"

/**
 * compensation_variable — commission, bonus, anything at risk.
 *
 * `target_amount` is what is on offer at 100% attainment, NOT what will be
 * paid. Presenting it as earnings would overstate everyone's compensation, so
 * the UI labels it "target".
 */

export type VariablePay = {
  id: string
  employee_id: string
  component_type: string
  component_name: string
  effective_from: string
  effective_to: string | null
  target_amount: string
  currency: string
  payment_frequency: string | null
  next_payment_date: string | null
  status: string | null
}

export async function currentForEmployee(
  tx: Tx,
  employeeId: string,
): Promise<VariablePay[]> {
  return tx<VariablePay[]>`
    SELECT id, employee_id, component_type::text AS component_type,
           component_name,
           to_char(effective_from,'YYYY-MM-DD') AS effective_from,
           to_char(effective_to,'YYYY-MM-DD') AS effective_to,
           target_amount::text AS target_amount, currency, payment_frequency,
           to_char(next_payment_date,'YYYY-MM-DD') AS next_payment_date, status
      FROM compensation_variable
     WHERE employee_id = ${employeeId}
       AND effective_from <= CURRENT_DATE
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY component_type, component_name
  `
}

import type { Tx } from "../db/tenant"

/**
 * compensation_allowances — recurring additions to pay: housing, transport,
 * phone. Effective-dated like base pay, and in the employee's own currency —
 * an Indian HRA is in rupees whoever is reading it.
 */

export type Allowance = {
  id: string
  employee_id: string
  allowance_type: string
  allowance_name: string
  effective_from: string
  effective_to: string | null
  amount: string
  currency: string
  frequency: string | null
  is_taxable: boolean | null
  is_reimbursement: boolean | null
  requires_receipts: boolean | null
  status: string | null
}

/** Only what is in force today; the history is on the record, not the summary. */
export async function currentForEmployee(
  tx: Tx,
  employeeId: string,
): Promise<Allowance[]> {
  return tx<Allowance[]>`
    SELECT id, employee_id, allowance_type::text AS allowance_type,
           allowance_name,
           to_char(effective_from,'YYYY-MM-DD') AS effective_from,
           to_char(effective_to,'YYYY-MM-DD') AS effective_to,
           amount::text AS amount, currency, frequency,
           is_taxable, is_reimbursement, requires_receipts, status
      FROM compensation_allowances
     WHERE employee_id = ${employeeId}
       AND effective_from <= CURRENT_DATE
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY allowance_type, allowance_name
  `
}

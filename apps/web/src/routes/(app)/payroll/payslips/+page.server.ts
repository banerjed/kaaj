import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as runs from "$lib/server/payroll/payroll_runs.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom } from "$lib/server/auth/can"

/**
 * /payroll/payslips — your own pay, and nobody else's.
 *
 * No permission is required beyond being an employee: everyone may see what
 * they were paid. The scoping is the employee id, and `payroll_run_employees`
 * carries a row-visibility policy (20260831110000) that refuses another
 * person's line even if this query asked for it.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!ctx?.employeeId) {
    // A tenant member who is not an employee — an external accountant, say.
    // There is no payslip to show, and that is not an error.
    return { payslips: [], notAnEmployee: true }
  }

  return withTenant(actorFrom(locals), async (tx) => ({
    payslips: await runs.forEmployee(tx, ctx.employeeId!),
    notAnEmployee: false,
  }))
}

import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as runs from "$lib/server/payroll/payroll_runs.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom } from "$lib/server/auth/can"

/** /payroll/payslips — your own pay only; row policy on `payroll_run_employees` scopes it. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!ctx?.employeeId) {
    // Not an employee (e.g. an external accountant) — no payslip, not an error.
    return { payslips: [], notAnEmployee: true, locations: [] }
  }

  return withTenant(actorFrom(locals), async (tx) => ({
    payslips: await runs.forEmployee(tx, ctx.employeeId!),
    notAnEmployee: false,
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}

import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as runs from "$lib/server/payroll/payroll_runs.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { pageOf, pageParam } from "$lib/server/db/paged"
import { contextFrom } from "$lib/server/auth/can"

const PAGE_SIZE = 24

/** /payroll/payslips — your own pay only; row policy on `payroll_run_employees` scopes it. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const page = pageParam(url)
  if (!ctx?.employeeId) {
    // Not an employee (e.g. an external accountant) — no payslip, not an error.
    return {
      payslips: [],
      total: 0,
      page,
      pageSize: PAGE_SIZE,
      notAnEmployee: true,
      locations: [],
    }
  }

  return withTenant(actorFrom(locals), async (tx) => {
    const { rows, total } = await runs.payslipsPage(
      tx,
      ctx.employeeId!,
      pageOf(page, PAGE_SIZE),
    )
    return {
      payslips: rows,
      total,
      page,
      pageSize: PAGE_SIZE,
      notAnEmployee: false,
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }
  })
}

import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as allowances from "$lib/server/compensation/compensation_allowances.repo"
import * as variablePay from "$lib/server/compensation/compensation_variable.repo"
import * as equity from "$lib/server/compensation/compensation_equity.repo"
import * as schedules from "$lib/server/compensation/compensation_work_schedules.repo"
import { allEnumerations } from "@kaaj/enums"
import * as employees from "$lib/server/employee-profile/employees.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"

/**
 * /employees/[id] — module-employee-profile.md.
 *
 * A 404 here means "no such employee IN THIS TENANT": RLS filters the row out
 * before this code sees it, so another firm's employee is indistinguishable
 * from one that does not exist. That is the intended behaviour — a 403 would
 * confirm the id is real.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const result = await withTenant(actorFrom(locals), async (tx) => {
    const employee = await employees.getById(tx, params.id)
    if (!employee) return null
    return {
      employee,
      compensation: await employees.compensationHistory(tx, params.id),
      locations: await locationsRepo.list(tx),
      payFrequencies: allEnumerations().get("pay_frequency") ?? [],
      // change_reason is a Postgres ENUM. A free-text box here meant anything
      // off-list ("Promotion", "raise") reached the INSERT and came back as an
      // unhandled 500.
      changeReasons: allEnumerations().get("change_reason") ?? [],
      // Also a Postgres enum; a hand-typed list here drifts from the type.
      compensationTypes: allEnumerations().get("compensation_type") ?? [],
      // The rest of total compensation. One transaction, so the tab shows a
      // consistent picture rather than five independently-timed reads.
      allowances: await allowances.currentForEmployee(tx, params.id),
      variablePay: await variablePay.currentForEmployee(tx, params.id),
      equity: await equity.forEmployee(tx, params.id),
      workSchedule: await schedules.currentForEmployee(tx, params.id),
    }
  })

  if (!result) error(404, "Employee not found")
  return result
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as compensation from "$lib/server/compensation/compensation_base.repo"
import { formString } from "$lib/server/forms"
import { allEnumerations } from "@kaaj/enums"
import * as employees from "$lib/server/employee-profile/employees.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"

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

  const result = await withTenant(locals.tenantId, async (tx) => {
    const employee = await employees.getById(tx, params.id)
    if (!employee) return null
    return {
      employee,
      compensation: await employees.compensationHistory(tx, params.id),
      locations: await locationsRepo.list(tx),
      payFrequencies: allEnumerations().get("pay_frequency") ?? [],
    }
  })

  if (!result) error(404, "Employee not found")
  return result
}

export const actions: Actions = {
  /**
   * Record a raise. A new effective-dated row, not an edit — see the note in
   * compensation_base.repo.ts about why the history is the point.
   */
  addRaise: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const actorId = locals.user?.id
    if (!actorId) error(403, "No user")

    const data = await request.formData()
    const effectiveFrom = formString(data, "effective_from")
    const amount = formString(data, "amount").trim()
    const currency = formString(data, "currency")
    const payFrequency = formString(data, "pay_frequency")

    const errorFields: string[] = []
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom))
      errorFields.push("effective_from")

    // Kept as a string all the way to Postgres: numeric(12,2) exceeds what a
    // float64 holds exactly, and parsing here would be the one place precision
    // is lost (L25).
    if (!/^\d+(\.\d{1,4})?$/.test(amount) || Number(amount) <= 0)
      errorFields.push("amount")
    if (!currency) errorFields.push("currency")

    if (errorFields.length) {
      return fail(400, {
        errorFields,
        message: errorFields.includes("amount")
          ? "Enter a positive amount, digits only."
          : "Some fields need attention.",
      })
    }

    await withTenant(tenantId, (tx) =>
      compensation.addRaise(
        tx,
        tenantId,
        {
          employee_id: params.id,
          effective_from: effectiveFrom,
          compensation_type: formString(data, "compensation_type") || "salary",
          amount,
          currency,
          pay_frequency: payFrequency || "monthly",
          annual_equivalent: null,
          overtime_eligible: formString(data, "overtime_eligible") === "on",
          change_reason: formString(data, "change_reason").trim() || null,
        },
        actorId,
      ),
    )

    return { saved: true }
  },
}

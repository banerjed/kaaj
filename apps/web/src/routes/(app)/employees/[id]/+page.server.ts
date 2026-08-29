import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as compensation from "$lib/server/compensation/compensation_base.repo"
import { RaiseRefused } from "$lib/server/compensation/compensation_base.repo"
import * as allowances from "$lib/server/compensation/compensation_allowances.repo"
import * as variablePay from "$lib/server/compensation/compensation_variable.repo"
import * as equity from "$lib/server/compensation/compensation_equity.repo"
import * as schedules from "$lib/server/compensation/compensation_work_schedules.repo"
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
      // change_reason is a Postgres ENUM. A free-text box here meant anything
      // off-list ("Promotion", "raise") reached the INSERT and came back as an
      // unhandled 500.
      changeReasons: allEnumerations().get("change_reason") ?? [],
      compensationTypes: ["salary", "hourly", "commission", "contract"],
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      errorFields.push("effective_from")
    } else if (Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`))) {
      // The shape check passes 2026-13-45; only a parse catches it. Otherwise
      // the ::date cast fails as an unhandled 500 on a crafted POST.
      errorFields.push("effective_from")
    }

    // Kept as a string all the way to Postgres: numeric(12,2) exceeds what a
    // float64 holds exactly, and parsing here would be the one place precision
    // is lost (L25). At most two decimals, because more are silently rounded
    // by the column and the user would never be told.
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      errorFields.push("amount")
    }

    const changeReason = formString(data, "change_reason").trim()
    const reasons = allEnumerations().get("change_reason") ?? []
    if (changeReason !== "" && !reasons.includes(changeReason)) {
      errorFields.push("change_reason")
    }

    const compensationType = formString(data, "compensation_type") || "salary"

    if (!currency) errorFields.push("currency")

    if (errorFields.length) {
      return fail(400, {
        errorFields,
        message: errorFields.includes("amount")
          ? "Enter a positive amount with at most two decimal places."
          : "Some fields need attention.",
      })
    }

    try {
      await withTenant(tenantId, (tx) =>
        compensation.addRaise(
          tx,
          tenantId,
          {
            employee_id: params.id,
            effective_from: effectiveFrom,
            compensation_type: compensationType,
            amount,
            currency,
            pay_frequency: payFrequency || "monthly",
            annual_equivalent: null,
            overtime_eligible: formString(data, "overtime_eligible") === "on",
            change_reason: changeReason || null,
          },
          actorId,
        ),
      )
    } catch (e) {
      // The repository refuses writes that would leave overlapping windows.
      // Surfacing them as field errors keeps the user in the form instead of
      // on a 500 page.
      if (e instanceof RaiseRefused) {
        const message =
          e.reason === "duplicate_date"
            ? "This person already has a record starting on that date. Correct that record instead of adding another."
            : e.reason === "would_overlap"
              ? "A later record already exists. A change must start after the most recent one."
              : "That amount is larger than this field can hold."
        return fail(400, {
          errorFields: [
            e.reason === "amount_out_of_range" ? "amount" : "effective_from",
          ],
          message,
        })
      }
      throw e
    }

    return { saved: true }
  },
}

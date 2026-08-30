import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as compensation from "$lib/server/compensation/compensation_base.repo"
import { RaiseRefused } from "$lib/server/compensation/compensation_base.repo"
import * as allowances from "$lib/server/compensation/compensation_allowances.repo"
import * as variablePay from "$lib/server/compensation/compensation_variable.repo"
import * as equity from "$lib/server/compensation/compensation_equity.repo"
import * as schedules from "$lib/server/compensation/compensation_work_schedules.repo"
import { FormReader } from "$lib/server/forms"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { isPositive } from "$lib/decimal"
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

export const actions: Actions = {
  /**
   * Record a raise. A new effective-dated row, not an edit — see the note in
   * compensation_base.repo.ts about why the history is the point.
   */
  addRaise: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    // hr_admin holds this; payroll_admin deliberately does not. Whoever sets
    // pay must not be the one who approves the run that pays it.
    requireCan(contextFrom(locals), "compensation.write")
    const tenantId = locals.tenantId
    const actorId = locals.user?.id
    if (!actorId) error(403, "No user")

    const f = new FormReader(await request.formData())

    const effectiveFrom = f.date("effective_from", { required: true })

    // Kept as a string all the way to Postgres: numeric(15,2) exceeds what a
    // float64 holds exactly, and parsing here would be the one place precision
    // is lost (L25). At most two decimals, because more are silently rounded
    // by the column and the user would never be told.
    const amount = f.decimal("amount", {
      required: true,
      scale: 2,
      integerDigits: 13,
    })
    if (amount && !isPositive(amount)) f.reject("amount")

    const currency = f.currency("currency", { required: true })

    // Every one of these is a Postgres enum. Unvalidated, an unknown value was
    // not a field error but an unhandled 500 — on the action that sets pay
    // (L34).
    const changeReason = f.enumValue("change_reason", "change_reason")
    const compensationType = f.enumValue(
      "compensation_type",
      "compensation_type",
      {
        fallback: "salary",
      },
    )
    const payFrequency = f.enumValue("pay_frequency", "pay_frequency", {
      fallback: "monthly",
    })

    if (!f.ok) {
      return fail(
        400,
        f.problem(
          f.errorFields.includes("amount")
            ? "Enter a positive amount with at most two decimal places."
            : "Some fields need attention.",
        ),
      )
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
            pay_frequency: payFrequency,
            annual_equivalent: null,
            overtime_eligible: f.bool("overtime_eligible"),
            change_reason: changeReason,
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

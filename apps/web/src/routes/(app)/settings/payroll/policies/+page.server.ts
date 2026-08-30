import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as policies from "$lib/server/firm-profile/firm_payroll_policies.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const ROUNDING = ["none", "nearest_5", "nearest_6", "nearest_15"] as const

/** /settings/payroll/policies — module-firm-profile.md § FR-FP-005. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  return withTenant(locals.tenantId, async (tx) => ({
    policies: await policies.list(tx),
    locations: await locationsRepo.list(tx),
    roundingOptions: ROUNDING,
  }))
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())

    const id = f.uuid("id")
    const rounding = f.choice("time_rounding", ROUNDING, { fallback: "none" })
    // The select always submits one; 0 (Sunday) only if a crafted POST omits it.
    const startDay = f.integer("workweek_start_day", { min: 0, max: 6 }) ?? 0

    // Hours and multipliers stay strings: they are the numeric(18,4) family,
    // and a blank one means "not set", which is not the same as zero. Anything
    // unparseable is REFUSED here — dropping it wrote a policy with no
    // multiplier at all, answered 200, and left overtime computing at 1x (L33).
    const daily = f.decimal("daily_threshold_hours", {
      scale: 4,
      min: 0,
      max: 24,
    })
    const weekly = f.decimal("weekly_threshold_hours", {
      scale: 4,
      min: 0,
      max: 168,
    })
    const multiplier = f.decimal("multiplier", { scale: 4, min: 0, max: 10 })
    const locationCode = f.text("location_code", { max: 100 })
    const doubleAfter = f.decimal("double_time_after_hours", {
      scale: 4,
      min: 0,
      max: 24,
    })

    // Ordered, or double time begins before overtime does.
    if (
      daily !== null &&
      doubleAfter !== null &&
      Number(doubleAfter) < Number(daily)
    ) {
      f.reject("double_time_after_hours")
    }

    if (!f.ok) {
      return fail(
        400,
        f.problem(
          f.errorFields.includes("double_time_after_hours")
            ? "Double time cannot start before overtime does."
            : "Some fields need attention.",
        ),
      )
    }

    const overtime: policies.OvertimeRules = {}
    if (daily !== null) overtime.daily_threshold_hours = daily
    if (weekly !== null) overtime.weekly_threshold_hours = weekly
    if (multiplier !== null) overtime.multiplier = multiplier
    if (doubleAfter !== null) overtime.double_time_after_hours = doubleAfter

    const input = {
      location_code: locationCode,
      overtime_rules: overtime,
      time_rounding: rounding,
      workweek_start_day: startDay,
      require_time_tracking: f.bool("require_time_tracking"),
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await policies.update(tx, id, input)
      else await policies.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  remove: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing policy."))
    await withTenant(locals.tenantId, (tx) => policies.remove(tx, id))
    return { removed: true }
  },
}

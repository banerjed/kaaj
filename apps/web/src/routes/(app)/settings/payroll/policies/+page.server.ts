import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as policies from "$lib/server/firm-profile/firm_payroll_policies.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"

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

/** A blank numeric field means "not set", which is not the same as zero. */
const optionalNumber = (raw: string): number | undefined => {
  const trimmed = raw.trim()
  if (trimmed === "") return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const rounding = formString(data, "time_rounding") || "none"
    const startDay = Number(formString(data, "workweek_start_day"))

    const errorFields: string[] = []
    if (!ROUNDING.includes(rounding as (typeof ROUNDING)[number]))
      errorFields.push("time_rounding")
    if (!Number.isInteger(startDay) || startDay < 0 || startDay > 6)
      errorFields.push("workweek_start_day")

    // Overtime thresholds only make sense ordered: double time cannot begin
    // before overtime does.
    const daily = optionalNumber(formString(data, "daily_threshold_hours"))
    const weekly = optionalNumber(formString(data, "weekly_threshold_hours"))
    const multiplier = optionalNumber(formString(data, "multiplier"))
    const doubleAfter = optionalNumber(
      formString(data, "double_time_after_hours"),
    )
    if (daily !== undefined && doubleAfter !== undefined && doubleAfter < daily)
      errorFields.push("double_time_after_hours")

    if (errorFields.length) {
      return fail(400, {
        errorFields,
        message: errorFields.includes("double_time_after_hours")
          ? "Double time cannot start before overtime does."
          : "Some fields need attention.",
      })
    }

    const overtime: policies.OvertimeRules = {}
    if (daily !== undefined) overtime.daily_threshold_hours = daily
    if (weekly !== undefined) overtime.weekly_threshold_hours = weekly
    if (multiplier !== undefined) overtime.multiplier = multiplier
    if (doubleAfter !== undefined)
      overtime.double_time_after_hours = doubleAfter

    const input = {
      location_code: formString(data, "location_code") || null,
      overtime_rules: overtime,
      time_rounding: rounding,
      workweek_start_day: startDay,
      require_time_tracking: formString(data, "require_time_tracking") === "on",
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await policies.update(tx, id, input)
      else await policies.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  remove: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const id = formString(await request.formData(), "id")
    if (!id) return fail(400, { message: "Missing policy." })
    await withTenant(locals.tenantId, (tx) => policies.remove(tx, id))
    return { removed: true }
  },
}

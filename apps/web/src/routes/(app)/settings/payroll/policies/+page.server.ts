import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as policies from "$lib/server/firm-profile/firm_payroll_policies.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

const ROUNDING = ["none", "nearest_5", "nearest_6", "nearest_15"] as const

/** /settings/payroll/policies — module-firm-profile.md § FR-FP-005. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  return withTenant(actorFrom(locals), async (tx) => ({
    policies: await policies.list(tx),
    locations: await locationsRepo.list(tx),
    roundingOptions: ROUNDING,
  }))
}

/** What a reviewer would ask about. Not every column: a table nobody can
 *  prune should carry the fields that matter, and burying them among unchanged
 *  ones is the same as not recording them. */
const AUDITED_FIELDS = [
  "location_id",
  "overtime_rules",
  "time_rounding",
  "workweek_start_day",
  "require_time_tracking",
]

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

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        // Read what it was BEFORE writing, so the entry says what changed
        // rather than only what it became.
        const before = id
          ? ((await policies.list(tx)).find((r) => r.id === id) ?? null)
          : null

        if (id) await policies.update(tx, id, input)
        else await policies.create(tx, tenantId, input)

        // SAME TRANSACTION. Overtime thresholds, multipliers and rounding. If someone's overtime drops, this is the change that did it.
        await audit.record(tx, contextFrom(locals)!, {
          action: id ? "update" : "create",
          entityType: "firm_payroll_policies",
          entityId: id ?? null,
          module: "payroll",
          changes: audit.diff(before, input, AUDITED_FIELDS),
        })
      })
    } catch (e) {
      // A stale office reference, or a workweek start the CHECK refuses.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { saved: true }
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing policy."))
    const archived = await withTenant(actorFrom(locals), async (tx) => {
      // Nothing matched: no audit entry, and no claim that it was archived.
      if (!(await policies.archive(tx, id))) return false
      await audit.record(tx, contextFrom(locals)!, {
        action: "archive",
        entityType: "firm_payroll_policies",
        entityId: id,
        module: "payroll",
        changes: { is_active: { from: "true", to: "false" } },
      })
      return true
    })
    if (!archived) {
      return fail(400, {
        message: "That payroll policy no longer exists. Reload the page.",
      })
    }
    return { archived: true }
  },
}

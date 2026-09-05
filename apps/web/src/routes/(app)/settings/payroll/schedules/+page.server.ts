import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as schedules from "$lib/server/payroll/payroll_pay_schedules.repo"
import * as holidaysRepo from "$lib/server/firm-profile/firm_holidays.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader, formString } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

const FREQUENCIES = ["weekly", "bi-weekly", "semi-monthly", "monthly"] as const

/** /settings/payroll/schedules — module-firm-profile.md § Pay Schedules Page. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")

  return withTenant(actorFrom(locals), async (tx) => ({
    schedules: await schedules.list(tx),
    // Needed to flag a pay date colliding with a holiday.
    holidays: await holidaysRepo.list(tx),
    locations: await locationsRepo.list(tx),
  }))
}

/** The fields a reviewer would ask about, not every column. */
const AUDITED_FIELDS = [
  "schedule_name",
  "pay_frequency",
  "pay_day_of_week",
  "first_pay_date",
  "timezone",
  "currency",
]

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId
    const data = await request.formData()

    // Every field through FormReader, not hand-checked formString (L34, L67).
    const f = new FormReader(data)
    const id = f.uuid("id")
    const name = f.text("name", { required: true, max: 255 })
    const frequency = f.choice("frequency", FREQUENCIES, { required: true })
    const anchorDate = f.date("anchor_date", { required: true })
    // The timezone decides which calendar day a pay date falls on.
    const timezone = f.timezone("timezone", { required: true })
    const currency = f.currency("currency", { required: true })

    if (!f.ok) return fail(400, f.problem())

    const supported = data
      .getAll("supported_locales")
      .filter((v): v is string => typeof v === "string")
    const nameI18n: Record<string, string> = {}
    for (const l of supported) {
      const v = formString(data, `name_i18n.${l}`).trim()
      if (v !== "") nameI18n[l] = v
    }

    const input = {
      name,
      name_i18n: Object.keys(nameI18n).length ? nameI18n : null,
      frequency,
      anchor_date: anchorDate,
      timezone,
      currency,
      adjust_for_weekends: f.bool("adjust_for_weekends"),
      adjust_for_holidays: f.bool("adjust_for_holidays"),
    }

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        // Read before writing, so the entry says what changed.
        const before = id
          ? ((await schedules.list(tx)).find((r) => r.id === id) ?? null)
          : null

        if (id) await schedules.update(tx, id, input)
        else await schedules.create(tx, tenantId, input)

        // Same transaction — a moved pay date is a question someone asks the same week.
        await audit.record(tx, contextFrom(locals)!, {
          action: id ? "update" : "create",
          entityType: "payroll_pay_schedules",
          entityId: id ?? null,
          module: "payroll",
          changes: audit.diff(before, input, AUDITED_FIELDS),
        })
      })
    } catch (e) {
      // A duplicate schedule reference, or a CHECK on frequency.
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
    if (!f.ok) return fail(400, f.problem("Missing schedule."))
    const archived = await withTenant(actorFrom(locals), async (tx) => {
      // Nothing matched: no audit entry, and no claim that it was archived.
      if (!(await schedules.archive(tx, id))) return false
      await audit.record(tx, contextFrom(locals)!, {
        action: "archive",
        entityType: "payroll_pay_schedules",
        entityId: id,
        module: "payroll",
        changes: { is_active: { from: "true", to: "false" } },
      })
      return true
    })
    if (!archived) {
      return fail(400, {
        message: "That pay schedule no longer exists. Reload the page.",
      })
    }
    return { archived: true }
  },
}

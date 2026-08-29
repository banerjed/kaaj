import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as schedules from "$lib/server/payroll/payroll_pay_schedules.repo"
import * as holidaysRepo from "$lib/server/firm-profile/firm_holidays.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"

const FREQUENCIES = ["weekly", "bi-weekly", "semi-monthly", "monthly"] as const

/** /settings/payroll/schedules — module-firm-profile.md § Pay Schedules Page. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  return withTenant(locals.tenantId, async (tx) => ({
    schedules: await schedules.list(tx),
    // Pay dates are flagged when they collide with a holiday, so the calendar
    // is needed to render the projection.
    holidays: await holidaysRepo.list(tx),
    locations: await locationsRepo.list(tx),
  }))
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const name = formString(data, "name").trim()
    const frequency = formString(data, "frequency")
    const anchorDate = formString(data, "anchor_date")
    const timezone = formString(data, "timezone")
    const currency = formString(data, "currency")

    const errorFields: string[] = []
    if (name === "") errorFields.push("name")
    if (!FREQUENCIES.includes(frequency as (typeof FREQUENCIES)[number]))
      errorFields.push("frequency")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) errorFields.push("anchor_date")
    if (!currency) errorFields.push("currency")

    // A schedule's timezone decides which calendar day a pay date falls on, so
    // an unreal zone would silently shift every payment.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    } catch {
      errorFields.push("timezone")
    }

    if (errorFields.length) {
      return fail(400, { errorFields, message: "Some fields need attention." })
    }

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
      adjust_for_weekends: formString(data, "adjust_for_weekends") === "on",
      adjust_for_holidays: formString(data, "adjust_for_holidays") === "on",
    }

    await withTenant(tenantId, async (tx) => {
      if (id) await schedules.update(tx, id, input)
      else await schedules.create(tx, tenantId, input)
    })
    return { saved: true }
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const id = formString(await request.formData(), "id")
    if (!id) return fail(400, { message: "Missing schedule." })
    await withTenant(locals.tenantId, (tx) => schedules.archive(tx, id))
    return { archived: true }
  },
}

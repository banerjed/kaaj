import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as holidays from "$lib/server/firm-profile/firm_holidays.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"

/** /settings/holidays — module-firm-profile.md § Holiday Calendar. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")

  // Filter state lives in the URL, not in component state (doc 03), so the
  // view is shareable and survives a reload.
  const yearParam = url.searchParams.get("year")
  const year = yearParam ? Number(yearParam) : undefined

  return withTenant(locals.tenantId, async (tx) => ({
    holidays: await holidays.list(tx, Number.isFinite(year) ? year : undefined),
    availableYears: await holidays.years(tx),
    locations: await locationsRepo.list(tx),
    selectedYear: Number.isFinite(year) ? year : null,
  }))
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const name = formString(data, "name").trim()
    const date = formString(data, "date")
    const locationCode = formString(data, "location_code")

    const errorFields: string[] = []
    if (name === "") errorFields.push("name")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errorFields.push("date")
    if (!locationCode) errorFields.push("location_code")

    const supported = data
      .getAll("supported_locales")
      .filter((v): v is string => typeof v === "string")
    const nameI18n: Record<string, string> = {}
    for (const l of supported) {
      const v = formString(data, `name_i18n.${l}`).trim()
      if (v !== "") nameI18n[l] = v
    }

    return withTenant(tenantId, async (tx) => {
      if (errorFields.length === 0) {
        if (await holidays.clashes(tx, locationCode, date, id || undefined)) {
          return fail(400, {
            errorFields: ["date"],
            message: "That office already observes a holiday on that date.",
          })
        }
      } else {
        return fail(400, {
          errorFields,
          message: "Some fields need attention.",
        })
      }

      const input = {
        location_code: locationCode,
        name,
        name_i18n: Object.keys(nameI18n).length ? nameI18n : null,
        date,
        is_paid: formString(data, "is_paid") === "on",
        is_mandatory: formString(data, "is_mandatory") === "on",
        is_recurring: formString(data, "is_recurring") === "on",
        holiday_id: formString(data, "holiday_id").trim() || null,
      }

      if (id) await holidays.update(tx, id, input)
      else await holidays.create(tx, tenantId, input)
      return { saved: true }
    })
  },

  remove: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const id = formString(await request.formData(), "id")
    if (!id) return fail(400, { message: "Missing holiday." })
    await withTenant(locals.tenantId, (tx) => holidays.remove(tx, id))
    return { removed: true }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as holidays from "$lib/server/firm-profile/firm_holidays.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"

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
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)

    const id = f.uuid("id")
    const name = f.text("name", { required: true, max: 255 })
    const date = f.date("date", { required: true })
    const locationCode = f.text("location_code", { required: true, max: 100 })
    const nameI18n = f.i18n(
      "name_i18n",
      formList(data, "supported_locales"),
      255,
    )

    const input = {
      location_code: locationCode,
      name,
      name_i18n: nameI18n,
      date,
      is_paid: f.bool("is_paid"),
      is_mandatory: f.bool("is_mandatory"),
      is_recurring: f.bool("is_recurring"),
      holiday_id: f.text("holiday_id", { max: 100 }),
    }

    if (!f.ok) return fail(400, f.problem())

    return withTenant(tenantId, async (tx) => {
      if (await holidays.clashes(tx, locationCode, date, id || undefined)) {
        return fail(400, {
          errorFields: ["date"],
          message: "That office already observes a holiday on that date.",
        })
      }

      if (id) await holidays.update(tx, id, input)
      else await holidays.create(tx, tenantId, input)
      return { saved: true }
    })
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing holiday."))
    await withTenant(locals.tenantId, (tx) => holidays.archive(tx, id))
    return { archived: true }
  },
}

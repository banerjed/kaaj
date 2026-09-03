import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as holidays from "$lib/server/firm-profile/firm_holidays.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader, formList } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /settings/holidays — module-firm-profile.md § Holiday Calendar. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")

  // Filter state lives in the URL so the view is shareable and survives a reload.
  const yearParam = url.searchParams.get("year")
  const year = yearParam ? Number(yearParam) : undefined

  return withTenant(actorFrom(locals), async (tx) => ({
    holidays: await holidays.list(tx, Number.isFinite(year) ? year : undefined),
    availableYears: await holidays.years(tx),
    locations: await locationsRepo.list(tx),
    selectedYear: Number.isFinite(year) ? year : null,
  }))
}

/** The fields a reviewer would ask about, not every column. */
const AUDITED_FIELDS = [
  "holiday_name",
  "holiday_date",
  "location_code",
  "is_paid",
  "is_recurring",
]

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

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        if (await holidays.clashes(tx, locationCode, date, id || undefined)) {
          return fail(400, {
            errorFields: ["date"],
            message: "That office already observes a holiday on that date.",
          })
        }

        // Read before writing, so the entry says what changed.
        const before = id
          ? ((await holidays.list(tx)).find((r) => r.id === id) ?? null)
          : null

        if (id) await holidays.update(tx, id, input)
        else await holidays.create(tx, tenantId, input)

        // Same transaction — a holiday decides paid leave and premium pay.
        await audit.record(tx, contextFrom(locals)!, {
          action: id ? "update" : "create",
          entityType: "firm_holidays",
          entityId: id ?? null,
          module: "firm-profile",
          changes: audit.diff(before, input, AUDITED_FIELDS),
        })
        return { saved: true }
      })
    } catch (e) {
      // A duplicate holiday reference; previously an "Internal Error" page.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing holiday."))
    const archived = await withTenant(actorFrom(locals), async (tx) => {
      // Nothing matched: no audit entry, and no claim that it was archived.
      if (!(await holidays.archive(tx, id))) return false
      await audit.record(tx, contextFrom(locals)!, {
        action: "archive",
        entityType: "firm_holidays",
        entityId: id,
        module: "firm-profile",
        changes: { is_active: { from: "true", to: "false" } },
      })
      return true
    })
    if (!archived) {
      return fail(400, {
        message: "That holiday no longer exists. Reload the page.",
      })
    }
    return { archived: true }
  },
}

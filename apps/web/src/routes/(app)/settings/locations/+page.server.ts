import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as locations from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader, formList, formString } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { sanitizeEmail, sanitizePhoneNumber } from "@kaaj/validation"

/** /settings/locations — module-firm-profile.md § Locations Page. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const rows = await withTenant(actorFrom(locals), (tx) => locations.list(tx))
  return { locations: rows }
}

/** The fields worth recording when an office changes. */
const AUDITED_FIELDS = [
  "name",
  "location_code",
  "timezone",
  "locale",
  "currency",
  "country",
  "is_headquarters",
]

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)

    const id = f.uuid("id")
    // Uppercased: location_code is UNIQUE, and "uk-lon"/"UK-LON" would else read as different offices.
    const code = f.text("location_code", {
      required: true,
      max: 50,
      upper: true,
      pattern: /^[A-Z0-9-]{2,50}$/,
    })

    // Country-specific formats come from @kaaj/validation, never a regex here.
    let email: string | null = null
    const rawEmail = formString(data, "email").trim()
    if (rawEmail !== "") {
      const r = sanitizeEmail(rawEmail)
      if (r.valid && r.value.length <= 255) email = r.value
      else f.reject("email")
    }

    let phone: string | null = null
    const rawPhone = formString(data, "phone").trim()
    if (rawPhone !== "") {
      const r = sanitizePhoneNumber(rawPhone)
      // varchar(20): an extension can overflow it, which would otherwise be a 500.
      if (r.valid && r.value.length <= 20) phone = r.value
      else f.reject("phone")
    }

    const isHq = f.bool("is_headquarters")
    const input = {
      name: f.text("name", { required: true, max: 255 }),
      name_i18n: f.i18n("name_i18n", formList(data, "supported_locales"), 255),
      location_code: code,
      address_line1: f.text("address_line1", { max: 255 }),
      address_line2: f.text("address_line2", { max: 255 }),
      city: f.text("city", { max: 100 }),
      state: f.text("state", { max: 100 }),
      postal_code: f.text("postal_code", { max: 20 }),
      country: f.text("country", {
        required: true,
        max: 2,
        upper: true,
        pattern: /^[A-Z]{2}$/,
      }),
      timezone: f.timezone("timezone", { required: true }),
      // Validated, not merely trimmed — the POSIX spelling (`en_US`) is a RangeError inside Intl (L24).
      locale: f.locale("locale"),
      currency: f.currency("currency"),
      phone,
      email,
      is_headquarters: isHq,
      capacity: f.integer("capacity", { min: 0, max: 2147483647 }),
    }

    if (!f.ok) return fail(400, f.problem())

    const ctx = contextFrom(locals)
    try {
      await withTenant(actorFrom(locals), async (tx) => {
        // Read before writing, so the entry says what changed.
        const before = id ? await locations.getById(tx, id) : null

        // Demote before writing: a partial unique index allows only one HQ, so order matters here.
        if (isHq) await locations.clearOtherHeadquarters(tx, id || null)

        if (id) await locations.update(tx, id, input)
        else await locations.create(tx, tenantId, input)

        // Same transaction — timezone decides the attendance day (L35); locale decides formatting.
        await audit.record(tx, ctx!, {
          action: id ? "update" : "create",
          entityType: "firm_locations",
          entityId: id ?? null,
          module: "firm-profile",
          changes: audit.diff(before, input, AUDITED_FIELDS),
        })
      })
    } catch (e) {
      // A duplicate code or a second headquarters — previously an "Internal Error" page.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }

    return { saved: true }
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const data = await request.formData()
    const f = new FormReader(data)
    const id = f.uuid("id", { required: true })
    const code = f.text("location_code", { required: true, max: 50 })
    if (!f.ok) return fail(400, f.problem("Missing location."))

    return withTenant(actorFrom(locals), async (tx) => {
      // Refuse rather than orphan: employees and holidays reference this office by code.
      const deps = await locations.dependents(tx, code)
      if (deps.employees > 0) {
        return fail(400, {
          message: `${deps.employees} active ${deps.employees === 1 ? "person is" : "people are"} still assigned to this office. Move them first.`,
        })
      }
      // Nothing matched: no audit entry, and no claim that it was archived.
      if (!(await locations.archive(tx, id))) {
        return fail(400, {
          message: "That office no longer exists. Reload the page.",
        })
      }

      await audit.record(tx, contextFrom(locals)!, {
        action: "archive",
        entityType: "firm_locations",
        entityId: id,
        module: "firm-profile",
        changes: { is_active: { from: "true", to: "false" } },
      })
      return { archived: true }
    })
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as locations from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList, formString } from "$lib/server/forms"
import { sanitizeEmail, sanitizePhoneNumber } from "@kaaj/validation"

/**
 * /settings/locations — module-firm-profile.md § Locations Page.
 *
 * One `load`, one transaction, one query (docs/03-perf_guide.md).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const rows = await withTenant(actorFrom(locals), (tx) => locations.list(tx))
  return { locations: rows }
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)

    const id = f.uuid("id")
    // Uppercased: UNIQUE (tenant_id, location_code), and "uk-lon" and "UK-LON"
    // would otherwise be two offices that read as one.
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
      // varchar(20): a valid international number with an extension can exceed
      // it, and the column would answer with a 500 rather than a field error.
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
      // Validated, not merely trimmed. This column is the locale every figure
      // for this office is formatted in (L24), and `en_US` — the POSIX
      // spelling — is a RangeError inside Intl, on every page that shows one.
      locale: f.locale("locale"),
      currency: f.currency("currency"),
      phone,
      email,
      is_headquarters: isHq,
      capacity: f.integer("capacity", { min: 0, max: 2147483647 }),
    }

    if (!f.ok) return fail(400, f.problem())

    await withTenant(actorFrom(locals), async (tx) => {
      // Demote BEFORE writing. A partial unique index enforces one HQ per
      // tenant, so promoting this office while another still holds the flag
      // fails on the write itself — order matters, not just atomicity.
      if (isHq) await locations.clearOtherHeadquarters(tx, id || null)

      if (id) await locations.update(tx, id, input)
      else await locations.create(tx, tenantId, input)
    })

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
      // Refuse rather than orphan: employees and holidays point at this office
      // by code, and deactivating under them leaves rows referencing something
      // the UI no longer shows.
      const deps = await locations.dependents(tx, code)
      if (deps.employees > 0) {
        return fail(400, {
          message: `${deps.employees} active ${deps.employees === 1 ? "person is" : "people are"} still assigned to this office. Move them first.`,
        })
      }
      await locations.archive(tx, id)
      return { archived: true }
    })
  },
}

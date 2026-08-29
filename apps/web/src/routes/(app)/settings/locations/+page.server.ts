import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as locations from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"
import { sanitizeEmail, sanitizePhoneNumber } from "@kaaj/validation"

/**
 * /settings/locations — module-firm-profile.md § Locations Page.
 *
 * One `load`, one transaction, one query (docs/03-perf_guide.md).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const rows = await withTenant(locals.tenantId, (tx) => locations.list(tx))
  return { locations: rows }
}

const nullIfBlank = (v: string) => (v.trim() === "" ? null : v.trim())

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const tenantId = locals.tenantId
    const data = await request.formData()

    const id = formString(data, "id")
    const name = formString(data, "name").trim()
    // Uppercased: UNIQUE (tenant_id, location_code), and "uk-lon" and "UK-LON"
    // would otherwise be two offices that read as one.
    const code = formString(data, "location_code").trim().toUpperCase()
    const country = formString(data, "country").trim().toUpperCase()
    const timezone = formString(data, "timezone")

    const errorFields: string[] = []
    if (name === "") errorFields.push("name")
    if (!/^[A-Z0-9-]{2,50}$/.test(code)) errorFields.push("location_code")
    if (!/^[A-Z]{2}$/.test(country)) errorFields.push("country")

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    } catch {
      errorFields.push("timezone")
    }

    // Country-specific formats come from @kaaj/validation, never a regex here.
    const rawEmail = formString(data, "email").trim()
    let email: string | null = null
    if (rawEmail !== "") {
      const r = sanitizeEmail(rawEmail)
      if (r.valid) email = r.value
      else errorFields.push("email")
    }

    const rawPhone = formString(data, "phone").trim()
    let phone: string | null = null
    if (rawPhone !== "") {
      const r = sanitizePhoneNumber(rawPhone)
      if (r.valid) phone = r.value
      else errorFields.push("phone")
    }

    const rawCapacity = formString(data, "capacity").trim()
    let capacity: number | null = null
    if (rawCapacity !== "") {
      const n = Number(rawCapacity)
      if (Number.isInteger(n) && n >= 0) capacity = n
      else errorFields.push("capacity")
    }

    const supported = data
      .getAll("supported_locales")
      .filter((v): v is string => typeof v === "string")
    const nameI18n: Record<string, string> = {}
    for (const l of supported) {
      const v = formString(data, `name_i18n.${l}`).trim()
      if (v !== "") nameI18n[l] = v
    }

    if (errorFields.length) {
      return fail(400, { errorFields, message: "Some fields need attention." })
    }

    const isHq = formString(data, "is_headquarters") === "on"
    const input = {
      name,
      name_i18n: Object.keys(nameI18n).length ? nameI18n : null,
      location_code: code,
      address_line1: nullIfBlank(formString(data, "address_line1")),
      address_line2: nullIfBlank(formString(data, "address_line2")),
      city: nullIfBlank(formString(data, "city")),
      state: nullIfBlank(formString(data, "state")),
      postal_code: nullIfBlank(formString(data, "postal_code")),
      country,
      timezone,
      locale: nullIfBlank(formString(data, "locale")),
      currency: nullIfBlank(formString(data, "currency")),
      phone,
      email,
      is_headquarters: isHq,
      capacity,
    }

    await withTenant(tenantId, async (tx) => {
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
    const data = await request.formData()
    const id = formString(data, "id")
    const code = formString(data, "location_code")
    if (!id) return fail(400, { message: "Missing location." })

    return withTenant(locals.tenantId, async (tx) => {
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

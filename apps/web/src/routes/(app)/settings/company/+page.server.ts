import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as tenants from "$lib/server/platform-tenancy/tenants.repo"
import * as audit from "$lib/server/audit/audit.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import {
  FormReader,
  checkFields,
  formString,
  formList,
} from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import {
  validateRegional,
  COMPANY_SIZES,
  DATE_FORMATS,
  TIME_FORMATS,
} from "$lib/firm-profile/regional"
import { sanitizeEmail, sanitizePhoneNumber } from "@kaaj/validation"

/** /settings/company — module-firm-profile.md § Company Profile Page. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const tenant = await withTenant(actorFrom(locals), (tx) =>
    tenants.getCurrent(tx),
  )
  if (!tenant) error(404, "Tenant not found")

  return { company: tenant }
}

/** Every figure in the product is formatted against these. */
const AUDITED_FIELDS = [
  "company_name",
  "legal_entity_name",
  "default_locale",
  "default_currency",
  "default_timezone",
  "date_format",
  "time_format",
  "supported_locales",
  "supported_currencies",
]

export const actions: Actions = {
  update: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "tenant.settings.write")

    const data = await request.formData()
    const f = new FormReader(data)

    const companyName = f.text("company_name", { required: true, max: 255 })
    const defaultLocale = formString(data, "default_locale")
    const supportedLocales = formList(data, "supported_locales")
    const defaultCurrency = formString(data, "default_currency")
    const supportedCurrencies = formList(data, "supported_currencies")
    const defaultTimezone = formString(data, "default_timezone")

    // So validation accepts locales already on the tenant, even off the launch list.
    const existing = await withTenant(actorFrom(locals), (tx) =>
      tenants.getCurrent(tx),
    )

    const errorFields = validateRegional({
      default_locale: defaultLocale,
      supported_locales: supportedLocales,
      default_currency: defaultCurrency,
      supported_currencies: supportedCurrencies,
      default_timezone: defaultTimezone,
      existing_locales: existing?.supported_locales ?? null,
    })

    // Both drive display formatting for the whole tenant (L34).
    const dateFormat = f.choice("date_format", DATE_FORMATS, {
      fallback: "MM/DD/YYYY",
    })
    const timeFormat = f.choice("time_format", TIME_FORMATS, {
      fallback: "12h",
    })
    // Every reader above the `if (!f.ok)` gate (L33).
    const legalEntityName = f.text("legal_entity_name", { max: 255 })
    const industry = f.text("industry", { max: 100 })
    const companySize = f.choice("company_size", COMPANY_SIZES)
    const contactName = f.text("primary_contact_name", { max: 255 })

    errorFields.push(...f.errorFields)

    // Validation comes from @kaaj/validation, never a regex here. Both fields are optional.
    const rawEmail = formString(data, "primary_contact_email").trim()
    let contactEmail: string | null = null
    if (rawEmail !== "") {
      const result = sanitizeEmail(rawEmail)
      if (result.valid) contactEmail = result.value
      else errorFields.push("primary_contact_email")
    }

    const rawPhone = formString(data, "primary_contact_phone").trim()
    let contactPhone: string | null = null
    if (rawPhone !== "") {
      const result = sanitizePhoneNumber(rawPhone)
      if (result.valid) contactPhone = result.value
      else errorFields.push("primary_contact_phone")
    }

    // Kept only for locales the tenant still supports, so a dropped locale's translation doesn't linger.
    const nameI18n: Record<string, string> = {}
    for (const locale of supportedLocales) {
      const value = formString(data, `company_name_i18n.${locale}`).trim()
      if (value !== "") nameI18n[locale] = value
    }

    if (errorFields.length > 0) {
      const unique = [...new Set(errorFields)]
      return fail(400, { errorFields: unique, message: checkFields(unique) })
    }

    const input = {
      company_name: companyName,
      company_name_i18n: Object.keys(nameI18n).length ? nameI18n : null,
      legal_entity_name: legalEntityName,
      industry,
      company_size: companySize,
      default_locale: defaultLocale,
      supported_locales: supportedLocales,
      default_currency: defaultCurrency,
      supported_currencies: supportedCurrencies,
      default_timezone: defaultTimezone,
      date_format: dateFormat,
      time_format: timeFormat,
      primary_contact_name: contactName,
      primary_contact_email: contactEmail,
      primary_contact_phone: contactPhone,
    }

    try {
      const saved = await withTenant(actorFrom(locals), async (tx) => {
        // Read before writing, so the audit entry says what changed.
        const before = await tenants.getCurrent(tx)
        const row = await tenants.update(tx, input)

        await audit.record(tx, contextFrom(locals)!, {
          action: "update",
          entityType: "tenants",
          entityId: locals.tenantId,
          module: "platform-tenancy",
          changes: audit.diff(before, input, AUDITED_FIELDS),
        })
        return row
      })
      return { saved: true, company: saved }
    } catch (e) {
      // company_size is a CHECK constraint, not an enum; a crafted value was a 500.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

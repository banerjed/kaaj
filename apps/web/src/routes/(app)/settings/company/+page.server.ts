import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as tenants from "$lib/server/platform-tenancy/tenants.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formString, formList } from "$lib/server/forms"
import {
  validateRegional,
  DATE_FORMATS,
  TIME_FORMATS,
} from "$lib/firm-profile/regional"
import { sanitizeEmail, sanitizePhoneNumber } from "@kaaj/validation"

/**
 * /settings/company — module-firm-profile.md § Company Profile Page.
 *
 * One load, one transaction, one query (doc 03).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")

  const tenant = await withTenant(actorFrom(locals), (tx) =>
    tenants.getCurrent(tx),
  )
  if (!tenant) error(404, "Tenant not found")

  return { company: tenant }
}

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

    // The record as stored, so validation can accept locales already on the
    // tenant that are not in the launch list (see localeOptions).
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

    // Both drive display formatting for the whole tenant, and both were
    // written straight through from the form (L34).
    const dateFormat = f.choice("date_format", DATE_FORMATS, {
      fallback: "MM/DD/YYYY",
    })
    const timeFormat = f.choice("time_format", TIME_FORMATS, {
      fallback: "12h",
    })
    // Read before the gate, not inline in the update below: the argument object
    // is evaluated after it, so a rejection there would never be reported and
    // the field would save as NULL (L33).
    const legalEntityName = f.text("legal_entity_name", { max: 255 })
    const industry = f.text("industry", { max: 100 })
    const companySize = f.text("company_size", { max: 50 })
    const contactName = f.text("primary_contact_name", { max: 255 })

    errorFields.push(...f.errorFields)

    // Country-specific formats come from @kaaj/validation, never a regex here:
    // maintaining these rules twice is how a wrong tax identifier reaches a
    // payslip. Both fields are optional, so only non-empty values are checked.
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

    // Per-locale company names, kept only where the tenant actually supports
    // the locale — otherwise a translation lingers after a locale is dropped
    // and reappears if it is ever re-enabled.
    const nameI18n: Record<string, string> = {}
    for (const locale of supportedLocales) {
      const value = formString(data, `company_name_i18n.${locale}`).trim()
      if (value !== "") nameI18n[locale] = value
    }

    if (errorFields.length > 0) {
      return fail(400, {
        errorFields: [...new Set(errorFields)],
        message: "Some fields need attention.",
      })
    }

    const saved = await withTenant(actorFrom(locals), (tx) =>
      tenants.update(tx, {
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
      }),
    )

    return { saved: true, company: saved }
  },
}

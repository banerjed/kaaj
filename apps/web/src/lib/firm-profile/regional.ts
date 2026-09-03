/**
 * Locale, currency and timezone reference data for the regional settings.
 *
 * Client-safe (no `$lib/server`), because the same lists drive the form and the
 * live preview beside it.
 *
 * Timezones come from `Intl.supportedValuesOf('timeZone')` rather than a list
 * in this repo: the IANA database changes several times a year, and a copied
 * list goes stale silently — a tenant in a zone we dropped simply cannot be
 * selected. The runtime's copy is maintained for us.
 *
 * Locales and currencies are NOT taken from Intl. Both would return hundreds of
 * entries, and module-firm-profile.md § Appendix deliberately scopes what the
 * product supports at launch — a currency we cannot format payslips in should
 * not be offerable. These lists are the spec's, and grow with it.
 */

/** module-firm-profile.md § Supported Locales — Phase 1 (Launch). */
export const SUPPORTED_LOCALES = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "de-DE", label: "German (Germany)" },
] as const

/** module-firm-profile.md § Supported Currencies — Launch Currencies. */
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "CNY",
  "INR",
  "MXN",
] as const

/** module-firm-profile.md § Page Specifications — Company Profile. */
export const DATE_FORMATS = [
  "MM/DD/YYYY",
  "DD/MM/YYYY",
  "YYYY-MM-DD",
  "DD.MM.YYYY",
  "DD-MM-YYYY",
] as const

export const TIME_FORMATS = ["12h", "24h"] as const

/**
 * `tenants.company_size` is a CHECK constraint on a plain `text` column, not a
 * Postgres enum — so it is not in `@kaaj/enums`, and this list IS the
 * constraint. It lives here rather than in the page because two copies of a
 * constraint are one constraint that will disagree (L57): the page had the
 * only copy, the action read the column with `f.text`, and an off-list value
 * reached Postgres and answered HTTP 500.
 */
export const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501+",
] as const

const isLocale = (code: string) =>
  SUPPORTED_LOCALES.some((l) => l.code === code)

/**
 * The locales to offer: the launch list, plus anything this tenant already has
 * that is not on it.
 *
 * Without the union, a stored locale we do not recognise renders no checkbox,
 * so the next save posts only the boxes that exist and drops it — silent data
 * loss on an unrelated edit. The Northwind fixture has exactly this shape
 * (`en-IN`), which is how it was found. Unknown entries are labelled so the
 * gap is visible rather than mysterious.
 */
export type LocaleOption = { code: string; label: string; known: boolean }

export function localeOptions(current: string[] | null): LocaleOption[] {
  // Annotated, not inferred: SUPPORTED_LOCALES is `as const`, so the inferred
  // element type would be the literal union and reject anything else.
  const options: LocaleOption[] = SUPPORTED_LOCALES.map((l) => ({
    code: l.code,
    label: l.label,
    known: true,
  }))
  for (const code of current ?? []) {
    if (!isLocale(code)) {
      options.push({
        code,
        label: `${code} — not in the launch set`,
        known: false,
      })
    }
  }
  return options
}

/** Same reasoning as `localeOptions`, for currencies. */
export function currencyOptions(current: string[] | null): string[] {
  const extra = (current ?? []).filter(
    (c) =>
      !SUPPORTED_CURRENCIES.includes(
        c as (typeof SUPPORTED_CURRENCIES)[number],
      ),
  )
  return [...SUPPORTED_CURRENCIES, ...extra]
}

/** IANA zones, grouped by region for a selectable list. */
export function timezoneOptions(): { region: string; zones: string[] }[] {
  let zones: string[]
  try {
    zones = Intl.supportedValuesOf("timeZone") as string[]
  } catch {
    // Older runtimes lack supportedValuesOf. Fall back to the zones the
    // fixture uses, so the form still works rather than rendering empty.
    zones = ["America/New_York", "Europe/London", "Asia/Kolkata", "UTC"]
  }

  const byRegion = new Map<string, string[]>()
  for (const zone of zones) {
    const region = zone.includes("/") ? zone.split("/")[0] : "Other"
    const list = byRegion.get(region)
    if (list) list.push(zone)
    else byRegion.set(region, [zone])
  }
  return [...byRegion.entries()]
    .map(([region, list]) => ({ region, zones: list }))
    .sort((a, b) => a.region.localeCompare(b.region))
}

export function currencyLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code)
    const symbol = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value
    return symbol && symbol !== code
      ? `${code} — ${name} (${symbol})`
      : `${code} — ${name}`
  } catch {
    return code
  }
}

/**
 * Validation from module-firm-profile.md § Validation Rules — Tenant
 * Configuration. Returns field names that failed, so the form can mark them.
 *
 * The two cross-field rules are the ones worth having a function for: a default
 * outside its own supported list leaves the tenant with a locale or currency
 * nothing else in the product will accept.
 */
export function validateRegional(input: {
  default_locale: string
  supported_locales: string[]
  default_currency: string
  supported_currencies: string[]
  default_timezone: string
  existing_locales?: string[] | null
}): string[] {
  const errors: string[] = []

  if (input.supported_locales.length === 0) errors.push("supported_locales")
  // Unknown-but-already-stored locales are permitted: rejecting them would make
  // an existing tenant unable to save any change until someone edited the
  // launch list. `known` in localeOptions() surfaces them in the UI instead.
  if (
    !input.supported_locales.every(
      (c) => isLocale(c) || (input.existing_locales ?? []).includes(c),
    )
  )
    errors.push("supported_locales")
  if (!input.supported_locales.includes(input.default_locale))
    errors.push("default_locale")

  if (input.supported_currencies.length === 0)
    errors.push("supported_currencies")
  if (!input.supported_currencies.includes(input.default_currency))
    errors.push("default_currency")

  // Ask the runtime whether the zone is real rather than matching a pattern:
  // "Europe/Nowhere" is well-formed and does not exist.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.default_timezone })
  } catch {
    errors.push("default_timezone")
  }

  return [...new Set(errors)]
}

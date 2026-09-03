import { dev } from "$app/environment"

/**
 * Locale-aware formatting, bound to the TENANT's settings rather than the
 * browser's — the whole product's i18n surface for numbers, money, dates and
 * times (BR-FP-003/004/006). Client-safe: used by both `load` and components.
 */

export type FormatContext = {
  locale: string
  currency: string
  timezone: string
  /** "12h" | "24h" from tenants.time_format. */
  timeFormat?: string | null
}

/** Intl constructors are expensive; the same few combinations recur per page. */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(
  key: string,
  build: () => T,
): T {
  const hit = cache.get(key)
  if (hit) return hit as T
  const made = build()
  cache.set(key, made)
  return made
}

/**
 * Money, EXACT, in the currency it is denominated in — never converted. The
 * default; use `approxMoney` for an abbreviated figure. `amount` is a string
 * because Postgres NUMERIC exceeds float64 precision.
 */
export function money(
  amount: string | number | null | undefined,
  currency: string,
  locale: string,
  options: { compact?: boolean } = {},
): string {
  if (amount === null || amount === undefined || amount === "") return "—"
  const value = typeof amount === "string" ? Number(amount) : amount
  if (!Number.isFinite(value)) return "—"

  // Missing currency is a caller bug, not an unknown one — throw loudly in
  // dev rather than render "undefined" on a payslip (L45).
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) {
    if (dev) {
      throw new Error(
        `money() needs a 3-letter currency; got ${JSON.stringify(currency)}. ` +
          `Currency travels with the amount (BR-FP-003).`,
      )
    }
    return number(value, locale)
  }

  const key = `m:${locale}:${currency}:${options.compact ? "c" : "f"}`
  try {
    return cached(
      key,
      () =>
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          ...(options.compact
            ? {
                notation: "compact",
                // Cap, not a minimum, so 950 stays $950 not $950.00.
                maximumFractionDigits: 2,
                // Stated explicitly — ICU's inherited minimum differs across
                // Node versions ("$950" vs "$950.00" for the same input).
                minimumFractionDigits: 0,
              }
            : {}),
        }),
    ).format(value) as string
  } catch {
    // Only a malformed code throws; keep an unknown code visible.
    return `${currency} ${value}`
  }
}

/**
 * Money, ABBREVIATED, by the locale's own convention (Intl handles lakh/crore
 * etc. natively). For scale only — dashboards, chart axes — never for a
 * payslip, invoice, or anything reconciled against a bank statement. See
 * CLAUDE.md § Money.
 */
export function approxMoney(
  amount: string | number | null | undefined,
  currency: string,
  locale: string,
): string {
  return money(amount, currency, locale, { compact: true })
}

export function number(value: number | string | null, locale: string): string {
  if (value === null || value === "") return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return "—"
  try {
    return cached(`n:${locale}`, () => new Intl.NumberFormat(locale)).format(
      n,
    ) as string
  } catch {
    // A malformed stored locale (e.g. `en_US`) is a RangeError; degrade
    // rather than take down the page.
    return String(n)
  }
}

/**
 * A duration held as decimal hours — `total_hours`, `overtime_hours` —
 * rendered as `7h 45m`. Printing the raw decimal lets Intl's fraction-digit
 * cap turn `6.9333` into `6.933`, a number nobody recognises.
 */
export function hours(
  value: string | number | null | undefined,
  locale: string,
): string {
  if (value === null || value === undefined || value === "") return "—"
  const decimal = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(decimal)) return "—"

  const negative = decimal < 0
  const totalMinutes = Math.round(Math.abs(decimal) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  const sign = negative ? "-" : ""
  if (h === 0) return `${sign}${number(m, locale)}m`
  if (m === 0) return `${sign}${number(h, locale)}h`
  return `${sign}${number(h, locale)}h ${number(m, locale)}m`
}

/**
 * A calendar date — `start_date`, `date` on a holiday. DATE columns carry no
 * zone, so this formats in UTC; a local timezone here off-by-ones the date.
 */
export function calendarDate(
  value: string | Date | null | undefined,
  locale: string,
  style: "long" | "medium" | "short" = "medium",
): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return "—"
  try {
    return cached(
      `d:${locale}:${style}`,
      () =>
        new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: "UTC" }),
    ).format(date) as string
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** An instant, shown in a specific zone — timestamps, "current time here". */
export function instant(
  value: Date | string | null | undefined,
  ctx: FormatContext,
  parts: "time" | "datetime" = "datetime",
): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  const hour12 = ctx.timeFormat ? ctx.timeFormat === "12h" : undefined
  const key = `i:${ctx.locale}:${ctx.timezone}:${parts}:${hour12}`
  try {
    return cached(
      key,
      () =>
        new Intl.DateTimeFormat(ctx.locale, {
          ...(parts === "datetime" ? { dateStyle: "medium" } : {}),
          timeStyle: "short",
          timeZone: ctx.timezone,
          ...(hour12 === undefined ? {} : { hour12 }),
        }),
    ).format(date) as string
  } catch {
    return ctx.timezone
  }
}

/**
 * The `*_i18n` JSONB columns, resolved against the viewer's locale: exact
 * match, then base language, then the plain column fallback (BR-FP-009).
 */
export function localised(
  i18n: Record<string, string> | null | undefined,
  fallback: string,
  locale: string,
): string {
  if (!i18n) return fallback
  if (i18n[locale]) return i18n[locale]

  const language = locale.split("-")[0]
  if (i18n[language]) return i18n[language]

  const sameLanguage = Object.keys(i18n).find((k) =>
    k.startsWith(`${language}-`),
  )
  return sameLanguage ? i18n[sameLanguage] : fallback
}

/** The current time in a given zone, for the "currently 3:45 PM" previews. */
export function currentTimeIn(
  timezone: string,
  locale: string,
  at: Date = new Date(),
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: timezone,
    }).format(at)
  } catch {
    return timezone
  }
}

/**
 * The locale a given currency should be formatted in, taken from the office
 * that uses it — grouping (e.g. INR lakh) is wrong if formatted in the
 * tenant's default locale instead. Falls back to the tenant default. See L24.
 */
export function localeForCurrency(
  locations: { currency: string | null; locale: string | null }[],
  currency: string,
  fallbackLocale: string,
): string {
  const office = locations.find((l) => l.currency === currency && l.locale)
  return office?.locale ?? fallbackLocale
}

/**
 * The locale a payroll run's country should be formatted in, taken from the
 * office in that country — the same reasoning as localeForCurrency, on
 * `firm_locations.country` instead of `.currency`. Two offices in one country
 * could disagree; the first configured wins, same tradeoff as the currency
 * version. Not a hardcoded country->locale table: a firm operating in a
 * country adds it by adding the office, not by this file growing a case.
 */
export function localeForCountry(
  locations: { country: string | null; locale: string | null }[],
  country: string | null,
  fallbackLocale: string,
): string {
  const office = locations.find((l) => l.country === country && l.locale)
  return office?.locale ?? fallbackLocale
}

/**
 * Locale-aware formatting, bound to the TENANT's settings rather than the
 * browser's.
 *
 * This is the whole of the product's i18n surface for numbers, money, dates and
 * times, and it lives in one file because the alternative — `toLocaleString()`
 * scattered through components — silently picks up the viewer's locale. A
 * London manager reviewing an India payslip must see the same figure the
 * employee sees, in the currency it was paid in. That is a correctness rule
 * (module-firm-profile.md § BR-FP-003/004/006), not a presentation preference.
 *
 * Client-safe: used by both `load` and components.
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
 * Money, in the currency it is denominated in — never converted.
 *
 * `amount` is a string because Postgres returns NUMERIC as one: the salaries
 * here run to 3,200,000.0000 and `numeric(18,4)` exceeds what a float64 holds
 * exactly. Parsing happens once, here, at the point of display.
 *
 * Fraction digits come from the currency itself, so JPY shows none and USD two,
 * without a table of special cases.
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

  const key = `m:${locale}:${currency}:${options.compact ? "c" : "f"}`
  try {
    return cached(
      key,
      () =>
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          ...(options.compact
            ? { notation: "compact", maximumFractionDigits: 1 }
            : {}),
        }),
    ).format(value) as string
  } catch {
    // Only a MALFORMED code throws — Intl accepts any well-formed 3-letter one
    // and uses it verbatim as the symbol, which is what we want (an unknown
    // code stays visible rather than being rendered as dollars).
    return `${currency} ${value}`
  }
}

export function number(value: number | string | null, locale: string): string {
  if (value === null || value === "") return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(n)) return "—"
  return cached(`n:${locale}`, () => new Intl.NumberFormat(locale)).format(
    n,
  ) as string
}

/**
 * A calendar date — `start_date`, `date` on a holiday.
 *
 * These columns are DATE, not TIMESTAMPTZ: they carry no time and no zone. A
 * hire date of 2025-03-07 is that day everywhere, so it is formatted in UTC.
 * Passing a local timezone here is the classic off-by-one, where a London user
 * sees an India hire date shift by a day.
 */
export function calendarDate(
  value: string | Date | null | undefined,
  locale: string,
  style: "long" | "medium" | "short" = "medium",
): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return "—"
  return cached(
    `d:${locale}:${style}`,
    () =>
      new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: "UTC" }),
  ).format(date) as string
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
 * The `*_i18n` JSONB columns, resolved against the viewer's locale.
 *
 * Falls back down the chain the spec describes (BR-FP-009): exact match, then
 * the base language, then the plain column. `en-GB` therefore reads an `en-US`
 * translation before giving up — better than showing a French name to a
 * British user because `en-GB` happened to be absent.
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
 * that uses it.
 *
 * An INR band is what the Bangalore office pays, so it reads correctly only in
 * `en-IN`: ₹18,00,000 (lakh grouping), not ₹1,800,000. Formatting every
 * currency in the tenant's default locale gets the symbol right and the
 * grouping wrong, which looks fine to a reader who does not use that currency
 * and wrong to everyone who does.
 *
 * `firm_locations.locale` is the per-office override the schema already
 * carries. Falls back to the tenant default for a currency no office uses.
 *
 * NOTE: the spec says "formatted per USER's locale", but no per-user locale
 * column exists anywhere in the schema — see docs/10-lessons-learned.md L24.
 * Market locale is the closest correct thing until that gap is closed.
 */
export function localeForCurrency(
  locations: { currency: string | null; locale: string | null }[],
  currency: string,
  fallbackLocale: string,
): string {
  const office = locations.find((l) => l.currency === currency && l.locale)
  return office?.locale ?? fallbackLocale
}

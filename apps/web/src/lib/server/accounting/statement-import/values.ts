/**
 * Amounts and dates as banks print them, into the units the columns store:
 * a signed decimal STRING with two places (money never passes through a
 * float — CLAUDE.md "Money"), and an ISO calendar date that round-trips
 * (L67). Nothing here rounds or guesses: a value that could mean two things
 * is refused, and the caller asks the person.
 */

export type DecimalMark = "." | ","

export type AmountResult =
  { ok: true; value: string | null } | { ok: false; reason: string }

/** numeric(15,2): 13 integer digits. */
const MAX_INTEGER_DIGITS = 13

const CURRENCY_NOISE = /[$£€₹¥]|\b(?:usd|gbp|eur|inr|rs\.?|cad|aud)\b/gi
/** Whitespace, no-break and thin spaces, and the Swiss apostrophe used as a thousands separator. */
const SPACES = new RegExp("[\\s\\u00a0\\u2009\\u202f']", "g")

/**
 * Parse one printed amount. Blank is `{ ok: true, value: null }` — a debit
 * column is blank on every credit line, and that is not an error.
 */
export function parseAmount(raw: string, decimal: DecimalMark): AmountResult {
  let s = raw.trim()
  if (s === "" || s === "-" || s === "—") return { ok: true, value: null }

  let negative = false
  const suffix = /\s*\b(cr|dr)\.?$/i.exec(s)
  if (suffix) {
    negative = suffix[1].toLowerCase() === "dr"
    s = s.slice(0, suffix.index).trim()
  }
  s = s.replace(CURRENCY_NOISE, "").trim()
  if (/^\(.*\)$/.test(s)) {
    negative = !negative
    s = s.slice(1, -1).trim()
  }
  if (/^[-−]/.test(s)) {
    negative = !negative
    s = s.slice(1).trim()
  } else if (/[-−]$/.test(s)) {
    negative = !negative
    s = s.slice(0, -1).trim()
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim()
  }
  s = s.replace(SPACES, "")

  const thousands = decimal === "." ? "," : "."
  const [intPart, fracPart, ...rest] = s.split(decimal)
  if (rest.length > 0)
    return { ok: false, reason: `"${raw}" has two decimal marks` }
  if (intPart.includes(thousands) && !groupedCorrectly(intPart, thousands)) {
    return { ok: false, reason: `"${raw}" is not a number in this format` }
  }
  const digits = intPart.split(thousands).join("")
  if (
    !/^\d+$/.test(digits) ||
    (fracPart !== undefined && !/^\d+$/.test(fracPart))
  ) {
    return { ok: false, reason: `"${raw}" is not a number` }
  }
  let frac = fracPart ?? ""
  // Extra places are refused, not rounded: numeric(15,2) would round them
  // silently. Trailing zeros lose nothing, so they are allowed.
  if (frac.length > 2) {
    if (/[^0]/.test(frac.slice(2))) {
      return { ok: false, reason: `"${raw}" has more than two decimal places` }
    }
    frac = frac.slice(0, 2)
  }
  const whole = digits.replace(/^0+(?=\d)/, "")
  if (whole.length > MAX_INTEGER_DIGITS) {
    return { ok: false, reason: `"${raw}" is too large` }
  }
  const cents = frac.padEnd(2, "0")
  const zero = /^0+$/.test(whole) && cents === "00"
  return { ok: true, value: `${negative && !zero ? "-" : ""}${whole}.${cents}` }
}

/** Western (1,234,567) or Indian (12,34,567) digit grouping, nothing else. */
function groupedCorrectly(intPart: string, sep: string): boolean {
  const esc = sep === "." ? "\\." : sep
  return (
    new RegExp(`^\\d{1,3}(${esc}\\d{3})+$`).test(intPart) ||
    new RegExp(`^\\d{1,2}(${esc}\\d{2})*${esc}\\d{3}$`).test(intPart)
  )
}

/**
 * Which character is the decimal mark, judged from EVERY value in the file.
 * Strong evidence: both marks present (the last is decimal), or a mark
 * followed by one or two digits. `1,234` or `1.234` alone could be either,
 * so they are only weak evidence. Returns every mark still possible.
 */
export function decimalCandidates(values: string[]): DecimalMark[] {
  let strongDot = false
  let strongComma = false
  let weakDot = false
  let weakComma = false
  for (const raw of values) {
    const s = raw.replace(/[^\d.,]/g, "")
    const dot = s.lastIndexOf(".")
    const comma = s.lastIndexOf(",")
    if (dot >= 0 && comma >= 0) {
      if (dot > comma) strongDot = true
      else strongComma = true
    } else if (dot >= 0) {
      if (/\.\d{1,2}$/.test(s)) strongDot = true
      else if (/\.\d{3}$/.test(s)) weakComma = true
    } else if (comma >= 0) {
      if (/,\d{1,2}$/.test(s)) strongComma = true
      else if (/,\d{3}$/.test(s)) weakDot = true
    }
  }
  if (strongDot && strongComma) return []
  if (strongDot) return ["."]
  if (strongComma) return [","]
  // Weak evidence never decides. `-1.005` is valid only as 1,005 in the
  // comma-decimal reading, and choosing a mark because it is the one that
  // makes every value valid turns a typo into an amount a thousand times too
  // large — silently. Ask instead.
  if (weakDot || weakComma) return [".", ","]
  // Only whole numbers: either mark reads them the same.
  return ["."]
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export const DATE_FORMATS = [
  "YYYY-MM-DD",
  "YYYY/MM/DD",
  "YYYYMMDD",
  "MM/DD/YYYY",
  "DD/MM/YYYY",
  "MM-DD-YYYY",
  "DD-MM-YYYY",
  "DD.MM.YYYY",
  "MM/DD/YY",
  "DD/MM/YY",
  "DD-MM-YY",
  "DD.MM.YY",
  "DD MMM YYYY",
  "DD-MMM-YYYY",
  "DD-MMM-YY",
  "DD MMM YY",
  "MMM DD, YYYY",
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

/** "Jan", "January", "Sept" — a real month name or its abbreviation, nothing else. */
function monthNumber(token: string): number | null {
  const t = token.toLowerCase()
  if (t.length < 3) return null
  const i = MONTH_NAMES.findIndex((name) => name.startsWith(t))
  return i < 0 ? null : i + 1
}

/** Captures, per format: [day, month, year] group indexes, and the regex. */
const PATTERNS: Record<
  DateFormat,
  { re: RegExp; d: number; m: number; y: number }
> = {
  "YYYY-MM-DD": { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, y: 1, m: 2, d: 3 },
  "YYYY/MM/DD": { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, y: 1, m: 2, d: 3 },
  YYYYMMDD: { re: /^(\d{4})(\d{2})(\d{2})$/, y: 1, m: 2, d: 3 },
  "MM/DD/YYYY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, m: 1, d: 2, y: 3 },
  "DD/MM/YYYY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, d: 1, m: 2, y: 3 },
  "MM-DD-YYYY": { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, m: 1, d: 2, y: 3 },
  "DD-MM-YYYY": { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, d: 1, m: 2, y: 3 },
  "DD.MM.YYYY": { re: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, d: 1, m: 2, y: 3 },
  "MM/DD/YY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, m: 1, d: 2, y: 3 },
  "DD/MM/YY": { re: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, d: 1, m: 2, y: 3 },
  "DD-MM-YY": { re: /^(\d{1,2})-(\d{1,2})-(\d{2})$/, d: 1, m: 2, y: 3 },
  "DD.MM.YY": { re: /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/, d: 1, m: 2, y: 3 },
  "DD MMM YYYY": {
    re: /^(\d{1,2}) ([a-z]{3,9})\.? (\d{4})$/i,
    d: 1,
    m: 2,
    y: 3,
  },
  "DD-MMM-YYYY": { re: /^(\d{1,2})-([a-z]{3,9})-(\d{4})$/i, d: 1, m: 2, y: 3 },
  "DD-MMM-YY": { re: /^(\d{1,2})-([a-z]{3,9})-(\d{2})$/i, d: 1, m: 2, y: 3 },
  "DD MMM YY": { re: /^(\d{1,2}) ([a-z]{3,9})\.? (\d{2})$/i, d: 1, m: 2, y: 3 },
  "MMM DD, YYYY": {
    re: /^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/i,
    m: 1,
    d: 2,
    y: 3,
  },
}

/** A trailing clock time ("10:15", "10:15:00 PM") carries no calendar meaning here. */
const TIME_SUFFIX =
  /[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(\s*[ap]m)?(\s*(z|[+-]\d{2}:?\d{2}))?$/i

/** The ISO date for `raw` under `format`, or null if it is not a real date in it. */
export function parseDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim().replace(TIME_SUFFIX, "").replace(/\s+/g, " ")
  const p = PATTERNS[format]
  const m = p.re.exec(s)
  if (!m) return null
  const monthToken = m[p.m]
  const month = /^\d+$/.test(monthToken)
    ? Number(monthToken)
    : monthNumber(monthToken)
  if (!month) return null
  let year = Number(m[p.y])
  if (m[p.y].length === 2) year += 2000
  const day = Number(m[p.d])
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month))
    return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function daysIn(year: number, month: number): number {
  if (month === 2) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** Every format under which EVERY non-blank value is a real date. */
export function dateFormatCandidates(values: string[]): DateFormat[] {
  const present = values.map((v) => v.trim()).filter((v) => v !== "")
  if (present.length === 0) return []
  return DATE_FORMATS.filter((f) =>
    present.every((v) => parseDate(v, f) !== null),
  )
}

/** Exact cents as a BigInt, for balance arithmetic without floats. */
export function toCents(value: string): bigint {
  const negative = value.startsWith("-")
  const [whole, frac = "00"] = value.replace("-", "").split(".")
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"))
  return negative ? -cents : cents
}

export function fromCents(cents: bigint): string {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const whole = abs / 100n
  const frac = (abs % 100n).toString().padStart(2, "0")
  return `${negative && abs !== 0n ? "-" : ""}${whole}.${frac}`
}

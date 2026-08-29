import { describe, expect, it } from "vitest"

/**
 * Intl separates a currency code from the number with a NON-BREAKING space
 * (U+00A0), not U+0020, so a literal " " in an expectation fails with two
 * strings that look identical in the diff. Normalise before comparing.
 */
const norm = (s: string) => s.replace(/\u00a0/g, " ")
import {
  approxMoney,
  calendarDate,
  currentTimeIn,
  instant,
  localised,
  money,
  number,
} from "./format"

/**
 * Internationalisation, exercised with the three countries the Northwind
 * fixture actually operates in — US, UK and India — using its real values.
 *
 * The India cases are the ones that catch mistakes: the lakh/crore grouping
 * (₹32,00,000, not ₹3,200,000) is wrong under every other locale, and the
 * salaries are large enough that a float64 would start losing precision.
 */

const US = { locale: "en-US", currency: "USD", timezone: "America/New_York" }
const UK = { locale: "en-GB", currency: "GBP", timezone: "Europe/London" }
const IN = { locale: "en-IN", currency: "INR", timezone: "Asia/Kolkata" }

describe("money", () => {
  it("formats each country's real fixture salary in its own currency", () => {
    // Sarah Johnson, E001
    expect(norm(money("185000.0000", US.currency, US.locale))).toBe(
      "$185,000.00",
    )
    // James Reid, E006
    expect(norm(money("88000.0000", UK.currency, UK.locale))).toBe("£88,000.00")
    // Marcus Chen, E002 — Indian grouping puts the separators differently
    const inr = money("3200000.0000", IN.currency, IN.locale)
    expect(inr).toContain("32,00,000")
    expect(inr).toContain("₹")
  })

  it("keeps the currency of record when the viewer's locale differs", () => {
    // A London manager opening an India salary sees rupees, not pounds.
    // Converting here would invent an exchange rate; BR-FP-003 forbids it.
    const asSeenInLondon = money("3200000.0000", IN.currency, UK.locale)
    expect(asSeenInLondon).toContain("₹")
    expect(asSeenInLondon).not.toContain("£")
  })

  it("takes fraction digits from the currency, not a hardcoded 2", () => {
    expect(norm(money("1234", "JPY", "en-US"))).toBe("¥1,234") // no minor unit
    expect(norm(money("1234", "USD", "en-US"))).toBe("$1,234.00")
  })

  it("does not lose precision on values Postgres returns as strings", () => {
    // numeric(18,4) exceeds float64's exact integer range; the point of
    // carrying these as strings is that they survive to the formatter.
    expect(money("9007199254740993.00", "USD", "en-US")).toContain(
      "9,007,199,254,740,99",
    )
  })

  it("shows an unrecognised currency code instead of a wrong symbol", () => {
    // Intl accepts any well-formed 3-letter code and uses it verbatim as the
    // symbol, so this does not throw — which is the behaviour we want: the
    // unknown code stays visible rather than being rendered as dollars.
    expect(norm(money("100", "XYZ", "en-US"))).toBe("XYZ 100.00")
  })

  it("renders absent amounts as a dash, not as zero", () => {
    // A missing salary and a zero salary mean very different things.
    expect(money(null, "USD", "en-US")).toBe("—")
    expect(money("", "USD", "en-US")).toBe("—")
    expect(money("0", "USD", "en-US")).toBe("$0.00")
  })
})

describe("money — compact", () => {
  it("abbreviates by each locale's own convention, not a hardcoded scale", () => {
    // No lakh/crore code exists anywhere in the product; Intl already knows.
    expect(norm(approxMoney("18123432", "USD", "en-US"))).toBe("$18.12M")
    expect(norm(approxMoney("1423323", "INR", "en-IN"))).toBe("₹14.23L")
    expect(norm(approxMoney("18123432", "INR", "en-IN"))).toBe("₹1.81Cr")
  })

  it("caps decimals rather than forcing them", () => {
    // A minimum of 2 would render $950 as "$950.00" and ₹45,000 as "₹45.00K".
    expect(norm(approxMoney("950", "USD", "en-US"))).toBe("$950")
    expect(norm(approxMoney("45000", "INR", "en-IN"))).toBe("₹45K")
  })

  it("keeps the currency of record when abbreviating", () => {
    // Same rule as the full form: a London reader still sees rupees, and still
    // sees them abbreviated the Indian way.
    const asSeenInLondon = approxMoney("18123432", "INR", "en-IN")
    expect(asSeenInLondon).toContain("Cr")
    expect(asSeenInLondon).toContain("₹")
  })

  it("is never used where an exact figure is needed", () => {
    // Documentation as much as assertion: compact is lossy on purpose.
    // ₹14.23L is not a number anyone can be paid.
    expect(approxMoney("1423323", "INR", "en-IN")).not.toBe(
      money("1423323", "INR", "en-IN"),
    )
  })
})

describe("calendarDate", () => {
  it("formats a DATE column the same calendar day in every timezone", () => {
    // Marcus Chen started 2024-12-17. Formatted with a local zone instead of
    // UTC this slips to the 16th for a US viewer — the classic off-by-one.
    for (const locale of [US.locale, UK.locale, IN.locale]) {
      expect(calendarDate("2024-12-17", locale)).toContain("2024")
      expect(calendarDate("2024-12-17", locale)).toMatch(/17/)
    }
  })

  it("orders the parts per locale", () => {
    expect(calendarDate("2025-03-07", "en-US", "short")).toMatch(/^3\/7\/25/)
    expect(calendarDate("2025-03-07", "en-GB", "short")).toMatch(
      /^07\/03\/2025/,
    )
  })
})

describe("instant", () => {
  it("shows one moment as the local wall clock in each office", () => {
    const moment = new Date("2026-08-29T14:00:00Z")
    expect(norm(instant(moment, { ...US, timeFormat: "12h" }, "time"))).toBe(
      "10:00 AM",
    )
    expect(instant(moment, { ...UK, timeFormat: "24h" }, "time")).toBe("15:00")
    // India is UTC+5:30 — the half-hour offset catches zone maths that assumes
    // whole hours.
    expect(instant(moment, { ...IN, timeFormat: "24h" }, "time")).toBe("19:30")
  })

  it("honours the tenant's 12/24-hour preference", () => {
    const moment = new Date("2026-08-29T14:00:00Z")
    // en-GB zero-pads the hour even in 12-hour mode; en-US does not.
    expect(norm(instant(moment, { ...UK, timeFormat: "12h" }, "time"))).toBe(
      "03:00 pm",
    )
    expect(instant(moment, { ...UK, timeFormat: "24h" }, "time")).toBe("15:00")
  })
})

describe("currentTimeIn", () => {
  it("labels the zone so two offices are distinguishable", () => {
    const at = new Date("2026-08-29T14:00:00Z")
    expect(currentTimeIn("Asia/Kolkata", "en-IN", at)).toMatch(/7:30|19:30/)
    expect(currentTimeIn("Europe/London", "en-GB", at)).toMatch(/3:00|15:00/)
  })

  it("returns the zone name rather than throwing on a bad zone", () => {
    expect(currentTimeIn("Europe/Nowhere", "en-GB")).toBe("Europe/Nowhere")
  })
})

describe("localised", () => {
  const i18n = { "en-US": "Northwind Consulting", "fr-FR": "Northwind Conseil" }

  it("prefers an exact locale match", () => {
    expect(localised(i18n, "fallback", "fr-FR")).toBe("Northwind Conseil")
  })

  it("falls back to the same language before giving up (BR-FP-009)", () => {
    // en-GB has no entry; en-US is closer than the untranslated column.
    expect(localised(i18n, "fallback", "en-GB")).toBe("Northwind Consulting")
  })

  it("falls back to the plain column for an unrelated locale", () => {
    expect(localised(i18n, "Northwind", "de-DE")).toBe("Northwind")
  })

  it("handles a null translations column", () => {
    expect(localised(null, "Northwind", "en-US")).toBe("Northwind")
  })
})

describe("number", () => {
  it("groups per locale", () => {
    expect(number(1234567.89, "en-US")).toBe("1,234,567.89")
    expect(norm(number(1234567.89, "de-DE"))).toBe("1.234.567,89")
    expect(number(1234567.89, "en-IN")).toBe("12,34,567.89")
  })
})

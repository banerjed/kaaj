import { describe, expect, it } from "vitest"

/** Intl uses a non-breaking space (U+00A0) before the currency; normalise before comparing. */
const norm = (s: string) => s.replace(/\u00a0/g, " ")
import {
  approxMoney,
  calendarDate,
  currentTimeIn,
  instant,
  localised,
  money,
  number,
  hours,
} from "./format"

/** Exercised with the fixture's real US/UK/India values; India catches lakh/crore grouping and float64 precision bugs. */

const US = { locale: "en-US", currency: "USD", timezone: "America/New_York" }
const UK = { locale: "en-GB", currency: "GBP", timezone: "Europe/London" }
const IN = { locale: "en-IN", currency: "INR", timezone: "Asia/Kolkata" }

describe("money", () => {
  it("formats each country's real fixture salary in its own currency", () => {
    expect(norm(money("185000.0000", US.currency, US.locale))).toBe(
      "$185,000.00",
    )
    expect(norm(money("88000.0000", UK.currency, UK.locale))).toBe("£88,000.00")
    const inr = money("3200000.0000", IN.currency, IN.locale)
    expect(inr).toContain("32,00,000")
    expect(inr).toContain("₹")
  })

  it("keeps the currency of record when the viewer's locale differs", () => {
    // Never converted — BR-FP-003.
    const asSeenInLondon = money("3200000.0000", IN.currency, UK.locale)
    expect(asSeenInLondon).toContain("₹")
    expect(asSeenInLondon).not.toContain("£")
  })

  it("takes fraction digits from the currency, not a hardcoded 2", () => {
    expect(norm(money("1234", "JPY", "en-US"))).toBe("¥1,234") // no minor unit
    expect(norm(money("1234", "USD", "en-US"))).toBe("$1,234.00")
  })

  it("does not lose precision on values Postgres returns as strings", () => {
    expect(money("9007199254740993.00", "USD", "en-US")).toContain(
      "9,007,199,254,740,99",
    )
  })

  it("shows an unrecognised currency code instead of a wrong symbol", () => {
    expect(norm(money("100", "XYZ", "en-US"))).toBe("XYZ 100.00")
  })

  it("renders absent amounts as a dash, not as zero", () => {
    expect(money(null, "USD", "en-US")).toBe("—")
    expect(money("", "USD", "en-US")).toBe("—")
    expect(money("0", "USD", "en-US")).toBe("$0.00")
  })
  it("refuses a missing currency rather than printing the word", () => {
    // Rendered "undefined 216000.27" on a payslip before (L45).
    expect(() =>
      money("216000.27", undefined as unknown as string, "en-IN"),
    ).toThrow(/3-letter currency/)
    expect(money("100", "XYZ", "en-US")).toContain("XYZ")
  })
})

describe("money — compact", () => {
  it("abbreviates by each locale's own convention, not a hardcoded scale", () => {
    expect(norm(approxMoney("18123432", "USD", "en-US"))).toBe("$18.12M")
    expect(norm(approxMoney("1423323", "INR", "en-IN"))).toBe("₹14.23L")
    expect(norm(approxMoney("18123432", "INR", "en-IN"))).toBe("₹1.81Cr")
  })

  it("caps decimals rather than forcing them", () => {
    // minimumFractionDigits: 0 is explicit — ICU's compact default drifted between Node versions (L71).
    expect(norm(approxMoney("950", "USD", "en-US"))).toBe("$950")
    expect(norm(approxMoney("45000", "INR", "en-IN"))).toBe("₹45K")
  })

  it("keeps the currency of record when abbreviating", () => {
    const asSeenInLondon = approxMoney("18123432", "INR", "en-IN")
    expect(asSeenInLondon).toContain("Cr")
    expect(asSeenInLondon).toContain("₹")
  })

  it("is never used where an exact figure is needed", () => {
    expect(approxMoney("1423323", "INR", "en-IN")).not.toBe(
      money("1423323", "INR", "en-IN"),
    )
  })
})

describe("calendarDate", () => {
  it("formats a DATE column the same calendar day in every timezone", () => {
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
    // India's UTC+5:30 offset catches zone maths that assumes whole hours.
    expect(instant(moment, { ...IN, timeFormat: "24h" }, "time")).toBe("19:30")
  })

  it("honours the tenant's 12/24-hour preference", () => {
    const moment = new Date("2026-08-29T14:00:00Z")
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

describe("a stored locale Intl rejects", () => {
  it("degrades instead of throwing, in every formatter", () => {
    // e.g. a stored POSIX-spelled locale like "en_US".
    expect(() => number("1234.5", "en_US")).not.toThrow()
    expect(() => calendarDate("2026-03-07", "en_US")).not.toThrow()
    expect(() => money("1234.50", "USD", "en_US")).not.toThrow()
    expect(number("1234.5", "en_US")).toBe("1234.5")
    expect(calendarDate("2026-03-07", "en_US")).toBe("2026-03-07")
  })
})

describe("hours", () => {
  it("reads as a timesheet, not as a decimal", () => {
    expect(hours("7.7500", "en-US")).toBe("7h 45m")
    expect(hours("8.5000", "en-US")).toBe("8h 30m")
    expect(hours("0.5000", "en-US")).toBe("30m")
    expect(hours("8.0000", "en-US")).toBe("8h")
  })

  it("does not lose the fourth decimal the way a printed decimal does", () => {
    expect(hours("6.9333", "en-US")).toBe("6h 56m")
    expect(number("6.9333", "en-US")).toBe("6.933")
  })

  it("formats the numbers in the office's locale", () => {
    expect(hours("1234.5", "en-IN")).toBe("1,234h 30m")
  })

  it("handles a blank, a null and a negative correction", () => {
    expect(hours(null, "en-US")).toBe("—")
    expect(hours("", "en-US")).toBe("—")
    expect(hours("-1.25", "en-US")).toBe("-1h 15m")
  })
})

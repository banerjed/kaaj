import { describe, expect, it } from "vitest"
import { FormReader } from "./forms"

/**
 * The regression guard for L33 and L34. Every case here was reachable by a
 * crafted POST against the running app before this file existed: three of them
 * returned a 500, and one returned `200 saved:true` having thrown the field
 * away.
 */

const form = (fields: Record<string, string>) => {
  const d = new FormData()
  for (const [k, v] of Object.entries(fields)) d.append(k, v)
  return new FormReader(d)
}

describe("an optional field has three outcomes, not two (L33)", () => {
  it("accepts blank as blank", () => {
    const f = form({ multiplier: "" })
    expect(f.decimal("multiplier", { scale: 2 })).toBeNull()
    expect(f.ok).toBe(true)
  })

  it("REFUSES garbage rather than dropping it", () => {
    // The bug: `Number("abc")` -> NaN -> undefined -> key never written, and
    // the action answered 200 saved:true. Overtime then computed at 1x.
    const f = form({ multiplier: "abc" })
    expect(f.decimal("multiplier", { scale: 2 })).toBeNull()
    expect(f.ok).toBe(false)
    expect(f.errorFields).toEqual(["multiplier"])
  })

  it("refuses a comma decimal, which is how much of the world types 1.5", () => {
    const f = form({ multiplier: "1,5" })
    f.decimal("multiplier", { scale: 2 })
    expect(f.errorFields).toEqual(["multiplier"])
  })

  it("refuses a negative below the floor instead of discarding it", () => {
    const f = form({ multiplier: "-1.5" })
    f.decimal("multiplier", { scale: 2, min: 0 })
    expect(f.errorFields).toEqual(["multiplier"])
  })

  it("refuses more decimals than the column keeps", () => {
    // numeric(15,2) ROUNDS silently (L25). 10.999 would become 11.00 and the
    // person who typed it would never be told.
    const f = form({ amount: "10.999" })
    f.decimal("amount", { scale: 2 })
    expect(f.errorFields).toEqual(["amount"])
  })

  it("keeps money as a string, never a number", () => {
    const f = form({ amount: "9007199254740993.01" })
    const v = f.decimal("amount", { scale: 2, integerDigits: 16 })
    expect(v).toBe("9007199254740993.01")
    // The whole point: parsing would have lost the last digit, silently.
    expect(String(Number(v))).not.toBe(v)
  })

  it("coerces nothing in integer(): garbage is refused, not turned into 0", () => {
    const f = form({ sort_order: "abc" })
    expect(f.integer("sort_order")).toBeNull()
    expect(f.errorFields).toEqual(["sort_order"])
  })
})

describe("the column type is not the validator (L34)", () => {
  it("refuses text longer than the column, which is a 500 otherwise", () => {
    const f = form({ name: "D".repeat(300) })
    f.text("name", { required: true, max: 255 })
    expect(f.errorFields).toEqual(["name"])
  })

  it("counts characters the way Postgres does, not UTF-16 units", () => {
    // "𝐀" is two UTF-16 units and one character. varchar(3) holds three.
    const f = form({ name: "𝐀𝐀𝐀" })
    expect(f.text("name", { max: 3 })).toBe("𝐀𝐀𝐀")
    expect(f.ok).toBe(true)
  })

  it("refuses a malformed uuid, which is a 500 otherwise", () => {
    const f = form({ id: "not-a-uuid" })
    expect(f.uuid("id", { required: true })).toBe("")
    expect(f.errorFields).toEqual(["id"])
  })

  it("refuses an unknown enum value, which is a 500 otherwise", () => {
    const f = form({ compensation_type: "NOT_AN_ENUM" })
    f.enumValue("compensation_type", "compensation_type", { required: true })
    expect(f.errorFields).toEqual(["compensation_type"])
  })

  it("accepts a real enum value and applies a fallback to a blank one", () => {
    const ok = form({ compensation_type: "salary" })
    expect(ok.enumValue("compensation_type", "compensation_type")).toBe(
      "salary",
    )
    const blank = form({})
    expect(
      blank.enumValue("compensation_type", "compensation_type", {
        fallback: "salary",
      }),
    ).toBe("salary")
    expect(blank.ok).toBe(true)
  })

  it("refuses a date that is well-shaped but not real", () => {
    // The shape check alone passes both of these; only a round-trip catches
    // them, and the ::date cast is an unhandled 500.
    for (const bad of ["2026-13-45", "2026-02-30"]) {
      const f = form({ effective_from: bad })
      f.date("effective_from", { required: true })
      expect(f.errorFields, bad).toEqual(["effective_from"])
    }
    const good = form({ effective_from: "2026-02-28" })
    expect(good.date("effective_from", { required: true })).toBe("2026-02-28")
  })

  it("rejects an OPTIONAL field that is over-length, not just a required one", () => {
    // The bug this guards: a reader called inside the object literal that is
    // built after `if (!f.ok)` raises its rejection too late to be reported,
    // and an optional field returns null — so an over-length middle_name saved
    // as NULL with a 303. Every reader must run before the gate.
    const f = form({ middle_name: "M".repeat(200) })
    expect(f.text("middle_name", { max: 100 })).toBeNull()
    expect(f.ok).toBe(false)
    expect(f.errorFields).toEqual(["middle_name"])
  })

  it("refuses a required field that is absent", () => {
    const f = form({})
    f.text("name", { required: true, max: 255 })
    expect(f.errorFields).toEqual(["name"])
  })
})

describe("values that feed Intl", () => {
  it("refuses a locale Intl would throw on", () => {
    // en_US is the POSIX spelling and the likeliest typo. It is a RangeError
    // in both NumberFormat and DateTimeFormat, and firm_locations.locale is
    // what every figure for that office is formatted in (L24).
    for (const bad of ["en_US", "e", "en-US-!!"]) {
      const f = form({ locale: bad })
      f.locale("locale")
      expect(f.errorFields, bad).toEqual(["locale"])
    }
    expect(form({ locale: "en-IN" }).locale("locale")).toBe("en-IN")
  })

  it("refuses an unreal timezone", () => {
    const f = form({ timezone: "Mars/Olympus" })
    f.timezone("timezone")
    expect(f.errorFields).toEqual(["timezone"])
    expect(form({ timezone: "Asia/Kolkata" }).timezone("timezone")).toBe(
      "Asia/Kolkata",
    )
  })

  it("normalises a currency and refuses a non-code", () => {
    expect(form({ currency: "inr" }).currency("currency")).toBe("INR")
    const f = form({ currency: "US" })
    f.currency("currency")
    expect(f.errorFields).toEqual(["currency"])
  })
})

describe("the reader as a whole", () => {
  it("collects every failure, not just the first", () => {
    const f = form({ name: "", id: "nope", amount: "x" })
    f.text("name", { required: true, max: 255 })
    f.uuid("id", { required: true })
    f.decimal("amount", { required: true, scale: 2 })
    expect(f.errorFields.sort()).toEqual(["amount", "id", "name"])
    // The default message NAMES them. "Some fields need attention." is true of
    // every rejection and actionable in none, and most pages in the product do
    // not render `errorFields` as a highlight — so it was the whole of what
    // the person was told.
    expect(f.problem().message).toBe("Check Name, Id and Amount.")
  })

  it("names one field without a list, and keeps a caller's own message", () => {
    const f = form({ location_code: "" })
    f.text("location_code", { required: true, max: 50 })
    expect(f.problem().message).toBe("Check Location code.")
    expect(f.problem("Pick an office.").message).toBe("Pick an office.")
  })

  it("qualifies a per-currency field, so the right band is named", () => {
    const f = form({ "range.USD.max": "oops" })
    f.decimal("range.USD.max", { scale: 2 })
    expect(f.problem().message).toBe("Check Max (USD).")
  })

  it("reports a field once however many rules it breaks", () => {
    const f = form({ code: "" })
    f.text("code", { required: true, max: 50 })
    f.reject("code")
    expect(f.errorFields).toEqual(["code"])
  })

  it("reads an unchecked box as false, since it submits nothing", () => {
    expect(form({}).bool("is_paid")).toBe(false)
    expect(form({ is_paid: "on" }).bool("is_paid")).toBe(true)
  })

  it("keeps translations only for locales that were passed in", () => {
    const f = form({ "name_i18n.en-US": "Engineering", "name_i18n.fr-FR": "X" })
    expect(f.i18n("name_i18n", ["en-US"], 255)).toEqual({
      "en-US": "Engineering",
    })
  })

  it("refuses an over-length translation rather than 500ing on the write", () => {
    const f = form({ "name_i18n.en-US": "D".repeat(300) })
    f.i18n("name_i18n", ["en-US"], 255)
    expect(f.errorFields).toEqual(["name_i18n.en-US"])
  })
})

describe("a required choice or enum is a string, not string | null", () => {
  it("returns the value when it is valid", () => {
    const f = form({ decision: "approved" })
    const d: string = f.choice("decision", ["approved", "denied"], {
      required: true,
    })
    expect(d).toBe("approved")
  })

  it("returns '' and rejects when it is not, so the caller returns first", () => {
    // The overload has to be honest: `required` means the caller checks
    // `f.ok` and returns before reading the value, so `string` is accurate at
    // every point the value is actually used.
    const f = form({ decision: "maybe" })
    expect(
      f.choice("decision", ["approved", "denied"], { required: true }),
    ).toBe("")
    expect(f.ok).toBe(false)
    expect(f.errorFields).toEqual(["decision"])
  })

  it("still prefers a fallback over rejecting", () => {
    const f = form({})
    expect(
      f.enumValue("pay_frequency", "pay_frequency", { fallback: "monthly" }),
    ).toBe("monthly")
    expect(f.ok).toBe(true)
  })
})

describe("decimal bounds are compared as decimals, not floats", () => {
  it("refuses a value a float comparison lets through", () => {
    // `Number("9007199254740993")` is 9007199254740992 — equal to the bound,
    // so the old `Number(raw) > opts.max` check accepted a figure ABOVE the
    // maximum. The value is a string precisely so this cannot happen.
    const f = form({ amount: "9007199254740993" })
    f.decimal("amount", { scale: 2, integerDigits: 16, max: 9007199254740992 })
    expect(f.errorFields).toEqual(["amount"])
  })

  it("still accepts a large value that is genuinely within the bound", () => {
    const f = form({ amount: "9007199254740991.99" })
    const v = f.decimal("amount", {
      scale: 2,
      integerDigits: 16,
      max: 9007199254740992,
    })
    expect(f.ok).toBe(true)
    expect(v).toBe("9007199254740991.99")
  })

  it("still refuses a value genuinely outside the bound", () => {
    const f = form({ amount: "10.01" })
    f.decimal("amount", { scale: 2, max: 10 })
    expect(f.errorFields).toEqual(["amount"])
  })

  it("refuses a negative payment where min is a fraction", () => {
    const under = form({ amount: "0.00" })
    under.decimal("amount", { scale: 2, min: 0.01 })
    expect(under.errorFields).toEqual(["amount"])

    const ok = form({ amount: "0.01" })
    ok.decimal("amount", { scale: 2, min: 0.01 })
    expect(ok.ok).toBe(true)
  })
})

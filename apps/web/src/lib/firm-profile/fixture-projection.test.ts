import { describe, expect, it } from "vitest"
import { clashingDates, nextPayDates } from "./pay-dates"

/**
 * The three schedules the Northwind fixture actually carries — US, UK and
 * India — all anchored 2026-01-31, which is the case that breaks naive month
 * arithmetic.
 */
describe("the fixture's own pay schedules", () => {
  const from = new Date("2026-08-29T00:00:00Z")

  it("clamps every short month across a full year", () => {
    const dates = nextPayDates("2026-01-31", "monthly", 12, from)
    expect(dates).toEqual([
      "2026-08-31",
      "2026-09-30", // 30 days
      "2026-10-31",
      "2026-11-30", // 30 days
      "2026-12-31",
      "2027-01-31",
      "2027-02-28", // 28 days, non-leap
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
      "2027-07-31",
    ])
  })

  it("flags month-ends that land on a weekend", () => {
    const dates = nextPayDates("2026-01-31", "monthly", 12, from)
    const clashes = clashingDates(dates, [])
    // 2026-08-31 is a Monday; 2027-01-31 is a Sunday.
    expect(clashes["2027-01-31"]).toBe("weekend")
    expect(clashes["2026-08-31"]).toBeUndefined()
  })

  it("flags a pay date colliding with an office holiday", () => {
    // If Bangalore observed 31 December, the India schedule would collide.
    const dates = nextPayDates("2026-01-31", "monthly", 12, from)
    expect(clashingDates(dates, ["2026-12-31"])["2026-12-31"]).toBe("holiday")
  })
})

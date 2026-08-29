import { describe, expect, it } from "vitest"
import { clashingDates, isWeekend, nextPayDates } from "./pay-dates"

/**
 * Pay-date projection. Every case here is one where a wage lands on the wrong
 * day if the arithmetic is naive.
 */

const from = (d: string) => new Date(`${d}T00:00:00Z`)

describe("nextPayDates — monthly", () => {
  it("clamps to the end of a short month instead of rolling over", () => {
    // The fixture's three schedules are all anchored 2026-01-31. Adding a month
    // naively gives 3 March; a monthly payroll must land on 28 February.
    const dates = nextPayDates("2026-01-31", "monthly", 4, from("2026-01-01"))
    expect(dates).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ])
  })

  it("uses 29 February in a leap year", () => {
    const dates = nextPayDates("2028-01-31", "monthly", 2, from("2028-01-01"))
    expect(dates[1]).toBe("2028-02-29")
  })

  it("starts from today, not from the anchor, when the anchor is past", () => {
    const dates = nextPayDates("2020-01-31", "monthly", 2, from("2026-06-15"))
    expect(dates[0]).toBe("2026-06-30")
  })

  it("returns the anchor itself when it is still ahead", () => {
    const dates = nextPayDates("2026-09-30", "monthly", 1, from("2026-08-29"))
    expect(dates[0]).toBe("2026-09-30")
  })
})

describe("nextPayDates — bi-weekly", () => {
  it("keeps the anchor's weekday across the whole projection", () => {
    // 2026-01-02 is a Friday. Every date must also be a Friday.
    const dates = nextPayDates("2026-01-02", "bi-weekly", 6, from("2026-01-01"))
    for (const d of dates) {
      expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(5)
    }
    expect(dates[1]).toBe("2026-01-16")
  })

  it("jumps to the current cycle rather than stepping from a distant anchor", () => {
    // A five-year-old anchor must not cost 130 iterations to reach today.
    const dates = nextPayDates("2021-01-01", "bi-weekly", 3, from("2026-08-29"))
    expect(dates).toHaveLength(3)
    expect(dates[0] >= "2026-08-29").toBe(true)
    // Spacing is still exactly 14 days.
    const gap =
      (new Date(`${dates[1]}T12:00:00Z`).getTime() -
        new Date(`${dates[0]}T12:00:00Z`).getTime()) /
      86_400_000
    expect(gap).toBe(14)
  })
})

describe("nextPayDates — weekly and semi-monthly", () => {
  it("steps weekly by seven days", () => {
    const dates = nextPayDates("2026-03-06", "weekly", 3, from("2026-03-01"))
    expect(dates).toEqual(["2026-03-06", "2026-03-13", "2026-03-20"])
  })

  it("pays twice a month, ending on the last day", () => {
    const dates = nextPayDates(
      "2026-02-15",
      "semi-monthly",
      4,
      from("2026-02-01"),
    )
    expect(dates).toEqual([
      "2026-02-15",
      "2026-02-28",
      "2026-03-15",
      "2026-03-31",
    ])
  })
})

describe("clash detection", () => {
  it("identifies weekends", () => {
    expect(isWeekend("2026-01-31")).toBe(true) // Saturday
    expect(isWeekend("2026-02-02")).toBe(false) // Monday
  })

  it("reports holidays and weekends separately, and does not move them", () => {
    const clashes = clashingDates(
      ["2026-01-01", "2026-01-31", "2026-02-02"],
      ["2026-01-01"],
    )
    expect(clashes).toEqual({
      "2026-01-01": "holiday",
      "2026-01-31": "weekend",
    })
    // Whether to pay early or late is a policy field on the schedule, so the
    // projection flags rather than silently shifting the date.
  })

  it("prefers holiday over weekend when a date is both", () => {
    expect(clashingDates(["2026-01-31"], ["2026-01-31"])).toEqual({
      "2026-01-31": "holiday",
    })
  })
})

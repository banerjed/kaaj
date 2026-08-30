import { describe, expect, it } from "vitest"
import { withTenant } from "../db/tenant"
import * as attendance from "./hr_attendance.repo"

/**
 * Attendance, against the real database. Read-only — every case here is an
 * assertion about the fixture, not a write.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/**
 * Repositories are tested as an actor who reads everything, so a row-visibility
 * policy does not silently narrow what a repository test sees. Visibility has
 * its own tests in db/row-visibility.test.ts.
 */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [],
  employeeId: null,
}
const TOM = "b9b84064-a67a-5048-8282-8fc048b4dbfb" // US-NYC, the evening shift

describe("what the driver returns", () => {
  it("hands back a Date for timestamptz and a string for numeric", async () => {
    // `types: {}` in client.ts adds handlers, it does not remove the built-in
    // ones. Money stays a string because NUMERIC has no built-in parser; a
    // timestamptz does, so it arrives already parsed. Declaring both as
    // `string` type-checks and then fails at runtime.
    const [row] = await withTenant(AS_OWNER, (tx) =>
      attendance.list(tx, {
        employeeId: TOM,
        from: "2026-01-09",
        to: "2026-01-09",
      }),
    )
    expect(row.clock_in_time).toBeInstanceOf(Date)
    expect(typeof row.total_hours).toBe("string")
  })
})

describe("attendance hours", () => {
  it("every row's stored hours agree with its own clock times", async () => {
    // total = (out - in) - break, AND total = regular + overtime.
    // Nothing enforces either, and payroll multiplies these by a rate.
    const bad = await withTenant(AS_OWNER, (tx) => attendance.inconsistent(tx))
    expect(bad).toEqual([])
  })

  it("keeps four decimals, because a timesheet compounds them", async () => {
    // 09:34–17:00 less a 30-minute break is 6.9333h, not 6.93. Rounding to two
    // before summing a fortnight loses most of an hour across a team.
    const rows = await withTenant(AS_OWNER, (tx) =>
      attendance.list(tx, { status: "late" }),
    )
    expect(rows[0].total_hours).toBe("6.9333")
  })

  it("sums in SQL, exactly", async () => {
    const t = await withTenant(AS_OWNER, (tx) =>
      attendance.totals(tx, TOM, "2026-01-01", "2026-01-31"),
    )
    expect(t.days).toBe(2) // the evening shift and the night shift
    expect(t.total_hours).toBe("16.0000")
    // The one fixture row that splits into regular and overtime.
    expect(t.regular_hours).toBe("15.5000")
    expect(t.overtime_hours).toBe("0.5000")
  })
})

describe("attendance and the office timezone", () => {
  it("attendance_date is the LOCAL date on every row", async () => {
    // The check a `::date` cast in a query would fail.
    const bad = await withTenant(AS_OWNER, (tx) =>
      attendance.misdatedForOffice(tx),
    )
    expect(bad).toEqual([])
  })

  it("renders a shift in its own office's zone, not UTC", async () => {
    // The same instant reads differently in Bangalore and New York, and the
    // office's zone is the only one that makes a workday look like a workday.
    const rows = await withTenant(AS_OWNER, (tx) =>
      attendance.list(tx, { from: "2026-01-06", to: "2026-01-06" }),
    )
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.location_code).toBe("IN-BLR")
      expect(r.clock_in_local).toBe("09:00")
      expect(r.clock_out_local).toBe("17:30")
    }
    // Stored as an instant: 09:00 IST is 03:30Z, NOT 09:00Z (L35).
    expect(rows[0].clock_in_time!.toISOString()).toBe(
      "2026-01-06T03:30:00.000Z",
    )
  })

  it("handles a shift that ends on the next UTC day", async () => {
    // 14:00–23:00 in New York is 19:00Z to 04:00Z the following day. The row
    // belongs to the 9th; only the UTC clock-out is on the 10th.
    const [shift] = await withTenant(AS_OWNER, (tx) =>
      attendance.list(tx, {
        employeeId: TOM,
        from: "2026-01-09",
        to: "2026-01-09",
      }),
    )
    expect(shift.attendance_date).toBe("2026-01-09")
    expect(shift.clock_in_local).toBe("14:00")
    expect(shift.clock_out_local).toBe("23:00")
    // Two UTC dates, ONE local day — so this is NOT an overnight shift, however
    // much the UTC timestamps suggest otherwise.
    expect(shift.crosses_local_midnight).toBe(false)
    expect(shift.clock_out_time!.toISOString().slice(0, 10)).toBe("2026-01-10")
    expect(shift.attendance_date).toBe("2026-01-09")
  })

  it("flags a night shift by the office's day, not by UTC's", async () => {
    // The inverse case, and the one that makes the rule concrete. 22:00-06:00
    // in New York is 03:00Z-11:00Z — a SINGLE UTC date. Comparing UTC dates
    // calls a genuine night shift a normal day, and calls an ordinary
    // 09:00-17:30 in Auckland (UTC+13) an overnight one. Only the local dates
    // describe the shift (L35).
    const [night] = await withTenant(AS_OWNER, (tx) =>
      attendance.list(tx, { from: "2026-01-12", to: "2026-01-12" }),
    )
    expect(night.clock_in_local).toBe("22:00")
    expect(night.clock_out_local).toBe("06:00")
    expect(night.crosses_local_midnight).toBe(true)
    // Both instants share one UTC date: the old check would have said false.
    expect(night.clock_in_time!.toISOString().slice(0, 10)).toBe("2026-01-13")
    expect(night.clock_out_time!.toISOString().slice(0, 10)).toBe("2026-01-13")
    // And the row still belongs to the day the shift started, locally.
    expect(night.attendance_date).toBe("2026-01-12")
  })

  it("does not raise on a blank employee filter", async () => {
    // '' is not a uuid and SQL does not short-circuit, so the cast runs anyway.
    const rows = await withTenant(AS_OWNER, (tx) =>
      attendance.list(tx, { employeeId: "" }),
    )
    expect(rows).toHaveLength(9)
  })
})

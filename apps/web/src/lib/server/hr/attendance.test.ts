import { describe, expect, it } from "vitest"
import { withTenant } from "../db/tenant"
import * as attendance from "./hr_attendance.repo"

/**
 * Attendance, against the real database. Read-only — every case here is an
 * assertion about the fixture, not a write.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const TOM = "b9b84064-a67a-5048-8282-8fc048b4dbfb" // US-NYC, the evening shift

describe("what the driver returns", () => {
  it("hands back a Date for timestamptz and a string for numeric", async () => {
    // `types: {}` in client.ts adds handlers, it does not remove the built-in
    // ones. Money stays a string because NUMERIC has no built-in parser; a
    // timestamptz does, so it arrives already parsed. Declaring both as
    // `string` type-checks and then fails at runtime.
    const [row] = await withTenant(NORTHWIND, (tx) =>
      attendance.list(tx, { employeeId: TOM }),
    )
    expect(row.clock_in_time).toBeInstanceOf(Date)
    expect(typeof row.total_hours).toBe("string")
  })
})

describe("attendance hours", () => {
  it("every row's stored hours agree with its own clock times", async () => {
    // total = (out - in) - break, AND total = regular + overtime.
    // Nothing enforces either, and payroll multiplies these by a rate.
    const bad = await withTenant(NORTHWIND, (tx) => attendance.inconsistent(tx))
    expect(bad).toEqual([])
  })

  it("keeps four decimals, because a timesheet compounds them", async () => {
    // 09:34–17:00 less a 30-minute break is 6.9333h, not 6.93. Rounding to two
    // before summing a fortnight loses most of an hour across a team.
    const rows = await withTenant(NORTHWIND, (tx) =>
      attendance.list(tx, { status: "late" }),
    )
    expect(rows[0].total_hours).toBe("6.9333")
  })

  it("sums in SQL, exactly", async () => {
    const t = await withTenant(NORTHWIND, (tx) =>
      attendance.totals(tx, TOM, "2026-01-01", "2026-01-31"),
    )
    expect(t.days).toBe(1)
    expect(t.total_hours).toBe("8.5000")
    // The one fixture row that splits into regular and overtime.
    expect(t.regular_hours).toBe("8.0000")
    expect(t.overtime_hours).toBe("0.5000")
  })
})

describe("attendance and the office timezone", () => {
  it("attendance_date is the LOCAL date on every row", async () => {
    // The check a `::date` cast in a query would fail.
    const bad = await withTenant(NORTHWIND, (tx) =>
      attendance.misdatedForOffice(tx),
    )
    expect(bad).toEqual([])
  })

  it("renders a shift in its own office's zone, not UTC", async () => {
    // The same instant reads differently in Bangalore and New York, and the
    // office's zone is the only one that makes a workday look like a workday.
    const rows = await withTenant(NORTHWIND, (tx) =>
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
    const [shift] = await withTenant(NORTHWIND, (tx) =>
      attendance.list(tx, { employeeId: TOM }),
    )
    expect(shift.attendance_date).toBe("2026-01-09")
    expect(shift.clock_in_local).toBe("14:00")
    expect(shift.clock_out_local).toBe("23:00")
    expect(shift.crosses_utc_midnight).toBe(true)
    expect(shift.clock_out_time!.toISOString().slice(0, 10)).toBe("2026-01-10")
    expect(shift.attendance_date).toBe("2026-01-09")
  })

  it("does not raise on a blank employee filter", async () => {
    // '' is not a uuid and SQL does not short-circuit, so the cast runs anyway.
    const rows = await withTenant(NORTHWIND, (tx) =>
      attendance.list(tx, { employeeId: "" }),
    )
    expect(rows).toHaveLength(8)
  })
})

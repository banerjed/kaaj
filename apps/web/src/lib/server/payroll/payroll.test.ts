import { describe, expect, it } from "vitest"
import { withTenant } from "../db/tenant"
import * as runs from "./payroll_runs.repo"

/**
 * Payroll, against the real database. Read-only.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"

describe("the figures add up", () => {
  it("net = gross − taxes − pretax − posttax, on every line", async () => {
    // The number that reaches a bank. Nothing enforces it, and a line that
    // drifts is invisible until someone is paid the wrong amount — by which
    // point the payment has left.
    const bad = await withTenant(AS_OWNER, (tx) => runs.inconsistentLines(tx))
    expect(bad).toEqual([])
  })

  it("every run's header agrees with the lines beneath it", async () => {
    // The header is what a finance lead reads and reports; the lines are what
    // people are paid. The fixture had a run claiming one employee with no
    // line at all — it said it paid someone it could not name.
    const bad = await withTenant(AS_OWNER, (tx) => runs.inconsistentRuns(tx))
    expect(bad).toEqual([])
  })

  it("includes the off-cycle bonus run, which is where that bug was", async () => {
    const all = await withTenant(AS_OWNER, (tx) => runs.list(tx))
    const bonus = all.find((r) => r.run_id === "PR-2026-01-BONUS-US")!
    expect(bonus.employee_count).toBe(1)
    expect(bonus.line_count).toBe(1)
    expect(bonus.total_gross_pay).toBe("2500.00")
  })
})

describe("money stays a string, and the breakdowns are not JSON numbers", () => {
  it("hands every figure back as a string", async () => {
    const [line] = await withTenant(AS_OWNER, async (tx) => {
      const [run] = await runs.list(tx, { country: "US" })
      return runs.linesFor(tx, run.id)
    })
    for (const f of ["gross_pay", "net_pay", "total_taxes"] as const) {
      expect(typeof line[f], f).toBe("string")
    }
  })

  it("holds strings inside the JSONB breakdowns too", async () => {
    // A JSON number is exact in Postgres and a float64 the moment a driver
    // reads it, so the loss happens on READ where nothing looks wrong.
    const [line] = await withTenant(AS_OWNER, async (tx) => {
      const [run] = await runs.list(tx, { country: "US" })
      return runs.linesFor(tx, run.id)
    })
    for (const doc of [line.earnings, line.taxes]) {
      expect(doc).not.toBeNull()
      for (const [k, v] of Object.entries(doc!)) {
        expect(typeof v, `${k} must be a string`).toBe("string")
      }
    }
  })

  it("keeps a figure exact that a float64 would lose", async () => {
    // 216000.27 survives; the point is it is never parsed on the way through.
    const lines = await withTenant(AS_OWNER, async (tx) => {
      const [run] = await runs.list(tx, { country: "IN" })
      return runs.linesFor(tx, run.id)
    })
    const marcus = lines.find((l) => l.employee_id === MARCUS)!
    expect(marcus.net_pay).toBe("216000.27")
    expect(marcus.gross_pay).toBe("266667.00")
  })
})

describe("runs across jurisdictions", () => {
  it("keeps each run in its own currency, never converted", async () => {
    // BR-FP-003: a figure is shown in its currency of record.
    const all = await withTenant(AS_OWNER, (tx) => runs.list(tx))
    const byCountry = Object.fromEntries(
      all.map((r) => [r.country, r.currency]),
    )
    expect(byCountry).toMatchObject({ US: "USD", GB: "GBP", IN: "INR" })
  })

  it("filters by country and by status", async () => {
    const uk = await withTenant(AS_OWNER, (tx) =>
      runs.list(tx, { country: "GB" }),
    )
    expect(uk).toHaveLength(1)
    expect(uk[0].currency).toBe("GBP")

    const finalized = await withTenant(AS_OWNER, (tx) =>
      runs.list(tx, { status: "finalized" }),
    )
    expect(finalized.every((r) => r.run_status === "finalized")).toBe(true)
  })

  it("names who calculated and who approved, and they differ", async () => {
    // Separation of duties, visible on the page rather than only enforced by a
    // CHECK: whoever calculated a run must not be the one who approved it.
    const all = await withTenant(AS_OWNER, (tx) => runs.list(tx))
    for (const r of all) {
      expect(r.calculated_by_name).toBeTruthy()
      expect(r.approved_by_name).toBeTruthy()
      expect(r.calculated_by_name).not.toBe(r.approved_by_name)
    }
  })

  it("carries a timestamp for every stage it claims", async () => {
    const all = await withTenant(AS_OWNER, (tx) => runs.list(tx))
    for (const r of all) {
      if (["approved", "finalized"].includes(r.run_status)) {
        expect(r.calculated_at, r.run_id!).not.toBeNull()
        expect(r.approved_at, r.run_id!).not.toBeNull()
      }
      if (r.run_status === "finalized") {
        expect(r.finalized_at, r.run_id!).not.toBeNull()
      }
    }
  })
})

describe("a person's payslip history", () => {
  it("carries every field a payslip has to print", async () => {
    // The run columns come from a JOIN, not from LINE_SELECT. When the return
    // type claimed them and the query did not select them, the page rendered
    // "undefined 216000.27" as a take-home figure and nothing failed — the
    // ordering test below mapped pay_date to a column of `undefined`, and
    // [undefined, undefined].sort() equals itself (L45).
    const [slip] = await withTenant(AS_OWNER, (tx) =>
      runs.forEmployee(tx, MARCUS),
    )
    // These seven, and only these. `forEmployee` wraps LINE_SELECT in a
    // subquery and asserts the row type over it, so anything added to
    // PayslipLine later is unguarded again — the same shape as L45, one layer
    // out. Add the field here when you add it there.
    for (const field of [
      "pay_date",
      "currency",
      "run_id",
      "gross_pay",
      "net_pay",
      "total_taxes",
      "work_country",
    ] as const) {
      expect(slip[field], `${field} is missing from forEmployee`).toBeDefined()
    }
    // A currency is what money() formats with; undefined prints the word.
    expect(slip.currency).toMatch(/^[A-Z]{3}$/)
    expect(slip.pay_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("returns their lines newest first", async () => {
    const mine = await withTenant(AS_OWNER, (tx) =>
      runs.forEmployee(tx, MARCUS),
    )
    expect(mine.length).toBeGreaterThan(0)
    const dates = mine.map((l) => l.pay_date)
    // Every date is real, so the ordering assertion cannot pass on a column
    // of undefined.
    expect(dates.every((d) => typeof d === "string" && d.length === 10)).toBe(
      true,
    )
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(mine.every((l) => l.employee_id === MARCUS)).toBe(true)
  })

  it("returns nothing for someone who has never been paid", async () => {
    const none = await withTenant(AS_OWNER, (tx) =>
      runs.forEmployee(tx, "385f5ae5-e567-5fb6-98f8-b45007099ff8"),
    )
    expect(Array.isArray(none)).toBe(true)
  })
})

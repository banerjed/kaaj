import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant } from "../db/tenant"
import * as comp from "./compensation_base.repo"

/**
 * Effective dating, against the real database.
 *
 * There is no constraint stopping two compensation rows from covering the same
 * day. When it happens the directory's DISTINCT ON picks one arbitrarily, so
 * the same person shows a different salary on different page loads — with no
 * error anywhere. That makes this an invariant that has to be TESTED, not
 * merely intended.
 *
 * Every case rolls back, so the fixture is unchanged afterwards.
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
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/** Marcus Chen — India, INR, two existing compensation rows. */
const CHEN = "db1f1f2b-b140-5948-a34e-1c998ed98757"

/** Run against the real schema, then undo. */
async function inRollback<T>(fn: (tx: comp.Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(AS_OWNER, async (tx) => {
      const result = await fn(tx as never)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

describe("compensation effective dating", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("the fixture starts with no overlapping windows", async () => {
    const found = await withTenant(AS_OWNER, (tx) => comp.overlaps(tx, CHEN))
    expect(found).toEqual([])
  })

  it("a raise closes the open row the day before it starts", async () => {
    const rows = await inRollback(async (tx) => {
      await comp.addRaise(
        tx,
        NORTHWIND,
        {
          employee_id: CHEN,
          effective_from: "2026-10-01",
          compensation_type: "salary",
          amount: "3500000.00",
          currency: "INR",
          pay_frequency: "monthly",
          annual_equivalent: "3500000.00",
          overtime_eligible: false,
          change_reason: "annual_review",
        },
        ACTOR,
      )
      return comp.listForEmployee(tx, CHEN)
    })

    // Newest first: the raise is open, and what it superseded closed on the
    // 30th — not the 1st, which would leave both covering that day.
    expect(rows[0].effective_from).toBe("2026-10-01")
    expect(rows[0].effective_to).toBeNull()
    expect(rows[1].effective_to).toBe("2026-09-30")
  })

  it("leaves no overlapping windows after a raise", async () => {
    const found = await inRollback(async (tx) => {
      await comp.addRaise(
        tx,
        NORTHWIND,
        {
          employee_id: CHEN,
          effective_from: "2026-10-01",
          compensation_type: "salary",
          amount: "3500000.00",
          currency: "INR",
          pay_frequency: "monthly",
          annual_equivalent: null,
          overtime_eligible: false,
          change_reason: "annual_review",
        },
        ACTOR,
      )
      return comp.overlaps(tx, CHEN)
    })
    expect(found).toEqual([])
  })

  it("does NOT push a future-dated raise into the employees cache", async () => {
    // The cache is what the directory falls back to when no dated row covers
    // today, so writing a future amount into it shows tomorrow's salary as
    // today's pay. 2026-10-01 has not arrived; the cache must not move.
    const row = await inRollback(async (tx) => {
      await comp.addRaise(
        tx,
        NORTHWIND,
        {
          employee_id: CHEN,
          effective_from: "2026-10-01",
          compensation_type: "salary",
          amount: "3500000.00",
          currency: "INR",
          pay_frequency: "monthly",
          annual_equivalent: null,
          overtime_eligible: false,
          change_reason: "annual_review",
        },
        ACTOR,
      )
      const [e] = await tx`
        SELECT base_amount::text AS base_amount, currency
          FROM employees WHERE id = ${CHEN}
      `
      return e as { base_amount: string; currency: string }
    })
    // Still the currently-effective figure, not the future one.
    expect(Number(row.base_amount)).toBe(3200000)
    expect(row.currency).toBe("INR")
  })

  it("does push a raise effective today into the cache", async () => {
    const row = await inRollback(async (tx) => {
      const [{ today }] =
        await tx`SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS today`
      await comp.addRaise(
        tx,
        NORTHWIND,
        {
          employee_id: CHEN,
          effective_from: today as string,
          compensation_type: "salary",
          amount: "3500000.00",
          currency: "INR",
          pay_frequency: "monthly",
          annual_equivalent: null,
          overtime_eligible: false,
          change_reason: "annual_review",
        },
        ACTOR,
      )
      const [e] = await tx`
        SELECT base_amount::text AS base_amount FROM employees WHERE id = ${CHEN}
      `
      return e as { base_amount: string }
    })
    expect(Number(row.base_amount)).toBe(3500000)
  })

  it("refuses a second record starting on the same date", async () => {
    // The likeliest real path: record a change, notice a typo, record it again.
    // Before this guard both rows stayed open, the directory picked one
    // arbitrarily, and the detail page threw on a duplicate each-key.
    await expect(
      inRollback(async (tx) => {
        const input = {
          employee_id: CHEN,
          effective_from: "2026-10-01",
          compensation_type: "salary",
          amount: "3500000.00",
          currency: "INR",
          pay_frequency: "monthly",
          annual_equivalent: null,
          overtime_eligible: false,
          change_reason: "annual_review" as string | null,
        }
        await comp.addRaise(tx, NORTHWIND, input, ACTOR)
        await comp.addRaise(tx, NORTHWIND, input, ACTOR)
      }),
    ).rejects.toThrow(/duplicate_date/)
  })

  it("refuses a record that starts before an existing later one", async () => {
    await expect(
      inRollback(async (tx) => {
        await comp.addRaise(
          tx,
          NORTHWIND,
          {
            employee_id: CHEN,
            effective_from: "2027-01-01",
            compensation_type: "salary",
            amount: "3600000.00",
            currency: "INR",
            pay_frequency: "monthly",
            annual_equivalent: null,
            overtime_eligible: false,
            change_reason: "annual_review",
          },
          ACTOR,
        )
        // Backdated relative to the row just written: would leave both open.
        await comp.addRaise(
          tx,
          NORTHWIND,
          {
            employee_id: CHEN,
            effective_from: "2026-10-01",
            compensation_type: "salary",
            amount: "3500000.00",
            currency: "INR",
            pay_frequency: "monthly",
            annual_equivalent: null,
            overtime_eligible: false,
            change_reason: "correction",
          },
          ACTOR,
        )
      }),
    ).rejects.toThrow(/would_overlap/)
  })

  it("refuses an amount wider than numeric(12,2) instead of 500ing", async () => {
    await expect(
      inRollback((tx) =>
        comp.addRaise(
          tx,
          NORTHWIND,
          {
            employee_id: CHEN,
            effective_from: "2026-10-01",
            compensation_type: "salary",
            amount: "99999999999.00", // 11 integer digits
            currency: "INR",
            pay_frequency: "monthly",
            annual_equivalent: null,
            overtime_eligible: false,
            change_reason: "correction",
          },
          ACTOR,
        ),
      ),
    ).rejects.toThrow(/amount_out_of_range/)
  })

  it("stores money at the authoritative column's scale, in both places", async () => {
    // compensation_base.amount is numeric(12,2) and employees.base_amount is
    // numeric(18,4). Postgres ROUNDS to scale silently (it does not truncate),
    // so a 4-decimal value lands differently in the two columns unless the
    // cache is rounded the same way. .9052 distinguishes the two behaviours;
    // .9012 would pass under either and prove nothing.
    const result = await inRollback(async (tx) => {
      const [{ today }] =
        await tx`SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS today`
      await comp.addRaise(
        tx,
        NORTHWIND,
        {
          employee_id: CHEN,
          effective_from: today as string,
          compensation_type: "salary",
          amount: "12345678.9052",
          currency: "INR",
          pay_frequency: "monthly",
          annual_equivalent: null,
          overtime_eligible: false,
          change_reason: "correction",
        },
        ACTOR,
      )
      const rows = await comp.listForEmployee(tx, CHEN)
      const [e] = await tx`
        SELECT base_amount::text AS base_amount FROM employees WHERE id = ${CHEN}
      `
      return { rows, cached: (e as { base_amount: string }).base_amount }
    })

    // Rounded, not truncated: .9052 -> .91.
    expect(result.rows[0].amount).toBe("12345678.91")
    // And the cache agrees rather than keeping the extra digits.
    expect(Number(result.cached)).toBe(12345678.91)
  })
})

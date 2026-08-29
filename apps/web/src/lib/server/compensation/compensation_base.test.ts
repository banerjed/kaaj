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
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/** Marcus Chen — India, INR, two existing compensation rows. */
const CHEN = "db1f1f2b-b140-5948-a34e-1c998ed98757"

/** Run against the real schema, then undo. */
async function inRollback<T>(fn: (tx: comp.Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(NORTHWIND, async (tx) => {
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
    const found = await withTenant(NORTHWIND, (tx) => comp.overlaps(tx, CHEN))
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

  it("keeps the denormalised employees columns in step", async () => {
    // The directory falls back to these when no dated row is current, so
    // letting them drift gives two answers to the same question.
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
    expect(Number(row.base_amount)).toBe(3500000)
    expect(row.currency).toBe("INR")
  })

  it("stores money at the authoritative column's scale, in both places", async () => {
    // compensation_base.amount is numeric(12,2) and employees.base_amount is
    // numeric(18,4). Postgres truncates to scale silently, so a 4-decimal value
    // would land differently in the two columns and the directory would show a
    // different figure depending on which one it read. Both must agree.
    const result = await inRollback(async (tx) => {
      await comp.addRaise(
        tx,
        NORTHWIND,
        {
          employee_id: CHEN,
          effective_from: "2026-11-01",
          compensation_type: "salary",
          amount: "12345678.9012",
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

    // The authoritative column holds two decimals...
    expect(result.rows[0].amount).toBe("12345678.90")
    // ...and the cache agrees with it rather than keeping the extra digits.
    expect(Number(result.cached)).toBe(12345678.9)
  })
})

import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as balances from "./hr_time_off_balances.repo"
import * as requests from "./hr_time_off_requests.repo"
import * as policies from "./hr_time_off_policies.repo"

/**
 * Time off, against the real database. Every case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(NORTHWIND, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

describe("time-off balances", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("every stored balance matches the identity", async () => {
    // current = opening + accrued + adjusted - used - pending - forfeited
    // No constraint enforces this, and accrual is a scheduled job, so drift
    // would be invisible until someone was refused leave they had earned.
    const bad = await withTenant(NORTHWIND, (tx) => balances.inconsistent(tx))
    expect(bad).toEqual([])
  })

  it("carried_over is NOT a separate addend", async () => {
    // It is already inside opening_balance. Adding it again inflates the
    // fixture's balances by 5-12 days each — leave nobody has earned.
    const rows = await withTenant(NORTHWIND, async (tx) => {
      return tx`
        SELECT count(*) FILTER (WHERE carried_over > 0)::int AS with_carryover,
               count(*) FILTER (
                 WHERE current_balance = opening_balance + accrued + carried_over
                                         + adjusted - used - pending - forfeited
               )::int AS would_match_if_additive
          FROM hr_time_off_balances
      ` as unknown as Promise<
        { with_carryover: number; would_match_if_additive: number }[]
      >
    })
    const [r] = rows
    expect(r.with_carryover).toBeGreaterThan(0)
    // Only rows whose carryover is zero can satisfy the additive form.
    expect(r.would_match_if_additive).toBeLessThan(r.with_carryover)
  })

  it("pending is already deducted, so current_balance is what can be booked", async () => {
    const rows = await withTenant(NORTHWIND, async (tx) => {
      return tx`
        SELECT opening_balance::text AS opening, accrued::text AS accrued,
               pending::text AS pending, current_balance::text AS current
          FROM hr_time_off_balances
         WHERE pending > 0 LIMIT 1
      ` as unknown as Promise<
        { opening: string; accrued: string; pending: string; current: string }[]
      >
    })
    const [r] = rows
    expect(Number(r.pending)).toBeGreaterThan(0)
    // Earned, less what is already spoken for.
    expect(Number(r.current)).toBeLessThan(
      Number(r.opening) + Number(r.accrued),
    )
  })
})

describe("time-off policies", () => {
  it("are scoped per jurisdiction, not firm-wide", async () => {
    // Statutory leave is national: a single policy cannot be lawful in the US,
    // the UK and India at once.
    const [us, uk, india] = await withTenant(NORTHWIND, async (tx) => [
      await policies.forLocation(tx, "US-NYC"),
      await policies.forLocation(tx, "UK-LON"),
      await policies.forLocation(tx, "IN-BLR"),
    ])
    expect(us.map((p) => p.policy_code)).toContain("US-PTO")
    expect(uk.map((p) => p.policy_code)).toContain("UK-ANNUAL")
    expect(india.map((p) => p.policy_code)).toContain("IN-EARNED")
    // Sick leave covers all three.
    for (const set of [us, uk, india]) {
      expect(set.map((p) => p.policy_code)).toContain("GLOBAL-SICK")
    }
    // And no office sees another's annual-leave policy.
    expect(us.map((p) => p.policy_code)).not.toContain("UK-ANNUAL")
    expect(india.map((p) => p.policy_code)).not.toContain("US-PTO")
  })
})

describe("approving time off", () => {
  it("moves hours from pending to used without changing what is available", async () => {
    // Both are already deducted from current_balance: the person spent it when
    // they asked. Approving must not deduct a second time.
    const result = await inRollback(async (tx) => {
      const [pending] = await requests.list(tx, { status: "pending" })
      const before = await balances.forEmployee(tx, pending.employee_id)
      const row = before.find((b) => b.policy_code === pending.policy_code)!
      await requests.decide(
        tx,
        pending.id,
        "approved",
        "6d466aa9-e51a-5d52-9015-152600855932",
        null,
      )
      const after = await balances.forEmployee(tx, pending.employee_id)
      const now = after.find((b) => b.policy_code === pending.policy_code)!
      return { row, now, hours: Number(pending.total_hours) }
    })

    const days = result.hours / 8
    expect(Number(result.now.pending)).toBeCloseTo(
      Number(result.row.pending) - days,
      4,
    )
    expect(Number(result.now.used)).toBeCloseTo(
      Number(result.row.used) + days,
      4,
    )
    expect(Number(result.now.current_balance)).toBeCloseTo(
      Number(result.row.current_balance),
      4,
    )
  })

  it("gives the hours back when denied", async () => {
    const result = await inRollback(async (tx) => {
      const [pending] = await requests.list(tx, { status: "pending" })
      const before = await balances.forEmployee(tx, pending.employee_id)
      const row = before.find((b) => b.policy_code === pending.policy_code)!
      await requests.decide(
        tx,
        pending.id,
        "denied",
        "6d466aa9-e51a-5d52-9015-152600855932",
        "Cover not available",
      )
      const after = await balances.forEmployee(tx, pending.employee_id)
      const now = after.find((b) => b.policy_code === pending.policy_code)!
      return { row, now, hours: Number(pending.total_hours) }
    })

    const days = result.hours / 8
    expect(Number(result.now.current_balance)).toBeCloseTo(
      Number(result.row.current_balance) + days,
      4,
    )
  })

  it("refuses to decide a request twice", async () => {
    // Otherwise approve-approve deducts twice, and approving a denied request
    // silently revives it.
    await expect(
      inRollback(async (tx) => {
        const [pending] = await requests.list(tx, { status: "pending" })
        const approver = "6d466aa9-e51a-5d52-9015-152600855932"
        await requests.decide(tx, pending.id, "approved", approver, null)
        await requests.decide(tx, pending.id, "approved", approver, null)
      }),
    ).rejects.toThrow(/not_pending/)
  })

  it("refuses self-approval", async () => {
    // The RLS policy is tenant isolation only, so this is the only thing
    // between a manager and unlimited self-granted holiday.
    await expect(
      inRollback(async (tx) => {
        const [pending] = await requests.list(tx, { status: "pending" })
        await requests.decide(
          tx,
          pending.id,
          "approved",
          pending.employee_id,
          null,
        )
      }),
    ).rejects.toThrow(/self_approval/)
  })
})

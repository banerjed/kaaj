import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import { fxRevaluation } from "./fx_revaluation.repo"

/**
 * Report-only, so read-only tests suffice for the receivables side — the
 * fixture's real GBP invoice already carries a live rate delta. The
 * payables side needs a rollback, same as `payables.writes.test.ts`: no
 * bill in the fixture is foreign-currency.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
/** BILL-AWS-2026-01 — USD in the fixture, converted within the rollback. */
const APPROVED_BILL = "fdab0a8b-c4d8-5601-bf23-59c3028e9359"

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(AS_OWNER, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

describe("FX revaluation report (US-ACC-053)", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("revalues an open foreign-currency invoice against its booking rate", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      fxRevaluation(tx, "2026-03-15"),
    )
    const row = rows.find(
      (r) => r.kind === "receivable" && r.documentNumber === "INV-2026-002",
    )
    // The fixture's latest GBP rate on or before 2026-03-15 is 1.28
    // (2026-02-07), above the invoice's own 1.27 booking rate: revaluing
    // the open 16,000.00 balance at the newer rate is a gain.
    expect(row?.currency).toBe("GBP")
    expect(row?.amountDue).toBe("16000.00")
    expect(row?.bookedRate).toBe("1.270000")
    expect(row?.asOfRate).toBe("1.280000")
    expect(row?.bookedBase).toBe("20320.00")
    expect(row?.revaluedBase).toBe("20480.00")
    expect(row?.unrealizedGainLoss).toBe("160.00")
  })

  it("reports no rate rather than a wrong one when none is on file yet", async () => {
    // 2026-01-01 predates the fixture's earliest GBP rate (2026-01-21).
    const rows = await withTenant(AS_OWNER, (tx) =>
      fxRevaluation(tx, "2026-01-01"),
    )
    const row = rows.find(
      (r) => r.kind === "receivable" && r.documentNumber === "INV-2026-002",
    )
    expect(row?.asOfRate).toBeNull()
    expect(row?.revaluedBase).toBeNull()
    expect(row?.unrealizedGainLoss).toBeNull()
  })

  it("revalues an open foreign-currency bill, in the opposite direction from a receivable", async () => {
    const row = await inRollback(async (tx) => {
      await tx`
        UPDATE bills SET currency = 'GBP', exchange_rate = 1.27
         WHERE id = ${APPROVED_BILL}::uuid
      `
      const rows = await fxRevaluation(tx, "2026-03-15")
      return rows.find(
        (r) => r.kind === "payable" && r.documentNumber === "BILL-AWS-2026-01",
      )
    })
    // Same rate movement as the receivable above (1.27 -> 1.28), but owing
    // more of a strengthened currency is a loss, not a gain.
    expect(row?.bookedBase).toBe("2516.54")
    expect(row?.revaluedBase).toBe("2536.36")
    expect(row?.unrealizedGainLoss).toBe("-19.82")
  })

  it("never returns a USD invoice or bill — there is nothing to revalue", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      fxRevaluation(tx, "2026-03-15"),
    )
    expect(rows.every((r) => r.currency !== "USD")).toBe(true)
  })
})

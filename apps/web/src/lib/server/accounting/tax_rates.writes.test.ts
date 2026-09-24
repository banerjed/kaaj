import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx, type Actor } from "../db/tenant"
import * as taxRates from "./tax_rates.repo"

/**
 * The tax_rates write path (US-ACC-046), against the real database. Every
 * case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const ACTOR = "48ccc5de-9ba7-5461-ab49-160a1146ed85"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const AS_AUDITOR = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: ["auditor"],
  employeeId: "db1f1f2b-b140-5948-a34e-1c998ed98757",
}
const AS_PLAIN_EMPLOYEE = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: [] as string[],
  employeeId: "db1f1f2b-b140-5948-a34e-1c998ed98757",
}

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

async function inRollbackAs<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(actor, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

const NEW_RATE = {
  code: "TAX-TEST-2027",
  tax_name: "Test Rate",
  tax_type: "sales_tax",
  rate: "0.06500",
  country: "US",
  region: "CA",
  jurisdiction: "US-CA",
  is_reverse_charge: false,
  effective_from: "2027-01-01",
}

describe("tax rates", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("creates a rate, readable back with the same figures", async () => {
    const row = await inRollback(async (tx) => {
      const { id } = await taxRates.createTaxRate(
        tx,
        NORTHWIND,
        NEW_RATE,
        ACTOR,
      )
      const rows = await taxRates.listTaxRates(tx)
      return rows.find((r) => r.id === id)
    })
    expect(row).toMatchObject({
      code: "TAX-TEST-2027",
      tax_name: "Test Rate",
      tax_type: "sales_tax",
      rate: "0.06500",
      country: "US",
      region: "CA",
      is_reverse_charge: false,
      is_active: true,
    })
    // (rate * 100), computed in SQL rather than parsed in JS.
    expect(row?.rate_percent).toBe("6.50000")
  })

  it("refuses a second rate with a code already in use by this tenant", async () => {
    await expect(
      inRollback((tx) =>
        taxRates
          .createTaxRate(
            tx,
            NORTHWIND,
            { ...NEW_RATE, tax_name: "Duplicate" },
            ACTOR,
          )
          .then(() =>
            taxRates.createTaxRate(
              tx,
              NORTHWIND,
              { ...NEW_RATE, tax_name: "Duplicate 2" },
              ACTOR,
            ),
          ),
      ),
    ).rejects.toThrow(/duplicate key|unique constraint/i)
  })

  it("deactivates a rate, then reactivates it", async () => {
    const [afterDeactivate, afterActivate] = await inRollback(async (tx) => {
      const { id } = await taxRates.createTaxRate(
        tx,
        NORTHWIND,
        NEW_RATE,
        ACTOR,
      )
      await taxRates.setTaxRateActive(tx, id, false, ACTOR)
      const deactivated = (await taxRates.listTaxRates(tx)).find(
        (r) => r.id === id,
      )
      await taxRates.setTaxRateActive(tx, id, true, ACTOR)
      const reactivated = (await taxRates.listTaxRates(tx)).find(
        (r) => r.id === id,
      )
      return [deactivated?.is_active, reactivated?.is_active]
    })
    expect(afterDeactivate).toBe(false)
    expect(afterActivate).toBe(true)
  })

  it("returns null, not silently succeeding, for a nonexistent id", async () => {
    const result = await inRollback((tx) =>
      taxRates.setTaxRateActive(
        tx,
        "00000000-0000-0000-0000-000000000000",
        false,
        ACTOR,
      ),
    )
    expect(result).toBeNull()
  })

  it("is visible to the finance function only", async () => {
    const rows = await inRollbackAs(AS_PLAIN_EMPLOYEE, (tx) =>
      taxRates.listTaxRates(tx),
    )
    expect(rows).toEqual([])
  })

  it("an auditor can read tax rates but the write is refused, not silently a no-op", async () => {
    const canRead = await inRollbackAs(AS_AUDITOR, (tx) =>
      taxRates.listTaxRates(tx),
    )
    expect(canRead.length).toBeGreaterThan(0)

    await expect(
      inRollbackAs(AS_AUDITOR, (tx) =>
        taxRates.createTaxRate(tx, NORTHWIND, NEW_RATE, ACTOR),
      ),
    ).rejects.toThrow()
  })
})

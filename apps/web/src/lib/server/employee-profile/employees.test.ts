import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant } from "../db/tenant"
import * as employees from "./employees.repo"

/**
 * The employee directory, read as a RESTRICTED actor.
 *
 * Every other repository suite runs as an actor who reads everything, so that
 * a row-visibility policy does not silently narrow what a repository test
 * sees. That convention has a blind spot, and this file exists to cover it:
 * a projection that falls back to an UNPROTECTED column when the protected one
 * is invisible looks correct to an owner, because the owner never reaches the
 * fallback. `employees.list` did exactly that and disclosed every salary in
 * the firm to every employee (L47).
 *
 * These cases must therefore run as someone who is meant to be refused.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

/** A plain employee: no functional role, no reports. */
const AS_MARCUS = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: [] as string[],
  employeeId: MARCUS,
}

const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: SARAH,
}

describe("the directory, as a plain employee", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("shows colleagues but not what they are paid", async () => {
    const { rows } = await withTenant(AS_MARCUS, (tx) =>
      employees.list(tx, { limit: 50 }),
    )

    // Both halves matter. A policy too tight blanks the page instead of
    // erroring (L21), so "no pay visible" is only meaningful alongside
    // "colleagues are visible".
    expect(rows.length).toBeGreaterThan(1)

    const others = rows.filter((r) => r.id !== MARCUS)
    expect(others.length).toBeGreaterThan(0)
    for (const r of others) {
      expect(
        r.base_amount_pvt,
        `${r.first_name} ${r.last_name}'s salary is visible to a colleague`,
      ).toBeNull()
    }
  })

  it("still shows the person their own pay", async () => {
    // The failure this guards is the over-correction: hiding everyone's pay
    // including your own, which reads as a broken page rather than a policy.
    const { rows } = await withTenant(AS_MARCUS, (tx) =>
      employees.list(tx, { limit: 50 }),
    )
    const me = rows.find((r) => r.id === MARCUS)
    expect(me).toBeDefined()
    expect(me!.base_amount_pvt).not.toBeNull()
    expect(Number(me!.base_amount_pvt)).toBeGreaterThan(0)
    expect(me!.currency).toBe("INR")
  })

  it("hides pay on the detail page too, not just the list", async () => {
    // Two queries carried the same fallback. Fixing one and shipping the
    // other is L42's shape exactly.
    const sarah = await withTenant(AS_MARCUS, (tx) =>
      employees.getById(tx, SARAH),
    )
    expect(sarah).not.toBeNull()
    expect(sarah!.first_name).toBe("Sarah")
    expect(sarah!.base_amount_pvt).toBeNull()
  })
})

describe("the directory, as the owner", () => {
  it("shows what everyone is paid", async () => {
    // The other half: the fix must not have blanked the figure for the people
    // whose job is to see it.
    const { rows } = await withTenant(AS_OWNER, (tx) =>
      employees.list(tx, { limit: 50 }),
    )
    const paid = rows.filter((r) => r.base_amount_pvt !== null)
    expect(paid.length).toBeGreaterThan(1)
  })
})

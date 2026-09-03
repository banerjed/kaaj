import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "./client"
import { withTenant } from "./tenant"

/**
 * Proves tenant isolation through the path the APPLICATION uses — `verify-rls.sql`
 * proves the policies filter; this proves `withTenant` builds the session the
 * same way. Asserts both directions, since a mistake here returns nothing or everything.
 */

// Seeded by mock-data.sql, whose own verification block asserts these counts.
const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/** Tested as an actor who reads everything; visibility has its own tests in row-visibility.test.ts. */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [],
  employeeId: null,
}
const NOBODY = "00000000-0000-4000-8000-000000000001"

describe("withTenant", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("sees the tenant's own rows", async () => {
    const [{ count }] = await withTenant(
      AS_OWNER,
      (tx) => tx`SELECT count(*)::int AS count FROM employees`,
    )
    // 0 here means the claim is not reaching app.current_tenant_id() (L1, L2).
    expect(count).toBe(12)
  })

  it("gives a tenant-only claim NOTHING from a row-scoped table", async () => {
    // Row-visibility keys on role/person too (docs/15) — a bare tenant id is denied. Fail closed.
    const [{ count }] = await withTenant(
      NORTHWIND,
      (tx) => tx`SELECT count(*)::int AS count FROM employees`,
    )
    expect(count).toBe(0)
  })

  it("sees nothing for a tenant that owns nothing", async () => {
    const [{ count }] = await withTenant(
      NOBODY,
      (tx) => tx`SELECT count(*)::int AS count FROM employees`,
    )
    // 12 here means RLS is not in effect — check the connection role (L3).
    expect(count).toBe(0)
  })

  it("does not leak one tenant's rows into another's transaction", async () => {
    // Same pool, back to back: catches a claim outliving its transaction.
    const mine = await withTenant(
      NORTHWIND,
      (tx) => tx`SELECT id FROM firm_locations ORDER BY id`,
    )
    const theirs = await withTenant(
      NOBODY,
      (tx) => tx`SELECT id FROM firm_locations ORDER BY id`,
    )

    expect(mine.length).toBe(3)
    expect(theirs.length).toBe(0)
  })

  it("restores the connection so a later transaction is unaffected", async () => {
    await withTenant(NOBODY, (tx) => tx`SELECT 1`)
    const [{ count }] = await withTenant(
      NORTHWIND,
      (tx) => tx`SELECT count(*)::int AS count FROM firm_departments`,
    )
    expect(count).toBe(6)
  })

  it("refuses a malformed tenant id rather than passing it to the database", async () => {
    await expect(
      withTenant("'; DROP TABLE employees; --", (tx) => tx`SELECT 1`),
    ).rejects.toThrow(/malformed tenant id/)
  })

  it("rolls back when the callback throws", async () => {
    const boom = new Error("deliberate")
    await expect(
      withTenant(AS_OWNER, async (tx) => {
        await tx`
          INSERT INTO firm_departments (tenant_id, name, department_code)
          VALUES (${NORTHWIND}, 'Rollback Probe', 'ROLLBACK-PROBE')
        `
        throw boom
      }),
    ).rejects.toThrow("deliberate")

    const [{ count }] = await withTenant(
      NORTHWIND,
      (tx) => tx`
        SELECT count(*)::int AS count
          FROM firm_departments
         WHERE department_code = 'ROLLBACK-PROBE'
      `,
    )
    expect(count).toBe(0)
  })
})

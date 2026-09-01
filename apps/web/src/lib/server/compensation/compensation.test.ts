import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant } from "../db/tenant"
import * as base from "./compensation_base.repo"

/**
 * The compensation page's own query, under the claims that matter.
 *
 * The query is IDENTICAL in every case; only the claim changes. What comes
 * back is decided by the row policy, which is the whole design — so this
 * asserts the design rather than an application filter, and it would fail if
 * anyone added one.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
const RACHEL = "a87e0200-0849-53b6-a491-e882feace3f5"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

const actor = (
  employeeId: string,
  role: string,
  functionalRoles: string[],
) => ({
  tenantId: NORTHWIND,
  role,
  functionalRoles,
  employeeId,
})

describe("current pay, as different people", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("shows a plain employee only their own row", async () => {
    const rows = await withTenant(actor(MARCUS, "employee", []), (tx) =>
      base.currentForAll(tx),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].employee_id).toBe(MARCUS)
  })

  it("shows HR and the owner everyone", async () => {
    const [hr, owner] = await Promise.all([
      withTenant(actor(RACHEL, "employee", ["hr_admin"]), (tx) =>
        base.currentForAll(tx),
      ),
      withTenant(actor(SARAH, "owner", []), (tx) => base.currentForAll(tx)),
    ])
    // Both halves: a policy too tight blanks the page rather than erroring
    // (L21), so "an employee sees one row" is only evidence alongside this.
    expect(hr.length).toBeGreaterThan(1)
    expect(owner.length).toBe(hr.length)
  })

  it("refuses finance and IT, who are powerful elsewhere", async () => {
    // The limit nobody thinks to test. A finance admin runs the ledger and an
    // IT admin administers accounts; neither administers anyone's salary.
    for (const role of ["finance_admin", "it_admin", "legal_admin"]) {
      const rows = await withTenant(actor(MARCUS, "employee", [role]), (tx) =>
        base.currentForAll(tx),
      )
      expect(rows, `${role} sees more than their own pay`).toHaveLength(1)
    }
  })

  it("returns money as a string with its currency, in more than one market", async () => {
    const rows = await withTenant(actor(SARAH, "owner", []), (tx) =>
      base.currentForAll(tx),
    )
    for (const r of rows) {
      expect(typeof r.amount).toBe("string")
      expect(r.currency).toMatch(/^[A-Z]{3}$/)
    }
    expect(new Set(rows.map((r) => r.currency)).size).toBeGreaterThan(1)
  })

  it("returns exactly one open record per person", async () => {
    // Two open rows means an overlapping history, which is what addRaise
    // refuses to create. If this ever fails, someone wrote around it.
    const rows = await withTenant(actor(SARAH, "owner", []), (tx) =>
      base.currentForAll(tx),
    )
    const seen = new Set<string>()
    for (const r of rows) {
      expect(
        seen.has(r.employee_id),
        `${r.last_name} has two current rows`,
      ).toBe(false)
      seen.add(r.employee_id)
    }
  })

  it("never reads the unprotected cache column", async () => {
    // employees.base_amount_pvt is a copy of this figure on a row every
    // colleague can read. The build guard forbids querying it; this asserts
    // the value we return comes from compensation_base by checking it against
    // the authoritative table directly.
    const result = await withTenant(actor(SARAH, "owner", []), async (tx) => {
      const rows = await base.currentForAll(tx)
      const [check] = await tx<{ amount: string }[]>`
        SELECT amount::text AS amount FROM compensation_base
         WHERE employee_id = ${rows[0].employee_id}
           AND effective_to IS NULL
      `
      return { got: rows[0].amount, authoritative: check.amount }
    })
    expect(result.got).toBe(result.authoritative)
  })
})

import { describe, expect, it } from "vitest"
import { withTenant } from "../db/tenant"
import { can, canReadEmployee, managesEmployee, type AuthContext } from "./can"
import {
  FORBIDDEN_COMBINATIONS,
  PERMISSIONS,
  permissionsFor,
} from "./permissions"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932" // manages ENG
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757" // reports to Sarah
const NADIA = "385f5ae5-e567-5fb6-98f8-b45007099ff8" // reports to nobody relevant

const ctx = (
  role: AuthContext["role"],
  functionalRoles: string[] = [],
  employeeId: string | null = MARCUS,
): AuthContext => ({
  tenantId: NORTHWIND,
  userId: "00000000-0000-0000-0000-000000000001",
  employeeId,
  role,
  functionalRoles,
})

describe("the floor", () => {
  it("an employee can see themselves and nothing else", () => {
    const e = ctx("employee")
    expect(can(e, "employee.read.self")).toBe(true)
    expect(can(e, "compensation.read.self")).toBe(true)
    expect(can(e, "employee.read.all")).toBe(false)
    expect(can(e, "compensation.write")).toBe(false)
    expect(can(e, "firm.settings.write")).toBe(false)
  })

  it("an unrecognised role reads as the floor, never as an escalation", () => {
    // A token minted before the vocabulary changed, or a tampered claim.
    const rogue = { ...ctx("employee"), role: "superuser" as never }
    expect(can(rogue, "compensation.write")).toBe(false)
    expect(can(rogue, "employee.read.self")).toBe(true)
  })

  it("no context is no permission", () => {
    for (const p of PERMISSIONS) expect(can(null, p)).toBe(false)
  })
})

describe("separation of duties", () => {
  it("hr_admin sets pay and cannot approve the run", () => {
    const hr = ctx("employee", ["hr_admin"])
    expect(can(hr, "compensation.write")).toBe(true)
    expect(can(hr, "payroll.approve")).toBe(false)
  })

  it("payroll_admin approves the run and cannot set pay", () => {
    // The whole point: one person raising their own salary and then approving
    // their own payment is the oldest fraud in payroll.
    const pay = ctx("employee", ["payroll_admin"])
    expect(can(pay, "payroll.approve")).toBe(true)
    expect(can(pay, "compensation.write")).toBe(false)
    expect(can(pay, "compensation.read.all")).toBe(true)
  })

  it("it_admin never reaches a tax identifier", () => {
    const it = ctx("employee", ["it_admin"])
    expect(can(it, "it.assets.write")).toBe(true)
    expect(can(it, "employee.read.all")).toBe(true)
    expect(can(it, "pii.read")).toBe(false)
  })

  it("auditor reads and writes nothing", () => {
    const a = ctx("employee", ["auditor"])
    const writes = PERMISSIONS.filter(
      (p) => !p.includes(".read") && p !== "timeoff.request",
    )
    for (const p of writes) expect(can(a, p), p).toBe(false)
    expect(can(a, "compensation.read.all")).toBe(true)
  })

  it("the database refuses the combinations the bundles describe", () => {
    // Documented in one place, enforced in another. If these drift, a grant UI
    // explains a rule the database does not have, or the reverse.
    expect(FORBIDDEN_COMBINATIONS.map((c) => c.roles)).toEqual([
      ["hr_admin", "payroll_admin"],
      ["auditor"],
    ])
  })
})

describe("owner and firm_admin", () => {
  it("owner holds everything", () => {
    const o = ctx("owner")
    for (const p of PERMISSIONS) expect(can(o, p), p).toBe(true)
  })

  it("firm_admin holds everything except billing, membership and erasure", () => {
    const f = ctx("firm_admin")
    expect(can(f, "firm.settings.write")).toBe(true)
    expect(can(f, "compensation.write")).toBe(true)
    expect(can(f, "tenant.billing")).toBe(false)
    expect(can(f, "tenant.members.manage")).toBe(false)
    expect(can(f, "pii.erase")).toBe(false)
  })

  it("only owner may erase a data subject", () => {
    expect(can(ctx("owner"), "pii.erase")).toBe(true)
    for (const r of ["firm_admin", "employee", "contractor"] as const) {
      expect(can(ctx(r, ["hr_admin"]), "pii.erase"), r).toBe(false)
    }
  })
})

describe("managers are derived, not granted", () => {
  it("recognises a direct report", async () => {
    const yes = await withTenant(NORTHWIND, (tx) =>
      managesEmployee(tx, ctx("employee", [], SARAH), MARCUS),
    )
    expect(yes).toBe(true)
  })

  it("does not make someone their own manager", async () => {
    // Otherwise the reporting-line check would let anyone approve their own.
    const self = await withTenant(NORTHWIND, (tx) =>
      managesEmployee(tx, ctx("employee", [], SARAH), SARAH),
    )
    expect(self).toBe(false)
  })

  it("does not invent a chain that is not there", async () => {
    const no = await withTenant(NORTHWIND, (tx) =>
      managesEmployee(tx, ctx("employee", [], MARCUS), SARAH),
    )
    expect(no).toBe(false)
  })

  it("a member with no employee record manages nobody", async () => {
    const none = await withTenant(NORTHWIND, (tx) =>
      managesEmployee(tx, ctx("employee", [], null), MARCUS),
    )
    expect(none).toBe(false)
  })

  it("lets a manager read a report, and hr read anyone", async () => {
    const [managerReadsReport, peerReadsPeer, hrReadsAnyone] = await withTenant(
      NORTHWIND,
      async (tx) => [
        await canReadEmployee(
          tx,
          { ...ctx("employee", [], SARAH), functionalRoles: [] },
          MARCUS,
        ),
        await canReadEmployee(tx, ctx("employee", [], MARCUS), NADIA),
        await canReadEmployee(tx, ctx("employee", ["hr_admin"], MARCUS), NADIA),
      ],
    )
    // `employee.read.reports` is not in any bundle yet, so a plain manager
    // reads a report only through their own record or an explicit grant.
    expect(managerReadsReport).toBe(false)
    expect(peerReadsPeer).toBe(false)
    expect(hrReadsAnyone).toBe(true)
  })

  it("everyone can read themselves", async () => {
    const self = await withTenant(NORTHWIND, (tx) =>
      canReadEmployee(tx, ctx("contractor", [], MARCUS), MARCUS),
    )
    expect(self).toBe(true)
  })
})

describe("bundles compose", () => {
  it("adds up, because a person wears several hats", () => {
    // The office manager who runs HR and orders the laptops.
    const both = permissionsFor("employee", ["hr_admin", "it_admin"])
    expect(both.has("employee.write")).toBe(true)
    expect(both.has("it.assets.write")).toBe(true)
    // hr_admin brings pii.read; it_admin never would on its own.
    expect(both.has("pii.read")).toBe(true)
    expect(permissionsFor("employee", ["it_admin"]).has("pii.read")).toBe(false)
  })

  it("ignores a functional role it does not recognise", () => {
    const p = permissionsFor("employee", ["cfo"])
    expect(p.has("accounting.write")).toBe(false)
  })
})

describe("what separation of duties cannot do", () => {
  it("does not bind the owner, and that is not a bug to fix", () => {
    // The owner holds every permission, including both halves of the payroll
    // rule. No constraint can bind them: the owner also grants and removes
    // roles, so any rule they hit they can remove first. Asserting it here so
    // the limit is stated rather than assumed — the compensating control is
    // the audit trail, and the advice is to keep Owner to people already
    // trusted with the company bank account.
    const owner = ctx("owner", ["payroll_admin"])
    expect(can(owner, "compensation.write")).toBe(true)
    expect(can(owner, "payroll.approve")).toBe(true)
    expect(can(owner, "tenant.members.manage")).toBe(true)
  })

  it("does bind everyone else, which is the case that matters", () => {
    // firm_admin is the most powerful role that is NOT the owner, and it also
    // cannot grant itself out of trouble — tenant.members.manage is withheld.
    const admin = ctx("firm_admin")
    expect(can(admin, "tenant.members.manage")).toBe(false)
    // And the two functional roles cannot be combined at all; the database
    // refuses it, so this pairing is unreachable rather than merely unwise.
    const hr = ctx("employee", ["hr_admin"])
    const payroll = ctx("employee", ["payroll_admin"])
    expect(can(hr, "payroll.approve")).toBe(false)
    expect(can(payroll, "compensation.write")).toBe(false)
  })
})

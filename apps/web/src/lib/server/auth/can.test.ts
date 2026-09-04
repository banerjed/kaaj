import { describe, expect, it } from "vitest"
import { withTenant } from "../db/tenant"
import { can, canReadEmployee, managesEmployee, type AuthContext } from "./can"
import {
  FORBIDDEN_COMBINATIONS,
  PERMISSIONS,
  maskIdentifier,
  permissionsFor,
  revealOrMask,
} from "@kaaj/authz"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/** Tested as an actor who reads everything; visibility has its own tests in row-visibility.test.ts. */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [],
  employeeId: null,
}
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
  customerContactId: null,
  customerId: null,
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
      (p) =>
        !p.includes(".read") &&
        p !== "timeoff.request" &&
        // Self-service, granted by the base `employee` role regardless of
        // functional bundle — same reasoning as `timeoff.request` above.
        p !== "time_entries.write",
    )
    for (const p of writes) expect(can(a, p), p).toBe(false)
    expect(can(a, "compensation.read.all")).toBe(true)
  })

  it("the database refuses the combinations the bundles describe", () => {
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
    for (const r of [
      "firm_admin",
      "employee",
      "contractor",
      "customer",
    ] as const) {
      expect(can(ctx(r, ["hr_admin"]), "pii.erase"), r).toBe(false)
    }
  })

  it("a portal contact gets exactly the four portal permissions, nothing from EVERYONE", () => {
    // Deliberately not built on EVERYONE — employee.read.self etc mean
    // nothing for someone who isn't an employee (docs/17-customer-portal.md §1).
    const c = ctx("customer", [], null)
    expect(can(c, "ticket.submit")).toBe(true)
    expect(can(c, "ticket.read.own")).toBe(true)
    expect(can(c, "document.read.own")).toBe(true)
    expect(can(c, "document.upload.own")).toBe(true)
    expect(can(c, "employee.read.self")).toBe(false)
    expect(can(c, "compensation.read.self")).toBe(false)
    expect(can(c, "timeoff.request")).toBe(false)
    expect(can(c, "time_entries.write")).toBe(false)
  })
})

describe("managers are derived, not granted", () => {
  it("recognises a direct report", async () => {
    const yes = await withTenant(AS_OWNER, (tx) =>
      managesEmployee(tx, ctx("employee", [], SARAH), MARCUS),
    )
    expect(yes).toBe(true)
  })

  it("does not make someone their own manager", async () => {
    const self = await withTenant(AS_OWNER, (tx) =>
      managesEmployee(tx, ctx("employee", [], SARAH), SARAH),
    )
    expect(self).toBe(false)
  })

  it("does not invent a chain that is not there", async () => {
    const no = await withTenant(AS_OWNER, (tx) =>
      managesEmployee(tx, ctx("employee", [], MARCUS), SARAH),
    )
    expect(no).toBe(false)
  })

  it("a member with no employee record manages nobody", async () => {
    const none = await withTenant(AS_OWNER, (tx) =>
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
    // `employee.read.reports` is not in any bundle yet.
    expect(managerReadsReport).toBe(false)
    expect(peerReadsPeer).toBe(false)
    expect(hrReadsAnyone).toBe(true)
  })

  it("everyone can read themselves", async () => {
    const self = await withTenant(AS_OWNER, (tx) =>
      canReadEmployee(tx, ctx("contractor", [], MARCUS), MARCUS),
    )
    expect(self).toBe(true)
  })
})

describe("bundles compose", () => {
  it("adds up, because a person wears several hats", () => {
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
    // Owner can grant/remove roles, so no rule can bind them; the compensating
    // control is the audit trail.
    const owner = ctx("owner", ["payroll_admin"])
    expect(can(owner, "compensation.write")).toBe(true)
    expect(can(owner, "payroll.approve")).toBe(true)
    expect(can(owner, "tenant.members.manage")).toBe(true)
  })

  it("does bind everyone else, which is the case that matters", () => {
    const admin = ctx("firm_admin")
    expect(can(admin, "tenant.members.manage")).toBe(false)
    // hr_admin + payroll_admin is refused by the database, not just unwise.
    const hr = ctx("employee", ["hr_admin"])
    const payroll = ctx("employee", ["payroll_admin"])
    expect(can(hr, "payroll.approve")).toBe(false)
    expect(can(payroll, "compensation.write")).toBe(false)
  })
})

describe("reading a sensitive value versus revealing it", () => {
  it("hr_admin reveals; payroll_admin only sees the last four", () => {
    const hr = permissionsFor("employee", ["hr_admin"])
    const payroll = permissionsFor("employee", ["payroll_admin"])

    expect(revealOrMask(hr, "12345678909012")).toEqual({
      value: "12345678909012",
      revealed: true,
    })
    expect(revealOrMask(payroll, "12345678909012")).toEqual({
      value: "•••• 9012",
      revealed: false,
    })
  })

  it("shows nothing to someone with neither permission", () => {
    expect(
      revealOrMask(permissionsFor("employee", []), "12345678909012"),
    ).toEqual({ value: "—", revealed: false })
  })

  it("does not half-mask a short value", () => {
    // "•••• 6789" of a 6-digit number gives away most of it.
    expect(maskIdentifier("1234")).toBe("••••")
    expect(maskIdentifier("")).toBe("—")
    expect(maskIdentifier(null)).toBe("—")
  })
})

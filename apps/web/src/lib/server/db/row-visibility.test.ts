import { describe, expect, it } from "vitest"
import postgres from "postgres"
import { can, type AuthContext } from "../auth/can"

/**
 * Row-level visibility — docs/15-row-level-visibility.md.
 *
 * These connect as `app_user` directly rather than through `withTenant`,
 * because the point is what the DATABASE returns for a given claim. Going
 * through the application would test the application.
 *
 * **Every case asserts what a role CAN see, not only what it cannot.** A
 * RESTRICTIVE policy that is too tight blanks a page rather than erroring
 * (L21), which is this codebase's default failure mode — so "returns nothing"
 * is never on its own evidence that a policy is right.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"

const sql = postgres(
  process.env.APP_DATABASE_URL ??
    "postgresql://app_user:app_user@127.0.0.1:54322/postgres",
  { max: 2, types: {}, onnotice: () => {} },
)

type Who = {
  employeeId?: string | null
  role?: string
  functionalRoles?: string[]
  tenantId?: string
}

/** One transaction, claim set the way withTenant sets it. */
async function asRole<T>(
  who: Who,
  fn: (tx: postgres.Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({
      app_metadata: {
        tenant_id: who.tenantId ?? NORTHWIND,
        employee_id: who.employeeId ?? null,
        role: who.role ?? "employee",
        functional_roles: who.functionalRoles ?? [],
      },
    })}, true)`
    return fn(tx as unknown as postgres.Sql)
  }) as Promise<T>
}

const counts = (who: Who) =>
  asRole(who, async (tx) => {
    const [r] = await tx<{ employees: number; pay: number }[]>`
      SELECT (SELECT count(*)::int FROM employees) AS employees,
             (SELECT count(*)::int FROM compensation_base) AS pay
    `
    return r
  })

describe("the staff directory", () => {
  it("is visible to an employee — colleagues need to find each other", async () => {
    // The directory is not a secret. Sensitive fields on a record are gated by
    // pii.read / pii.reveal, not by hiding the row.
    const c = await counts({ employeeId: MARCUS, role: "employee" })
    expect(c.employees).toBe(12)
  })

  it("is NOT visible to a contractor — they see only themselves", async () => {
    const c = await counts({ employeeId: MARCUS, role: "contractor" })
    expect(c.employees).toBe(1)
  })

  it("shows nothing at all without a claim", async () => {
    // Fails closed. A token minted before the claim existed, or a malformed
    // one, must mean "no rows", never "every row".
    const c = await counts({ employeeId: null, role: "" })
    expect(c.employees).toBe(0)
    expect(c.pay).toBe(0)
  })

  it("treats an unrecognised role as the floor", async () => {
    // Not an escalation, and not a blank page for someone who has a record.
    const c = await counts({ employeeId: MARCUS, role: "superuser" })
    expect(c.employees).toBe(1)
  })
})

describe("pay", () => {
  it("shows an employee their own, and only their own", async () => {
    const c = await counts({ employeeId: MARCUS, role: "employee" })
    expect(c.pay).toBe(2) // Marcus's two effective-dated records
    const rows = await asRole(
      { employeeId: MARCUS, role: "employee" },
      (tx) =>
        tx<
          { employee_id: string }[]
        >`SELECT employee_id FROM compensation_base`,
    )
    expect(rows.every((r) => r.employee_id === MARCUS)).toBe(true)
  })

  it("shows hr_admin and payroll_admin everyone's", async () => {
    for (const role of ["hr_admin", "payroll_admin"]) {
      const c = await counts({
        employeeId: MARCUS,
        role: "employee",
        functionalRoles: [role],
      })
      expect(c.pay, role).toBe(24)
    }
  })

  it("shows it_admin the directory and NOT the pay", async () => {
    // The separation rule, now holding at the row level as well as in can():
    // IT administers systems, not salaries.
    const c = await counts({
      employeeId: MARCUS,
      role: "employee",
      functionalRoles: ["it_admin"],
    })
    expect(c.employees).toBe(12)
    expect(c.pay).toBe(2)
  })

  it("shows owner and firm_admin everyone's", async () => {
    for (const role of ["owner", "firm_admin"]) {
      const c = await counts({ employeeId: MARCUS, role })
      expect(c.pay, role).toBe(24)
    }
  })
})

describe("RLS and can() agree", () => {
  // The divergence problem again — a policy and application code enforcing the
  // same rule. Not merged: asserted to agree, the same answer used for the two
  // test suites.
  const ctx = (role: string, functionalRoles: string[] = []): AuthContext => ({
    tenantId: NORTHWIND,
    userId: "00000000-0000-0000-0000-000000000001",
    employeeId: MARCUS,
    role: role as AuthContext["role"],
    functionalRoles,
  })

  it("gives the same answer on who reads all compensation", async () => {
    const cases: [string, string[]][] = [
      ["employee", []],
      ["employee", ["hr_admin"]],
      ["employee", ["payroll_admin"]],
      ["employee", ["it_admin"]],
      ["employee", ["finance_admin"]],
      ["owner", []],
      ["firm_admin", []],
      ["contractor", []],
    ]
    for (const [role, fns] of cases) {
      const viaPolicy =
        (
          await counts({
            employeeId: MARCUS,
            role,
            functionalRoles: fns,
          })
        ).pay === 24
      const viaCan = can(ctx(role, fns), "compensation.read.all")
      expect(viaPolicy, `${role}+${fns.join("+") || "none"}`).toBe(viaCan)
    }
  })

  it("gives the same answer on who reads every employee", async () => {
    for (const [role, fns] of [
      ["employee", ["hr_admin"]],
      ["employee", ["payroll_admin"]],
      ["owner", []],
      ["firm_admin", []],
    ] as [string, string[]][]) {
      const viaPolicy =
        (
          await counts({
            employeeId: MARCUS,
            role,
            functionalRoles: fns,
          })
        ).employees === 12
      expect(viaPolicy, `${role}+${fns.join("+")}`).toBe(
        can(ctx(role, fns), "employee.read.all"),
      )
    }
  })
})

describe("tenant isolation still holds underneath", () => {
  it("shows nothing for another tenant, whatever the role", async () => {
    // RESTRICTIVE is AND-ed with tenant_isolation, so it can only narrow —
    // but a policy that accidentally widened would show here.
    const c = await counts({
      employeeId: MARCUS,
      role: "owner",
      tenantId: "00000000-0000-0000-0000-0000000000ff",
    })
    expect(c.employees).toBe(0)
    expect(c.pay).toBe(0)
  })
})

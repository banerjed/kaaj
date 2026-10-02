import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { can, type AuthContext } from "../auth/can"

/**
 * Who the database lets read and write messaging rows — asserted directly
 * as app_user, as the refused actor AND the permitted one (docs/37 §3). A
 * policy that admits nobody blanks the inbox rather than erroring (L21), so
 * the permitted half matters as much as the refused half.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
const DANA_CONTACT = "da1d1f9e-9d10-4d13-a3d9-b90f49903a13"
const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"

const sql = postgres(
  process.env.APP_DATABASE_URL ??
    "postgresql://app_user:app_user@127.0.0.1:54322/postgres",
  { max: 2, types: {}, onnotice: () => {} },
)

type Who = {
  employeeId?: string | null
  customerContactId?: string | null
  customerId?: string | null
  role?: string
  functionalRoles?: string[]
}

async function asRole<T>(
  who: Who,
  fn: (tx: postgres.Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({
      app_metadata: {
        tenant_id: NORTHWIND,
        employee_id: who.employeeId ?? null,
        customer_contact_id: who.customerContactId ?? null,
        customer_id: who.customerId ?? null,
        role: who.role ?? "employee",
        functional_roles: who.functionalRoles ?? [],
      },
    })}, true)`
    return fn(tx as unknown as postgres.Sql)
  }) as Promise<T>
}

type Counts = {
  endpoints: number
  threads: number
  messages: number
  optOuts: number
}

const counts = (who: Who) =>
  asRole(who, async (tx) => {
    const [r] = await tx<Counts[]>`
      SELECT (SELECT count(*)::int FROM messaging_endpoints) AS endpoints,
             (SELECT count(*)::int FROM messaging_conversations) AS threads,
             (SELECT count(*)::int FROM messaging_messages) AS messages,
             (SELECT count(*)::int FROM messaging_opt_outs) AS "optOuts"
    `
    return r
  })

const EVERYTHING: Counts = { endpoints: 3, threads: 3, messages: 6, optOuts: 2 }
const NOTHING: Counts = { endpoints: 0, threads: 0, messages: 0, optOuts: 0 }

/** Tries to open a thread; resolves to whether the database let the row in. Rolled back either way. */
async function canInsertThread(who: Who): Promise<boolean> {
  const marker = new Error("__rollback__")
  try {
    await asRole(who, async (tx) => {
      await tx`
        INSERT INTO messaging_conversations (
          tenant_id, channel, endpoint_id, counterparty_address, last_direction
        ) VALUES (
          ${NORTHWIND}::uuid, 'sms', 'f0000000-0000-4000-8000-000000000001'::uuid,
          '+15550009999', 'outbound'
        )
      `
      throw marker
    })
    return true
  } catch (e) {
    if (e === marker) return true
    if ((e as { code?: string }).code === "42501") return false
    throw e
  }
}

afterAll(async () => {
  await sql.end()
})

describe("messaging rows", () => {
  it("are invisible to an employee with no messaging role, and to a contractor", async () => {
    expect(await counts({ employeeId: MARCUS, role: "employee" })).toEqual(
      NOTHING,
    )
    expect(await counts({ employeeId: MARCUS, role: "contractor" })).toEqual(
      NOTHING,
    )
  })

  it("are invisible to HR, payroll, finance and IT — powerful elsewhere, not here", async () => {
    for (const role of [
      "hr_admin",
      "payroll_admin",
      "finance_admin",
      "it_admin",
    ]) {
      expect(
        await counts({
          employeeId: MARCUS,
          role: "employee",
          functionalRoles: [role],
        }),
        role,
      ).toEqual(NOTHING)
    }
  })

  it("are visible to sales, marketing, auditor, the firm's admins and the webhook's system claim", async () => {
    for (const fn of ["sales_admin", "marketing_admin", "auditor"]) {
      expect(
        await counts({
          employeeId: MARCUS,
          role: "employee",
          functionalRoles: [fn],
        }),
        fn,
      ).toEqual(EVERYTHING)
    }
    for (const role of ["owner", "firm_admin"]) {
      expect(await counts({ employeeId: MARCUS, role }), role).toEqual(
        EVERYTHING,
      )
    }
    expect(await counts({ employeeId: null, role: "system" })).toEqual(
      EVERYTHING,
    )
  })

  it("are invisible to a portal contact, even one whose own company is in the thread", async () => {
    expect(
      await counts({
        role: "customer",
        customerContactId: DANA_CONTACT,
        customerId: ACME,
      }),
    ).toEqual(NOTHING)
  })

  it("show nothing without a claim", async () => {
    expect(await counts({ employeeId: null, role: "" })).toEqual(NOTHING)
  })
})

describe("writing a thread", () => {
  it("is refused for auditor and for a plain employee, allowed for sales and the system claim", async () => {
    expect(
      await canInsertThread({
        employeeId: MARCUS,
        role: "employee",
        functionalRoles: ["auditor"],
      }),
    ).toBe(false)
    expect(
      await canInsertThread({ employeeId: MARCUS, role: "employee" }),
    ).toBe(false)
    expect(
      await canInsertThread({
        employeeId: MARCUS,
        role: "employee",
        functionalRoles: ["sales_admin"],
      }),
    ).toBe(true)
    expect(await canInsertThread({ employeeId: null, role: "system" })).toBe(
      true,
    )
  })
})

describe("RLS and can() agree on messaging", () => {
  const ctx = (role: string, functionalRoles: string[] = []): AuthContext => ({
    tenantId: NORTHWIND,
    userId: "00000000-0000-0000-0000-000000000001",
    employeeId: MARCUS,
    customerContactId: null,
    customerId: null,
    role: role as AuthContext["role"],
    functionalRoles,
  })

  it("for every base and functional role", async () => {
    const cases: [string, string[]][] = [
      ["employee", []],
      ["contractor", []],
      ["employee", ["hr_admin"]],
      ["employee", ["finance_admin"]],
      ["employee", ["sales_admin"]],
      ["employee", ["marketing_admin"]],
      ["employee", ["auditor"]],
      ["firm_admin", []],
      ["owner", []],
    ]
    for (const [role, fns] of cases) {
      const seen =
        (await counts({ employeeId: MARCUS, role, functionalRoles: fns }))
          .threads > 0
      expect(seen, `${role}+${fns.join("+")} read`).toBe(
        can(ctx(role, fns), "messaging.read"),
      )
      const wrote = await canInsertThread({
        employeeId: MARCUS,
        role,
        functionalRoles: fns,
      })
      expect(wrote, `${role}+${fns.join("+")} write`).toBe(
        can(ctx(role, fns), "messaging.write"),
      )
    }
  })
})

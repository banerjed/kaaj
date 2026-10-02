import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"

/**
 * The payroll export tables' RESTRICTIVE write policies, watched FAILING
 * for the roles they refuse — as `app_user`, directly against the database.
 * verify-rls.sql only SELECTs, so without this a DROP/CREATE that loses
 * `AS RESTRICTIVE` (L63) would pass ./check and let HR bind provider ids.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
/** Nobody in the fixture has a Gusto id, so an insert here collides with nothing. */
const PROVIDER = "gusto"

const sql = postgres(
  process.env.APP_DATABASE_URL ??
    "postgresql://app_user:app_user@127.0.0.1:54322/postgres",
  { max: 2, types: {}, onnotice: () => {} },
)

type Who = { role: string; functionalRoles?: string[] }

/** Runs `fn` as the role, then rolls back. Resolves to whether the write was let through. */
async function tryWrite(
  who: Who,
  fn: (tx: postgres.Sql) => Promise<unknown>,
): Promise<boolean> {
  const marker = new Error("__rollback__")
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({
        app_metadata: {
          tenant_id: NORTHWIND,
          employee_id: MARCUS,
          role: who.role,
          functional_roles: who.functionalRoles ?? [],
        },
      })}, true)`
      await fn(tx as unknown as postgres.Sql)
      throw marker
    })
    return true
  } catch (e) {
    if (e === marker) return true
    if ((e as { code?: string }).code === "42501") return false
    throw e
  }
}

const insertId = (tx: postgres.Sql) =>
  tx`
    INSERT INTO payroll_employee_ids (tenant_id, employee_id, provider, external_id)
    VALUES (${NORTHWIND}::uuid, ${MARCUS}::uuid, ${PROVIDER}, 'G-900')
  `

/** An UPDATE a policy hides reports 0 rows, never an error (L95) — so count. */
async function updatesSettings(who: Who): Promise<number> {
  let n = -1
  await tryWrite(who, async (tx) => {
    const rows = await tx`
      UPDATE payroll_export_settings SET company_code = 'R9ZZZ'
       WHERE tenant_id = ${NORTHWIND}::uuid
      RETURNING tenant_id
    `
    n = rows.length
  })
  return n
}

afterAll(async () => {
  await sql.end()
})

describe("payroll export write policies", () => {
  it("refuse an employee, HR and finance — each can read elsewhere, none may bind a payroll id", async () => {
    expect(await tryWrite({ role: "employee" }, insertId)).toBe(false)
    expect(
      await tryWrite(
        { role: "employee", functionalRoles: ["hr_admin"] },
        insertId,
      ),
    ).toBe(false)
    expect(
      await tryWrite(
        { role: "employee", functionalRoles: ["finance_admin"] },
        insertId,
      ),
    ).toBe(false)
    expect(
      await updatesSettings({
        role: "employee",
        functionalRoles: ["hr_admin"],
      }),
    ).toBe(0)
  })

  it("admit payroll, firm_admin and owner", async () => {
    expect(
      await tryWrite(
        { role: "employee", functionalRoles: ["payroll_admin"] },
        insertId,
      ),
    ).toBe(true)
    expect(await tryWrite({ role: "firm_admin" }, insertId)).toBe(true)
    expect(await tryWrite({ role: "owner" }, insertId)).toBe(true)
    expect(
      await updatesSettings({
        role: "employee",
        functionalRoles: ["payroll_admin"],
      }),
    ).toBe(1)
  })
})

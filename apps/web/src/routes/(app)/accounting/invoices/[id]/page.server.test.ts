import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "$lib/server/db/client"
import { withTenant } from "$lib/server/db/tenant"
import { actions } from "./+page.server"

/**
 * `emailInvoice` opens its own `withTenant` transaction (same shape as
 * every other action here), so it cannot run inside `inRollback`'s wrapper —
 * the "no email on file" case instead toggles the real fixture row and
 * restores it in `finally`, a real committed mutation kept as narrow and
 * short-lived as the Storage tests' own cleanup discipline.
 *
 * No `PRIVATE_RESEND_API_KEY` is configured in this environment (matching
 * `mailer.test.ts`'s own "not configured" case) — real sends aren't
 * exercised here either, only that the action reaches that honest refusal
 * rather than reporting success.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
const INV_2026_001 = "c72699f8-700c-5760-a8e8-19ae6dfd53c5"
const INV_2026_003_DRAFT = "bee0d3ca-72f7-5ba2-9a31-3bbf17daf320"

const NEVER_CALLED = {
  storage: {
    from() {
      throw new Error("must not reach Storage when there is no logo set")
    },
  },
} as unknown as App.Locals["supabase"]

function locals(supabase: App.Locals["supabase"]) {
  return {
    tenantId: NORTHWIND,
    tenantRole: "owner",
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
    user: { id: "00000000-0000-0000-0000-000000000000" },
    supabase,
  } as unknown as App.Locals
}

afterAll(async () => {
  await closeConnections()
})

describe("emailInvoice (US-ACC-008)", () => {
  it("refuses a draft invoice — nothing has been issued yet", async () => {
    const result = (await actions.emailInvoice({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_003_DRAFT },
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["invoice"])
  })

  it("refuses when the customer has no email on file", async () => {
    await withTenant(
      {
        tenantId: NORTHWIND,
        role: "owner",
        functionalRoles: [],
        employeeId: null,
      },
      (tx) => tx`UPDATE customers SET email = NULL WHERE id = ${ACME}::uuid`,
    )
    try {
      const result = (await actions.emailInvoice({
        locals: locals(NEVER_CALLED),
        params: { id: INV_2026_001 },
      } as never)) as { status: number; data: { errorFields: string[] } }
      expect(result.status).toBe(400)
      expect(result.data.errorFields).toEqual(["invoice"])
    } finally {
      await withTenant(
        {
          tenantId: NORTHWIND,
          role: "owner",
          functionalRoles: [],
          employeeId: null,
        },
        (tx) =>
          tx`UPDATE customers SET email = 'ap@acme.example' WHERE id = ${ACME}::uuid`,
      )
    }
  })

  it("reaches an honest not_configured refusal rather than reporting a real send", async () => {
    const result = (await actions.emailInvoice({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_001 },
    } as never)) as { status: number; data: { message: string } }
    expect(result.status).toBe(400)
    expect(result.data.message).toContain("not_configured")
  })
})

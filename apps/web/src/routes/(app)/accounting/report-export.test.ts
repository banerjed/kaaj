import { afterAll, describe, expect, it } from "vitest"
import { isHttpError } from "@sveltejs/kit"
import { closeConnections } from "$lib/server/db/client"
import { GET as trialBalanceExport } from "./trial-balance/export/+server"
import { GET as balanceSheetExport } from "./balance-sheet/export/+server"
import { GET as profitLossExport } from "./profit-loss/export/+server"
import { GET as cashFlowExport } from "./cash-flow/export/+server"
import { GET as arAgingExport } from "./ar-aging/export/+server"
import { GET as apDueSoonExport } from "./ap-due-soon/export/+server"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"

function ownerLocals() {
  return {
    tenantId: NORTHWIND,
    tenantRole: "owner",
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
    user: { id: "00000000-0000-0000-0000-000000000000" },
  } as unknown as App.Locals
}

// An employee with no accounting functional role — the actor every one of
// these routes must refuse, per "test as the actor meant to be REFUSED".
function refusedLocals() {
  return {
    tenantId: NORTHWIND,
    tenantRole: "member",
    functionalRoles: [] as string[],
    employeeId: "11111111-1111-1111-1111-111111111111",
    customerContactId: null,
    customerId: null,
    user: { id: "11111111-1111-1111-1111-111111111111" },
  } as unknown as App.Locals
}

// A portal contact — not a firm member at all. A `+server.ts` under `(app)`
// runs no `+layout.server.ts`, so the layout's own `tenantRole === "customer"`
// redirect never applies here; `can()` in the route is the ENTIRE defence,
// unlike a page where the layout gate is a second, redundant line of
// protection for the same identity.
function customerLocals() {
  return {
    tenantId: NORTHWIND,
    tenantRole: "customer",
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: "22222222-2222-2222-2222-222222222222",
    customerId: "33333333-3333-3333-3333-333333333333",
    user: { id: "22222222-2222-2222-2222-222222222222" },
  } as unknown as App.Locals
}

afterAll(async () => {
  await closeConnections()
})

async function textOf(response: Response): Promise<string> {
  return response.text()
}

/** The status and message a route's own `error()` threw — never just "it
 *  threw," which would also pass for an unrelated crash (L48: a guard
 *  never observed failing with its OWN shape is not evidence it's the
 *  guard that fired). */
async function refusal(
  call: () => unknown,
): Promise<{ status: number; message: string }> {
  try {
    await call()
  } catch (e) {
    if (isHttpError(e)) {
      return {
        status: e.status,
        message: (e.body as { message: string }).message,
      }
    }
    throw e
  }
  throw new Error("expected a refusal, but the call succeeded")
}

describe("report CSV export (US-ACC-045)", () => {
  it("trial balance: refuses an actor without accounting.read, and exports a real CSV for an owner", async () => {
    const employeeRefusal = await refusal(() =>
      trialBalanceExport({
        locals: refusedLocals(),
        url: new URL("http://x/accounting/trial-balance/export"),
      } as never),
    )
    expect(employeeRefusal.status).toBe(403)

    // A portal contact — the identity this codebase most deliberately keeps
    // out of the firm's own accounting, and the one actor a page's
    // `+layout.server.ts` gate would normally also catch, which no
    // `+server.ts` route runs.
    const customerRefusal = await refusal(() =>
      trialBalanceExport({
        locals: customerLocals(),
        url: new URL("http://x/accounting/trial-balance/export"),
      } as never),
    )
    expect(customerRefusal.status).toBe(403)

    const res = await trialBalanceExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/trial-balance/export"),
    } as never)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toContain(
      "trial-balance.csv",
    )
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Account Code,Account Name,Account Type,Debits (USD),Credits (USD)",
    )
    expect(csv).toContain("TOTAL")
  })

  it("balance sheet exports a real CSV with a currency-labeled amount column", async () => {
    const res = await balanceSheetExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/balance-sheet/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Account Code,Account Name,Account Type,Amount (USD)",
    )
    expect(csv).toContain("TOTAL ASSETS")
  })

  it("profit and loss exports revenue/expense rows plus a net income summary", async () => {
    const res = await profitLossExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/profit-loss/export"),
    } as never)
    const csv = await textOf(res)
    // The fixture's net income is genuinely negative (expenses > revenue) —
    // this is the real value flowing through toCsv()'s post-`-` escape
    // regex, not a hand-built string, so a leading "-" money value that
    // reaches the CSV layer through the actual report path stays unescaped.
    expect(csv).toContain("\r\n,NET INCOME,,-56920.00\r\n")
  })

  it("cash flow exports the reconciling rows plus an ending-cash summary", async () => {
    const res = await cashFlowExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/cash-flow/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv).toContain("ENDING CASH")
  })

  it("AR aging exports one row per customer/currency, no row cap applied", async () => {
    const res = await arAgingExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/ar-aging/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Customer,Currency,Current,1-30 Days,31-60 Days,61-90 Days,90+ Days,Total",
    )
  })

  it("AP due soon exports bills within the window, filtered the same way load() filters", async () => {
    const res = await apDueSoonExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/ap-due-soon/export?within_days=30"),
    } as never)
    expect(res.headers.get("Content-Disposition")).toContain("30d.csv")
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Bill Number,Vendor,Currency,Due Date,Days Until Due,Amount Due",
    )
  })

  it("a bad as_of date is refused with a 400, same message as the screen's own load()", async () => {
    const { status, message } = await refusal(() =>
      trialBalanceExport({
        locals: ownerLocals(),
        url: new URL(
          "http://x/accounting/trial-balance/export?as_of=not-a-date",
        ),
      } as never),
    )
    expect(status).toBe(400)
    expect(message).toBe("That date is not a real date.")
  })
})

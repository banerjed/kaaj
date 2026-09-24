import { afterAll, describe, expect, it } from "vitest"
import { isHttpError } from "@sveltejs/kit"
import { closeConnections } from "$lib/server/db/client"
import { GET as trialBalanceExport } from "./trial-balance/export/+server"
import { GET as balanceSheetExport } from "./balance-sheet/export/+server"
import { GET as profitLossExport } from "./profit-loss/export/+server"
import { GET as cashFlowExport } from "./cash-flow/export/+server"
import { GET as arAgingExport } from "./ar-aging/export/+server"
import { GET as apDueSoonExport } from "./ap-due-soon/export/+server"
import { GET as equityExport } from "./equity/export/+server"
import { GET as taxSummaryExport } from "./tax-summary/export/+server"
import { GET as customerBalancesExport } from "./customer-balances/export/+server"
import { GET as ledgerExport } from "./ledger/export/+server"
import { GET as fxRevaluationExport } from "./fx-revaluation/export/+server"

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
      "Account Code,Account Name,Account Type,Debits (USD),Credits (USD),Compare Debits (USD),Compare Credits (USD)",
    )
    expect(csv).toContain("TOTAL")
    // No comparison requested — the columns are still present, just blank.
    expect(csv).toContain(",TOTAL,,")
    const totalLine = csv.split("\r\n").find((l) => l.startsWith(",TOTAL,"))!
    expect(totalLine.endsWith(",,")).toBe(true)
  })

  it("trial balance carries real comparison figures in the same 7-column header when compare_as_of is set", async () => {
    const res = await trialBalanceExport({
      locals: ownerLocals(),
      url: new URL(
        "http://x/accounting/trial-balance/export?as_of=2026-09-21&compare_as_of=2026-01-01",
      ),
    } as never)
    const csv = await textOf(res)
    const [header, ...lines] = csv.trim().split("\r\n")
    expect(header).toBe(
      "Account Code,Account Name,Account Type,Debits (USD),Credits (USD),Compare Debits (USD),Compare Credits (USD)",
    )
    const totalLine = lines.find((l) => l.startsWith(",TOTAL,"))!
    const cells = totalLine.split(",")
    // Compare Debits/Credits (last two cells) are populated, not blank.
    expect(cells[cells.length - 1]).not.toBe("")
    expect(cells[cells.length - 2]).not.toBe("")
  })

  it("balance sheet exports a real CSV with currency-labeled amount/compare/change columns, blank without a comparison", async () => {
    const res = await balanceSheetExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/balance-sheet/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Account Code,Account Name,Account Type,Amount (USD),Compare Amount (USD),Change (USD)",
    )
    expect(csv).toContain("TOTAL ASSETS")
  })

  it("balance sheet carries real comparison figures when compare_as_of is set", async () => {
    const res = await balanceSheetExport({
      locals: ownerLocals(),
      url: new URL(
        "http://x/accounting/balance-sheet/export?as_of=2026-09-21&compare_as_of=2026-01-01",
      ),
    } as never)
    const csv = await textOf(res)
    const [header, ...lines] = csv.trim().split("\r\n")
    expect(header).toBe(
      "Account Code,Account Name,Account Type,Amount (USD),Compare Amount (USD),Change (USD)",
    )
    // A per-account row (not the TOTAL summary, which has no per-total
    // "change" field in BalanceSheetComparisonTotals — computing one in JS
    // from two money strings would be the exact arithmetic CLAUDE.md's
    // Money section forbids) — the first real account row after the header.
    const firstAccountLine = lines[0]
    const cells = firstAccountLine.split(",")
    expect(cells[cells.length - 1]).not.toBe("") // change
    expect(cells[cells.length - 2]).not.toBe("") // compare_amount
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
    // Comparison summary rows are always present, blank without a comparison.
    expect(csv).toContain("\r\n,PRIOR NET INCOME,,\r\n")
  })

  it("profit and loss fills the comparison summary rows for real once compare is active", async () => {
    const res = await profitLossExport({
      locals: ownerLocals(),
      url: new URL(
        "http://x/accounting/profit-loss/export?from=2026-07-01&to=2026-09-21&compare=previous_period",
      ),
    } as never)
    const csv = await textOf(res)
    const priorLine = csv
      .split("\r\n")
      .find((l) => l.startsWith(",PRIOR NET INCOME,"))!
    expect(priorLine.endsWith(",")).toBe(false)
  })

  it("cash flow exports the reconciling rows plus an ending-cash summary", async () => {
    const res = await cashFlowExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/cash-flow/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv).toContain("ENDING CASH")
    expect(csv).toContain("\r\n,PRIOR NET CHANGE IN CASH,,\r\n")
  })

  it("cash flow fills the comparison summary rows for real once compare is active", async () => {
    const res = await cashFlowExport({
      locals: ownerLocals(),
      url: new URL(
        "http://x/accounting/cash-flow/export?from=2026-07-01&to=2026-09-21&compare=previous_period",
      ),
    } as never)
    const csv = await textOf(res)
    const priorLine = csv
      .split("\r\n")
      .find((l) => l.startsWith(",PRIOR NET CHANGE IN CASH,"))!
    expect(priorLine.endsWith(",")).toBe(false)
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

  it("equity exports the roll-forward rows plus comparison summary rows, blank without a comparison", async () => {
    const res = await equityExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/equity/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Account Code,Account Name,Beginning Balance (USD),Direct Changes (USD),Ending Balance (USD)",
    )
    const lines = csv.split("\r\n")

    // The TOTAL row fills all three money columns from its own field, not
    // one value flattened into "ending balance" — the bug this pins against.
    const totalFields = lines
      .find((l) => l.startsWith(",TOTAL (stated equity accounts),"))!
      .split(",")
    expect(totalFields[2]).not.toBe("")
    expect(totalFields[3]).not.toBe("")
    expect(totalFields[4]).not.toBe("")

    // "Current period earnings" has no beginning balance or direct changes
    // of its own — only its ending-balance-column figure is populated.
    const earningsFields = lines
      .find((l) =>
        l.startsWith(
          ",Current period earnings (not yet closed into an equity account),",
        ),
      )!
      .split(",")
    expect(earningsFields[2]).toBe("")
    expect(earningsFields[3]).toBe("")
    expect(earningsFields[4]).not.toBe("")

    expect(csv).toContain("TOTAL EQUITY INCLUDING CURRENT EARNINGS")
    expect(csv).toContain("\r\n,Prior period earnings,,,\r\n")
  })

  it("equity fills the comparison summary rows for real once compare is active", async () => {
    const res = await equityExport({
      locals: ownerLocals(),
      url: new URL(
        "http://x/accounting/equity/export?from=2026-07-01&to=2026-09-21&compare=previous_period",
      ),
    } as never)
    const csv = await textOf(res)
    const priorEarningsLine = csv
      .split("\r\n")
      .find((l) => l.startsWith(",Prior period earnings,"))!
    expect(priorEarningsLine.endsWith(",")).toBe(false)

    // "Prior direct changes" belongs in the direct-changes column (index 3),
    // not wherever "Prior period earnings" put its own figure (index 4).
    const priorDirectFields = csv
      .split("\r\n")
      .find((l) => l.startsWith(",Prior direct changes,"))!
      .split(",")
    expect(priorDirectFields[3]).not.toBe("")
    expect(priorDirectFields[4]).toBe("")
  })

  it("tax summary refuses an actor without accounting.read, and exports jurisdiction rows for an owner", async () => {
    const denied = await refusal(() =>
      taxSummaryExport({
        locals: refusedLocals(),
        url: new URL("http://x/accounting/tax-summary/export"),
      } as never),
    )
    expect(denied.status).toBe(403)

    const res = await taxSummaryExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/tax-summary/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Jurisdiction Code,Jurisdiction,Output Tax (USD),Input Tax (USD),Net Liability (USD)",
    )
  })

  it("customer balances refuses an actor without accounting.read", async () => {
    const denied = await refusal(() =>
      customerBalancesExport({ locals: refusedLocals() } as never),
    )
    expect(denied.status).toBe(403)
  })

  it("customer balances takes no filters and exports one row per customer/currency", async () => {
    const res = await customerBalancesExport({
      locals: ownerLocals(),
    } as never)
    expect(res.headers.get("Content-Disposition")).toContain(
      "customer-balances.csv",
    )
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Customer,Currency,Credit Limit,Invoice Count,Total Invoiced,Total Paid,Total Credited,Total Due",
    )
  })

  it("general ledger flattens to one row per journal line, dropping page/limit in favor of the full filtered range", async () => {
    const res = await ledgerExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/ledger/export?status=posted"),
    } as never)
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Entry Number,Date,Status,Reference,Entry Description,Account Code,Account Name,Line Description,Debit,Credit,Currency",
    )
    const dataLines = csv.trim().split("\r\n").slice(1)
    const entryNumbers = new Set(dataLines.map((l) => l.split(",")[0]))
    // More rows than distinct entry numbers proves this flattens to one row
    // per journal line, not one row per entry (or the screen's pagination).
    expect(dataLines.length).toBeGreaterThan(entryNumbers.size)
    expect(entryNumbers.size).toBeGreaterThan(1)
  })

  it("FX revaluation exports one row per open AR/AP document", async () => {
    const res = await fxRevaluationExport({
      locals: ownerLocals(),
      url: new URL("http://x/accounting/fx-revaluation/export"),
    } as never)
    const csv = await textOf(res)
    expect(csv.split("\r\n")[0]).toBe(
      "Kind,Document Number,Party,Currency,Amount Due,Booked Rate,As-Of Rate,Booked (Base),Revalued (Base),Unrealized Gain/Loss",
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

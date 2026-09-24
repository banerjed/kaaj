import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parsePeriodFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { CashFlowAdjustmentRow } from "$lib/server/accounting/accounting.repo"

type Row =
  | CashFlowAdjustmentRow
  | {
      account_code: string
      account_name: string
      account_type: string
      amount: string
    }

/**
 * Same filter parsing as cash-flow's own `load()`, and the same
 * hand-verified `can()` gate note as trial-balance/export/+server.ts.
 *
 * No per-account comparison breakdown server-side — same reasoning as
 * profit-loss/export/+server.ts. The comparison summary rows below are
 * always appended, blank when no comparison is active.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the cash flow statement.")
  }

  const { from, to, compare } = parsePeriodFilters(url)
  const filters = { from, to }

  const { rows, currency } = await withTenant(actorFrom(locals), async (tx) => {
    const [plainRows, totals, currency] = await Promise.all([
      acc.cashFlowStatement(tx, filters),
      acc.cashFlowTotals(tx, filters),
      acc.tenantBaseCurrency(tx, locals.tenantId!),
    ])
    const comparison =
      compare !== "none" && from && to
        ? await acc.cashFlowComparison(tx, { from, to, compareTo: compare })
        : null

    const summary = (name: string, amount: string): Row => ({
      account_code: "",
      account_name: name,
      account_type: "",
      amount,
    })
    const rows: Row[] = [
      ...plainRows,
      summary("Net income", totals.net_income),
      summary("Working capital change", totals.working_capital_change),
      summary("OPERATING CASH FLOW", totals.operating_cash_flow),
      summary("Investing cash flow", totals.investing_cash_flow),
      summary("Financing cash flow", totals.financing_cash_flow),
      summary("NET CHANGE IN CASH", totals.net_change_in_cash),
      summary("Beginning cash", totals.beginning_cash),
      summary("ENDING CASH", totals.ending_cash),
      summary(
        "PRIOR OPERATING CASH FLOW",
        comparison?.prior_operating_cash_flow ?? "",
      ),
      summary(
        "PRIOR FINANCING CASH FLOW",
        comparison?.prior_financing_cash_flow ?? "",
      ),
      summary(
        "PRIOR NET CHANGE IN CASH",
        comparison?.prior_net_change_in_cash ?? "",
      ),
      summary(
        "OPERATING CASH FLOW CHANGE",
        comparison?.operating_cash_flow_change ?? "",
      ),
      summary(
        "FINANCING CASH FLOW CHANGE",
        comparison?.financing_cash_flow_change ?? "",
      ),
      summary(
        "NET CHANGE IN CASH — CHANGE",
        comparison?.net_change_in_cash_change ?? "",
      ),
    ]
    return { rows, currency }
  })

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    { header: "Account Type", value: (r) => r.account_type },
    { header: `Cash Impact (${currency})`, value: (r) => r.amount },
  ]

  const range = from || to ? `-${from || "start"}-to-${to || "now"}` : ""
  return csvResponse(`cash-flow${range}.csv`, toCsv(columns, rows))
}

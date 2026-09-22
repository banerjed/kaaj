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

/** Same filter parsing as cash-flow's own `load()`, and the same
 *  hand-verified `can()` gate note as trial-balance/export/+server.ts. */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the cash flow statement.")
  }

  const { from, to } = parsePeriodFilters(url)
  const filters = { from, to }

  const { rows, totals, currency } = await withTenant(
    actorFrom(locals),
    async (tx) => ({
      rows: await acc.cashFlowStatement(tx, filters),
      totals: await acc.cashFlowTotals(tx, filters),
      currency: await acc.tenantBaseCurrency(tx, locals.tenantId!),
    }),
  )

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    { header: "Account Type", value: (r) => r.account_type },
    { header: `Cash Impact (${currency})`, value: (r) => r.amount },
  ]
  const summary = (name: string, amount: string): Row => ({
    account_code: "",
    account_name: name,
    account_type: "",
    amount,
  })
  const allRows: Row[] = [
    ...rows,
    summary("Net income", totals.net_income),
    summary("Working capital change", totals.working_capital_change),
    summary("OPERATING CASH FLOW", totals.operating_cash_flow),
    summary("Investing cash flow", totals.investing_cash_flow),
    summary("Financing cash flow", totals.financing_cash_flow),
    summary("NET CHANGE IN CASH", totals.net_change_in_cash),
    summary("Beginning cash", totals.beginning_cash),
    summary("ENDING CASH", totals.ending_cash),
  ]

  const range = from || to ? `-${from || "start"}-to-${to || "now"}` : ""
  return csvResponse(`cash-flow${range}.csv`, toCsv(columns, allRows))
}

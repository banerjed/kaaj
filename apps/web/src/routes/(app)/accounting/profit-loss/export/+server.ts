import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parsePeriodFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { ProfitAndLossRow } from "$lib/server/accounting/accounting.repo"

type Row =
  | ProfitAndLossRow
  | {
      account_code: string
      account_name: string
      account_type: string
      amount: string
    }

/**
 * Same filter parsing as profit-loss's own `load()`, and the same
 * hand-verified `can()` gate note as trial-balance/export/+server.ts.
 *
 * Unlike trial-balance/balance-sheet, there is no per-account comparison
 * breakdown server-side — `profitAndLossComparison()` returns period TOTALS
 * only, the same shape the screen's own comparison table shows. The six
 * comparison summary rows below are always appended (blank when `compare`
 * is "none" or the range is open), so the file's row set is stable across
 * queries the same way trial-balance's columns are.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the profit and loss statement.")
  }

  const { from, to, compare } = parsePeriodFilters(url)
  const filters = { from, to }

  const { rows, currency } = await withTenant(actorFrom(locals), async (tx) => {
    const [plainRows, totals, currency] = await Promise.all([
      acc.profitAndLoss(tx, filters),
      acc.profitAndLossTotals(tx, filters),
      acc.tenantBaseCurrency(tx, locals.tenantId!),
    ])
    const comparison =
      compare !== "none" && from && to
        ? await acc.profitAndLossComparison(tx, {
            from,
            to,
            compareTo: compare,
          })
        : null

    const summary = (name: string, amount: string): Row => ({
      account_code: "",
      account_name: name,
      account_type: "",
      amount,
    })
    const rows: Row[] = [
      ...plainRows,
      summary("TOTAL REVENUE", totals.revenue),
      summary("TOTAL EXPENSES", totals.expenses),
      summary("NET INCOME", totals.net_income),
      summary("PRIOR REVENUE", comparison?.prior_revenue ?? ""),
      summary("PRIOR EXPENSES", comparison?.prior_expenses ?? ""),
      summary("PRIOR NET INCOME", comparison?.prior_net_income ?? ""),
      summary("REVENUE CHANGE", comparison?.revenue_change ?? ""),
      summary("EXPENSES CHANGE", comparison?.expenses_change ?? ""),
      summary("NET INCOME CHANGE", comparison?.net_income_change ?? ""),
    ]
    return { rows, currency }
  })

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    { header: "Account Type", value: (r) => r.account_type },
    { header: `Amount (${currency})`, value: (r) => r.amount },
  ]

  const range = from || to ? `-${from || "start"}-to-${to || "now"}` : ""
  return csvResponse(`profit-loss${range}.csv`, toCsv(columns, rows))
}

import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfCompareFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { BalanceSheetRow } from "$lib/server/accounting/accounting.repo"

type Row =
  | BalanceSheetRow
  | {
      account_code: string
      account_name: string
      account_type: string
      amount: string
    }

/** Same filter parsing as balance-sheet's own `load()`, and the same
 *  hand-verified `can()` gate note as trial-balance/export/+server.ts. */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the balance sheet.")
  }

  const { asOf } = parseAsOfCompareFilters(url)

  const { rows, totals, currency } = await withTenant(
    actorFrom(locals),
    async (tx) => ({
      rows: await acc.balanceSheet(tx, { asOf }),
      totals: await acc.balanceSheetTotals(tx, { asOf }),
      currency: await acc.tenantBaseCurrency(tx, locals.tenantId!),
    }),
  )

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    { header: "Account Type", value: (r) => r.account_type },
    { header: `Amount (${currency})`, value: (r) => r.amount },
  ]
  const summary = (name: string, amount: string): Row => ({
    account_code: "",
    account_name: name,
    account_type: "",
    amount,
  })
  const allRows: Row[] = [
    ...rows,
    summary("TOTAL ASSETS", totals.assets),
    summary("TOTAL LIABILITIES", totals.liabilities),
    summary("Equity (excl. current net income)", totals.equity),
    summary("Net income (undistributed)", totals.net_income),
    summary("TOTAL EQUITY", totals.total_equity),
    summary("TOTAL LIABILITIES + EQUITY", totals.total_liabilities_and_equity),
  ]

  return csvResponse(
    `balance-sheet${asOf ? `-${asOf}` : ""}.csv`,
    toCsv(columns, allRows),
  )
}

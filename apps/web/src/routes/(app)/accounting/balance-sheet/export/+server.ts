import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfCompareFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"

type Row = {
  account_code: string
  account_name: string
  account_type: string
  amount: string
  compare_amount: string
  change: string
}

/** Same filter parsing as balance-sheet's own `load()`, and the same
 *  hand-verified `can()` gate note as trial-balance/export/+server.ts. The
 *  comparison columns are always present, blank when no `compare_as_of` is
 *  given — see trial-balance/export/+server.ts for why (one stable header,
 *  not a column count that varies by query). */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the balance sheet.")
  }

  const { asOf, compareAsOf } = parseAsOfCompareFilters(url)

  const { rows, currency } = await withTenant(actorFrom(locals), async (tx) => {
    const currency = await acc.tenantBaseCurrency(tx, locals.tenantId!)
    const summary = (
      name: string,
      amount: string,
      compare = "",
      change = "",
    ): Row => ({
      account_code: "",
      account_name: name,
      account_type: "",
      amount,
      compare_amount: compare,
      change,
    })
    if (asOf && compareAsOf) {
      const [compRows, t] = await Promise.all([
        acc.balanceSheetComparison(tx, { asOf, compareAsOf }),
        acc.balanceSheetComparisonTotals(tx, { asOf, compareAsOf }),
      ])
      const rows: Row[] = [
        ...compRows,
        summary("TOTAL ASSETS", t.assets, t.compare_assets),
        summary("TOTAL LIABILITIES", t.liabilities, t.compare_liabilities),
        summary(
          "Equity (excl. current net income)",
          t.equity,
          t.compare_equity,
        ),
        summary(
          "Net income (undistributed)",
          t.net_income,
          t.compare_net_income,
        ),
        summary("TOTAL EQUITY", t.total_equity, t.compare_total_equity),
        summary(
          "TOTAL LIABILITIES + EQUITY",
          t.total_liabilities_and_equity,
          t.compare_total_liabilities_and_equity,
        ),
      ]
      return { rows, currency }
    }
    const [plainRows, t] = await Promise.all([
      acc.balanceSheet(tx, { asOf }),
      acc.balanceSheetTotals(tx, { asOf }),
    ])
    const rows: Row[] = [
      ...plainRows.map((r) => ({ ...r, compare_amount: "", change: "" })),
      summary("TOTAL ASSETS", t.assets),
      summary("TOTAL LIABILITIES", t.liabilities),
      summary("Equity (excl. current net income)", t.equity),
      summary("Net income (undistributed)", t.net_income),
      summary("TOTAL EQUITY", t.total_equity),
      summary("TOTAL LIABILITIES + EQUITY", t.total_liabilities_and_equity),
    ]
    return { rows, currency }
  })

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    { header: "Account Type", value: (r) => r.account_type },
    { header: `Amount (${currency})`, value: (r) => r.amount },
    { header: `Compare Amount (${currency})`, value: (r) => r.compare_amount },
    { header: `Change (${currency})`, value: (r) => r.change },
  ]

  const suffix = compareAsOf
    ? `-${asOf}-vs-${compareAsOf}`
    : asOf
      ? `-${asOf}`
      : ""
  return csvResponse(`balance-sheet${suffix}.csv`, toCsv(columns, rows))
}

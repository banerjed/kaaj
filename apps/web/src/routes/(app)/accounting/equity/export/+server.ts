import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parsePeriodFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { EquityStatementRow } from "$lib/server/accounting/accounting.repo"

type Row =
  | EquityStatementRow
  | {
      account_code: string
      account_name: string
      beginning_balance: string
      direct_changes: string
      ending_balance: string
    }

/**
 * Same filter parsing as equity's own `load()`, and the same hand-verified
 * `can()` gate note as trial-balance/export/+server.ts. No per-account
 * comparison breakdown server-side — `equityComparison()` returns period
 * TOTALS only, same shape as profit-loss/cash-flow's own comparison. Built
 * with the comparison summary rows from the start, unlike the other four
 * reports where this had to be retrofitted.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the statement of changes in equity.")
  }

  const { from, to, compare } = parsePeriodFilters(url)
  const filters = { from, to }

  const { rows, currency } = await withTenant(actorFrom(locals), async (tx) => {
    const [plainRows, totals, currency] = await Promise.all([
      acc.equityStatement(tx, filters),
      acc.equityStatementTotals(tx, filters),
      acc.tenantBaseCurrency(tx, locals.tenantId!),
    ])
    const comparison =
      compare !== "none" && from && to
        ? await acc.equityComparison(tx, { from, to, compareTo: compare })
        : null

    const summary = (
      name: string,
      fields: Partial<
        Pick<Row, "beginning_balance" | "direct_changes" | "ending_balance">
      >,
    ): Row => ({
      account_code: "",
      account_name: name,
      beginning_balance: fields.beginning_balance ?? "",
      direct_changes: fields.direct_changes ?? "",
      ending_balance: fields.ending_balance ?? "",
    })
    // Each summary row fills only the column(s) it actually has a value for,
    // matching the screen's own layout — a beginning/direct/ending figure
    // never gets flattened into a single "amount" column the way profit-loss
    // and cash-flow's summary rows do, because that would put a beginning
    // balance under the "Ending Balance" header.
    const rows: Row[] = [
      ...plainRows,
      summary("TOTAL (stated equity accounts)", {
        beginning_balance: totals.beginning_equity,
        direct_changes: totals.direct_changes,
        ending_balance: totals.ending_equity,
      }),
      summary(
        "Current period earnings (not yet closed into an equity account)",
        {
          ending_balance: totals.net_income,
        },
      ),
      summary("TOTAL EQUITY INCLUDING CURRENT EARNINGS", {
        ending_balance: totals.ending_equity_including_current_earnings,
      }),
      summary("Prior direct changes", {
        direct_changes: comparison?.prior_direct_changes ?? "",
      }),
      summary("Prior period earnings", {
        ending_balance: comparison?.prior_net_income ?? "",
      }),
      summary("Direct changes — change", {
        direct_changes: comparison?.direct_changes_change ?? "",
      }),
      summary("Net income — change", {
        ending_balance: comparison?.net_income_change ?? "",
      }),
    ]
    return { rows, currency }
  })

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    {
      header: `Beginning Balance (${currency})`,
      value: (r) => r.beginning_balance,
    },
    { header: `Direct Changes (${currency})`, value: (r) => r.direct_changes },
    { header: `Ending Balance (${currency})`, value: (r) => r.ending_balance },
  ]

  const range = from || to ? `-${from || "start"}-to-${to || "now"}` : ""
  return csvResponse(`equity${range}.csv`, toCsv(columns, rows))
}

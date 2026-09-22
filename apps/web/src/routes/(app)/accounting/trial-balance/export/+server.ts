import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfCompareFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { TrialBalanceRow } from "$lib/server/accounting/accounting.repo"

type Row =
  | TrialBalanceRow
  | {
      account_code: string
      account_name: string
      account_type: string
      debits: string
      credits: string
    }

/**
 * Same filter parsing as trial-balance's own `load()` — never re-derived
 * here, so a download always covers the exact `as_of` the screen shows.
 * `verify-authz.mjs`'s "actions are authorized" check only scans
 * `+page.server.ts` action bodies, not a `+server.ts` GET handler with no
 * `export const actions` — so this route's `can()` gate is hand-verified,
 * nothing fails automatically if it were ever dropped.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the trial balance.")
  }

  const { asOf } = parseAsOfCompareFilters(url)

  const { rows, totals, currency } = await withTenant(
    actorFrom(locals),
    async (tx) => ({
      rows: await acc.trialBalance(tx, { asOf }),
      totals: await acc.trialBalanceTotals(tx, { asOf }),
      currency: await acc.tenantBaseCurrency(tx, locals.tenantId!),
    }),
  )

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    { header: "Account Type", value: (r) => r.account_type },
    { header: `Debits (${currency})`, value: (r) => r.debits },
    { header: `Credits (${currency})`, value: (r) => r.credits },
  ]
  const allRows: Row[] = [
    ...rows,
    {
      account_code: "",
      account_name: "TOTAL",
      account_type: "",
      debits: totals.debits,
      credits: totals.credits,
    },
  ]

  return csvResponse(
    `trial-balance${asOf ? `-${asOf}` : ""}.csv`,
    toCsv(columns, allRows),
  )
}

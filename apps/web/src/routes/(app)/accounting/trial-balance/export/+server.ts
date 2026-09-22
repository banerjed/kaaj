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
  debits: string
  credits: string
  compare_debits: string
  compare_credits: string
}

/**
 * Same filter parsing as trial-balance's own `load()` — never re-derived
 * here, so a download always covers the exact `as_of`/`compare_as_of` the
 * screen shows. The comparison columns are always present, blank when no
 * `compare_as_of` is given — one stable header per report, rather than a
 * column count that varies by query and silently breaks whatever a
 * downstream spreadsheet or script expected.
 *
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

  const { asOf, compareAsOf } = parseAsOfCompareFilters(url)

  const { rows, currency } = await withTenant(actorFrom(locals), async (tx) => {
    const currency = await acc.tenantBaseCurrency(tx, locals.tenantId!)
    if (asOf && compareAsOf) {
      const [compRows, compTotals] = await Promise.all([
        acc.trialBalanceComparison(tx, { asOf, compareAsOf }),
        acc.trialBalanceComparisonTotals(tx, { asOf, compareAsOf }),
      ])
      const rows: Row[] = [
        ...compRows,
        {
          account_code: "",
          account_name: "TOTAL",
          account_type: "",
          debits: compTotals.debits,
          credits: compTotals.credits,
          compare_debits: compTotals.compare_debits,
          compare_credits: compTotals.compare_credits,
        },
      ]
      return { rows, currency }
    }
    const [plainRows, totals] = await Promise.all([
      acc.trialBalance(tx, { asOf }),
      acc.trialBalanceTotals(tx, { asOf }),
    ])
    const rows: Row[] = [
      ...plainRows.map((r) => ({
        ...r,
        compare_debits: "",
        compare_credits: "",
      })),
      {
        account_code: "",
        account_name: "TOTAL",
        account_type: "",
        debits: totals.debits,
        credits: totals.credits,
        compare_debits: "",
        compare_credits: "",
      },
    ]
    return { rows, currency }
  })

  const columns: CsvColumn<Row>[] = [
    { header: "Account Code", value: (r) => r.account_code },
    { header: "Account Name", value: (r) => r.account_name },
    { header: "Account Type", value: (r) => r.account_type },
    { header: `Debits (${currency})`, value: (r) => r.debits },
    { header: `Credits (${currency})`, value: (r) => r.credits },
    { header: `Compare Debits (${currency})`, value: (r) => r.compare_debits },
    {
      header: `Compare Credits (${currency})`,
      value: (r) => r.compare_credits,
    },
  ]

  const suffix = compareAsOf
    ? `-${asOf}-vs-${compareAsOf}`
    : asOf
      ? `-${asOf}`
      : ""
  return csvResponse(`trial-balance${suffix}.csv`, toCsv(columns, rows))
}

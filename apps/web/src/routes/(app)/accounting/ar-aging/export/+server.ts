import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfOnlyFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { ArAgingRow } from "$lib/server/accounting/accounting.repo"

const columns: CsvColumn<ArAgingRow>[] = [
  { header: "Customer", value: (r) => r.customer_name },
  { header: "Currency", value: (r) => r.currency },
  { header: "Current", value: (r) => r.current },
  { header: "1-30 Days", value: (r) => r.days_1_30 },
  { header: "31-60 Days", value: (r) => r.days_31_60 },
  { header: "61-90 Days", value: (r) => r.days_61_90 },
  { header: "90+ Days", value: (r) => r.days_90_plus },
  { header: "Total", value: (r) => r.total },
]

/**
 * Same filter parsing as ar-aging's own `load()`, and the same
 * hand-verified `can()` gate note as trial-balance/export/+server.ts.
 *
 * No row-cap here, unlike ap-due-soon's export: `arAging()` groups by
 * (customer, currency), so its row count is bounded by the tenant's own
 * customer roster — `customers` is classified `NOT_SCALE_SENSITIVE` in
 * `verify-query-scale.mjs` for exactly that reason — not by invoice volume,
 * which is what `SCALE_SENSITIVE` growth would actually threaten here.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the AR aging report.")
  }

  const { asOf } = parseAsOfOnlyFilters(url)

  const rows = await withTenant(actorFrom(locals), (tx) =>
    acc.arAging(tx, { asOf }),
  )

  return csvResponse(
    `ar-aging${asOf ? `-${asOf}` : ""}.csv`,
    toCsv(columns, rows),
  )
}

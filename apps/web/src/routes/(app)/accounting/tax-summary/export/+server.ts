import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseFromToFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { TaxLiabilityRow } from "$lib/server/accounting/accounting.repo"

/** Same filter parsing as tax-summary's own `load()`, and the same
 *  hand-verified `can()` gate note as trial-balance/export/+server.ts. No
 *  row cap: one row per tax jurisdiction, bounded by the tenant's own
 *  configured rates, not by transaction volume. */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the tax liability summary.")
  }

  const filters = parseFromToFilters(url)

  const { rows, currency } = await withTenant(
    actorFrom(locals),
    async (tx) => ({
      rows: await acc.taxLiabilitySummary(tx, filters),
      currency: await acc.tenantBaseCurrency(tx, locals.tenantId!),
    }),
  )

  const columns: CsvColumn<TaxLiabilityRow>[] = [
    { header: "Jurisdiction Code", value: (r) => r.code ?? "" },
    { header: "Jurisdiction", value: (r) => r.jurisdiction ?? "Unattributed" },
    { header: `Output Tax (${currency})`, value: (r) => r.output_tax },
    { header: `Input Tax (${currency})`, value: (r) => r.input_tax },
    { header: `Net Liability (${currency})`, value: (r) => r.net_liability },
  ]

  const { from, to } = filters
  const range = from || to ? `-${from || "start"}-to-${to || "now"}` : ""
  return csvResponse(`tax-summary${range}.csv`, toCsv(columns, rows))
}

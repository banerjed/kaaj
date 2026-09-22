import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { fxRevaluation } from "$lib/server/accounting/fx_revaluation.repo"
import type { FxRevaluationRow } from "$lib/server/accounting/fx_revaluation.repo"
import { REPORT_ROW_CAP } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseAsOfOnlyFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"

const columns: CsvColumn<FxRevaluationRow>[] = [
  { header: "Kind", value: (r) => r.kind },
  { header: "Document Number", value: (r) => r.documentNumber },
  { header: "Party", value: (r) => r.partyName ?? "" },
  { header: "Currency", value: (r) => r.currency },
  { header: "Amount Due", value: (r) => r.amountDue },
  { header: "Booked Rate", value: (r) => r.bookedRate },
  { header: "As-Of Rate", value: (r) => r.asOfRate ?? "" },
  { header: "Booked (Base)", value: (r) => r.bookedBase },
  { header: "Revalued (Base)", value: (r) => r.revaluedBase ?? "" },
  { header: "Unrealized Gain/Loss", value: (r) => r.unrealizedGainLoss ?? "" },
]

/**
 * Same filter parsing as fx-revaluation's own `load()`, and the same
 * hand-verified `can()` gate note as trial-balance/export/+server.ts.
 *
 * One row per open AR/AP document — both `invoices` and `bills` are
 * `SCALE_SENSITIVE`, so like ap-due-soon this is genuinely unbounded with
 * transaction volume. `fxRevaluation()` runs two independent queries (open
 * AR, open AP) with no shared WHERE clause to reuse for a cheap combined
 * pre-count, so this refuses AFTER fetching, the same shape ap-due-soon's
 * export uses and for the same reason.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the FX revaluation report.")
  }

  const { asOf } = parseAsOfOnlyFilters(url)

  const rows = await withTenant(actorFrom(locals), (tx) =>
    fxRevaluation(tx, asOf),
  )
  if (rows.length > REPORT_ROW_CAP) {
    error(
      400,
      `This report has ${rows.length} rows — too many for a single export. Narrow the window and try again.`,
    )
  }

  return csvResponse(
    `fx-revaluation${asOf ? `-${asOf}` : ""}.csv`,
    toCsv(columns, rows),
  )
}

import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import type { ApDueSoonRow } from "$lib/server/accounting/payables.repo"
import { REPORT_ROW_CAP } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseApDueSoonFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"

const columns: CsvColumn<ApDueSoonRow>[] = [
  { header: "Bill Number", value: (r) => r.bill_number },
  { header: "Vendor", value: (r) => r.vendor_name ?? "" },
  { header: "Currency", value: (r) => r.currency },
  { header: "Due Date", value: (r) => r.due_date },
  { header: "Days Until Due", value: (r) => String(r.days_until_due) },
  { header: "Amount Due", value: (r) => r.amount_due },
]

/**
 * Same filter parsing as ap-due-soon's own `load()`, and the same
 * hand-verified `can()` gate note as trial-balance/export/+server.ts.
 *
 * `apDueSoon()` returns one row per bill in the window — `bills` is
 * `SCALE_SENSITIVE`, so unlike ar-aging's export this really is unbounded
 * with tenure. Refused outright past `REPORT_ROW_CAP` with the true count —
 * the refusal is the same "one bounded file, not a silent truncation" shape
 * `DOCUMENT_CHILD_CAP` uses for a single PDF, though not the same READ
 * shape: `DOCUMENT_CHILD_CAP` counts first and refuses before fetching
 * (`accounting.repo.ts`'s `invoiceLines`), while this counts the rows
 * `apDueSoon()` already fetched — REPORT_ROW_CAP bounds the file it
 * produces, not the query behind it.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see upcoming bills.")
  }

  const { asOf, withinDays } = parseApDueSoonFilters(url)

  const rows = await withTenant(actorFrom(locals), (tx) =>
    pay.apDueSoon(tx, { asOf, withinDays }),
  )
  if (rows.length > REPORT_ROW_CAP) {
    error(
      400,
      `This report has ${rows.length} rows — too many for a single export. Narrow the window and try again.`,
    )
  }

  return csvResponse(
    `ap-due-soon${asOf ? `-${asOf}` : ""}-${withinDays}d.csv`,
    toCsv(columns, rows),
  )
}

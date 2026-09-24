import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"
import type { CustomerBalanceRow } from "$lib/server/accounting/accounting.repo"

const columns: CsvColumn<CustomerBalanceRow>[] = [
  { header: "Customer", value: (r) => r.customer_name },
  { header: "Currency", value: (r) => r.currency },
  { header: "Credit Limit", value: (r) => r.credit_limit ?? "" },
  { header: "Invoice Count", value: (r) => String(r.invoice_count) },
  { header: "Total Invoiced", value: (r) => r.total_invoiced },
  { header: "Total Paid", value: (r) => r.total_paid },
  { header: "Total Credited", value: (r) => r.total_credited },
  { header: "Total Due", value: (r) => r.total_due },
]

/**
 * No filters — same as customer-balances's own `load()`, and the same
 * hand-verified `can()` gate note as trial-balance/export/+server.ts. No
 * row cap: one row per (customer, currency), bounded by the tenant's own
 * `NOT_SCALE_SENSITIVE` customer roster, same reasoning as ar-aging's export.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see customer balances.")
  }

  const rows = await withTenant(actorFrom(locals), (tx) =>
    acc.customerBalances(tx),
  )

  return csvResponse("customer-balances.csv", toCsv(columns, rows))
}

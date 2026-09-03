import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
  "void",
] as const

/**
 * /accounting/invoices — accounts receivable.
 *
 * Gated: what the firm bills and what it is owed is not directory data. Anyone
 * who may read the ledger may read this.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see invoices.")
  }

  const params = new FormData()
  params.append("status", url.searchParams.get("status") ?? "")
  const f = new FormReader(params)
  const status = f.choice("status", STATUSES) ?? ""
  const overdueOnly = url.searchParams.get("overdue") === "1"

  return withTenant(actorFrom(locals), async (tx) => ({
    invoices: await acc.listInvoices(tx, { status, overdueOnly }),
    statuses: STATUSES,
    filters: { status, overdueOnly },
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}

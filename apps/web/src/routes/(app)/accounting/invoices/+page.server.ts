import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

// "viewed" has no equivalent in accounting.repo.ts's INVOICE_STATUSES — a
// pre-existing divergence, left alone; "credited" and "written_off" are
// added to both.
const STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
  "void",
  "credited",
  "written_off",
] as const

const PAGE_SIZE = 20

/** /accounting/invoices — accounts receivable; gated to finance. */
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
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const [invoices, total] = await Promise.all([
      acc.listInvoices(tx, {
        status,
        overdueOnly,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      acc.countInvoices(tx, { status, overdueOnly }),
    ])
    return {
      invoices,
      total,
      page,
      pageSize: PAGE_SIZE,
      statuses: STATUSES,
      filters: { status, overdueOnly },
      mayWrite: can(ctx, "accounting.write"),
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }
  })
}

import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const STATUSES = [
  "draft",
  "awaiting_approval",
  "approved",
  "partial",
  "paid",
  "cancelled",
  "void",
] as const

/** /accounting/bills — accounts payable. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see bills.")
  }

  const params = new FormData()
  params.append("status", url.searchParams.get("status") ?? "")
  const f = new FormReader(params)
  const status = f.choice("status", STATUSES) ?? ""
  const unapprovedOnly = url.searchParams.get("unapproved") === "1"

  return withTenant(actorFrom(locals), async (tx) => ({
    bills: await pay.listBills(tx, { status, unapprovedOnly }),
    statuses: STATUSES,
    filters: { status, unapprovedOnly },
  }))
}

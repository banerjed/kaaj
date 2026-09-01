import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const STATUSES = [
  "unmatched",
  "matched",
  "categorized",
  "reconciled",
  "ignored",
] as const

/** /accounting/banking — accounts, and the transactions still to reconcile. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see banking.")
  }

  const params = new FormData()
  params.append("account", url.searchParams.get("account") ?? "")
  params.append("status", url.searchParams.get("status") ?? "")
  const f = new FormReader(params)
  // Read before the gate: a reader called inside the object built afterwards
  // runs after `f.ok` was checked, so its rejection is raised too late (L33).
  const accountId = f.uuid("account")
  const status = f.choice("status", STATUSES) ?? ""
  if (!f.ok) error(400, "That is not a valid account.")

  return withTenant(actorFrom(locals), async (tx) => ({
    accounts: await pay.bankAccounts(tx),
    transactions: await pay.bankTransactions(tx, {
      accountId: accountId ?? "",
      status,
    }),
    statuses: STATUSES,
    filters: { accountId: accountId ?? "", status },
  }))
}

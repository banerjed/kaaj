import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/**
 * /accounting/equity — every active equity account's roll-forward for a
 * period: beginning balance, its own direct postings, and the resulting
 * ending balance, with the period's net income shown as its own line since
 * this codebase never closes it into an equity account.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the statement of changes in equity.")
  }

  const params = new FormData()
  params.append("from", url.searchParams.get("from") ?? "")
  params.append("to", url.searchParams.get("to") ?? "")
  const f = new FormReader(params)
  // Read above the gate — inside the object it'd be reported too late (L33).
  const from = f.date("from")
  const to = f.date("to")
  if (!f.ok) error(400, "That date is not a real date.")
  if (from && to && from > to) {
    error(400, "The 'from' date must be on or before the 'to' date.")
  }

  const filters = { from: from ?? "", to: to ?? "" }
  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.equityStatement(tx, filters),
    totals: await acc.equityStatementTotals(tx, filters),
    filters,
  }))
}

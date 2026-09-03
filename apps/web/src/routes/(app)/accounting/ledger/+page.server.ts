import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const STATUSES = ["draft", "posted", "reversed"] as const

/** /accounting/ledger — the journal, and whether it balances. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the general ledger.")
  }

  const params = new FormData()
  for (const k of ["from", "to", "status"]) {
    params.append(k, url.searchParams.get(k) ?? "")
  }
  const f = new FormReader(params)
  // Read above the gate — inside the object it'd be reported too late (L33).
  const from = f.date("from")
  const to = f.date("to")
  const status = f.choice("status", STATUSES) ?? ""
  if (!f.ok) error(400, "That date is not a real date.")

  return withTenant(actorFrom(locals), async (tx) => {
    const entries = await acc.ledger(tx, {
      from: from ?? "",
      to: to ?? "",
      status,
    })
    return {
      entries,
      // One query for all lines, keyed by entry — avoids per-row N+1.
      lines: await acc.ledgerLinesForEntries(
        tx,
        entries.map((e) => e.id),
      ),
      unbalanced: await acc.unbalanced(tx),
      statuses: STATUSES,
      filters: { from: from ?? "", to: to ?? "", status },
    }
  })
}

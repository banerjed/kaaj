import { error } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const STATUSES = ["draft", "posted", "reversed"] as const

const PAGE_SIZE = 20

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
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const filters = { from: from ?? "", to: to ?? "", status }
    const [entries, total] = await Promise.all([
      acc.ledger(tx, {
        ...filters,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      acc.countLedger(tx, filters),
    ])
    return {
      entries,
      total,
      page,
      pageSize: PAGE_SIZE,
      // One query for all lines, keyed by entry — avoids per-row N+1. Now
      // scoped to one page of entries, not every entry ever posted.
      lines: await acc.ledgerLinesForEntries(
        tx,
        entries.map((e) => e.id),
      ),
      statuses: STATUSES,
      filters,
      mayWrite: can(ctx, "accounting.write"),
    }
  })
}

export const actions: Actions = {
  /**
   * A full-ledger integrity scan — every entry's debits against its credits
   * — has to read the whole of `journal_entries`/`journal_entry_lines`, so
   * it cannot be part of `load()` without the page's cost growing with the
   * ledger's entire history rather than with one page of rows. Run on
   * demand instead.
   */
  checkBalance: async ({ locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "accounting.read")
    return {
      unbalanced: await withTenant(actorFrom(locals), (tx) =>
        acc.unbalanced(tx),
      ),
    }
  },
}

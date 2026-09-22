import { error } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { LEDGER_STATUSES } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { parseLedgerFilters } from "$lib/server/accounting/report_filters"

const PAGE_SIZE = 20

/** /accounting/ledger — the journal, and whether it balances. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the general ledger.")
  }

  const filters = parseLedgerFilters(url)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
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
      statuses: LEDGER_STATUSES,
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

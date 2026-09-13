import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/** Lexicographic on `YYYY-MM-DD`, same trick as the `from > to` guard below — never a `Date` object, so no timezone to get wrong. */
function oneYearAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split("-")
  return `${String(Number(y) + 1).padStart(4, "0")}-${m}-${d}`
}

/**
 * /accounting/profit-loss — revenue and expense activity for a period, with
 * net income. Unlike the trial balance's cumulative `asOf`, a P&L is
 * inherently periodic: both `from` and `to` are optional filters, and
 * leaving both blank reports all posted activity to date.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the profit and loss statement.")
  }

  const params = new FormData()
  params.append("from", url.searchParams.get("from") ?? "")
  params.append("to", url.searchParams.get("to") ?? "")
  params.append("compare", url.searchParams.get("compare") ?? "")
  const f = new FormReader(params)
  // Read above the gate — inside the object it'd be reported too late (L33).
  const from = f.date("from")
  const to = f.date("to")
  const compare = f.choice(
    "compare",
    ["none", "previous_period", "previous_year"] as const,
    { fallback: "none" },
  )
  if (!f.ok) {
    if (f.errorFields.includes("compare")) {
      error(400, "That comparison option is not recognized.")
    }
    error(400, "That date is not a real date.")
  }
  if (from && to && from > to) {
    error(400, "The 'from' date must be on or before the 'to' date.")
  }
  if (compare !== "none" && !(from && to)) {
    error(400, "Comparing periods requires both a 'from' and 'to' date.")
  }
  // previous_year shifts both dates back exactly a year; a period a year or
  // longer would make that shifted window overlap the current one, so the
  // same activity would count on both sides of the comparison.
  if (compare === "previous_year" && from && to && to >= oneYearAfter(from)) {
    error(
      400,
      "Comparing to the same period last year requires a period shorter than one year.",
    )
  }

  const filters = { from: from ?? "", to: to ?? "" }
  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await acc.profitAndLoss(tx, filters),
    totals: await acc.profitAndLossTotals(tx, filters),
    filters,
    compare,
    comparison:
      compare !== "none" && from && to
        ? await acc.profitAndLossComparison(tx, {
            from,
            to,
            compareTo: compare,
          })
        : null,
  }))
}

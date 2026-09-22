import { error } from "@sveltejs/kit"
import { FormReader } from "$lib/server/forms"
import { AP_DUE_SOON_WINDOWS } from "$lib/server/accounting/payables.repo"
import {
  readCompare,
  checkCompareOk,
  guardCompareNeedsRange,
  guardPreviousYearOverlap,
  type CompareOption,
} from "$lib/server/accounting/period-compare"

/**
 * One parser per report filter shape, called from both a report's `load()`
 * and its sibling CSV export route — never re-parsed independently, so a
 * download can't silently cover a different period than the screen it was
 * downloaded from.
 */

/** Trial balance and balance sheet: a cumulative `asOf`, with an optional
 *  second `compareAsOf` snapshot rather than a range. */
export function parseAsOfCompareFilters(url: URL): {
  asOf: string
  compareAsOf: string
} {
  const params = new FormData()
  params.append("as_of", url.searchParams.get("as_of") ?? "")
  params.append("compare_as_of", url.searchParams.get("compare_as_of") ?? "")
  const f = new FormReader(params)
  const asOf = f.date("as_of")
  const compareAsOf = f.date("compare_as_of")
  if (!f.ok) error(400, "That date is not a real date.")
  if (compareAsOf && !asOf) {
    error(400, "Give an 'as of' date to compare against.")
  }
  return { asOf: asOf ?? "", compareAsOf: compareAsOf ?? "" }
}

/** Profit & loss and cash flow: a periodic `from`/`to` range, with the
 *  shared `compare` vocabulary from period-compare.ts. */
export function parsePeriodFilters(url: URL): {
  from: string
  to: string
  compare: CompareOption
} {
  const params = new FormData()
  params.append("from", url.searchParams.get("from") ?? "")
  params.append("to", url.searchParams.get("to") ?? "")
  params.append("compare", url.searchParams.get("compare") ?? "")
  const f = new FormReader(params)
  const from = f.date("from")
  const to = f.date("to")
  const compare = readCompare(f)
  checkCompareOk(f)
  if (from && to && from > to) {
    error(400, "The 'from' date must be on or before the 'to' date.")
  }
  guardCompareNeedsRange(compare, from, to)
  guardPreviousYearOverlap(compare, from, to)
  return { from: from ?? "", to: to ?? "", compare }
}

/** AR aging: a single reference date, no comparison. */
export function parseAsOfOnlyFilters(url: URL): { asOf: string } {
  const params = new FormData()
  params.append("as_of", url.searchParams.get("as_of") ?? "")
  const f = new FormReader(params)
  const asOf = f.date("as_of")
  if (!f.ok) error(400, "That date is not a real date.")
  return { asOf: asOf ?? "" }
}

/** AP due soon: a reference date plus a fixed lookahead window. */
export function parseApDueSoonFilters(url: URL): {
  asOf: string
  withinDays: number
} {
  const params = new FormData()
  params.append("as_of", url.searchParams.get("as_of") ?? "")
  params.append("within_days", url.searchParams.get("within_days") ?? "")
  const f = new FormReader(params)
  const asOf = f.date("as_of")
  const withinDays = f.choice("within_days", AP_DUE_SOON_WINDOWS, {
    fallback: "30",
  })
  if (!f.ok) {
    if (f.errorFields.includes("within_days")) {
      error(400, "That is not one of the available windows.")
    }
    error(400, "That date is not a real date.")
  }
  return { asOf: asOf ?? "", withinDays: Number(withinDays) }
}

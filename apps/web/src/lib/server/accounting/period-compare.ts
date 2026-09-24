import { error } from "@sveltejs/kit"
import type { FormReader } from "$lib/server/forms"

/**
 * The `compare` query param shared by every periodic report (P&L, cash
 * flow, equity) — one copy of the vocabulary and its guards, per CLAUDE.md's
 * rule that a plain-text vocabulary belongs in one place, not copied at
 * every call site where it can drift.
 */
export const COMPARE_OPTIONS = [
  "none",
  "previous_period",
  "previous_year",
] as const
export type CompareOption = (typeof COMPARE_OPTIONS)[number]

/** Read above the gate, same as `from`/`to` — a reader called after `if (!f.ok)` reports too late (L33). */
export function readCompare(f: FormReader): CompareOption {
  return f.choice("compare", COMPARE_OPTIONS, { fallback: "none" })
}

/**
 * `f.choice()` fails the same way `f.date()` does, so a bare `if (!f.ok)`
 * would blame an invalid `compare` on "that date is not a real date" — name
 * the field that actually failed.
 */
export function checkCompareOk(f: FormReader): void {
  if (!f.ok) {
    if (f.errorFields.includes("compare")) {
      error(400, "That comparison option is not recognized.")
    }
    error(400, "That date is not a real date.")
  }
}

export function guardCompareNeedsRange(
  compare: CompareOption,
  from: string | null,
  to: string | null,
): void {
  if (compare !== "none" && !(from && to)) {
    error(400, "Comparing periods requires both a 'from' and 'to' date.")
  }
}

/** Lexicographic on `YYYY-MM-DD`, same trick as an inverted `from > to` range — never a `Date` object, so no timezone to get wrong. */
function oneYearAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split("-")
  return `${String(Number(y) + 1).padStart(4, "0")}-${m}-${d}`
}

/**
 * `previous_year` shifts both dates back exactly a year; a period a year or
 * longer would make that shifted window overlap the current one, so the
 * same activity would count on both sides of the comparison.
 */
export function guardPreviousYearOverlap(
  compare: CompareOption,
  from: string | null,
  to: string | null,
): void {
  if (compare === "previous_year" && from && to && to >= oneYearAfter(from)) {
    error(
      400,
      "Comparing to the same period last year requires a period shorter than one year.",
    )
  }
}

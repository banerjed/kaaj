/**
 * The period an export covers, read from the query string. Shared by the
 * review page and the file route, so the file is always the period the page
 * showed.
 */
import { FormReader } from "$lib/server/forms"
import {
  RUN_FREQUENCY,
  type PayrollProvider,
} from "$lib/payroll/export-formats"
import type { PeriodFilter } from "./payroll_export.repo"

/** The longest period one file covers: a monthly payroll, with room. */
export const MAX_PERIOD_DAYS = 31

export const FREQUENCIES = Object.keys(RUN_FREQUENCY)

export type PeriodRead =
  | { ok: true; period: PeriodFilter }
  | { ok: false; message: string; errorFields: string[] }

/** Whole days from `from` to `to`, inclusive. Both are already valid ISO dates. */
function daysInclusive(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000 +
    1
  )
}

export function readPeriod(
  params: URLSearchParams,
  provider: PayrollProvider,
): PeriodRead {
  const form = new FormData()
  for (const k of ["from", "to", "frequency"])
    form.append(k, params.get(k) ?? "")
  const f = new FormReader(form)
  const from = f.date("from", { required: true })
  const to = f.date("to", { required: true })
  const frequency = f.choice("frequency", FREQUENCIES)
  if (from && to) {
    const days = daysInclusive(from, to)
    if (days < 1 || days > MAX_PERIOD_DAYS) f.reject("to")
  }
  // A RUN file holds one pay frequency (ADP's Time Sheet Import guide).
  if (provider === "adp_run" && !frequency) f.reject("frequency")
  if (!f.ok) {
    const fields = f.errorFields
    return {
      ok: false,
      errorFields: fields,
      message: fields.includes("frequency")
        ? "Choose a pay frequency: an ADP RUN file holds one."
        : fields.includes("to")
          ? `Choose an end date on or after the start, at most ${MAX_PERIOD_DAYS} days later.`
          : "Choose the first and last day of the pay period.",
    }
  }
  return {
    ok: true,
    period: { from: from!, to: to!, frequency: frequency ?? null },
  }
}

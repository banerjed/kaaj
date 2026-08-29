/**
 * Projecting future pay dates from a schedule.
 *
 * Pure and client-safe so the preview in the form and any server-side use share
 * one implementation — two would drift, and a pay date that differs between the
 * preview and the run is a wrong wage on a specific day.
 *
 * All arithmetic is in UTC. A pay date is a CALENDAR day, like the DATE columns
 * it comes from: "the 31st" is the 31st in the schedule's own timezone, not an
 * instant that shifts across midnight for a viewer elsewhere. Doing the maths
 * in local time is how the 1st of the month becomes the 31st of the previous
 * one for half the company.
 */

export type Frequency = "weekly" | "bi-weekly" | "semi-monthly" | "monthly"

const DAY_MS = 86_400_000

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Add months, clamping to the end of the target month.
 *
 * JavaScript rolls 31 January + 1 month over into 3 March. A monthly payroll
 * anchored on the 31st must land on the 28th in February, not skip it.
 */
function addMonthsClamped(d: Date, months: number): Date {
  const targetMonth = d.getUTCMonth() + months
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0),
  ).getUTCDate()
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      targetMonth,
      Math.min(d.getUTCDate(), lastDay),
      12, // midday, so no DST-style rounding can move the calendar day
    ),
  )
}

/**
 * The next `count` pay dates on or after `from`.
 *
 * `anchor` fixes the cycle: a bi-weekly schedule anchored on a Friday pays every
 * second Friday from that Friday, which is why the anchor cannot simply be
 * "today".
 */
export function nextPayDates(
  anchorDate: string,
  frequency: Frequency,
  count = 12,
  from: Date = new Date(),
): string[] {
  const anchor = new Date(`${anchorDate}T12:00:00Z`)
  if (Number.isNaN(anchor.getTime())) return []

  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 12),
  )
  const out: string[] = []

  if (frequency === "weekly" || frequency === "bi-weekly") {
    const step = (frequency === "weekly" ? 7 : 14) * DAY_MS
    // Jump straight to the first occurrence at or after `start` rather than
    // stepping from the anchor: an anchor years back would loop thousands of
    // times to reach today.
    const elapsed = start.getTime() - anchor.getTime()
    const skipped = elapsed > 0 ? Math.ceil(elapsed / step) : 0
    let cursor = new Date(anchor.getTime() + skipped * step)
    while (out.length < count) {
      out.push(iso(cursor))
      cursor = new Date(cursor.getTime() + step)
    }
    return out
  }

  if (frequency === "semi-monthly") {
    // The anchor's day-of-month and the end of the month: the common
    // "15th and last day" pattern falls out of this without special-casing.
    const anchorDay = anchor.getUTCDate()
    let year = start.getUTCFullYear()
    let month = start.getUTCMonth()
    while (out.length < count) {
      const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      for (const day of [Math.min(anchorDay, last), last]) {
        const d = new Date(Date.UTC(year, month, day, 12))
        if (d >= start && out.length < count && !out.includes(iso(d))) {
          out.push(iso(d))
        }
      }
      month += 1
      if (month > 11) {
        month = 0
        year += 1
      }
    }
    return out.sort()
  }

  // monthly. Jump straight to the current cycle rather than stepping from the
  // anchor: a schedule anchored years ago would otherwise need one iteration
  // per elapsed month, and any guard low enough to be safe would cut the
  // projection short — which is exactly what it did.
  let step =
    (start.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (start.getUTCMonth() - anchor.getUTCMonth())
  if (step < 0) step = 0

  // The clamped date for that month may still sit before `start` (anchored on
  // the 31st, today is the 15th), so walk forward until it does not.
  while (out.length < count) {
    const d = addMonthsClamped(anchor, step)
    if (d >= start) out.push(iso(d))
    step += 1
  }
  return out
}

/** Is this ISO date a Saturday or Sunday? */
export const isWeekend = (isoDate: string): boolean => {
  const day = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/**
 * Pay dates that fall on a weekend or a holiday at the schedule's office.
 *
 * Flagged rather than silently moved: whether a firm pays early or late is a
 * policy decision (`adjust_for_weekends`, `holiday_adjustment` on the schedule),
 * and guessing it here would quietly change when people are paid.
 */
export function clashingDates(
  dates: string[],
  holidayDates: string[],
): Record<string, "weekend" | "holiday"> {
  const holidays = new Set(holidayDates)
  const out: Record<string, "weekend" | "holiday"> = {}
  for (const d of dates) {
    if (holidays.has(d)) out[d] = "holiday"
    else if (isWeekend(d)) out[d] = "weekend"
  }
  return out
}

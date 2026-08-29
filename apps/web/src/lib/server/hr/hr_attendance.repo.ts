import type { Tx } from "../db/tenant"

/**
 * hr_attendance — clock in, clock out, and the hours that come out of it.
 *
 * Two things about this table are easy to get wrong, and both are silent.
 *
 * **`clock_in_time`/`clock_out_time` are `timestamptz` — instants, not wall
 * clocks.** They must be rendered in the OFFICE's timezone, never the viewer's
 * and never UTC. The fixture originally stored 09:00 IST as `09:00:00Z`, which
 * is 14:30 in Bangalore; nothing errored, and the rows looked entirely
 * plausible until a page displayed them (L35).
 *
 * **`attendance_date` is the LOCAL date and cannot be derived from the
 * timestamps.** An evening shift ending 23:00 in New York is 04:00 UTC the
 * following day, so `clock_out_time::date` is legitimately a day ahead of the
 * date the shift belongs to. Casting either timestamp to `::date` in a query is
 * the bug this note exists to prevent — join to the office and use
 * `AT TIME ZONE` first.
 *
 * Hours are `numeric(18,4)` and travel as strings (CLAUDE.md § Money). Any
 * arithmetic on them happens in SQL.
 */

export type AttendanceDay = {
  id: string
  employee_id: string
  employee_name: string
  location_code: string | null
  timezone: string | null
  locale: string | null
  attendance_date: string
  /**
   * A `Date`, not a string. postgres.js's `types: {}` adds custom handlers, it
   * does not remove the built-in ones — so `timestamptz` still arrives parsed
   * while `NUMERIC` (which has no built-in parser) stays the string money
   * requires. The two behave differently in the same row; declaring these as
   * `string` type-checks and then fails at runtime on `.slice`.
   */
  clock_in_time: Date | null
  clock_out_time: Date | null
  /** HH:MM in the office's zone, formatted by Postgres so no cast is needed. */
  clock_in_local: string | null
  clock_out_local: string | null
  /** True when the shift ended on a later UTC day than it started. */
  crosses_utc_midnight: boolean
  break_minutes: number | null
  total_hours: string | null
  regular_hours: string | null
  overtime_hours: string | null
  status: string
  notes: string | null
}

/** The office's zone, falling back to the employee's own, then to UTC. */
const SELECT = `
  SELECT a.id, a.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         e.location_code, l.timezone, l.locale,
         to_char(a.attendance_date,'YYYY-MM-DD') AS attendance_date,
         a.clock_in_time, a.clock_out_time,
         to_char(a.clock_in_time  AT TIME ZONE coalesce(l.timezone, e.timezone, 'UTC'), 'HH24:MI')
           AS clock_in_local,
         to_char(a.clock_out_time AT TIME ZONE coalesce(l.timezone, e.timezone, 'UTC'), 'HH24:MI')
           AS clock_out_local,
         (a.clock_out_time::date > a.clock_in_time::date) AS crosses_utc_midnight,
         a.break_minutes,
         a.total_hours::text   AS total_hours,
         a.regular_hours::text AS regular_hours,
         a.overtime_hours::text AS overtime_hours,
         a.status, a.notes
    FROM hr_attendance a
    JOIN employees e ON e.id = a.employee_id
    LEFT JOIN firm_locations l ON l.location_code = e.location_code
`

export async function list(
  tx: Tx,
  filters: {
    from?: string
    to?: string
    employeeId?: string
    status?: string
  } = {},
): Promise<AttendanceDay[]> {
  const { status = "" } = filters
  // NULL rather than '' for every CAST parameter — not only the uuid.
  //
  // Two separate mechanisms punish `''` here. SQL does not short-circuit, so
  // `'' = '' OR x = ''::date` evaluates the cast regardless; and postgres.js
  // reads the `::date` hint and serialises the parameter itself, so `''` is
  // `new Date("").toISOString()` — a `RangeError: Invalid time value` thrown in
  // the driver before the query is ever sent. A NULL parameter casts cleanly
  // through both.
  const from = filters.from || null
  const to = filters.to || null
  const employee = filters.employeeId || null
  return tx<AttendanceDay[]>`
    ${tx.unsafe(SELECT)}
     WHERE (${from}::date IS NULL OR a.attendance_date >= ${from}::date)
       AND (${to}::date   IS NULL OR a.attendance_date <= ${to}::date)
       AND (${status} = '' OR a.status = ${status})
       AND (${employee}::uuid IS NULL OR a.employee_id = ${employee}::uuid)
     ORDER BY a.attendance_date DESC, employee_name ASC
  `
}

export type AttendanceTotals = {
  days: number
  total_hours: string
  regular_hours: string
  overtime_hours: string
}

/** Summed in SQL, as NUMERIC. Never by reducing over the rows in JavaScript. */
export async function totals(
  tx: Tx,
  employeeId: string,
  from: string,
  to: string,
): Promise<AttendanceTotals> {
  const [row] = await tx<AttendanceTotals[]>`
    SELECT count(*)::int                        AS days,
           coalesce(sum(total_hours), 0)::text   AS total_hours,
           coalesce(sum(regular_hours), 0)::text AS regular_hours,
           coalesce(sum(overtime_hours), 0)::text AS overtime_hours
      FROM hr_attendance
     WHERE employee_id = ${employeeId}
       AND attendance_date BETWEEN ${from}::date AND ${to}::date
  `
  return row
}

/**
 * Rows whose stored hours disagree with their own clock times.
 *
 *   total_hours = (clock_out - clock_in) - break
 *   total_hours = regular_hours + overtime_hours
 *
 * No constraint enforces either, and both are what payroll multiplies by a
 * rate. A row that drifts is not visible anywhere until someone is paid the
 * wrong amount, so it is worth being able to ask.
 */
export async function inconsistent(
  tx: Tx,
): Promise<
  { id: string; attendance_date: string; stored: string; computed: string }[]
> {
  return tx`
    SELECT id, to_char(attendance_date,'YYYY-MM-DD') AS attendance_date,
           total_hours::text AS stored,
           round(
             extract(epoch FROM (clock_out_time - clock_in_time)) / 3600.0
               - coalesce(break_minutes, 0) / 60.0,
             4
           )::text AS computed
      FROM hr_attendance
     WHERE clock_in_time IS NOT NULL
       AND clock_out_time IS NOT NULL
       AND (
         total_hours IS DISTINCT FROM round(
           extract(epoch FROM (clock_out_time - clock_in_time)) / 3600.0
             - coalesce(break_minutes, 0) / 60.0,
           4
         )
         OR total_hours IS DISTINCT FROM
            regular_hours + coalesce(overtime_hours, 0)
       )
  `
}

/**
 * Rows whose `attendance_date` is not the local date of the clock-in.
 *
 * This is the check a `::date` cast in a query would fail. It passes for every
 * fixture row including the evening shift that ends on the next UTC day.
 */
export async function misdatedForOffice(
  tx: Tx,
): Promise<{ id: string; attendance_date: string; local_date: string }[]> {
  return tx`
    SELECT a.id, to_char(a.attendance_date,'YYYY-MM-DD') AS attendance_date,
           to_char(
             (a.clock_in_time AT TIME ZONE coalesce(l.timezone, e.timezone, 'UTC'))::date,
             'YYYY-MM-DD'
           ) AS local_date
      FROM hr_attendance a
      JOIN employees e ON e.id = a.employee_id
      LEFT JOIN firm_locations l ON l.location_code = e.location_code
     WHERE a.clock_in_time IS NOT NULL
       AND (a.clock_in_time AT TIME ZONE coalesce(l.timezone, e.timezone, 'UTC'))::date
           <> a.attendance_date
  `
}

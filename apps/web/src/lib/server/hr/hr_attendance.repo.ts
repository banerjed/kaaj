import type { Tx } from "../db/tenant"

/**
 * hr_attendance — clock in, clock out, and the hours that come out of it.
 *
 * `clock_in_time`/`clock_out_time` are `timestamptz` instants — render in the
 * OFFICE's timezone, never UTC or the viewer's (L35). `attendance_date` is the
 * LOCAL date and can't be derived by casting a timestamp to `::date` — a night
 * shift crosses UTC midnight without crossing local midnight; join to the
 * office and use `AT TIME ZONE` first.
 *
 * Hours are numeric(18,4) strings; arithmetic happens in SQL.
 */

export type AttendanceDay = {
  id: string
  employee_id: string
  employee_name: string
  location_code: string | null
  timezone: string | null
  locale: string | null
  attendance_date: string
  /** A `Date`, not a string — postgres.js still parses timestamptz even with types: {} (L36). */
  clock_in_time: Date | null
  clock_out_time: Date | null
  /** HH:MM in the office's zone, formatted by Postgres so no cast is needed. */
  clock_in_local: string | null
  clock_out_local: string | null
  /** True when the shift ended on a later day IN THE OFFICE — compared after AT TIME ZONE, not on UTC dates (L35). */
  crosses_local_midnight: boolean
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
         (
           (a.clock_out_time AT TIME ZONE coalesce(l.timezone, e.timezone, 'UTC'))::date
           > (a.clock_in_time AT TIME ZONE coalesce(l.timezone, e.timezone, 'UTC'))::date
         ) AS crosses_local_midnight,
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
  // NULL rather than '' for every CAST parameter (L37) — '' still hits the
  // cast and postgres.js throws before the query is sent.
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
 * Rows whose stored hours disagree with their own clock times:
 *   total_hours = (clock_out - clock_in) - break = regular + overtime
 * No constraint enforces this, and payroll multiplies these by a rate.
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
     WHERE
       -- Holds even on an absent day with no clock times.
       total_hours IS DISTINCT FROM regular_hours + coalesce(overtime_hours, 0)
       -- The clock identity only applies where there is a clock.
       OR (
         clock_in_time IS NOT NULL
         AND clock_out_time IS NOT NULL
         AND total_hours IS DISTINCT FROM round(
           extract(epoch FROM (clock_out_time - clock_in_time)) / 3600.0
             - coalesce(break_minutes, 0) / 60.0,
           4
         )
       )
  `
}

/** Rows whose `attendance_date` is not the local date of the clock-in — what a `::date` cast would get wrong. */
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

/**
 * Hours for a pay period, in the shape a payroll provider imports
 * (docs/37-payroll-provider-integration.md), and the settings that shape
 * them. Kaaj does not calculate pay: this totals approved hours, classifies
 * overtime, and prorates time off. All arithmetic is NUMERIC, in SQL.
 */
import type { Tx } from "$lib/server/db/tenant"
import {
  NEEDS_EMPLOYEE_ID,
  type PayrollProvider,
} from "$lib/payroll/export-formats"

export type ExportSettings = {
  provider: PayrollProvider
  company_code: string | null
}

export async function settings(tx: Tx): Promise<ExportSettings | null> {
  const [row] = await tx<ExportSettings[]>`
    SELECT provider, company_code FROM payroll_export_settings`
  return row ?? null
}

export async function saveSettings(
  tx: Tx,
  input: ExportSettings,
  actorUserId: string,
): Promise<void> {
  await tx`
    INSERT INTO payroll_export_settings (tenant_id, provider, company_code, updated_by)
    VALUES (app.current_tenant_id(), ${input.provider}, ${input.company_code}, ${actorUserId}::uuid)
    ON CONFLICT (tenant_id) DO UPDATE
       SET provider = EXCLUDED.provider, company_code = EXCLUDED.company_code,
           updated_by = EXCLUDED.updated_by, updated_at = now()`
}

export type CodeMapping = { source: string; code: string | null }

export async function codes(
  tx: Tx,
  provider: PayrollProvider,
): Promise<CodeMapping[]> {
  return tx<CodeMapping[]>`
    SELECT source, code FROM payroll_export_codes
     WHERE provider = ${provider} ORDER BY source`
}

/** All of a provider's mappings in one statement. A NULL code means "not exported". */
export async function saveCodes(
  tx: Tx,
  provider: PayrollProvider,
  mappings: CodeMapping[],
  actorUserId: string,
): Promise<void> {
  if (mappings.length === 0) return
  await tx`
    INSERT INTO payroll_export_codes (tenant_id, provider, source, code, updated_by)
    SELECT app.current_tenant_id(), ${provider}, m.source, m.code, ${actorUserId}::uuid
      FROM unnest(${mappings.map((m) => m.source)}::text[],
                  ${mappings.map((m) => m.code)}::text[]) AS m(source, code)
    ON CONFLICT (tenant_id, provider, source) DO UPDATE
       SET code = EXCLUDED.code, updated_by = EXCLUDED.updated_by, updated_at = now()`
}

export type TimeOffPolicy = { policy_code: string; policy_name: string }

/** Every policy a request can name, active or not: an old request still exports. */
export async function timeOffPolicies(tx: Tx): Promise<TimeOffPolicy[]> {
  return tx<TimeOffPolicy[]>`
    SELECT policy_code, policy_name FROM hr_time_off_policies
     WHERE policy_code IS NOT NULL
     ORDER BY policy_name`
}

export type EmployeeIdRow = {
  id: string
  employee_code: string
  name: string
  is_active: boolean
  external_id: string | null
}

/** One page of employees and their id in the provider, by name. */
export async function employeeIdsPage(
  tx: Tx,
  provider: PayrollProvider,
  opts: { search: string; missingOnly: boolean; limit: number; offset: number },
): Promise<{ rows: EmployeeIdRow[]; total: number }> {
  const like = `%${opts.search}%`
  const rows = await tx<(EmployeeIdRow & { total: string })[]>`
    WITH page AS (
      SELECT e.id, count(*) OVER ()::text AS total
        FROM employees e
        LEFT JOIN payroll_employee_ids x
               ON x.employee_id = e.id AND x.provider = ${provider}
       WHERE (${opts.search} = '' OR e.first_name ILIKE ${like}
              OR e.last_name ILIKE ${like} OR e.employee_id ILIKE ${like})
         AND (NOT ${opts.missingOnly} OR x.external_id IS NULL)
       ORDER BY e.is_active DESC, e.last_name, e.first_name, e.id
       LIMIT ${opts.limit} OFFSET ${opts.offset}
    )
    SELECT e.id, e.employee_id AS employee_code,
           e.first_name || ' ' || e.last_name AS name,
           coalesce(e.is_active, true) AS is_active,
           x.external_id, page.total
      FROM page
      JOIN employees e ON e.id = page.id
      LEFT JOIN payroll_employee_ids x
             ON x.employee_id = e.id AND x.provider = ${provider}
     ORDER BY e.is_active DESC, e.last_name, e.first_name, e.id`
  return {
    rows: rows.map(({ total: _, ...r }) => r),
    total: Number(rows[0]?.total ?? 0),
  }
}

export class EmployeeIdRefused extends Error {
  constructor(readonly reason: "no_such_employee") {
    super(reason)
  }
}

/**
 * Sets, or clears with null, an employee's id in the provider. The employee
 * is read under RLS first: the foreign key alone would accept another
 * tenant's employee (L103).
 */
export async function setEmployeeId(
  tx: Tx,
  provider: PayrollProvider,
  employeeId: string,
  externalId: string | null,
  actorUserId: string,
): Promise<{ before: string | null; name: string }> {
  const [employee] = await tx<{ name: string; before: string | null }[]>`
    SELECT e.first_name || ' ' || e.last_name AS name, x.external_id AS before
      FROM employees e
      LEFT JOIN payroll_employee_ids x
             ON x.employee_id = e.id AND x.provider = ${provider}
     WHERE e.id = ${employeeId}::uuid`
  if (!employee) throw new EmployeeIdRefused("no_such_employee")
  await tx`
    INSERT INTO payroll_employee_ids (tenant_id, employee_id, provider, external_id, updated_by)
    VALUES (app.current_tenant_id(), ${employeeId}::uuid, ${provider}, ${externalId}, ${actorUserId}::uuid)
    ON CONFLICT (tenant_id, provider, employee_id) DO UPDATE
       SET external_id = EXCLUDED.external_id, updated_by = EXCLUDED.updated_by,
           updated_at = now()`
  return employee
}

export type PeriodFilter = {
  from: string
  to: string
  /** The current `compensation_base.pay_frequency`, or null for every employee. */
  frequency: string | null
}

export type PeriodLine = {
  employee_id: string
  first_name: string
  last_name: string
  employee_code: string
  external_id: string | null
  source: string
  /** Two decimals, never zero. */
  hours: string
  /** This source's total over every employee, from the same rounded hours. */
  source_total: string
  mapped: boolean
  code: string | null
  /** Overtime-eligible hours with no overtime rule to classify them. */
  policy_missing: boolean
}

/**
 * Each pay record as the days it is in effect: from its start to its own end,
 * or to the day before the next record starts. Entries join these ranges in
 * one pass; a lookup per entry was one index probe per time entry, which at a
 * firm's size is tens of thousands per review.
 */
function payRanges(tx: Tx) {
  return tx`
    SELECT c.employee_id, c.compensation_type::text AS compensation_type,
           coalesce(c.overtime_eligible, false) AS ot_eligible,
           c.pay_frequency::text AS pay_frequency, c.effective_from AS starts,
           least(coalesce(c.effective_to, 'infinity'::date),
                 coalesce(lead(c.effective_from) OVER (
                            PARTITION BY c.employee_id ORDER BY c.effective_from) - 1,
                          'infinity'::date)) AS ends
      FROM compensation_base c`
}

/**
 * Every employee's hours for the period, by source, joined to the provider's
 * id and code. The whole period, not a page: the file needs every row and the
 * review needs every problem; the period is at most 31 days.
 *
 * Worked hours: approved time entries, on days when the employee's pay
 * record (the `compensation_base` row in effect that day) is hourly. So an
 * employee who leaves, or moves to a salary, part-way through the period
 * keeps the hourly days before the change. Overtime, on days when that record
 * is overtime-eligible, by the office's payroll policy (the firm-wide one when
 * the office has none): per day, hours past `double_time_after_hours` are
 * double time and hours past `daily_threshold_hours` overtime; per workweek,
 * regular hours past `weekly_threshold_hours` are overtime. A workweek is
 * counted from its first day, also when that day is before the period, but
 * only days in the period are exported.
 *
 * Time off: approved requests, prorated by the weekdays of the request that
 * fall in the period (by calendar days for a request with no weekday).
 *
 * The pay frequency filter uses the latest pay record in effect at any time
 * in the period.
 */
export async function periodLines(
  tx: Tx,
  provider: PayrollProvider,
  f: PeriodFilter,
): Promise<PeriodLine[]> {
  return tx<PeriodLine[]>`
    WITH pay AS (${payRanges(tx)}),
    emp AS (
      SELECT e.id, e.first_name, e.last_name, e.employee_id AS employee_code,
             e.location_code
        FROM employees e
        LEFT JOIN LATERAL (
          SELECT c.pay_frequency::text AS pay_frequency
            FROM compensation_base c
           WHERE c.employee_id = e.id
             AND c.effective_from <= ${f.to}::date
             AND (c.effective_to IS NULL OR c.effective_to >= ${f.from}::date)
           ORDER BY c.effective_from DESC
           LIMIT 1
        ) cb ON true
       WHERE (${f.frequency}::text IS NULL OR cb.pay_frequency = ${f.frequency}::text)
    ),
    pol AS (
      SELECT emp.id AS employee_id,
             nullif(p.overtime_rules ->> 'daily_threshold_hours', '')::numeric AS daily_thr,
             nullif(p.overtime_rules ->> 'weekly_threshold_hours', '')::numeric AS weekly_thr,
             nullif(p.overtime_rules ->> 'double_time_after_hours', '')::numeric AS dt_after,
             coalesce(p.workweek_start_day, 0) AS wsd
        FROM emp
        LEFT JOIN firm_locations l ON l.location_code = emp.location_code
        LEFT JOIN LATERAL (
          SELECT fp.overtime_rules, fp.workweek_start_day
            FROM firm_payroll_policies fp
           WHERE coalesce(fp.is_active, true)
             AND (fp.location_id = l.id OR fp.location_id IS NULL)
           ORDER BY fp.location_id IS NULL
           LIMIT 1
        ) p ON true
    ),
    days AS (
      SELECT t.employee_id, t.entry_date, p.ot_eligible, sum(t.hours) AS h
        FROM time_tracking_entries t
        JOIN emp ON emp.id = t.employee_id
        JOIN pay p ON p.employee_id = t.employee_id
                  AND t.entry_date BETWEEN p.starts AND p.ends
       WHERE t.status = 'approved'
         AND p.compensation_type = 'hourly'
         AND t.entry_date BETWEEN ${f.from}::date - 6 AND ${f.to}::date
       GROUP BY t.employee_id, t.entry_date, p.ot_eligible
    ),
    daily AS (
      SELECT d.employee_id, d.entry_date, d.h, d.ot_eligible, pol.weekly_thr,
             d.entry_date - ((extract(dow FROM d.entry_date)::int - pol.wsd + 7) % 7)
               AS week_start,
             CASE WHEN d.ot_eligible AND pol.dt_after IS NOT NULL
                  THEN greatest(d.h - pol.dt_after, 0) ELSE 0 END AS dt,
             CASE WHEN d.ot_eligible AND pol.daily_thr IS NOT NULL
                  THEN greatest(least(d.h, coalesce(pol.dt_after, d.h)) - pol.daily_thr, 0)
                  ELSE 0 END AS daily_ot
        FROM days d
        JOIN pol ON pol.employee_id = d.employee_id
    ),
    weekly AS (
      SELECT x.*, x.h - x.dt - x.daily_ot AS reg_day,
             sum(x.h - x.dt - x.daily_ot) OVER (
               PARTITION BY x.employee_id, x.week_start ORDER BY x.entry_date
             ) AS cum
        FROM daily x
    ),
    worked AS (
      SELECT w.employee_id, w.ot_eligible, w.dt, w.daily_ot + w.weekly_ot AS ot,
             w.reg_day - w.weekly_ot AS reg
        FROM (
          SELECT weekly.*,
                 CASE WHEN weekly.ot_eligible AND weekly.weekly_thr IS NOT NULL
                      THEN greatest(weekly.cum - weekly.weekly_thr, 0)
                         - greatest(weekly.cum - weekly.reg_day - weekly.weekly_thr, 0)
                      ELSE 0 END AS weekly_ot
            FROM weekly
        ) w
       WHERE w.entry_date BETWEEN ${f.from}::date AND ${f.to}::date
    ),
    -- Overtime-eligible hours with no rule to classify them: every hour would
    -- go out as regular, which under-pays with no error. A refusal instead.
    unruled AS (
      SELECT w.employee_id
        FROM worked w
        JOIN pol ON pol.employee_id = w.employee_id
       WHERE w.ot_eligible
         AND pol.daily_thr IS NULL AND pol.weekly_thr IS NULL AND pol.dt_after IS NULL
       GROUP BY w.employee_id
    ),
    leave AS (
      SELECT r.employee_id, 'time_off:' || r.policy_code AS source,
             r.total_hours * CASE WHEN wd.all_days > 0
                                  THEN wd.in_days::numeric / wd.all_days
                                  ELSE cd.in_days::numeric / cd.all_days END AS hours
        FROM hr_time_off_requests r
        JOIN emp ON emp.id = r.employee_id
        CROSS JOIN LATERAL (
          SELECT count(*) FILTER (WHERE extract(isodow FROM g.d) < 6) AS all_days,
                 count(*) FILTER (WHERE extract(isodow FROM g.d) < 6
                                    AND g.d BETWEEN ${f.from}::date AND ${f.to}::date) AS in_days
            FROM generate_series(r.start_date, r.end_date, interval '1 day') AS g(d)
        ) wd
        CROSS JOIN LATERAL (
          SELECT r.end_date - r.start_date + 1 AS all_days,
                 least(r.end_date, ${f.to}::date) - greatest(r.start_date, ${f.from}::date) + 1
                   AS in_days
        ) cd
       WHERE r.status = 'approved'
         AND r.start_date <= ${f.to}::date AND r.end_date >= ${f.from}::date
    ),
    lines AS (
      SELECT employee_id, 'regular' AS source, sum(reg) AS hours FROM worked GROUP BY 1
      UNION ALL
      SELECT employee_id, 'overtime', sum(ot) FROM worked GROUP BY 1
      UNION ALL
      SELECT employee_id, 'double_time', sum(dt) FROM worked GROUP BY 1
      UNION ALL
      SELECT employee_id, source, sum(hours) FROM leave GROUP BY 1, 2
    )
    SELECT l.employee_id, emp.first_name, emp.last_name, emp.employee_code,
           x.external_id, l.source, round(l.hours, 2)::text AS hours,
           (sum(round(l.hours, 2)) OVER (PARTITION BY l.source))::text AS source_total,
           c.id IS NOT NULL AS mapped, c.code,
           u.employee_id IS NOT NULL AS policy_missing
      FROM lines l
      JOIN emp ON emp.id = l.employee_id
      LEFT JOIN unruled u ON u.employee_id = l.employee_id
      LEFT JOIN payroll_employee_ids x
             ON x.employee_id = l.employee_id AND x.provider = ${provider}
      LEFT JOIN payroll_export_codes c
             ON c.source = l.source AND c.provider = ${provider}
     WHERE round(l.hours, 2) > 0
     ORDER BY emp.last_name, emp.first_name, l.employee_id,
              CASE l.source WHEN 'regular' THEN 0 WHEN 'overtime' THEN 1
                            WHEN 'double_time' THEN 2 ELSE 3 END,
              l.source`
}

export type Named = { employee_id: string; name: string }

export type PeriodNotes = {
  /** Time entries of hourly days in the period that are still draft or submitted. */
  unapproved_entries: number
  /** Approved requests that extend outside the period, so were prorated: the first 10. */
  prorated: {
    employee: string
    policy_code: string
    start_date: string
    end_date: string
  }[]
  prorated_total: number
  /**
   * Employees with approved time in the period and no pay record to say
   * whether it is paid: their hours would be left out of the file.
   */
  no_pay_record: Named[]
}

export async function periodNotes(
  tx: Tx,
  f: PeriodFilter,
): Promise<PeriodNotes> {
  const [counts] = await tx<{ unapproved_entries: number }[]>`
    WITH pay AS (${payRanges(tx)})
    SELECT count(*)::int AS unapproved_entries
      FROM time_tracking_entries t
      JOIN pay p ON p.employee_id = t.employee_id
                AND t.entry_date BETWEEN p.starts AND p.ends
     WHERE t.status IN ('draft', 'submitted')
       AND p.compensation_type = 'hourly'
       AND t.entry_date BETWEEN ${f.from}::date AND ${f.to}::date
       AND (${f.frequency}::text IS NULL OR p.pay_frequency = ${f.frequency}::text)`
  const prorated = await tx<
    (PeriodNotes["prorated"][number] & { total: number })[]
  >`
    SELECT e.first_name || ' ' || e.last_name AS employee, r.policy_code,
           to_char(r.start_date, 'YYYY-MM-DD') AS start_date,
           to_char(r.end_date, 'YYYY-MM-DD') AS end_date,
           count(*) OVER ()::int AS total
      FROM hr_time_off_requests r
      JOIN employees e ON e.id = r.employee_id
      LEFT JOIN LATERAL (
        SELECT c.pay_frequency::text AS pay_frequency
          FROM compensation_base c
         WHERE c.employee_id = e.id
           AND c.effective_from <= ${f.to}::date
           AND (c.effective_to IS NULL OR c.effective_to >= ${f.from}::date)
         ORDER BY c.effective_from DESC
         LIMIT 1
      ) cb ON true
     WHERE r.status = 'approved'
       AND r.start_date <= ${f.to}::date AND r.end_date >= ${f.from}::date
       AND (r.start_date < ${f.from}::date OR r.end_date > ${f.to}::date)
       AND (${f.frequency}::text IS NULL OR cb.pay_frequency = ${f.frequency}::text)
     ORDER BY e.last_name, e.first_name, r.start_date
     LIMIT 10`
  // Approved time on a day no pay record covers, or approved time off in a
  // period no pay record overlaps. Not filtered by frequency: with no pay
  // record there is no frequency to filter on, and leaving them out is the
  // failure this exists to catch.
  const noPayRecord = await tx<Named[]>`
    WITH pay AS (${payRanges(tx)}),
    uncovered AS (
      SELECT t.employee_id
        FROM time_tracking_entries t
        LEFT JOIN pay p ON p.employee_id = t.employee_id
                       AND t.entry_date BETWEEN p.starts AND p.ends
       WHERE t.status = 'approved'
         AND t.entry_date BETWEEN ${f.from}::date AND ${f.to}::date
         AND p.employee_id IS NULL
      UNION
      SELECT r.employee_id
        FROM hr_time_off_requests r
        LEFT JOIN pay p ON p.employee_id = r.employee_id
                       AND p.starts <= ${f.to}::date AND p.ends >= ${f.from}::date
       WHERE r.status = 'approved'
         AND r.start_date <= ${f.to}::date AND r.end_date >= ${f.from}::date
         AND p.employee_id IS NULL
    )
    SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS name
      FROM uncovered u
      JOIN employees e ON e.id = u.employee_id
     ORDER BY e.last_name, e.first_name`
  return {
    unapproved_entries: counts.unapproved_entries,
    prorated: prorated.map(({ total: _, ...r }) => r),
    prorated_total: prorated[0]?.total ?? 0,
    no_pay_record: noPayRecord.map(({ employee_id, name }) => ({
      employee_id,
      name,
    })),
  }
}

export type ExportProblems = {
  /** Employees with hours and no id in a provider that needs one. */
  missing_ids: Named[]
  /** Sources with hours and no code mapping. */
  unmapped_sources: string[]
  /** Gusto matches by name: two employees with one name are ambiguous. */
  duplicate_names: string[]
  /** Overtime-eligible employees whose office has no overtime rule, and no firm-wide one. */
  no_overtime_rule: Named[]
  /** Approved time with no pay record: it would be left out. */
  no_pay_record: Named[]
}

/** What stops the file being complete. Any of these refuses the download. */
export function problems(
  provider: PayrollProvider,
  lines: PeriodLine[],
  notes: Pick<PeriodNotes, "no_pay_record">,
): ExportProblems {
  const missing = new Map<string, string>()
  const unruled = new Map<string, string>()
  const unmapped = new Set<string>()
  const names = new Map<string, Set<string>>()
  for (const l of lines) {
    const name = `${l.first_name} ${l.last_name}`
    if (!l.mapped) unmapped.add(l.source)
    if (l.policy_missing) unruled.set(l.employee_id, name)
    // A source mapped to "not exported" puts nothing in the file, so needs no id.
    const exported = l.mapped && l.code !== null
    if (exported && NEEDS_EMPLOYEE_ID[provider] && !l.external_id)
      missing.set(l.employee_id, name)
    if (exported) {
      const key = name.toLowerCase()
      names.set(key, (names.get(key) ?? new Set()).add(l.employee_id))
    }
  }
  const named = (m: Map<string, string>) =>
    [...m].map(([employee_id, name]) => ({ employee_id, name }))
  return {
    missing_ids: named(missing),
    unmapped_sources: [...unmapped].sort(),
    duplicate_names:
      provider === "gusto"
        ? [...names].filter(([, ids]) => ids.size > 1).map(([n]) => n)
        : [],
    no_overtime_rule: named(unruled),
    no_pay_record: notes.no_pay_record,
  }
}

export function refuses(p: ExportProblems): boolean {
  return (
    p.missing_ids.length > 0 ||
    p.unmapped_sources.length > 0 ||
    p.duplicate_names.length > 0 ||
    p.no_overtime_rule.length > 0 ||
    p.no_pay_record.length > 0
  )
}

import type { Tx } from "../db/tenant"

/**
 * employees — the directory and one person's record.
 *
 * docs/api-surface.md names the directory join as its worked example:
 * `employees` + `firm_departments` + `compensation_base` in ONE query. Doc 03's
 * rule is one page, one query — a per-row lookup for the department name and
 * another for pay would be 25 queries for a 12-person firm.
 */

export type EmployeeRow = {
  id: string
  employee_id: string | null
  first_name: string
  last_name: string
  preferred_name: string | null
  email: string
  job_title: string | null
  job_level: string | null
  employment_status: string
  employment_type: string
  start_date: string
  end_date: string | null
  is_active: boolean
  location_code: string | null
  timezone: string | null
  department_code: string | null
  department_name: string | null
  manager_name: string | null
  /** NUMERIC comes back as a string; see $lib/format money(). */
  base_amount: string | null
  currency: string | null
  pay_frequency: string | null
}

export type ListFilters = {
  search?: string
  departmentCode?: string
  locationCode?: string
  status?: string
  includeInactive?: boolean
  limit?: number
  offset?: number
}

/**
 * The directory page.
 *
 * Compensation is taken from the effective-dated `compensation_base` — the row
 * whose window covers today — falling back to the denormalised column on
 * `employees` when no row is current. Taking the newest row regardless of dates
 * would show a future raise that has not started, or a lapsed rate.
 *
 * The count comes back on every row rather than from a second query, so the
 * pagination total and the page itself can never disagree.
 */
export async function list(
  tx: Tx,
  filters: ListFilters = {},
): Promise<{ rows: EmployeeRow[]; total: number }> {
  const {
    search = "",
    departmentCode = "",
    locationCode = "",
    status = "",
    includeInactive = false,
    limit = 50,
    offset = 0,
  } = filters

  const rows = await tx<(EmployeeRow & { total: string })[]>`
    WITH current_pay AS (
      SELECT DISTINCT ON (employee_id)
             employee_id, amount, currency, pay_frequency
        FROM compensation_base
       WHERE effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY employee_id, effective_from DESC
    )
    SELECT e.id, e.employee_id, e.first_name, e.last_name, e.preferred_name,
           e.email, e.job_title, e.job_level,
           e.employment_status::text AS employment_status,
           e.employment_type, to_char(e.start_date,'YYYY-MM-DD') AS start_date,
           to_char(e.end_date,'YYYY-MM-DD') AS end_date,
           e.is_active, e.location_code, e.timezone, e.department_code,
           d.name AS department_name,
           m.first_name || ' ' || m.last_name AS manager_name,
           COALESCE(cp.amount, e.base_amount)::text AS base_amount,
           COALESCE(cp.currency, e.currency) AS currency,
           COALESCE(cp.pay_frequency::text, e.pay_frequency::text) AS pay_frequency,
           count(*) OVER ()::text AS total
      FROM employees e
      LEFT JOIN firm_departments d ON d.department_code = e.department_code
      LEFT JOIN employees m ON m.id = e.manager_id
      LEFT JOIN current_pay cp ON cp.employee_id = e.id
     WHERE (${includeInactive} OR e.is_active)
       AND (${departmentCode} = '' OR e.department_code = ${departmentCode})
       AND (${locationCode} = '' OR e.location_code = ${locationCode})
       AND (${status} = '' OR e.employment_status::text = ${status})
       AND (${search} = '' OR (
              e.first_name ILIKE ${"%" + search + "%"} OR
              e.last_name  ILIKE ${"%" + search + "%"} OR
              e.email      ILIKE ${"%" + search + "%"} OR
              e.employee_id ILIKE ${"%" + search + "%"}))
     ORDER BY e.last_name ASC, e.first_name ASC
     LIMIT ${limit} OFFSET ${offset}
  `

  return {
    rows: rows.map(({ total: _total, ...row }) => row),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  }
}

export type EmployeeDetail = EmployeeRow & {
  middle_name: string | null
  phone: string | null
  gender: string | null
  pronouns: string | null
  marital_status: string | null
  birth_date: string | null
  introduction: string | null
  compensation_type: string | null
  fte: string | null
  employee_number: string | null
}

export async function getById(
  tx: Tx,
  id: string,
): Promise<EmployeeDetail | null> {
  const [row] = await tx<EmployeeDetail[]>`
    WITH current_pay AS (
      SELECT DISTINCT ON (employee_id)
             employee_id, amount, currency, pay_frequency
        FROM compensation_base
       WHERE effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY employee_id, effective_from DESC
    )
    SELECT e.id, e.employee_id, e.employee_number, e.first_name, e.last_name,
           e.middle_name, e.preferred_name, e.email, e.phone,
           e.gender::text AS gender, e.pronouns::text AS pronouns,
           e.marital_status::text AS marital_status,
           to_char(e.birth_date,'YYYY-MM-DD') AS birth_date,
           e.introduction, e.job_title, e.job_level,
           e.employment_status::text AS employment_status, e.employment_type,
           to_char(e.start_date,'YYYY-MM-DD') AS start_date,
           to_char(e.end_date,'YYYY-MM-DD') AS end_date,
           e.is_active, e.location_code, e.timezone, e.department_code,
           e.compensation_type, e.fte::text AS fte,
           d.name AS department_name,
           m.first_name || ' ' || m.last_name AS manager_name,
           COALESCE(cp.amount, e.base_amount)::text AS base_amount,
           COALESCE(cp.currency, e.currency) AS currency,
           COALESCE(cp.pay_frequency::text, e.pay_frequency::text) AS pay_frequency
      FROM employees e
      LEFT JOIN firm_departments d ON d.department_code = e.department_code
      LEFT JOIN employees m ON m.id = e.manager_id
      LEFT JOIN current_pay cp ON cp.employee_id = e.id
     WHERE e.id = ${id}
  `
  return row ?? null
}

/** Compensation history for one person, newest first. */
export type CompensationRow = {
  effective_from: string
  effective_to: string | null
  amount: string
  currency: string
  pay_frequency: string | null
  change_reason: string | null
}

export async function compensationHistory(
  tx: Tx,
  employeeId: string,
): Promise<CompensationRow[]> {
  return tx<CompensationRow[]>`
    SELECT to_char(effective_from,'YYYY-MM-DD') AS effective_from,
           to_char(effective_to,'YYYY-MM-DD') AS effective_to,
           amount::text AS amount, currency,
           pay_frequency::text AS pay_frequency, change_reason
      FROM compensation_base
     WHERE employee_id = ${employeeId}
     ORDER BY effective_from DESC
  `
}

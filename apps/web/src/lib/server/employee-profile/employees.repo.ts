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
           -- NO COALESCE ONTO e.base_amount. compensation_base carries the
           -- row-visibility policy; employees.base_amount is an unprotected
           -- cache of the same figure, so falling back to it handed every
           -- employee every colleague's salary — RLS hid the source and the
           -- query silently substituted the copy (L47).
           cp.amount::text AS base_amount,
           cp.currency AS currency,
           cp.pay_frequency::text AS pay_frequency,
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
           -- NO COALESCE ONTO e.base_amount. compensation_base carries the
           -- row-visibility policy; employees.base_amount is an unprotected
           -- cache of the same figure, so falling back to it handed every
           -- employee every colleague's salary — RLS hid the source and the
           -- query silently substituted the copy (L47).
           cp.amount::text AS base_amount,
           cp.currency AS currency,
           cp.pay_frequency::text AS pay_frequency
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

export type EmployeeInput = {
  first_name: string
  last_name: string
  middle_name: string | null
  preferred_name: string | null
  email: string
  phone: string | null
  employee_id: string
  gender: string | null
  pronouns: string | null
  marital_status: string | null
  birth_date: string | null
  employment_status: string
  employment_type: string
  start_date: string
  end_date: string | null
  department_code: string | null
  job_title: string | null
  job_level: string | null
  location_code: string | null
  timezone: string | null
  manager_id: string | null
  pay_frequency: string | null
  introduction: string | null
}

/**
 * `created_by` is NOT NULL with no default on this table, so it must be
 * supplied. It takes the acting user's id — the audit trail is the point.
 */
export async function create(
  tx: Tx,
  tenantId: string,
  input: EmployeeInput,
  actorId: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO employees (
      tenant_id, employee_id, first_name, last_name, middle_name,
      preferred_name, email, phone, gender, pronouns, marital_status,
      birth_date, employment_status, employment_type, start_date, end_date,
      department_code, job_title, job_level, location_code, timezone,
      manager_id, pay_frequency, introduction,
      is_active, created_at, updated_at, created_by
    ) VALUES (
      ${tenantId}, ${input.employee_id}, ${input.first_name}, ${input.last_name},
      ${input.middle_name}, ${input.preferred_name}, ${input.email},
      ${input.phone}, ${input.gender}::gender, ${input.pronouns}::pronouns,
      ${input.marital_status}::marital_status, ${input.birth_date}::date,
      ${input.employment_status}::employment_status, ${input.employment_type},
      ${input.start_date}::date, ${input.end_date}::date,
      ${input.department_code}, ${input.job_title}, ${input.job_level},
      ${input.location_code}, ${input.timezone}, ${input.manager_id},
      ${input.pay_frequency}::pay_frequency, ${input.introduction},
      -- Someone who has already left is created inactive, so the directory's
      -- default view and the status field cannot disagree from the outset.
      ${input.employment_status === "active"},
      now(), now(), ${actorId}
    )
    RETURNING id
  `
  return row
}

export async function update(
  tx: Tx,
  id: string,
  input: EmployeeInput,
): Promise<void> {
  await tx`
    UPDATE employees SET
      employee_id       = ${input.employee_id},
      first_name        = ${input.first_name},
      last_name         = ${input.last_name},
      middle_name       = ${input.middle_name},
      preferred_name    = ${input.preferred_name},
      email             = ${input.email},
      phone             = ${input.phone},
      gender            = ${input.gender}::gender,
      pronouns          = ${input.pronouns}::pronouns,
      marital_status    = ${input.marital_status}::marital_status,
      birth_date        = ${input.birth_date}::date,
      employment_status = ${input.employment_status}::employment_status,
      employment_type   = ${input.employment_type},
      start_date        = ${input.start_date}::date,
      end_date          = ${input.end_date}::date,
      department_code   = ${input.department_code},
      job_title         = ${input.job_title},
      job_level         = ${input.job_level},
      location_code     = ${input.location_code},
      timezone          = ${input.timezone},
      manager_id        = ${input.manager_id},
      pay_frequency     = ${input.pay_frequency}::pay_frequency,
      introduction      = ${input.introduction},
      is_active         = ${input.employment_status === "active"},
      updated_at        = now(),
      version           = version + 1
    WHERE id = ${id}
  `
}

/** Everyone who could be someone's manager, for the picker. */
export async function managerOptions(
  tx: Tx,
  excludeId?: string,
): Promise<{ id: string; name: string }[]> {
  return tx<{ id: string; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name
      FROM employees
     WHERE is_active
       AND (${excludeId ?? null}::uuid IS NULL OR id <> ${excludeId ?? null}::uuid)
     ORDER BY last_name, first_name
  `
}

/**
 * Would setting `managerId` as this employee's manager create a reporting
 * cycle? Same shape of problem as the department tree: the FK cannot express
 * acyclicity, and a loop makes any "walk up the chain" query non-terminating.
 */
export async function wouldReportToSelf(
  tx: Tx,
  employeeId: string,
  managerId: string | null,
): Promise<boolean> {
  if (!managerId) return false
  if (managerId === employeeId) return true

  const rows = await tx<{ id: string; manager_id: string | null }[]>`
    SELECT id, manager_id FROM employees
  `
  const managerOf = new Map(rows.map((r) => [r.id, r.manager_id]))

  let cursor: string | null = managerId
  const seen = new Set<string>()
  while (cursor) {
    if (cursor === employeeId) return true
    if (seen.has(cursor)) return true
    seen.add(cursor)
    cursor = managerOf.get(cursor) ?? null
  }
  return false
}

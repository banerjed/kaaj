import type { Tx } from "../db/tenant"

/**
 * firm_departments — the org structure. Self-referencing through
 * `parent_department_id`, so the list is a forest, not a flat set.
 */

export type FirmDepartment = {
  id: string
  parent_department_id: string | null
  name: string
  name_i18n: Record<string, string> | null
  description: string | null
  department_code: string | null
  parent_department_code: string | null
  location_code: string | null
  cost_center: string | null
  budget_currency: string | null
  head_employee_id: string | null
  is_active: boolean
  /** Denormalised for display; see `list`. */
  head_name: string | null
  employee_count: number
}

/**
 * Every department, with its head's name and headcount — one query, not one
 * per row. Headcount joins on `department_code`, which is what `employees` carries.
 */
export async function list(
  tx: Tx,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<FirmDepartment[]> {
  return tx<FirmDepartment[]>`
    SELECT d.id, d.parent_department_id, d.name, d.name_i18n, d.description,
           d.department_code, d.parent_department_code, d.location_code,
           d.cost_center, d.budget_currency, d.head_employee_id, d.is_active,
           h.first_name || ' ' || h.last_name AS head_name,
           (SELECT count(*)::int
              FROM employees e
             WHERE e.department_code = d.department_code
               AND e.is_active) AS employee_count
      FROM firm_departments d
      LEFT JOIN employees h ON h.id = d.head_employee_id
     WHERE (${includeArchived} OR d.is_active)
     ORDER BY d.name ASC
  `
}

export async function getById(
  tx: Tx,
  id: string,
): Promise<FirmDepartment | null> {
  const [row] = await list(tx, { includeArchived: true }).then((rows) => [
    rows.find((r) => r.id === id),
  ])
  return row ?? null
}

export type DepartmentInput = {
  name: string
  name_i18n: Record<string, string> | null
  description: string | null
  department_code: string
  parent_department_code: string | null
  location_code: string | null
  cost_center: string | null
  budget_currency: string | null
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: DepartmentInput,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO firm_departments (
      tenant_id, name, name_i18n, description, department_code,
      parent_department_code, location_code, cost_center, budget_currency,
      parent_department_id
    ) VALUES (
      ${tenantId}, ${input.name}, ${tx.json(input.name_i18n)},
      ${input.description}, ${input.department_code},
      ${input.parent_department_code}, ${input.location_code},
      ${input.cost_center}, ${input.budget_currency},
      (SELECT id FROM firm_departments
        WHERE department_code = ${input.parent_department_code})
    )
    RETURNING id
  `
  return row
}

export async function update(
  tx: Tx,
  id: string,
  input: DepartmentInput,
): Promise<void> {
  await tx`
    UPDATE firm_departments SET
      name                   = ${input.name},
      name_i18n              = ${tx.json(input.name_i18n)},
      description            = ${input.description},
      department_code        = ${input.department_code},
      parent_department_code = ${input.parent_department_code},
      parent_department_id   = (SELECT id FROM firm_departments
                                 WHERE department_code = ${input.parent_department_code}),
      location_code          = ${input.location_code},
      cost_center            = ${input.cost_center},
      budget_currency        = ${input.budget_currency},
      updated_at             = now()
    WHERE id = ${id}
  `
}

/** Deactivate, and say whether a row actually matched — a no-op must not report success (L68). */
export async function archive(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE firm_departments
       SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}
   RETURNING id`
  return rows.length > 0
}

/** Would making `childCode` a child of `parentCode` create a cycle? A self-referencing FK can't express acyclicity, so this walks up manually. */
export async function wouldCycle(
  tx: Tx,
  childCode: string,
  parentCode: string | null,
): Promise<boolean> {
  if (!parentCode) return false
  if (parentCode === childCode) return true

  const rows = await tx<{ department_code: string; parent: string | null }[]>`
    SELECT department_code, parent_department_code AS parent
      FROM firm_departments
  `
  const parentOf = new Map(rows.map((r) => [r.department_code, r.parent]))

  let cursor: string | null = parentCode
  const seen = new Set<string>()
  while (cursor) {
    if (cursor === childCode) return true
    if (seen.has(cursor)) return true // pre-existing cycle; refuse to add to it
    seen.add(cursor)
    cursor = parentOf.get(cursor) ?? null
  }
  return false
}

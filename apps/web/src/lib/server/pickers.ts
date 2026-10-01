/**
 * Server half of every searchable picker: a page's own `search*` action reads
 * the query with `pickerQuery`, after its own `requireCan`, and calls one of
 * these. Each returns at most PICKER_LIMIT matches, so no page ships a whole
 * table to fill a `<select>` (CLAUDE.md, Performance). Each mirrors the
 * filter of the preloaded list it replaced — a picker must offer the same
 * set it always did, only searched.
 */
import type { ComboboxOption } from "$lib/components/Combobox.svelte"
import type { Tx } from "$lib/server/db/tenant"
import type { FormReader } from "$lib/server/forms"

export const PICKER_LIMIT = 20

/** The search text; an empty query lists the first PICKER_LIMIT by name. */
export function pickerQuery(f: FormReader): string {
  return f.text("q", { max: 200 }) ?? ""
}

function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export type EmployeeFilter = {
  /** `managerOptions`' set: `is_active`. `employed`: `employment_status = 'active'`. */
  set?: "active" | "employed"
  excludeId?: string | null
}

export async function searchEmployees(
  tx: Tx,
  q: string,
  { set = "active", excludeId = null }: EmployeeFilter = {},
): Promise<ComboboxOption[]> {
  const rows = await tx<{ id: string; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name
      FROM employees
     WHERE (CASE WHEN ${set} = 'employed' THEN employment_status = 'active' ELSE is_active END)
       AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid)
       AND (first_name || ' ' || last_name) ILIKE ${like(q)}
     ORDER BY first_name, last_name
     LIMIT ${PICKER_LIMIT}
  `
  return rows.map((r) => ({ id: r.id, label: r.name }))
}

/** `activeOnly`: the invoicing pickers' set (`is_active`); otherwise every customer. Carries the currency in `meta`. */
export async function searchCustomers(
  tx: Tx,
  q: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<ComboboxOption[]> {
  const rows = await tx<
    { id: string; customer_name: string; currency: string }[]
  >`
    SELECT id, customer_name, currency
      FROM customers
     WHERE (NOT ${activeOnly} OR is_active)
       AND customer_name ILIKE ${like(q)}
     ORDER BY customer_name
     LIMIT ${PICKER_LIMIT}
  `
  return rows.map((r) => ({
    id: r.id,
    label: r.customer_name,
    meta: { currency: r.currency },
  }))
}

/** Projects that are not archived — time tracking's set. */
export async function searchProjects(
  tx: Tx,
  q: string,
): Promise<ComboboxOption[]> {
  const rows = await tx<
    { id: string; project_number: string; project_name: string }[]
  >`
    SELECT id, project_number, project_name
      FROM projects
     WHERE archived_at IS NULL
       AND (project_name ILIKE ${like(q)} OR project_number ILIKE ${like(q)})
     ORDER BY project_name
     LIMIT ${PICKER_LIMIT}
  `
  return rows.map((r) => ({
    id: r.id,
    label: r.project_name,
    sublabel: r.project_number,
  }))
}

/** Open tasks of one project — time tracking's set, scoped to the chosen project. */
export async function searchTasks(
  tx: Tx,
  q: string,
  projectId: string,
): Promise<ComboboxOption[]> {
  const rows = await tx<{ id: string; task_name: string }[]>`
    SELECT t.id, t.task_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
     WHERE t.project_id = ${projectId}
       AND p.archived_at IS NULL
       AND t.status <> 'done'
       AND t.task_name ILIKE ${like(q)}
     ORDER BY t.task_name
     LIMIT ${PICKER_LIMIT}
  `
  return rows.map((r) => ({ id: r.id, label: r.task_name }))
}

/** Active vendors — the bill form's set. Carries the default currency in `meta`. */
export async function searchVendors(
  tx: Tx,
  q: string,
): Promise<ComboboxOption[]> {
  const rows = await tx<
    { id: string; vendor_name: string; currency: string }[]
  >`
    SELECT id, vendor_name, currency
      FROM vendors
     WHERE is_active
       AND vendor_name ILIKE ${like(q)}
     ORDER BY vendor_name
     LIMIT ${PICKER_LIMIT}
  `
  return rows.map((r) => ({
    id: r.id,
    label: r.vendor_name,
    meta: { currency: r.currency },
  }))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The current picks of people pickers (a filter in the URL), as `selected` options. */
export async function employeeLabels(
  tx: Tx,
  ids: (string | null | undefined)[],
): Promise<Record<string, ComboboxOption>> {
  // Ids come from the URL: a malformed one is simply not a pick, never a 500 on the cast.
  const wanted = [
    ...new Set(ids.filter((id): id is string => !!id && UUID.test(id))),
  ]
  if (!wanted.length) return {}
  const rows = await tx<{ id: string; name: string }[]>`
    SELECT id, first_name || ' ' || last_name AS name
      FROM employees
     WHERE id = ANY(${wanted}::uuid[])
  `
  return Object.fromEntries(
    rows.map((r) => [r.id, { id: r.id, label: r.name }]),
  )
}

/** Top-level folders that are not archived — the root upload form's set. */
export async function searchTopFolders(
  tx: Tx,
  q: string,
): Promise<ComboboxOption[]> {
  const rows = await tx<{ id: string; name: string }[]>`
    SELECT f.id, f.name
      FROM document_folders f
      JOIN employees o ON o.id = f.owner_employee_id
     WHERE f.parent_folder_id IS NULL AND f.archived_at IS NULL
       AND f.name ILIKE ${like(q)}
     ORDER BY f.name, f.id
     LIMIT ${PICKER_LIMIT}
  `
  return rows.map((r) => ({ id: r.id, label: r.name }))
}

/** Shows each option's `meta.currency` as its sublabel — accounting pickers name the currency a document will be raised in. */
export function withCurrency(options: ComboboxOption[]): ComboboxOption[] {
  return options.map((o) => ({ ...o, sublabel: o.meta?.currency }))
}

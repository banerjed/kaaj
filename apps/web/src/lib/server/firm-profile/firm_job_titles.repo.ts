import type { Tx } from "../db/tenant"

/** firm_job_titles — the roles the firm hires into. Levels hang off these. */

export type FirmJobTitle = {
  id: string
  title: string
  title_i18n: Record<string, string> | null
  description: string | null
  is_exempt: boolean
  eeoc_category: string | null
  isco_code: string | null
  is_active: boolean
  employee_count: number
}

export async function list(
  tx: Tx,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<FirmJobTitle[]> {
  return tx<FirmJobTitle[]>`
    SELECT t.id, t.title, t.title_i18n, t.description, t.is_exempt,
           t.eeoc_category::text AS eeoc_category, t.isco_code, t.is_active,
           (SELECT count(*)::int FROM employees e
             WHERE e.job_title = t.title AND e.is_active) AS employee_count
      FROM firm_job_titles t
     WHERE (${includeArchived} OR t.is_active)
     ORDER BY t.title ASC
  `
}

export type JobTitleInput = {
  title: string
  title_i18n: Record<string, string> | null
  description: string | null
  is_exempt: boolean
  eeoc_category: string | null
}

export async function create(
  tx: Tx,
  tenantId: string,
  input: JobTitleInput,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO firm_job_titles
      (tenant_id, title, title_i18n, description, is_exempt, eeoc_category)
    VALUES (
      ${tenantId}, ${input.title}, ${tx.json(input.title_i18n)},
      ${input.description}, ${input.is_exempt},
      ${input.eeoc_category}::eeoc_category
    )
    RETURNING id
  `
  return row
}

export async function update(
  tx: Tx,
  id: string,
  input: JobTitleInput,
): Promise<void> {
  await tx`
    UPDATE firm_job_titles SET
      title         = ${input.title},
      title_i18n    = ${tx.json(input.title_i18n)},
      description   = ${input.description},
      is_exempt     = ${input.is_exempt},
      eeoc_category = ${input.eeoc_category}::eeoc_category,
      updated_at    = now()
    WHERE id = ${id}
  `
}

/** Deactivate, never delete: employees reference the title by name. */
export async function archive(tx: Tx, id: string): Promise<void> {
  await tx`
    UPDATE firm_job_titles SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}
  `
}

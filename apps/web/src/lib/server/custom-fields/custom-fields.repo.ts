import { DEFAULT_CATEGORY } from "$lib/custom-fields"
import type { Tx } from "../db/tenant"

/**
 * Custom fields on every kind of record (docs/31-custom-fields.md). The only
 * code that touches `custom_field_definitions` or `custom_field_values`.
 *
 * A money field is typed and validated here but must never be read by the
 * accounting or payroll modules, and never summed into a real figure.
 */

export const CUSTOM_FIELD_DATA_TYPES = [
  "text",
  "number",
  "money",
  "date",
  "boolean",
  "select",
  "multiselect",
] as const
export type CustomFieldDataType = (typeof CUSTOM_FIELD_DATA_TYPES)[number]

/** Kinds of record whose fields can be edited. Matches the value table's record columns. */
export const CUSTOM_FIELD_ENTITY_TYPES = [
  "project",
  "task",
  "customer_contact",
  "ticket",
] as const
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number]

/**
 * Chosen from these fixed maps by entity type, never from caller input, so
 * `tx.unsafe` over them is safe — the same pattern as projects.repo.ts's
 * `nextNumber`.
 */
const RECORD_COLUMN: Record<CustomFieldEntityType, string> = {
  project: "project_id",
  task: "task_id",
  customer_contact: "customer_contact_id",
  ticket: "ticket_id",
}
const RECORD_TABLE: Record<CustomFieldEntityType, string> = {
  project: "projects",
  task: "tasks",
  customer_contact: "customer_contacts",
  ticket: "ticketing_tickets",
}

/**
 * Which records a set of definitions applies to. Tickets are scoped by
 * business area; nothing else is scoped, and the schema refuses an area on
 * any other entity type.
 */
export type FieldScope =
  | { entityType: Exclude<CustomFieldEntityType, "ticket"> }
  | { entityType: "ticket"; businessAreaId: string }

const areaOf = (scope: FieldScope): string | null =>
  scope.entityType === "ticket" ? scope.businessAreaId : null

/**
 * Decoration, not status — deliberately NOT `Tone` from `$lib/components/status-tone`,
 * which its own docstring reserves for "meaning only". Four of these reuse
 * StatusBadge's already-AA-measured classes; the other four are daisyUI
 * defaults nobody has measured against corporate/night yet — see LabelBadge.svelte.
 */
export const LABEL_COLORS = [
  "success",
  "warning",
  "error",
  "info",
  "primary",
  "secondary",
  "accent",
  "neutral",
] as const
export type LabelColor = (typeof LABEL_COLORS)[number]

export type CustomFieldOption = {
  value: string
  label: string
  tone?: LabelColor
}

export type CustomFieldDefinition = {
  id: string
  entity_type: CustomFieldEntityType
  category: string
  field_key: string
  label: string
  help_text: string | null
  data_type: CustomFieldDataType
  options: CustomFieldOption[] | null
  is_required: boolean
  display_order: number
}

export class CustomFieldWriteRefused extends Error {
  constructor(
    readonly reason: "no_such_definition" | "no_such_record" | "invalid_option",
  ) {
    super(reason)
    this.name = "CustomFieldWriteRefused"
  }
}

function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/**
 * Every active field in a scope, in display order: "General" first, then
 * each category in the order it was first used, then each field by its
 * position within its category. Archived fields count toward "first used",
 * so archiving a category's oldest field never reorders the page.
 */
export async function definitionsFor(
  tx: Tx,
  scope: FieldScope,
): Promise<CustomFieldDefinition[]> {
  const area = areaOf(scope)
  return tx<CustomFieldDefinition[]>`
    SELECT d.id, d.entity_type, d.category, d.field_key, d.label, d.help_text,
           d.data_type, d.options, d.is_required, d.display_order
      FROM custom_field_definitions d
     WHERE d.entity_type = ${scope.entityType}
       AND d.business_area_id IS NOT DISTINCT FROM ${area}::uuid
       AND d.is_active
     ORDER BY d.category <> ${DEFAULT_CATEGORY},
              (SELECT min(c.created_at) FROM custom_field_definitions c
                WHERE c.entity_type = d.entity_type
                  AND c.business_area_id IS NOT DISTINCT FROM d.business_area_id
                  AND c.category = d.category),
              d.category, d.display_order, d.label
  `
}

export async function createDefinition(
  tx: Tx,
  tenantId: string,
  scope: FieldScope,
  input: {
    category: string
    label: string
    helpText: string | null
    dataType: CustomFieldDataType
    options: CustomFieldOption[] | null
    isRequired: boolean
  },
): Promise<{ id: string }> {
  const area = areaOf(scope)
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO custom_field_definitions
      (tenant_id, entity_type, business_area_id, category, field_key, label,
       help_text, data_type, options, is_required, display_order)
    SELECT ${tenantId}::uuid, ${scope.entityType}, ${area}::uuid, ${input.category},
           ${slugifyFieldKey(input.label)}, ${input.label}, ${input.helpText},
           ${input.dataType},
           ${input.options ? tx.json(input.options as never) : null},
           ${input.isRequired},
           coalesce((SELECT max(display_order) + 1 FROM custom_field_definitions
                      WHERE entity_type = ${scope.entityType}
                        AND business_area_id IS NOT DISTINCT FROM ${area}::uuid
                        AND category = ${input.category}), 1)
    RETURNING id
  `
  return row
}

/** Soft: the definition and its values survive, and it leaves `definitionsFor`. */
export async function archiveDefinition(
  tx: Tx,
  scope: FieldScope,
  id: string,
): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE custom_field_definitions SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}::uuid AND entity_type = ${scope.entityType}
       AND business_area_id IS NOT DISTINCT FROM ${areaOf(scope)}::uuid
       AND is_active
    RETURNING id
  `
  return !!row
}

/**
 * Rename a category on every field in it, archived ones included, so an
 * archived field restored later lands back in the renamed category. Naming
 * an existing category merges the two. Returns how many fields moved.
 */
export async function renameCategory(
  tx: Tx,
  scope: FieldScope,
  from: string,
  to: string,
): Promise<number> {
  const rows = await tx<{ id: string }[]>`
    UPDATE custom_field_definitions SET category = ${to}, updated_at = now()
     WHERE entity_type = ${scope.entityType}
       AND business_area_id IS NOT DISTINCT FROM ${areaOf(scope)}::uuid
       AND category = ${from}
    RETURNING id
  `
  return rows.length
}

/**
 * Move a field one place up or down within its category, renumbering the
 * category 1..n in the same statement so ties left by earlier data are
 * resolved rather than carried forward.
 */
export async function moveDefinition(
  tx: Tx,
  scope: FieldScope,
  id: string,
  direction: "up" | "down",
): Promise<boolean> {
  const area = areaOf(scope)
  const siblings = await tx<{ id: string }[]>`
    SELECT s.id FROM custom_field_definitions s
      JOIN custom_field_definitions d ON d.id = ${id}::uuid
     WHERE s.entity_type = ${scope.entityType}
       AND s.business_area_id IS NOT DISTINCT FROM ${area}::uuid
       AND d.entity_type = s.entity_type
       AND d.business_area_id IS NOT DISTINCT FROM s.business_area_id
       AND s.category = d.category AND s.is_active
     ORDER BY s.display_order, s.label
  `
  const ids = siblings.map((s) => s.id)
  const at = ids.indexOf(id)
  const to = direction === "up" ? at - 1 : at + 1
  if (at < 0 || to < 0 || to >= ids.length) return false
  ;[ids[at], ids[to]] = [ids[to], ids[at]]
  await tx`
    UPDATE custom_field_definitions d SET display_order = o.n, updated_at = now()
      FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS o(id, n)
     WHERE d.id = o.id
  `
  return true
}

export type CustomFieldValueRow = {
  field_definition_id: string
  value_text: string | null
  value_number: string | null
  value_money: string | null
  value_date: string | null
  value_boolean: boolean | null
  value_multi: string[] | null
}

/** Every value for a set of records of one kind, in one query, grouped by record id. */
export async function valuesFor(
  tx: Tx,
  entityType: CustomFieldEntityType,
  recordIds: string[],
): Promise<Record<string, CustomFieldValueRow[]>> {
  if (recordIds.length === 0) return {}
  const column = tx.unsafe(RECORD_COLUMN[entityType])
  const rows = await tx<(CustomFieldValueRow & { record_id: string })[]>`
    SELECT ${column} AS record_id, field_definition_id,
           value_text,
           value_number::text AS value_number,
           value_money::text  AS value_money,
           to_char(value_date, 'YYYY-MM-DD') AS value_date,
           value_boolean,
           value_multi
      FROM custom_field_values
     WHERE ${column} = ANY(${recordIds}::uuid[])
       -- A cleared value leaves an all-NULL row (there is no DELETE grant).
       AND num_nonnulls(value_text, value_number, value_money, value_date,
                        value_boolean, value_multi) > 0
  `
  const out: Record<string, CustomFieldValueRow[]> = {}
  for (const { record_id, ...v } of rows) {
    ;(out[record_id] ??= []).push(v)
  }
  return out
}

export type CustomFieldSubmission = {
  definitionId: string
  value: string | boolean | string[] | null
}

/**
 * Save every submitted value for one record, in one statement. The record
 * must be readable by the person saving — a foreign key proves it exists in
 * this tenant, not that they may see it — and every definition must belong
 * to the scope. A blank value clears the field. Returns the fields whose
 * value changed, keyed by field_key, for an audit diff.
 */
export async function saveValues(
  tx: Tx,
  tenantId: string,
  scope: FieldScope,
  recordId: string,
  submissions: CustomFieldSubmission[],
  actorId: string,
): Promise<Record<string, { from: string; to: string }>> {
  if (submissions.length === 0) return {}
  const table = tx.unsafe(RECORD_TABLE[scope.entityType])
  const [record] = await tx<{ ok: boolean }[]>`
    SELECT TRUE AS ok FROM ${table} WHERE id = ${recordId}::uuid
  `
  if (!record) throw new CustomFieldWriteRefused("no_such_record")

  const ids = submissions.map((s) => s.definitionId)
  const defs = await tx<
    {
      id: string
      field_key: string
      data_type: CustomFieldDataType
      options: CustomFieldOption[] | null
    }[]
  >`
    SELECT id, field_key, data_type, options FROM custom_field_definitions
     WHERE id = ANY(${ids}::uuid[]) AND entity_type = ${scope.entityType}
       AND business_area_id IS NOT DISTINCT FROM ${areaOf(scope)}::uuid
  `
  const defById = new Map(defs.map((d) => [d.id, d]))
  if (defById.size !== new Set(ids).size) {
    throw new CustomFieldWriteRefused("no_such_definition")
  }

  const before = (await valuesFor(tx, scope.entityType, [recordId]))[recordId]
  const beforeById = new Map(
    (before ?? []).map((v) => [v.field_definition_id, v]),
  )

  const rows = submissions.map(({ definitionId, value }) => {
    const def = defById.get(definitionId)!
    const empty =
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    if (
      !empty &&
      (def.data_type === "select" || def.data_type === "multiselect")
    ) {
      const allowed = new Set((def.options ?? []).map((o) => o.value))
      const chosen = Array.isArray(value) ? value : [value as string]
      if (chosen.some((v) => !allowed.has(v))) {
        throw new CustomFieldWriteRefused("invalid_option")
      }
    }
    const set = (type: CustomFieldDataType[]) =>
      !empty && type.includes(def.data_type) ? value : null
    return {
      definition_id: definitionId,
      value_text: set(["text", "select"]),
      value_number: set(["number"]),
      value_money: set(["money"]),
      value_date: set(["date"]),
      value_boolean: empty
        ? null
        : def.data_type === "boolean"
          ? value === true
          : null,
      value_multi: set(["multiselect"]),
    }
  })

  const column = tx.unsafe(RECORD_COLUMN[scope.entityType])
  await tx`
    INSERT INTO custom_field_values (
      tenant_id, field_definition_id, ${column}, updated_by,
      value_text, value_number, value_money, value_date, value_boolean, value_multi
    )
    SELECT ${tenantId}::uuid, r.definition_id, ${recordId}::uuid, ${actorId},
           r.value_text, r.value_number, r.value_money, r.value_date,
           r.value_boolean, r.value_multi
      FROM jsonb_to_recordset(${tx.json(rows as never)}) AS r(
             definition_id uuid, value_text text, value_number numeric(18,4),
             value_money numeric(15,2), value_date date, value_boolean boolean,
             value_multi jsonb)
    ON CONFLICT ON CONSTRAINT custom_field_values_unique DO UPDATE SET
      value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
      value_money = EXCLUDED.value_money, value_date = EXCLUDED.value_date,
      value_boolean = EXCLUDED.value_boolean, value_multi = EXCLUDED.value_multi,
      updated_at = now(), updated_by = EXCLUDED.updated_by
  `

  const after = (await valuesFor(tx, scope.entityType, [recordId]))[recordId]
  const afterById = new Map(
    (after ?? []).map((v) => [v.field_definition_id, v]),
  )
  const changes: Record<string, { from: string; to: string }> = {}
  for (const id of new Set(ids)) {
    const from = asText(beforeById.get(id))
    const to = asText(afterById.get(id))
    if (from !== to) changes[defById.get(id)!.field_key] = { from, to }
  }
  return changes
}

/** One value as a string, for an audit diff — never a JSON number (L41). */
function asText(v: CustomFieldValueRow | undefined): string {
  if (!v) return ""
  if (v.value_boolean !== null) return v.value_boolean ? "true" : "false"
  if (v.value_multi !== null) return v.value_multi.join(", ")
  return v.value_text ?? v.value_number ?? v.value_money ?? v.value_date ?? ""
}

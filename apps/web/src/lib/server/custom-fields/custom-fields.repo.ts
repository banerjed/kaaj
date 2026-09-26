import type { Tx } from "../db/tenant"

/**
 * Typed custom fields on projects and tasks (docs/26-project-management-custom-fields.md).
 * Tier 2 customization (docs/06-customization-model.md) — `custom_field_definitions`
 * already exists and already has one consumer (ticketing); this is the second,
 * scoped to `entity_type = 'project' | 'task'`. Values live in their own typed
 * table (`custom_field_values`), not the entity's own `custom_fields` JSONB —
 * deliberately: `money/jsonb-is-text` can't register a runtime-typed column,
 * and a real `NUMERIC` column is automatically covered by
 * `money/numeric-not-float` the way JSONB never could be.
 *
 * The financial-calculation boundary applies unchanged: a `money` field here
 * is typed and validated now, but must never be read by the accounting or
 * payroll modules, and never summed into `projects.budget`/`actual_cost`.
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

export const CUSTOM_FIELD_ENTITY_TYPES = ["project", "task"] as const
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number]

/**
 * Decoration, not status — deliberately NOT `Tone` from `$lib/components/status-tone`,
 * which its own docstring reserves for "meaning only". A custom field option
 * like a region or service line has no inherent meaning to encode. Four of
 * these reuse StatusBadge's already-AA-measured classes; the other four
 * (primary/secondary/accent/neutral) are daisyUI defaults nobody in this
 * codebase has measured against corporate/night yet — see LabelBadge.svelte.
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
  tone: LabelColor
}

export type CustomFieldDefinition = {
  id: string
  entity_type: CustomFieldEntityType
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
    readonly reason:
      "no_such_definition" | "wrong_entity_type" | "invalid_option",
  ) {
    super(reason)
    this.name = "CustomFieldWriteRefused"
  }
}

/** `snake_case`, matching the JSONB key convention every other custom field already uses — same as ticketing.repo.ts's own. */
function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/** Every active field definition an entity type carries, in display order — the form-rendering read, for both the settings page and the entity's own edit form. */
export async function definitionsFor(
  tx: Tx,
  entityType: CustomFieldEntityType,
): Promise<CustomFieldDefinition[]> {
  return tx<CustomFieldDefinition[]>`
    SELECT id, entity_type, field_key, label, help_text, data_type, options,
           is_required, display_order
      FROM custom_field_definitions
     WHERE entity_type = ${entityType} AND is_active
     ORDER BY display_order, label
  `
}

export async function createDefinition(
  tx: Tx,
  tenantId: string,
  input: {
    entityType: CustomFieldEntityType
    label: string
    helpText: string | null
    dataType: CustomFieldDataType
    options: CustomFieldOption[] | null
    isRequired: boolean
  },
): Promise<{ id: string }> {
  const fieldKey = slugifyFieldKey(input.label)
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO custom_field_definitions
      (tenant_id, entity_type, field_key, label, help_text, data_type,
       options, is_required, display_order)
    SELECT ${tenantId}::uuid, ${input.entityType}, ${fieldKey}, ${input.label},
           ${input.helpText}, ${input.dataType},
           ${input.options ? tx.json(input.options as never) : null},
           ${input.isRequired},
           coalesce((SELECT max(display_order) + 1 FROM custom_field_definitions
                      WHERE entity_type = ${input.entityType}), 1)
    RETURNING id
  `
  return row
}

export async function archiveDefinition(tx: Tx, id: string): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE custom_field_definitions SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}::uuid AND entity_type IN ('project', 'task')
    RETURNING id
  `
  return !!row
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

/** Every custom field value for a SET of entities of one type, in one query — batched, not one per entity (same discipline as documents.forEntities/comments.commentsForProject). */
export async function valuesFor(
  tx: Tx,
  entityType: CustomFieldEntityType,
  entityIds: string[],
): Promise<Record<string, CustomFieldValueRow[]>> {
  if (entityIds.length === 0) return {}
  const rows = await tx<(CustomFieldValueRow & { entity_id: string })[]>`
    SELECT field_definition_id, entity_id,
           value_text,
           value_number::text AS value_number,
           value_money::text  AS value_money,
           to_char(value_date, 'YYYY-MM-DD') AS value_date,
           value_boolean,
           value_multi
      FROM custom_field_values
     WHERE entity_type = ${entityType} AND entity_id = ANY(${entityIds}::uuid[])
       -- A cleared value (setValue's empty-input path) leaves an all-NULL
       -- row rather than deleting it (no DELETE grant) — excluded here so
       -- "has a value" stays a simple question for every caller.
       AND num_nonnulls(value_text, value_number, value_money, value_date,
                        value_boolean, value_multi) > 0
  `
  const out: Record<string, CustomFieldValueRow[]> = {}
  for (const { entity_id, ...v } of rows) {
    ;(out[entity_id] ??= []).push(v)
  }
  return out
}

const VALUE_COLUMN: Record<CustomFieldDataType, string> = {
  text: "value_text",
  select: "value_text",
  number: "value_number",
  money: "value_money",
  date: "value_date",
  boolean: "value_boolean",
  multiselect: "value_multi",
}

/**
 * Set (or clear) one field's value on one entity. An empty/null value clears
 * every typed column back to NULL rather than deleting the row —
 * `app_user` has no DELETE grant anywhere in this schema
 * (20260830120000_append_only.sql), and `custom_field_values_one_typed_value`
 * is `<= 1`, not `= 1`, precisely so an all-NULL row is valid.
 *
 * `column` is chosen from `VALUE_COLUMN`, a fixed internal map keyed by the
 * definition's own `data_type` read from the database one line above — never
 * from caller input — so `tx.unsafe(column)` here is the same safe pattern
 * `projects.repo.ts`'s `nextNumber` already uses for a column name chosen
 * from a small fixed set.
 */
export async function setValue(
  tx: Tx,
  tenantId: string,
  fieldDefinitionId: string,
  entityType: CustomFieldEntityType,
  entityId: string,
  value: string | boolean | string[] | null,
  actorId: string,
): Promise<void> {
  const [def] = await tx<
    {
      data_type: CustomFieldDataType
      entity_type: string
      options: CustomFieldOption[] | null
    }[]
  >`
    SELECT data_type, entity_type, options FROM custom_field_definitions
     WHERE id = ${fieldDefinitionId}::uuid
  `
  if (!def) throw new CustomFieldWriteRefused("no_such_definition")
  if (def.entity_type !== entityType) {
    throw new CustomFieldWriteRefused("wrong_entity_type")
  }

  const isEmpty =
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  if (isEmpty) {
    // `app_user` has no DELETE grant anywhere in this schema
    // (20260830120000_append_only.sql) — clearing a value UPDATEs every
    // typed column back to NULL (or inserts an all-NULL row, if none
    // exists yet) rather than removing the row. `<= 1`, not `= 1`, is what
    // makes an all-NULL row valid under the CHECK.
    await tx`
      INSERT INTO custom_field_values (
        tenant_id, field_definition_id, entity_type, entity_id, updated_by
      ) VALUES (
        ${tenantId}::uuid, ${fieldDefinitionId}::uuid, ${entityType}, ${entityId}::uuid, ${actorId}
      )
      ON CONFLICT (tenant_id, field_definition_id, entity_type, entity_id)
      DO UPDATE SET value_text = NULL, value_number = NULL, value_money = NULL,
                    value_date = NULL, value_boolean = NULL, value_multi = NULL,
                    updated_at = now(), updated_by = EXCLUDED.updated_by
    `
    return
  }

  if (def.data_type === "select" || def.data_type === "multiselect") {
    // Never boolean for these two data_types — `isEmpty` above already
    // excluded null/"" /[].
    const stringValue = value as string | string[]
    const allowed = new Set((def.options ?? []).map((o) => o.value))
    const chosen = Array.isArray(stringValue) ? stringValue : [stringValue]
    if (chosen.some((v) => !allowed.has(v))) {
      throw new CustomFieldWriteRefused("invalid_option")
    }
  }

  const column = VALUE_COLUMN[def.data_type]
  const sqlValue =
    def.data_type === "multiselect"
      ? tx.json(value as never)
      : def.data_type === "boolean"
        ? value === true || value === "true"
        : def.data_type === "number"
          ? tx`${value as string}::numeric(18,4)`
          : def.data_type === "money"
            ? tx`${value as string}::numeric(15,2)`
            : def.data_type === "date"
              ? tx`${value as string}::date`
              : (value as string)

  await tx`
    INSERT INTO custom_field_values (
      tenant_id, field_definition_id, entity_type, entity_id, ${tx.unsafe(column)}, updated_by
    ) VALUES (
      ${tenantId}::uuid, ${fieldDefinitionId}::uuid, ${entityType}, ${entityId}::uuid, ${sqlValue}, ${actorId}
    )
    ON CONFLICT (tenant_id, field_definition_id, entity_type, entity_id)
    DO UPDATE SET ${tx.unsafe(column)} = EXCLUDED.${tx.unsafe(column)},
                  updated_at = now(), updated_by = EXCLUDED.updated_by
  `
}

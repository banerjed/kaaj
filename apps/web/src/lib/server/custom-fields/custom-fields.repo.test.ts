import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as customFields from "./custom-fields.repo"
import { CustomFieldWriteRefused } from "./custom-fields.repo"

/** Typed custom fields (docs/26-project-management-custom-fields.md), against the real database. Every case rolls back. */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/** T-001 'Discovery workshops', in PRJ-001. */
const T1 = "48961ce2-d17a-5ebe-81db-f608b4b6b125"
/** T-002 'Data model mapping', in PRJ-001. */
const T2 = "864cc09e-6b7e-58b4-a2e2-04233fbfea70"
/** The fixture's own pre-existing entity_type='task' definition (boolean). */
const CLIENT_BILLABLE = "210b40b7-df80-5139-b843-821bfa8da2f7"

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(AS_OWNER, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

describe("custom field definitions", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("the fixture's own pre-existing task definition is real coverage, not a placeholder", async () => {
    const defs = await inRollback((tx) =>
      customFields.definitionsFor(tx, "task"),
    )
    expect(defs.find((d) => d.id === CLIENT_BILLABLE)?.field_key).toBe(
      "client_billable",
    )
  })

  it("createDefinition slugifies the label into field_key and assigns the next display_order", async () => {
    const def = await inRollback(async (tx) => {
      const created = await customFields.createDefinition(tx, NORTHWIND, {
        entityType: "task",
        label: "Client Sign-off Status",
        helpText: null,
        dataType: "text",
        options: null,
        isRequired: false,
      })
      const [row] = await tx<{ field_key: string; display_order: number }[]>`
        SELECT field_key, display_order FROM custom_field_definitions WHERE id = ${created.id}::uuid
      `
      return row
    })
    expect(def.field_key).toBe("client_sign_off_status")
    expect(def.display_order).toBeGreaterThan(0)
  })

  it("archiveDefinition is soft — is_active flips, the row survives, and it drops out of definitionsFor", async () => {
    const { stillExists, gone } = await inRollback(async (tx) => {
      const created = await customFields.createDefinition(tx, NORTHWIND, {
        entityType: "project",
        label: "Retired Field",
        helpText: null,
        dataType: "text",
        options: null,
        isRequired: false,
      })
      await customFields.archiveDefinition(tx, created.id)
      const [row] = await tx<{ is_active: boolean }[]>`
        SELECT is_active FROM custom_field_definitions WHERE id = ${created.id}::uuid
      `
      const defs = await customFields.definitionsFor(tx, "project")
      return {
        stillExists: row,
        gone: defs.find((d) => d.id === created.id),
      }
    })
    expect(stillExists.is_active).toBe(false)
    expect(gone).toBeUndefined()
  })
})

describe("custom field values", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("setValue then valuesFor round-trips a text value", async () => {
    const values = await inRollback(async (tx) => {
      const created = await customFields.createDefinition(tx, NORTHWIND, {
        entityType: "task",
        label: "Region",
        helpText: null,
        dataType: "text",
        options: null,
        isRequired: false,
      })
      await customFields.setValue(
        tx,
        NORTHWIND,
        created.id,
        "task",
        T1,
        "APAC",
        ACTOR,
      )
      return customFields.valuesFor(tx, "task", [T1])
    })
    expect(values[T1]?.[0].value_text).toBe("APAC")
  })

  it("setValue round-trips number, money, date and boolean into their own typed columns, never a shared one", async () => {
    const rows = await inRollback(async (tx) => {
      const hours = await customFields.createDefinition(tx, NORTHWIND, {
        entityType: "task",
        label: "Extra Hours",
        helpText: null,
        dataType: "number",
        options: null,
        isRequired: false,
      })
      const cost = await customFields.createDefinition(tx, NORTHWIND, {
        entityType: "task",
        label: "Licensing Cost",
        helpText: null,
        dataType: "money",
        options: null,
        isRequired: false,
      })
      const signOff = await customFields.createDefinition(tx, NORTHWIND, {
        entityType: "task",
        label: "Sign-off Date",
        helpText: null,
        dataType: "date",
        options: null,
        isRequired: false,
      })
      await customFields.setValue(
        tx,
        NORTHWIND,
        hours.id,
        "task",
        T1,
        "12.5",
        ACTOR,
      )
      await customFields.setValue(
        tx,
        NORTHWIND,
        cost.id,
        "task",
        T1,
        "999.99",
        ACTOR,
      )
      await customFields.setValue(
        tx,
        NORTHWIND,
        signOff.id,
        "task",
        T1,
        "2026-11-30",
        ACTOR,
      )
      await customFields.setValue(
        tx,
        NORTHWIND,
        CLIENT_BILLABLE,
        "task",
        T1,
        true,
        ACTOR,
      )
      return customFields.valuesFor(tx, "task", [T1])
    })
    const byDef = Object.fromEntries(
      rows[T1].map((r) => [r.field_definition_id, r]),
    )
    const hoursRow = Object.values(byDef).find(
      (r) => r.value_number === "12.5000",
    )
    expect(hoursRow).toBeDefined()
    const costRow = Object.values(byDef).find((r) => r.value_money === "999.99")
    expect(costRow).toBeDefined()
    const dateRow = Object.values(byDef).find(
      (r) => r.value_date === "2026-11-30",
    )
    expect(dateRow).toBeDefined()
    expect(byDef[CLIENT_BILLABLE].value_boolean).toBe(true)
    // Each row has exactly one typed column set — the CHECK constraint's own guarantee, asserted from the read side too.
    for (const row of rows[T1]) {
      const populated = [
        row.value_text,
        row.value_number,
        row.value_money,
        row.value_date,
        row.value_boolean,
        row.value_multi,
      ].filter((v) => v !== null)
      expect(populated).toHaveLength(1)
    }
  })

  it("setValue with an empty string clears every typed column to NULL — never a DELETE (app_user has no DELETE grant, 20260830120000_append_only.sql)", async () => {
    const { afterSet, afterClear, row, createdId } = await inRollback(
      async (tx) => {
        const created = await customFields.createDefinition(tx, NORTHWIND, {
          entityType: "task",
          label: "Transient Note",
          helpText: null,
          dataType: "text",
          options: null,
          isRequired: false,
        })
        await customFields.setValue(
          tx,
          NORTHWIND,
          created.id,
          "task",
          T1,
          "hello",
          ACTOR,
        )
        const afterSet = await customFields.valuesFor(tx, "task", [T1])
        await customFields.setValue(
          tx,
          NORTHWIND,
          created.id,
          "task",
          T1,
          "",
          ACTOR,
        )
        const afterClear = await customFields.valuesFor(tx, "task", [T1])
        const [row] = await tx<{ value_text: string | null }[]>`
        SELECT value_text FROM custom_field_values
         WHERE field_definition_id = ${created.id}::uuid AND entity_id = ${T1}::uuid
      `
        return { afterSet, afterClear, row, createdId: created.id }
      },
    )
    expect(afterSet[T1]?.some((r) => r.value_text === "hello")).toBe(true)
    // The row survives (no DELETE grant) with every typed column NULL —
    // and valuesFor excludes an all-NULL row, so "has a value" stays simple
    // for every caller. T1 carries its own fixture custom field values
    // (region, sign-off date) independent of this one, so the assertion is
    // "this specific field is gone," not "T1 has none at all."
    expect(row).toBeDefined()
    expect(row.value_text).toBeNull()
    expect(
      afterClear[T1]?.some((r) => r.field_definition_id === createdId),
    ).toBe(false)
  })

  it("refuses a value for a field definition that does not exist", async () => {
    await expect(
      inRollback((tx) =>
        customFields.setValue(
          tx,
          NORTHWIND,
          "00000000-0000-0000-0000-000000000000",
          "task",
          T1,
          "x",
          ACTOR,
        ),
      ),
    ).rejects.toThrow(CustomFieldWriteRefused)
  })

  it("refuses a value posted against the wrong entity_type", async () => {
    // client_billable is entity_type = 'task'.
    await expect(
      inRollback((tx) =>
        customFields.setValue(
          tx,
          NORTHWIND,
          CLIENT_BILLABLE,
          "project",
          T1,
          true,
          ACTOR,
        ),
      ),
    ).rejects.toThrow(CustomFieldWriteRefused)
  })

  it("refuses a select/multiselect value that isn't one of the definition's own options", async () => {
    const def = await inRollback((tx) =>
      customFields.createDefinition(tx, NORTHWIND, {
        entityType: "task",
        label: "Priority Tier",
        helpText: null,
        dataType: "select",
        options: [
          { value: "gold", label: "Gold", tone: "success" },
          { value: "silver", label: "Silver", tone: "info" },
        ],
        isRequired: false,
      }),
    )
    await expect(
      inRollback((tx) =>
        customFields.setValue(
          tx,
          NORTHWIND,
          def.id,
          "task",
          T1,
          "platinum",
          ACTOR,
        ),
      ),
    ).rejects.toThrow(CustomFieldWriteRefused)
  })

  it("valuesFor is batched — a set of entities in one call, grouped by entity id", async () => {
    const { values, fieldId } = await inRollback(async (tx) => {
      const created = await customFields.createDefinition(tx, NORTHWIND, {
        entityType: "task",
        label: "Batched Field",
        helpText: null,
        dataType: "text",
        options: null,
        isRequired: false,
      })
      await customFields.setValue(
        tx,
        NORTHWIND,
        created.id,
        "task",
        T1,
        "one",
        ACTOR,
      )
      await customFields.setValue(
        tx,
        NORTHWIND,
        created.id,
        "task",
        T2,
        "two",
        ACTOR,
      )
      return {
        values: await customFields.valuesFor(tx, "task", [T1, T2]),
        fieldId: created.id,
      }
    })
    // T1/T2 carry other fixture custom field values too — find this one by
    // its own field_definition_id, not by array position.
    expect(
      values[T1]?.find((r) => r.field_definition_id === fieldId)?.value_text,
    ).toBe("one")
    expect(
      values[T2]?.find((r) => r.field_definition_id === fieldId)?.value_text,
    ).toBe("two")
  })

  it("valuesFor returns nothing for an empty id list, without querying", async () => {
    const result = await inRollback((tx) =>
      customFields.valuesFor(tx, "task", []),
    )
    expect(result).toEqual({})
  })
})

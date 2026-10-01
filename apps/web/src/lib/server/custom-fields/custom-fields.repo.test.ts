import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as customFields from "./custom-fields.repo"
import { CustomFieldWriteRefused, type FieldScope } from "./custom-fields.repo"

/** Custom fields (docs/31-custom-fields.md), against the real database. Every case rolls back. */

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
const PRJ_001 = "8257009f-6a91-5fd1-9efb-518198c08e2a"
/** The fixture's task boolean field, in the "Billing" category. */
const CLIENT_BILLABLE = "210b40b7-df80-5139-b843-821bfa8da2f7"
const IT_SUPPORT = "872ea5b0-1dc9-5e20-be3e-5eaa8c431c0c"
const FACILITIES = "2e90b722-25ef-51b7-866b-e93d3bcca1c3"
const IT_0001 = "a22f6d41-d654-5951-a043-e174f7e1a258"

const TASK: FieldScope = { entityType: "task" }
const PROJECT: FieldScope = { entityType: "project" }

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

/** The constraint a raw statement trips, or null if it was accepted. */
async function refusedBy(fn: (tx: Tx) => Promise<unknown>) {
  try {
    await inRollback(fn)
    return null
  } catch (e) {
    return (e as { constraint_name?: string }).constraint_name ?? String(e)
  }
}

const field = (
  label: string,
  over: Partial<{
    category: string
    dataType: customFields.CustomFieldDataType
  }> = {},
) => ({
  category: over.category ?? "General",
  label,
  helpText: null,
  dataType: over.dataType ?? ("text" as const),
  options: null,
  isRequired: false,
})

afterAll(async () => {
  await closeConnections()
})

describe("custom field definitions", () => {
  it("lists General first, then each category in the order it was first used, each field by its position within its category", async () => {
    const defs = await inRollback((tx) => customFields.definitionsFor(tx, TASK))
    expect(defs.map((d) => [d.category, d.field_key])).toEqual([
      ["General", "region"],
      ["General", "priority_tier"],
      ["Billing", "client_billable"],
      ["Billing", "extra_hours"],
      ["Billing", "client_signoff_date"],
    ])
  })

  it("gives a ticket area only its own fields", async () => {
    const [it, fac] = await inRollback((tx) =>
      Promise.all([
        customFields.definitionsFor(tx, {
          entityType: "ticket",
          businessAreaId: IT_SUPPORT,
        }),
        customFields.definitionsFor(tx, {
          entityType: "ticket",
          businessAreaId: FACILITIES,
        }),
      ]),
    )
    expect(it.map((d) => d.field_key)).toEqual([
      "asset_tag",
      "requires_manager_approval",
    ])
    expect(fac.map((d) => d.field_key)).toEqual([
      "location",
      "vendor_ticket_number",
    ])
  })

  it("slugifies the label and numbers a field from 1 within a new category", async () => {
    const row = await inRollback(async (tx) => {
      const created = await customFields.createDefinition(
        tx,
        NORTHWIND,
        TASK,
        field("Client Sign-off Status", { category: "Approvals" }),
      )
      const [r] = await tx<
        { field_key: string; display_order: number; category: string }[]
      >`
        SELECT field_key, display_order, category FROM custom_field_definitions WHERE id = ${created.id}::uuid`
      return r
    })
    expect(row).toEqual({
      field_key: "client_sign_off_status",
      display_order: 1,
      category: "Approvals",
    })
  })

  it("moves a field within its category only", async () => {
    const keys = await inRollback(async (tx) => {
      const [, extraHours] = (
        await customFields.definitionsFor(tx, TASK)
      ).filter((d) => d.category === "Billing")
      await customFields.moveDefinition(tx, TASK, extraHours.id, "up")
      return (await customFields.definitionsFor(tx, TASK)).map(
        (d) => d.field_key,
      )
    })
    expect(keys).toEqual([
      "region",
      "priority_tier",
      "extra_hours",
      "client_billable",
      "client_signoff_date",
    ])
  })

  it("will not move the first field up or the last down", async () => {
    const moved = await inRollback(async (tx) => {
      const defs = await customFields.definitionsFor(tx, TASK)
      return [
        await customFields.moveDefinition(tx, TASK, defs[0].id, "up"),
        await customFields.moveDefinition(tx, TASK, defs[4].id, "down"),
      ]
    })
    expect(moved).toEqual([false, false])
  })

  it("renames a category on every field in it, archived ones included", async () => {
    const { moved, categories, archived } = await inRollback(async (tx) => {
      const old = await customFields.createDefinition(
        tx,
        NORTHWIND,
        TASK,
        field("Old Billing Field", { category: "Billing" }),
      )
      await customFields.archiveDefinition(tx, TASK, old.id)
      const moved = await customFields.renameCategory(
        tx,
        TASK,
        "Billing",
        "Invoicing",
      )
      const categories = [
        ...new Set(
          (await customFields.definitionsFor(tx, TASK)).map((d) => d.category),
        ),
      ]
      const [a] = await tx<
        { category: string }[]
      >`SELECT category FROM custom_field_definitions WHERE id = ${old.id}::uuid`
      return { moved, categories, archived: a.category }
    })
    expect(moved).toBe(4)
    expect(categories).toEqual(["General", "Invoicing"])
    expect(archived).toBe("Invoicing")
  })

  it("archives softly, and only within the page's own scope", async () => {
    const { wrongScope, archived, listed, row } = await inRollback(
      async (tx) => {
        const created = await customFields.createDefinition(
          tx,
          NORTHWIND,
          PROJECT,
          field("Retired Field"),
        )
        const wrongScope = await customFields.archiveDefinition(
          tx,
          TASK,
          created.id,
        )
        const archived = await customFields.archiveDefinition(
          tx,
          PROJECT,
          created.id,
        )
        const listed = (await customFields.definitionsFor(tx, PROJECT)).some(
          (d) => d.id === created.id,
        )
        const [row] = await tx<
          { is_active: boolean }[]
        >`SELECT is_active FROM custom_field_definitions WHERE id = ${created.id}::uuid`
        return { wrongScope, archived, listed, row }
      },
    )
    expect({ wrongScope, archived, listed, active: row.is_active }).toEqual({
      wrongScope: false,
      archived: true,
      listed: false,
      active: false,
    })
  })
})

describe("the schema holds the rules", () => {
  const insertDef =
    (entityType: string, area: string | null, key: string) => (tx: Tx) => tx`
    INSERT INTO custom_field_definitions (tenant_id, entity_type, business_area_id, field_key, label, data_type)
    VALUES (${NORTHWIND}::uuid, ${entityType}, ${area}::uuid, ${key}, 'Probe', 'text')`

  it("refuses a duplicate field key where there is no business area", async () => {
    expect(await refusedBy(insertDef("task", null, "region"))).toBe(
      "uq_custom_field_definitions_key",
    )
  })

  it("refuses an entity type it does not know", async () => {
    expect(await refusedBy(insertDef("taks", null, "probe"))).toBe(
      "ck_custom_field_definitions_entity_type",
    )
  })

  it("refuses a ticket field with no area, and an area on anything else", async () => {
    expect(await refusedBy(insertDef("ticket", null, "probe"))).toBe(
      "ck_custom_field_definitions_ticket_area",
    )
    expect(await refusedBy(insertDef("task", IT_SUPPORT, "probe"))).toBe(
      "ck_custom_field_definitions_ticket_area",
    )
  })

  it("accepts a well-formed definition — the permitted half", async () => {
    expect(await refusedBy(insertDef("task", null, "probe"))).toBeNull()
  })

  it("refuses a value naming two records, or none", async () => {
    const value =
      (project: string | null, task: string | null) => (tx: Tx) => tx`
      INSERT INTO custom_field_values (tenant_id, field_definition_id, project_id, task_id, value_boolean, updated_by)
      VALUES (${NORTHWIND}::uuid, ${CLIENT_BILLABLE}::uuid, ${project}::uuid, ${task}::uuid, true, ${ACTOR})`
    expect(await refusedBy(value(PRJ_001, T1))).toBe(
      "ck_custom_field_values_one_record",
    )
    expect(await refusedBy(value(null, null))).toBe(
      "ck_custom_field_values_one_record",
    )
  })

  it("refuses a value whose field is for another kind of record", async () => {
    // client_billable is a TASK field; PRJ-001 is a project.
    expect(
      await refusedBy(
        (tx) => tx`
        INSERT INTO custom_field_values (tenant_id, field_definition_id, project_id, value_boolean, updated_by)
        VALUES (${NORTHWIND}::uuid, ${CLIENT_BILLABLE}::uuid, ${PRJ_001}::uuid, true, ${ACTOR})`,
      ),
    ).toBe("fk_custom_field_values_definition")
  })

  it("refuses a value for a record that does not exist", async () => {
    expect(
      await refusedBy(
        (tx) => tx`
        INSERT INTO custom_field_values (tenant_id, field_definition_id, task_id, value_boolean, updated_by)
        VALUES (${NORTHWIND}::uuid, ${CLIENT_BILLABLE}::uuid, gen_random_uuid(), true, ${ACTOR})`,
      ),
    ).toBe("fk_custom_field_values_task")
  })
})

describe("custom field values", () => {
  it("round-trips every type into its own typed column, and reports what changed", async () => {
    const { rows, changes } = await inRollback(async (tx) => {
      const make = (
        label: string,
        dataType: customFields.CustomFieldDataType,
      ) =>
        customFields.createDefinition(
          tx,
          NORTHWIND,
          TASK,
          field(label, { dataType }),
        )
      const [hours, cost, signOff, note] = await Promise.all([
        make("Probe Hours", "number"),
        make("Probe Cost", "money"),
        make("Probe Date", "date"),
        make("Probe Note", "text"),
      ])
      const changes = await customFields.saveValues(
        tx,
        NORTHWIND,
        TASK,
        T1,
        [
          { definitionId: hours.id, value: "12.5" },
          { definitionId: cost.id, value: "999.99" },
          { definitionId: signOff.id, value: "2026-11-30" },
          { definitionId: note.id, value: "hello" },
          { definitionId: CLIENT_BILLABLE, value: true },
        ],
        ACTOR,
      )
      return {
        rows: (await customFields.valuesFor(tx, "task", [T1]))[T1],
        changes,
      }
    })
    expect(rows.find((r) => r.value_number === "12.5000")).toBeDefined()
    expect(rows.find((r) => r.value_money === "999.99")).toBeDefined()
    expect(rows.find((r) => r.value_date === "2026-11-30")).toBeDefined()
    expect(rows.find((r) => r.value_text === "hello")).toBeDefined()
    expect(
      rows.find((r) => r.field_definition_id === CLIENT_BILLABLE)
        ?.value_boolean,
    ).toBe(true)
    for (const row of rows) {
      const set = [
        row.value_text,
        row.value_number,
        row.value_money,
        row.value_date,
        row.value_boolean,
        row.value_multi,
      ]
      expect(set.filter((v) => v !== null)).toHaveLength(1)
    }
    expect(changes).toMatchObject({
      probe_hours: { from: "", to: "12.5000" },
      probe_note: { from: "", to: "hello" },
      client_billable: { from: "", to: "true" },
    })
  })

  it("saves a ticket value against the ticket, and reports nothing when nothing changed", async () => {
    const scope: FieldScope = {
      entityType: "ticket",
      businessAreaId: IT_SUPPORT,
    }
    const { first, again, value } = await inRollback(async (tx) => {
      const [assetTag] = await customFields.definitionsFor(tx, scope)
      const first = await customFields.saveValues(
        tx,
        NORTHWIND,
        scope,
        IT_0001,
        [{ definitionId: assetTag.id, value: "LT-9999" }],
        ACTOR,
      )
      const again = await customFields.saveValues(
        tx,
        NORTHWIND,
        scope,
        IT_0001,
        [{ definitionId: assetTag.id, value: "LT-9999" }],
        ACTOR,
      )
      const value = (await customFields.valuesFor(tx, "ticket", [IT_0001]))[
        IT_0001
      ].find((v) => v.field_definition_id === assetTag.id)
      return { first, again, value: value?.value_text }
    })
    expect(first).toEqual({ asset_tag: { from: "LT-2291", to: "LT-9999" } })
    expect(again).toEqual({})
    expect(value).toBe("LT-9999")
  })

  it("clears a value to an all-NULL row, never a DELETE", async () => {
    const { listed, row } = await inRollback(async (tx) => {
      const created = await customFields.createDefinition(
        tx,
        NORTHWIND,
        TASK,
        field("Transient Note"),
      )
      await customFields.saveValues(
        tx,
        NORTHWIND,
        TASK,
        T1,
        [{ definitionId: created.id, value: "hello" }],
        ACTOR,
      )
      await customFields.saveValues(
        tx,
        NORTHWIND,
        TASK,
        T1,
        [{ definitionId: created.id, value: "" }],
        ACTOR,
      )
      const listed = (await customFields.valuesFor(tx, "task", [T1]))[T1].some(
        (r) => r.field_definition_id === created.id,
      )
      const [row] = await tx<{ value_text: string | null }[]>`
        SELECT value_text FROM custom_field_values WHERE field_definition_id = ${created.id}::uuid AND task_id = ${T1}::uuid`
      return { listed, row }
    })
    expect(listed).toBe(false)
    expect(row).toEqual({ value_text: null })
  })

  it.each([
    [
      "a definition that does not exist",
      TASK,
      "00000000-0000-0000-0000-000000000000",
      T1,
      "no_such_definition",
    ],
    [
      "a task field posted against a project",
      PROJECT,
      CLIENT_BILLABLE,
      PRJ_001,
      "no_such_definition",
    ],
    [
      "a record that does not exist",
      TASK,
      CLIENT_BILLABLE,
      "00000000-0000-0000-0000-000000000000",
      "no_such_record",
    ],
  ] as const)(
    "refuses %s",
    async (_, scope, definitionId, recordId, reason) => {
      await expect(
        inRollback((tx) =>
          customFields.saveValues(
            tx,
            NORTHWIND,
            scope,
            recordId,
            [{ definitionId, value: true }],
            ACTOR,
          ),
        ),
      ).rejects.toSatisfy(
        (e) => e instanceof CustomFieldWriteRefused && e.reason === reason,
      )
    },
  )

  it("refuses another area's ticket field", async () => {
    await expect(
      inRollback(async (tx) => {
        const [location] = await customFields.definitionsFor(tx, {
          entityType: "ticket",
          businessAreaId: FACILITIES,
        })
        return customFields.saveValues(
          tx,
          NORTHWIND,
          { entityType: "ticket", businessAreaId: IT_SUPPORT },
          IT_0001,
          [{ definitionId: location.id, value: "Room 1" }],
          ACTOR,
        )
      }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof CustomFieldWriteRefused &&
        e.reason === "no_such_definition",
    )
  })

  it("refuses an option the field does not offer", async () => {
    await expect(
      inRollback(async (tx) => {
        const tier = (await customFields.definitionsFor(tx, TASK)).find(
          (d) => d.field_key === "priority_tier",
        )!
        return customFields.saveValues(
          tx,
          NORTHWIND,
          TASK,
          T1,
          [{ definitionId: tier.id, value: "platinum" }],
          ACTOR,
        )
      }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof CustomFieldWriteRefused && e.reason === "invalid_option",
    )
  })

  it("saves and lists company and deal fields under their categories", async () => {
    const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
    const ACME_RENEWAL = "22222222-dea1-4000-8000-000000000002"
    const COMPANY: FieldScope = { entityType: "company" }
    const DEAL: FieldScope = { entityType: "deal" }
    const { companyCategories, dealCategories, changes, seats } =
      await inRollback(async (tx) => {
        const companyDefs = await customFields.definitionsFor(tx, COMPANY)
        const dealDefs = await customFields.definitionsFor(tx, DEAL)
        const tier = companyDefs.find((d) => d.field_key === "account_tier")!
        const seatsDef = dealDefs.find((d) => d.field_key === "seats")!
        const changes = await customFields.saveValues(
          tx,
          NORTHWIND,
          COMPANY,
          ACME,
          [{ definitionId: tier.id, value: "growth" }],
          ACTOR,
        )
        await customFields.saveValues(
          tx,
          NORTHWIND,
          DEAL,
          ACME_RENEWAL,
          [{ definitionId: seatsDef.id, value: "300" }],
          ACTOR,
        )
        const seats = (
          await customFields.valuesFor(tx, "deal", [ACME_RENEWAL])
        )[ACME_RENEWAL].find(
          (v) => v.field_definition_id === seatsDef.id,
        )?.value_number
        return {
          companyCategories: [...new Set(companyDefs.map((d) => d.category))],
          dealCategories: [...new Set(dealDefs.map((d) => d.category))],
          changes,
          seats,
        }
      })
    expect(companyCategories).toEqual(["Account", "Compliance"])
    // Created in one statement, so they tie on first use and sort by name.
    expect(dealCategories).toEqual(["Competition", "Qualification"])
    expect(changes).toEqual({
      account_tier: { from: "strategic", to: "growth" },
    })
    expect(seats).toBe("300.0000")
  })

  it("refuses a company field posted against a deal", async () => {
    await expect(
      inRollback(async (tx) => {
        const [tier] = await customFields.definitionsFor(tx, {
          entityType: "company",
        })
        return customFields.saveValues(
          tx,
          NORTHWIND,
          { entityType: "deal" },
          "22222222-dea1-4000-8000-000000000002",
          [{ definitionId: tier.id, value: "growth" }],
          ACTOR,
        )
      }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof CustomFieldWriteRefused &&
        e.reason === "no_such_definition",
    )
  })

  it("reads a set of records in one call, grouped by record", async () => {
    const values = await inRollback((tx) =>
      customFields.valuesFor(tx, "task", [T1, T2]),
    )
    expect(values[T1].some((v) => v.value_text === "APAC")).toBe(true)
    expect(values[T2].some((v) => v.value_number === "6.5000")).toBe(true)
  })

  it("returns nothing for an empty id list, without querying", async () => {
    expect(
      await inRollback((tx) => customFields.valuesFor(tx, "task", [])),
    ).toEqual({})
  })
})

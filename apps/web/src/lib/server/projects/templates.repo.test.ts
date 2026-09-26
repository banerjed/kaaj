import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as templates from "./templates.repo"
import { TemplateWriteRefused } from "./templates.repo"

/** Project templates (docs/25-project-management-phase2.md), against the real database. Every case rolls back. */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/** PRJ-001 — three TOP-LEVEL tasks (T1 done/Feb 13, T2 in_progress/Mar 20, T3 todo/May 29)
 *  plus one SUBTASK (T8, due Jul 31) that must NOT be captured. */
const PRJ1 = "8257009f-6a91-5fd1-9efb-518198c08e2a"

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

describe("project templates", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("captures only the project's top-level tasks, never a subtask", async () => {
    const tasks = await inRollback(async (tx) => {
      const created = await templates.saveAsTemplate(
        tx,
        NORTHWIND,
        PRJ1,
        { name: "Test template", description: null, category: null },
        ACTOR,
      )
      return templates.tasksFromTemplate(tx, created.id)
    })
    expect(tasks).toHaveLength(3)
    expect(tasks.map((t) => t.task_name)).not.toContain(
      "Write up discovery findings",
    )
  })

  it("computes due_offset_days relative to the EARLIEST due date among top-level tasks", async () => {
    const tasks = await inRollback(async (tx) => {
      const created = await templates.saveAsTemplate(
        tx,
        NORTHWIND,
        PRJ1,
        { name: "Offsets", description: null, category: null },
        ACTOR,
      )
      return templates.tasksFromTemplate(tx, created.id)
    })
    const byName = Object.fromEntries(tasks.map((t) => [t.task_name, t]))
    // Discovery workshops is due Feb 13 2026 — the earliest, so its own offset is 0.
    expect(byName["Discovery workshops"].due_offset_days).toBe(0)
    // Data model mapping (Mar 20) and Integration build (May 29) are both later.
    expect(byName["Data model mapping"].due_offset_days).toBeGreaterThan(0)
    expect(byName["Integration build"].due_offset_days).toBeGreaterThan(
      byName["Data model mapping"].due_offset_days!,
    )
  })

  it("does NOT capture assignee, dates or dependencies — only name/description/priority/hours/offset", async () => {
    const tasks = await inRollback(async (tx) => {
      const created = await templates.saveAsTemplate(
        tx,
        NORTHWIND,
        PRJ1,
        { name: "Shape only", description: null, category: null },
        ACTOR,
      )
      return templates.tasksFromTemplate(tx, created.id)
    })
    for (const t of tasks) {
      expect(Object.keys(t).sort()).toEqual(
        [
          "description",
          "due_offset_days",
          "estimated_hours",
          "priority",
          "task_name",
        ].sort(),
      )
    }
  })

  it("refuses a template for a project that does not exist", async () => {
    await expect(
      inRollback((tx) =>
        templates.saveAsTemplate(
          tx,
          NORTHWIND,
          "00000000-0000-0000-0000-000000000000",
          { name: "x", description: null, category: null },
          ACTOR,
        ),
      ),
    ).rejects.toThrow(TemplateWriteRefused)
  })

  it("refuses tasksFromTemplate for a template that does not exist", async () => {
    await expect(
      inRollback((tx) =>
        templates.tasksFromTemplate(tx, "00000000-0000-0000-0000-000000000000"),
      ),
    ).rejects.toThrow(TemplateWriteRefused)
  })

  it("recordUse is a plain increment — a monotonic usage counter, not a derived aggregate", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const created = await templates.saveAsTemplate(
        tx,
        NORTHWIND,
        PRJ1,
        { name: "Use count", description: null, category: null },
        ACTOR,
      )
      const [before] = await templates
        .listTemplates(tx)
        .then((rows) => rows.filter((r) => r.id === created.id))
      await templates.recordUse(tx, created.id)
      const [after] = await templates
        .listTemplates(tx)
        .then((rows) => rows.filter((r) => r.id === created.id))
      return { before, after }
    })
    expect(after.use_count).toBe(before.use_count + 1)
  })

  it("listTemplates' task_count matches the captured task array length", async () => {
    const row = await inRollback(async (tx) => {
      const created = await templates.saveAsTemplate(
        tx,
        NORTHWIND,
        PRJ1,
        { name: "Count check", description: null, category: null },
        ACTOR,
      )
      const rows = await templates.listTemplates(tx)
      return rows.find((r) => r.id === created.id)!
    })
    expect(row.task_count).toBe(3)
  })

  it("assigns a TPL-nnn id and takes the next free number", async () => {
    const { templateId, existing } = await inRollback(async (tx) => {
      const existing = await tx<{ n: string }[]>`
        SELECT template_id AS n FROM pm_project_templates WHERE template_id IS NOT NULL
      `
      const created = await templates.saveAsTemplate(
        tx,
        NORTHWIND,
        PRJ1,
        { name: "Numbering", description: null, category: null },
        ACTOR,
      )
      return {
        templateId: created.template_id,
        existing: existing.map((r) => r.n),
      }
    })
    expect(templateId).toMatch(/^TPL-\d{3}$/)
    expect(existing).not.toContain(templateId)
  })
})

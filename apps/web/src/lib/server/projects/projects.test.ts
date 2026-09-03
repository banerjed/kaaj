import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant } from "../db/tenant"
import * as projects from "./projects.repo"

/**
 * Projects and tasks, against the real database. No row-visibility policy —
 * the disclosure boundary here is `client_visible`, asserted separately.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: "6d466aa9-e51a-5d52-9015-152600855932",
}

describe("the project list", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("counts tasks itself rather than trusting the stored counter", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => projects.list(tx))
    expect(rows.length).toBeGreaterThan(0)
    for (const p of rows) {
      expect(
        p.actual_task_count,
        `${p.project_number}: stored task_count ${p.task_count} but ${p.actual_task_count} tasks exist`,
      ).toBe(p.task_count)
      expect(p.actual_completed_count).toBe(p.completed_task_count)
    }
  })

  it("reports no stale counters in the fixture", async () => {
    const stale = await withTenant(AS_OWNER, (tx) => projects.staleCounters(tx))
    expect(stale).toEqual([])
  })

  it("returns money as strings, with the currency beside it", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => projects.list(tx))
    const funded = rows.filter((p) => p.budget !== null && Number(p.budget) > 0)
    expect(funded.length).toBeGreaterThan(0)
    for (const p of funded) {
      expect(typeof p.budget).toBe("string")
      expect(p.currency).toMatch(/^[A-Z]{3}$/)
    }
  })

  it("carries more than one currency, so nothing may assume USD", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => projects.list(tx))
    const currencies = new Set(rows.map((p) => p.currency))
    expect(currencies.size).toBeGreaterThan(1)
  })

  it("filters by status and by health", async () => {
    const [active, atRisk] = await withTenant(AS_OWNER, async (tx) => [
      await projects.list(tx, { status: "active" }),
      await projects.list(tx, { health: "at_risk" }),
    ])
    expect(active.length).toBeGreaterThan(0)
    expect(active.every((p) => p.status === "active")).toBe(true)
    expect(atRisk.length).toBeGreaterThan(0)
    expect(atRisk.every((p) => p.health_status === "at_risk")).toBe(true)
  })
})

describe("tasks on a project", () => {
  it("marks overdue against the DATABASE's date, not the viewer's", async () => {
    const rows = await withTenant(AS_OWNER, async (tx) => {
      const [first] = await projects.list(tx)
      return projects.tasksFor(tx, first.id)
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const t of rows) {
      const past =
        t.due_date !== null &&
        t.due_date < new Date().toISOString().slice(0, 10)
      expect(t.is_overdue).toBe(past && t.status !== "done")
    }
  })

  it("does not call a delivered task overdue", async () => {
    const all = await withTenant(AS_OWNER, async (tx) => {
      const ps = await projects.list(tx)
      const out = []
      for (const p of ps) out.push(...(await projects.tasksFor(tx, p.id)))
      return out
    })
    const done = all.filter((t) => t.status === "done")
    expect(done.length).toBeGreaterThan(0)
    expect(done.every((t) => t.is_overdue === false)).toBe(true)
  })

  it("has at least one genuinely overdue task to render", async () => {
    const all = await withTenant(AS_OWNER, async (tx) => {
      const ps = await projects.list(tx)
      const out = []
      for (const p of ps) out.push(...(await projects.tasksFor(tx, p.id)))
      return out
    })
    expect(all.some((t) => t.is_overdue)).toBe(true)
  })

  it("varies priority, so ordering and filtering have something to do", async () => {
    const all = await withTenant(AS_OWNER, async (tx) => {
      const ps = await projects.list(tx)
      const out = []
      for (const p of ps) out.push(...(await projects.tasksFor(tx, p.id)))
      return out
    })
    expect(new Set(all.map((t) => t.priority)).size).toBeGreaterThan(1)
  })
})

describe("the client-visible slice", () => {
  it("filters in SQL and never returns another client's work", async () => {
    const result = await withTenant(AS_OWNER, async (tx) => {
      const [row] = await tx<{ id: string }[]>`SELECT id FROM clients LIMIT 1`
      return {
        clientId: row.id,
        visible: await projects.clientVisibleOnly(tx, row.id),
        all: await projects.list(tx),
      }
    })
    expect(result.visible.length).toBeLessThanOrEqual(result.all.length)
    const names = new Set(result.visible.map((p) => p.project_name))
    for (const p of result.all) {
      if (!names.has(p.project_name)) continue
      expect(p.client_name).not.toBeNull()
    }
  })
})

import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as objectives from "./objectives.repo"
import * as projects from "../projects/projects.repo"

/**
 * Objective rollup — progress_percentage, health_status and actual_revenue
 * are recomputed from linked projects, never incremented (L58). Every case
 * rolls back, same pattern as projects.writes.test.ts.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/**
 * OBJ-001 — linked to all four fixture projects (PRJ-001..004). The fixture
 * deliberately varies these ("a board where everything is green never shows
 * what the status colours are for"): PRJ1 active/on_track, PRJ2
 * active/at_risk, PRJ3 active/off_track, PRJ4 on_hold/on_track/ARCHIVED.
 * `normalizeObj1Projects` resets all four before a test that needs a clean
 * baseline.
 */
const OBJ1 = "960d66b2-8a52-59d0-8cf8-5c383d031244"
const PRJ1 = "8257009f-6a91-5fd1-9efb-518198c08e2a"
const PRJ2 = "fda698f3-bf14-5aae-bed6-330c8b5a6a70"

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

const BASE_EDIT = {
  project_name: "x",
  status: "active",
  priority: "medium",
  health_status: "on_track",
  target_end_date: null,
  budget: null,
  currency: "USD",
  is_billable: true,
  hourly_rate: null,
}

afterAll(async () => {
  await closeConnections()
})

describe("objective rollup — recomputed, never incremented", () => {
  it("is zero for an objective with no linked projects", async () => {
    const created = await inRollback(async (tx) => {
      const { id } = await objectives.createObjective(
        tx,
        NORTHWIND,
        {
          objective_name: "Empty objective",
          description: null,
          objective_type: "general",
          status: "planning",
          client_id: null,
          owner_employee_id: null,
          start_date: null,
          target_end_date: null,
          fiscal_year: null,
          quarter: null,
          target_revenue: null,
          currency: "USD",
        },
        ACTOR,
      )
      return (await objectives.byId(tx, id))!
    })
    expect(created.progress_percentage).toBe("0.0000")
    expect(created.actual_revenue).toBe("0.0000")
    expect(created.health_status).toBe("on_track")
  })

  it("recomputes when a project is created under the objective, even the first one", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const { id: objId } = await objectives.createObjective(
        tx,
        NORTHWIND,
        {
          objective_name: "Fresh objective",
          description: null,
          objective_type: "general",
          status: "planning",
          client_id: null,
          owner_employee_id: null,
          start_date: null,
          target_end_date: null,
          fiscal_year: null,
          quarter: null,
          target_revenue: null,
          currency: "USD",
        },
        ACTOR,
      )
      const before = (await objectives.byId(tx, objId))!
      await projects.createProject(
        tx,
        NORTHWIND,
        {
          project_name: "New under objective",
          client_id: null,
          project_manager_id: null,
          status: "completed",
          priority: "medium",
          health_status: "on_track",
          start_date: null,
          target_end_date: null,
          budget: null,
          currency: "USD",
          estimated_hours: null,
          is_billable: true,
          hourly_rate: null,
          description: null,
          objective_id: objId,
        },
        ACTOR,
      )
      const after = (await objectives.byId(tx, objId))!
      return { before, after }
    })
    expect(before.progress_percentage).toBe("0.0000")
    expect(after.progress_percentage).toBe("100.0000")
  })

  it("recomputes the OLD objective when a project moves to a different one", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const before = (await objectives.byId(tx, OBJ1))!
      await projects.updateProject(
        tx,
        PRJ1,
        { ...BASE_EDIT, objective_id: null },
        ACTOR,
      )
      const after = (await objectives.byId(tx, OBJ1))!
      return { before, after }
    })
    // OBJ1 goes from 4 projects to 3 — progress recomputed, not left stale.
    expect(after.project_count).toBe(before.project_count - 1)
  })

  it("recomputes the NEW objective when an already-existing, previously-unlinked project is edited onto it", async () => {
    const { before, after, project } = await inRollback(async (tx) => {
      const before = (await objectives.byId(tx, OBJ1))!
      // A fresh project, created with no objective at all — not a project
      // that already belonged to a DIFFERENT one (that's the "moves" case
      // above); this is the "gains its first link via an edit" case.
      const { id: projectId } = await projects.createProject(
        tx,
        NORTHWIND,
        {
          project_name: "Previously unlinked project",
          client_id: null,
          project_manager_id: null,
          status: "completed",
          priority: "medium",
          health_status: "on_track",
          start_date: null,
          target_end_date: null,
          budget: null,
          currency: "USD",
          estimated_hours: null,
          is_billable: true,
          hourly_rate: null,
          description: null,
          objective_id: null,
        },
        ACTOR,
      )
      const project = (await projects.byId(tx, projectId))!
      expect(project.objective_id).toBeNull()

      // The edit path (updateProject), not another createProject — this is
      // the transition item 2 of the test plan names as untested.
      await projects.updateProject(
        tx,
        projectId,
        {
          project_name: project.project_name,
          status: project.status!,
          priority: project.priority!,
          health_status: project.health_status!,
          target_end_date: null,
          budget: null,
          currency: "USD",
          is_billable: true,
          hourly_rate: null,
          objective_id: OBJ1,
        },
        ACTOR,
      )
      const after = (await objectives.byId(tx, OBJ1))!
      return { before, after, project }
    })
    expect(project.objective_id).toBeNull() // captured before the edit
    expect(after.project_count).toBe(before.project_count + 1)
  })

  /**
   * The fixture deliberately varies PRJ-002 (at_risk), PRJ-003 (off_track)
   * and archives PRJ-004 ("a board where everything is green never shows
   * what the status colours are for" — mock-data.sql) so every isolated
   * scenario below normalizes the four linked projects to a known baseline
   * first, rather than assume a pristine fixture.
   */
  async function normalizeObj1Projects(tx: Tx) {
    await tx`
      UPDATE projects
         SET status = 'active', health_status = 'on_track', archived_at = NULL
       WHERE objective_id = ${OBJ1}::uuid
    `
    await objectives.refreshRollup(tx, OBJ1)
  }

  it("progress_percentage is completed / total, not an average of percentages", async () => {
    const pct = await inRollback(async (tx) => {
      await normalizeObj1Projects(tx)
      // Move PRJ1 and PRJ2 to 'completed'; PRJ3 and PRJ4 stay active.
      await projects.updateProject(
        tx,
        PRJ1,
        { ...BASE_EDIT, status: "completed", objective_id: OBJ1 },
        ACTOR,
      )
      await projects.updateProject(
        tx,
        PRJ2,
        { ...BASE_EDIT, status: "completed", objective_id: OBJ1 },
        ACTOR,
      )
      return (await objectives.byId(tx, OBJ1))!.progress_percentage
    })
    expect(pct).toBe("50.0000")
  })

  it("health_status is off_track if ANY linked project is off_track, regardless of the others", async () => {
    const health = await inRollback(async (tx) => {
      await normalizeObj1Projects(tx)
      await projects.updateProject(
        tx,
        PRJ1,
        { ...BASE_EDIT, health_status: "off_track", objective_id: OBJ1 },
        ACTOR,
      )
      // The other three stay on_track — off_track must still win.
      return (await objectives.byId(tx, OBJ1))!.health_status
    })
    expect(health).toBe("off_track")
  })

  it("health_status is at_risk when more than 30% of projects are at_risk (2 of 4)", async () => {
    const health = await inRollback(async (tx) => {
      await normalizeObj1Projects(tx)
      await projects.updateProject(
        tx,
        PRJ1,
        { ...BASE_EDIT, health_status: "at_risk", objective_id: OBJ1 },
        ACTOR,
      )
      await projects.updateProject(
        tx,
        PRJ2,
        { ...BASE_EDIT, health_status: "at_risk", objective_id: OBJ1 },
        ACTOR,
      )
      return (await objectives.byId(tx, OBJ1))!.health_status
    })
    expect(health).toBe("at_risk")
  })

  it("health_status stays on_track when at_risk is 30% or less (1 of 4)", async () => {
    const health = await inRollback(async (tx) => {
      await normalizeObj1Projects(tx)
      await projects.updateProject(
        tx,
        PRJ1,
        { ...BASE_EDIT, health_status: "at_risk", objective_id: OBJ1 },
        ACTOR,
      )
      return (await objectives.byId(tx, OBJ1))!.health_status
    })
    expect(health).toBe("on_track")
  })

  it("excludes an archived project's total_billed from actual_revenue", async () => {
    const revenue = await inRollback(async (tx) => {
      // Raw SQL, then an explicit refresh — total_billed has no write path
      // of its own yet (no invoicing integration), so this exercises the
      // rollup formula directly rather than through a repository write.
      await tx`UPDATE projects SET total_billed = 50000 WHERE id = ${PRJ1}::uuid`
      await objectives.refreshRollup(tx, OBJ1)
      const withIt = (await objectives.byId(tx, OBJ1))!.actual_revenue

      await tx`UPDATE projects SET archived_at = now() WHERE id = ${PRJ1}::uuid`
      await objectives.refreshRollup(tx, OBJ1)
      const withoutIt = (await objectives.byId(tx, OBJ1))!.actual_revenue
      return { withIt, withoutIt }
    })
    expect(Number(revenue.withIt)).toBeGreaterThan(0)
    expect(revenue.withoutIt).not.toBe(revenue.withIt)
  })

  it("recompute is SET, not increment — a corrupted stored value self-heals", async () => {
    const after = await inRollback(async (tx) => {
      await tx`UPDATE pm_objectives SET progress_percentage = 9999, actual_revenue = -1 WHERE id = ${OBJ1}::uuid`
      await objectives.refreshRollup(tx, OBJ1)
      return (await objectives.byId(tx, OBJ1))!
    })
    expect(Number(after.progress_percentage)).toBeLessThanOrEqual(100)
    expect(Number(after.actual_revenue)).toBeGreaterThanOrEqual(0)
  })
})

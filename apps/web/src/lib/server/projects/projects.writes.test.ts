import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as projects from "./projects.repo"
import { ProjectWriteRefused } from "./projects.repo"

/**
 * The project and task WRITES, against the real database. Most of this file
 * asserts `staleCounters()` is empty AFTER a write, not before. Every case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/** An owner, so a row policy cannot silently narrow what these tests see. */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "75bf4b0c-4f4b-cad9-daec-de7be09ff367"

/** PRJ-001 — three tasks, one of them done. */
const PRJ1 = "8257009f-6a91-5fd1-9efb-518198c08e2a"
/** T-003 'Integration build', todo. */
const T3 = "6d029a3a-8887-50a7-85b0-9e22408bdf61"
/** T-001 'Discovery workshops', done. */
const T1 = "48961ce2-d17a-5ebe-81db-f608b4b6b125"
/** T-002 'Data model mapping', in_progress — depends on T1 in the fixture. */
const T2 = "864cc09e-6b7e-58b4-a2e2-04233fbfea70"
/** T-008 'Write up discovery findings' — a real subtask of T1 (depth_level 1). */
const T8_SUBTASK = "a19f5b3e-2b7a-5c3e-9a0d-7e6f4c2b1a90"
/** T-004 'Loyalty rules engine', in a different project (PRJ-002). */
const T4_OTHER_PROJECT = "e5557981-472b-5016-a458-b1de5cce6910"

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

const NEW_TASK = {
  project_id: PRJ1,
  task_name: "Cutover rehearsal",
  status: "todo" as const,
  priority: "high",
  assigned_to: null,
  start_date: null,
  due_date: "2026-11-30",
  estimated_hours: "12.5000",
  is_billable: true,
  description: null,
}

describe("adding a task keeps the project's counters true", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("raises task_count, and leaves completed alone for an open task", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const before = (await projects.byId(tx, PRJ1))!
      await projects.createTask(tx, NORTHWIND, NEW_TASK, ACTOR)
      return { before, after: (await projects.byId(tx, PRJ1))! }
    })
    expect(after.task_count).toBe(before.task_count + 1)
    expect(after.completed_task_count).toBe(before.completed_task_count)
    expect(after.task_count).toBe(after.actual_task_count)
  })

  it("counts a task created as done immediately", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const before = (await projects.byId(tx, PRJ1))!
      await projects.createTask(
        tx,
        NORTHWIND,
        { ...NEW_TASK, status: "done" },
        ACTOR,
      )
      return { before, after: (await projects.byId(tx, PRJ1))! }
    })
    expect(after.task_count).toBe(before.task_count + 1)
    expect(after.completed_task_count).toBe(before.completed_task_count + 1)
    expect(after.completed_task_count).toBe(after.actual_completed_count)
  })

  it("leaves no stale counter anywhere in the tenant", async () => {
    const stale = await inRollback(async (tx) => {
      await projects.createTask(tx, NORTHWIND, NEW_TASK, ACTOR)
      return projects.staleCounters(tx)
    })
    expect(stale).toEqual([])
  })

  it("takes the next free number rather than reusing one", async () => {
    const { number, existing } = await inRollback(async (tx) => {
      const existing = await tx<{ n: string }[]>`
        SELECT task_number AS n FROM tasks
      `
      const created = await projects.createTask(tx, NORTHWIND, NEW_TASK, ACTOR)
      return { number: created.task_number, existing: existing.map((r) => r.n) }
    })
    expect(number).toMatch(/^T-\d{3}$/)
    expect(existing).not.toContain(number)
  })

  it("refuses a task on a project that does not exist", async () => {
    await expect(
      inRollback((tx) =>
        projects.createTask(
          tx,
          NORTHWIND,
          { ...NEW_TASK, project_id: "00000000-0000-0000-0000-000000000000" },
          ACTOR,
        ),
      ),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("stores estimated_hours exactly, without a float round trip", async () => {
    const hours = await inRollback(async (tx) => {
      const { id } = await projects.createTask(
        tx,
        NORTHWIND,
        { ...NEW_TASK, estimated_hours: "12.3456" },
        ACTOR,
      )
      const [row] = await tx<{ h: string }[]>`
        SELECT estimated_hours::text AS h FROM tasks WHERE id = ${id}::uuid
      `
      return row.h
    })
    expect(typeof hours).toBe("string")
    expect(hours).toBe("12.3456")
  })
})

describe("moving a task", () => {
  it("raises the completed count and dates the completion", async () => {
    const { before, after, task } = await inRollback(async (tx) => {
      const before = (await projects.byId(tx, PRJ1))!
      await projects.setTaskStatus(tx, T3, "done", ACTOR)
      const [task] = await tx<
        { completed_date: string | null; progress: string }[]
      >`
        SELECT to_char(completed_date,'YYYY-MM-DD') AS completed_date,
               progress_percentage::text AS progress
          FROM tasks WHERE id = ${T3}::uuid
      `
      return { before, after: (await projects.byId(tx, PRJ1))!, task }
    })
    expect(after.completed_task_count).toBe(before.completed_task_count + 1)
    expect(after.task_count).toBe(before.task_count)
    expect(task.completed_date).not.toBeNull()
    expect(task.progress).toBe("100.0000")
  })

  it("clears the completion when a task is pulled back out of done", async () => {
    const { after, task } = await inRollback(async (tx) => {
      await projects.setTaskStatus(tx, T1, "in_progress", ACTOR)
      const [task] = await tx<
        { completed_date: string | null; completed_at: Date | null }[]
      >`
        SELECT completed_date, completed_at FROM tasks WHERE id = ${T1}::uuid
      `
      return { after: (await projects.byId(tx, PRJ1))!, task }
    })
    expect(task.completed_date).toBeNull()
    expect(task.completed_at).toBeNull()
    expect(after.completed_task_count).toBe(after.actual_completed_count)
  })

  it("reports what the status WAS, which is the half an audit needs", async () => {
    const moved = await inRollback((tx) =>
      projects.setTaskStatus(tx, T3, "in_progress", ACTOR),
    )
    expect(moved.from).toBe("todo")
    expect(moved.project_id).toBe(PRJ1)
  })

  it("refuses a task that does not exist", async () => {
    await expect(
      inRollback((tx) =>
        projects.setTaskStatus(
          tx,
          "00000000-0000-0000-0000-000000000000",
          "done",
          ACTOR,
        ),
      ),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("REPAIRS a counter that had already drifted", async () => {
    // Recomputed, not incremented — a wrong prior value self-heals.
    const { corrupted, repaired } = await inRollback(async (tx) => {
      await tx`UPDATE projects SET task_count = 99 WHERE id = ${PRJ1}::uuid`
      const corrupted = await projects.staleCounters(tx)
      await projects.setTaskStatus(tx, T3, "review", ACTOR)
      return { corrupted, repaired: await projects.staleCounters(tx) }
    })
    expect(corrupted.length).toBe(1)
    expect(repaired).toEqual([])
  })
})

describe("creating a project", () => {
  const NEW_PROJECT = {
    project_name: "Warehouse relabelling",
    client_id: null,
    project_manager_id: null,
    status: "draft",
    priority: "medium",
    health_status: "on_track",
    start_date: "2026-10-01",
    target_end_date: "2026-12-15",
    budget: "125000.5000",
    currency: "EUR",
    estimated_hours: "800.0000",
    is_billable: true,
    hourly_rate: "145.7500",
    description: null,
    objective_id: null,
  }

  it("starts with both counters at zero and no tasks", async () => {
    const row = await inRollback(async (tx) => {
      const { id } = await projects.createProject(
        tx,
        NORTHWIND,
        NEW_PROJECT,
        ACTOR,
      )
      return (await projects.byId(tx, id))!
    })
    expect(row.task_count).toBe(0)
    expect(row.completed_task_count).toBe(0)
    expect(row.actual_task_count).toBe(0)
  })

  it("keeps money as an exact string in its own currency", async () => {
    const row = await inRollback(async (tx) => {
      const { id } = await projects.createProject(
        tx,
        NORTHWIND,
        NEW_PROJECT,
        ACTOR,
      )
      return (await projects.byId(tx, id))!
    })
    expect(row.budget).toBe("125000.5000")
    expect(row.currency).toBe("EUR")
    expect(typeof row.budget).toBe("string")
  })

  it("takes the next free project number", async () => {
    const { number, existing } = await inRollback(async (tx) => {
      const existing = await tx<{ n: string }[]>`
        SELECT project_number AS n FROM projects
      `
      const created = await projects.createProject(
        tx,
        NORTHWIND,
        NEW_PROJECT,
        ACTOR,
      )
      return {
        number: created.project_number,
        existing: existing.map((r) => r.n),
      }
    })
    expect(number).toMatch(/^PRJ-\d{3}$/)
    expect(existing).not.toContain(number)
  })

  it("is reachable from the list, which is why draft is a filter value", async () => {
    const found = await inRollback(async (tx) => {
      const created = await projects.createProject(
        tx,
        NORTHWIND,
        NEW_PROJECT,
        ACTOR,
      )
      const rows = await projects.list(tx, { status: "draft" })
      return rows.some((p) => p.project_number === created.project_number)
    })
    expect(found).toBe(true)
    expect(projects.PROJECT_STATUSES).toContain("draft")
  })
})

describe("editing a project", () => {
  it("returns the values it replaced, so the trail has a from and a to", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const current = (await projects.byId(tx, PRJ1))!
      const before = await projects.updateProject(
        tx,
        PRJ1,
        {
          project_name: current.project_name,
          status: "on_hold",
          priority: "urgent",
          health_status: "at_risk",
          target_end_date: current.target_end_date,
          budget: "999000.0000",
          currency: current.currency ?? "USD",
          is_billable: true,
          hourly_rate: "200.0000",
          objective_id: current.objective_id,
        },
        ACTOR,
      )
      return { before, after: (await projects.byId(tx, PRJ1))! }
    })
    expect(before.status).toBe("active")
    expect(after.status).toBe("on_hold")
    expect(after.budget).toBe("999000.0000")
  })

  it("does not disturb the counters", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const before = (await projects.byId(tx, PRJ1))!
      await projects.updateProject(
        tx,
        PRJ1,
        {
          project_name: before.project_name,
          status: "active",
          priority: "low",
          health_status: "on_track",
          target_end_date: before.target_end_date,
          budget: before.budget,
          currency: before.currency ?? "USD",
          is_billable: true,
          hourly_rate: "10.0000",
          objective_id: before.objective_id,
        },
        ACTOR,
      )
      return { before, after: (await projects.byId(tx, PRJ1))! }
    })
    expect(after.task_count).toBe(before.task_count)
    expect(after.completed_task_count).toBe(before.completed_task_count)
  })

  it("refuses a project that does not exist", async () => {
    await expect(
      inRollback((tx) =>
        projects.updateProject(
          tx,
          "00000000-0000-0000-0000-000000000000",
          {
            project_name: "x",
            status: "active",
            priority: "low",
            health_status: "on_track",
            target_end_date: null,
            budget: null,
            currency: "USD",
            is_billable: false,
            hourly_rate: null,
            objective_id: null,
          },
          ACTOR,
        ),
      ),
    ).rejects.toThrow(ProjectWriteRefused)
  })
})

describe("subtasks — one level deep (docs/23-project-management-phase1.md)", () => {
  it("computes depth_level 0 when no parent is given", async () => {
    const created = await inRollback(async (tx) => {
      const { id } = await projects.createTask(tx, NORTHWIND, NEW_TASK, ACTOR)
      return (await projects.tasksFor(tx, PRJ1)).find((t) => t.id === id)!
    })
    expect(created.depth_level).toBe(0)
    expect(created.parent_task_id).toBeNull()
  })

  it("computes depth_level 1 and stores the parent when one is given", async () => {
    const created = await inRollback(async (tx) => {
      const { id } = await projects.createTask(
        tx,
        NORTHWIND,
        { ...NEW_TASK, parent_task_id: T1 },
        ACTOR,
      )
      return (await projects.tasksFor(tx, PRJ1)).find((t) => t.id === id)!
    })
    expect(created.depth_level).toBe(1)
    expect(created.parent_task_id).toBe(T1)
  })

  it("refuses a parent that is itself a subtask — one level only", async () => {
    await expect(
      inRollback((tx) =>
        projects.createTask(
          tx,
          NORTHWIND,
          { ...NEW_TASK, parent_task_id: T8_SUBTASK },
          ACTOR,
        ),
      ),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("refuses a parent from a different project", async () => {
    await expect(
      inRollback((tx) =>
        projects.createTask(
          tx,
          NORTHWIND,
          { ...NEW_TASK, parent_task_id: T4_OTHER_PROJECT },
          ACTOR,
        ),
      ),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("counts a subtask toward the project's task_count — a subtask is still a task", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const before = (await projects.byId(tx, PRJ1))!
      await projects.createTask(
        tx,
        NORTHWIND,
        { ...NEW_TASK, parent_task_id: T1 },
        ACTOR,
      )
      return { before, after: (await projects.byId(tx, PRJ1))! }
    })
    expect(after.task_count).toBe(before.task_count + 1)
    expect(after.task_count).toBe(after.actual_task_count)
  })

  it("sorts a subtask directly after its parent in tasksFor, regardless of task_number", async () => {
    const rows = await inRollback(async (tx) => {
      // A new top-level task normally sorts after existing ones (later
      // due_date / task_number) — a subtask of T1 should sort right after
      // T1 anyway, not wherever its own task_number would place it.
      await projects.createTask(
        tx,
        NORTHWIND,
        { ...NEW_TASK, parent_task_id: T1 },
        ACTOR,
      )
      return projects.tasksFor(tx, PRJ1)
    })
    const t1Index = rows.findIndex((t) => t.id === T1)
    const newSubtaskIndex = rows.findIndex(
      (t) => t.task_name === NEW_TASK.task_name,
    )
    // Both T1's pre-existing subtask (T-008) and the new one land immediately
    // after T1, before any other top-level task.
    expect(newSubtaskIndex).toBeGreaterThan(t1Index)
    const nextTopLevelIndex = rows.findIndex(
      (t, i) => i > t1Index && t.depth_level === 0,
    )
    expect(newSubtaskIndex).toBeLessThan(nextTopLevelIndex)
  })
})

describe("task dependencies — same project, no cycles (docs/23-project-management-phase1.md)", () => {
  it("updates both sides in one call: depends_on and the reverse blocks index", async () => {
    const rows = await inRollback(async (tx) => {
      // T3 already depends on T1 (fixture); add a second edge T3 -> T8_SUBTASK.
      await projects.addDependency(tx, T3, T8_SUBTASK, ACTOR)
      return projects.tasksFor(tx, PRJ1)
    })
    const t3 = rows.find((t) => t.id === T3)!
    const subtask = rows.find((t) => t.id === T8_SUBTASK)!
    expect(t3.depends_on.map((d) => d.id)).toContain(T8_SUBTASK)
    expect(subtask.blocks.map((b) => b.id)).toContain(T3)
  })

  it("refuses a dependency on a task in a different project", async () => {
    await expect(
      inRollback((tx) =>
        projects.addDependency(tx, T3, T4_OTHER_PROJECT, ACTOR),
      ),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("refuses a task depending on itself", async () => {
    await expect(
      inRollback((tx) => projects.addDependency(tx, T3, T3, ACTOR)),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("the no_self_dependency CHECK refuses a self-reference even bypassing addDependency entirely", async () => {
    // Not projects.addDependency (already covered above) — a raw write
    // straight past the repository, proving the database itself is the
    // backstop the app-level guard is not the only thing standing on.
    await expect(
      inRollback(
        (tx) => tx`
          UPDATE tasks
             SET depends_on_task_ids = jsonb_build_array(id::text)
           WHERE id = ${T3}::uuid
        `,
      ),
    ).rejects.toThrow(/no_self_dependency/)
  })

  it("refuses a direct cycle: T2 already depends on T1, so T1 depending on T2 is refused", async () => {
    await expect(
      inRollback((tx) => projects.addDependency(tx, T1, T2, ACTOR)),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("refuses a transitive cycle across more than one hop", async () => {
    await expect(
      inRollback(async (tx) => {
        // Build T3 -> T2 -> T1 (T3 no longer depends on T1 directly for this
        // chain), then attempting T1 -> T3 must be refused: T3 can already
        // reach T1 in two hops.
        await projects.removeDependency(tx, T3, T1, ACTOR)
        await projects.addDependency(tx, T3, T2, ACTOR)
        await projects.addDependency(tx, T1, T3, ACTOR)
      }),
    ).rejects.toThrow(ProjectWriteRefused)
  })

  it("removing a dependency clears the reverse index on the far side too", async () => {
    const rows = await inRollback(async (tx) => {
      await projects.removeDependency(tx, T2, T1, ACTOR)
      return projects.tasksFor(tx, PRJ1)
    })
    const t1 = rows.find((t) => t.id === T1)!
    const t2 = rows.find((t) => t.id === T2)!
    expect(t2.depends_on.map((d) => d.id)).not.toContain(T1)
    expect(t1.blocks.map((b) => b.id)).not.toContain(T2)
    // T3 still depends on T1 (untouched) — the recompute is project-wide,
    // not "clear everything".
    expect(t1.blocks.map((b) => b.id)).toContain(T3)
  })

  it("recomputing blocks_task_ids for one project never touches a task in a different project", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const [before] = await tx<{ blocks_task_ids: string[] }[]>`
        SELECT blocks_task_ids FROM tasks WHERE id = ${T4_OTHER_PROJECT}::uuid
      `
      // Several writes to PRJ1's dependency graph — none of them should ever
      // reach a row outside PRJ1.
      await projects.addDependency(tx, T3, T8_SUBTASK, ACTOR)
      await projects.removeDependency(tx, T2, T1, ACTOR)
      const [after] = await tx<{ blocks_task_ids: string[] }[]>`
        SELECT blocks_task_ids FROM tasks WHERE id = ${T4_OTHER_PROJECT}::uuid
      `
      return { before, after }
    })
    expect(after.blocks_task_ids).toEqual(before.blocks_task_ids)
  })

  it("annotates a dependent task as blocked without touching its own status, and the annotation disappears once the dependency is resolved — still without touching status", async () => {
    const { before, blocked, resolved } = await inRollback(async (tx) => {
      const before = (await projects.tasksFor(tx, PRJ1)).find(
        (t) => t.id === T2,
      )!
      // T2 depends on T1, which is already 'done' in the fixture — not
      // blocked. Depend on T3 (still 'todo') to exercise the annotation.
      await projects.addDependency(tx, T2, T3, ACTOR)
      const blocked = (await projects.tasksFor(tx, PRJ1)).find(
        (t) => t.id === T2,
      )!

      // Resolve the dependency — the annotation is read live off T3's own
      // status, so finishing T3 (never T2) is what should clear it.
      await projects.setTaskStatus(tx, T3, "done", ACTOR)
      const resolved = (await projects.tasksFor(tx, PRJ1)).find(
        (t) => t.id === T2,
      )!

      return { before, blocked, resolved }
    })

    const incompleteWhileBlocked = blocked.depends_on.filter(
      (d) => d.status !== "done",
    )
    expect(incompleteWhileBlocked.map((d) => d.id)).toContain(T3)

    const incompleteAfterResolving = resolved.depends_on.filter(
      (d) => d.status !== "done",
    )
    expect(incompleteAfterResolving).toEqual([])

    // T2's OWN status never moved, through either transition — the
    // annotation is read-only, never a second status-setting path.
    expect(before.status).toBe(blocked.status)
    expect(blocked.status).toBe(resolved.status)
  })
})

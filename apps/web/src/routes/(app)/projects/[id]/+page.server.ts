import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as projects from "$lib/server/projects/projects.repo"
import { ProjectWriteRefused } from "$lib/server/projects/projects.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

const {
  TASK_STATUSES,
  TASK_PRIORITIES,
  PROJECT_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_PRIORITIES,
} = projects

/** /projects/[id] — a project and its tasks. */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)

  return withTenant(actorFrom(locals), async (tx) => {
    const project = await projects.byId(tx, params.id)
    if (!project) error(404, "No such project")
    return {
      project,
      tasks: await projects.tasksFor(tx, project.id),
      taskStatuses: TASK_STATUSES,
      taskPriorities: TASK_PRIORITIES,
      projectStatuses: PROJECT_STATUSES,
      projectHealths: PROJECT_HEALTHS,
      projectPriorities: PROJECT_PRIORITIES,
      mayWrite: can(ctx, "projects.write"),
      assignees: await tx<{ id: string; name: string }[]>`
        SELECT id, first_name || ' ' || last_name AS name
          FROM employees
         WHERE employment_status = 'active'
         ORDER BY first_name, last_name
      `,
    }
  })
}

/** Turn a domain refusal into something the page can show on a field. */
function refusal(e: ProjectWriteRefused) {
  switch (e.reason) {
    case "no_such_task":
      return { message: "That task no longer exists.", field: "task_id" }
    case "no_such_project":
      return { message: "That project no longer exists.", field: "task_name" }
    case "number_taken":
      return {
        message:
          "Another task was added at the same moment and took that number. Try again.",
        field: "task_name",
      }
    case "unknown_status":
      return {
        message: "That is not a status a task can be in.",
        field: "status",
      }
  }
}

export const actions: Actions = {
  /**
   * Add a task. NOT audited — a task move doesn't touch money, employment or
   * rights, and a row per move would bury the entries that matter. `createTask`
   * recomputes the project's counters in the same transaction.
   */
  addTask: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const taskName = f.text("task_name", { max: 200, required: true })
    const description = f.text("description", { max: 2000 })
    const status = f.choice("status", TASK_STATUSES, { required: true })
    const priority = f.choice("priority", TASK_PRIORITIES)
    // assigned_to is TEXT with no FK; validating as uuid anyway stops a malformed value.
    const assignedTo = f.uuid("assigned_to")
    const startDate = f.date("start_date")
    const dueDate = f.date("due_date")
    const estimatedHours = f.decimal("estimated_hours", { scale: 4 })
    const isBillable = f.bool("is_billable")

    if (startDate && dueDate && dueDate < startDate) f.reject("due_date")
    if (!f.ok) return fail(400, f.problem("That task is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await projects.createTask(
          tx,
          locals.tenantId!,
          {
            project_id: params.id,
            task_name: taskName!,
            description,
            status: status!,
            priority,
            assigned_to: assignedTo,
            start_date: startDate,
            due_date: dueDate,
            estimated_hours: estimatedHours,
            is_billable: isBillable,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        return { added: created.task_number }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /**
   * Move a task to another status. NOT audited, same reasoning as `addTask`.
   * `setTaskStatus` moves the completion fields together, so pulling a task
   * back out of `done` doesn't leave it still looking finished.
   */
  moveTask: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const taskId = f.uuid("task_id", { required: true })
    const status = f.choice("status", TASK_STATUSES, { required: true })
    if (!f.ok) return fail(400, f.problem("That move is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const moved = await projects.setTaskStatus(
          tx,
          taskId!,
          status!,
          ctx!.employeeId ?? ctx!.userId,
        )
        return { moved: moved.task_name, from: moved.from, to: status }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** Edit the project itself. Audited — only the fields that moved. */
  updateProject: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const projectName = f.text("project_name", { max: 200, required: true })
    const status = f.choice("status", PROJECT_STATUSES, { required: true })
    const priority = f.choice("priority", PROJECT_PRIORITIES, {
      required: true,
    })
    const health = f.choice("health_status", PROJECT_HEALTHS, {
      required: true,
    })
    const targetEnd = f.date("target_end_date")
    const budget = f.decimal("budget", { scale: 4 })
    const currency = f.currency("currency", { required: true })
    const hourlyRate = f.decimal("hourly_rate", { scale: 4 })
    const isBillable = f.bool("is_billable")

    if (!f.ok) return fail(400, f.problem("That change is not valid."))

    const next = {
      project_name: projectName!,
      status: status!,
      priority: priority!,
      health_status: health!,
      target_end_date: targetEnd,
      budget,
      currency: currency!,
      is_billable: isBillable,
      hourly_rate: hourlyRate,
    }

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const before = await projects.updateProject(
          tx,
          params.id,
          next,
          ctx!.employeeId ?? ctx!.userId,
        )

        // Explicit field list: adding a form column is a deliberate decision about auditing it.
        const changes = audit.diff(before, next, [
          "project_name",
          "status",
          "priority",
          "health_status",
          "target_end_date",
          "budget",
          "currency",
          "is_billable",
          "hourly_rate",
        ])

        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "projects",
          entityId: params.id,
          module: "projects",
          changes,
        })

        return { saved: true }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as projects from "$lib/server/projects/projects.repo"
import { ProjectWriteRefused } from "$lib/server/projects/projects.repo"
import * as objectives from "$lib/server/objectives/objectives.repo"
import * as comments from "$lib/server/projects/comments.repo"
import { CommentWriteRefused } from "$lib/server/projects/comments.repo"
import * as templates from "$lib/server/projects/templates.repo"
import { TemplateWriteRefused } from "$lib/server/projects/templates.repo"
import * as documents from "$lib/server/documents/documents.repo"
import { uploadTaskFile as attachTaskFile } from "$lib/server/documents/upload"
import { UploadRefused } from "$lib/server/documents/upload"
import * as customFields from "$lib/server/custom-fields/custom-fields.repo"
import { CustomFieldWriteRefused } from "$lib/server/custom-fields/custom-fields.repo"
import { readCustomFieldValues } from "$lib/server/custom-fields/read-values"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
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
    const [tasks, tasksTotal] = await Promise.all([
      projects.tasksFor(tx, project.id),
      projects.countTasksFor(tx, project.id),
    ])
    const taskIds = tasks.map((t) => t.id)
    return {
      project,
      tasks,
      tasksTotal,
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
      objectives: await objectives.list(tx),
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
      // Batched — one query each, not one per task (verify-no-loop-queries.mjs).
      commentsByTask: await comments.commentsForProject(tx, project.id),
      filesByTask: await documents.forEntities(tx, "task", taskIds),
      // Custom fields (docs/26-project-management-custom-fields.md).
      taskFieldDefs: await customFields.definitionsFor(tx, "task"),
      taskFieldValues: await customFields.valuesFor(tx, "task", taskIds),
      projectFieldDefs: await customFields.definitionsFor(tx, "project"),
      projectFieldValues: (
        await customFields.valuesFor(tx, "project", [project.id])
      )[project.id],
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
    case "invalid_parent":
      return {
        message:
          "That task can't be a parent — pick a top-level task, or none.",
        field: "parent_task_id",
      }
    case "no_such_dependency":
      return {
        message: "One of those tasks no longer exists.",
        field: "depends_on_task_id",
      }
    case "cross_project_dependency":
      return {
        message: "A task can only depend on another task in the same project.",
        field: "depends_on_task_id",
      }
    case "self_dependency":
      return {
        message: "A task can't depend on itself.",
        field: "depends_on_task_id",
      }
    case "dependency_cycle":
      return {
        message:
          "That would make two tasks depend on each other, directly or through others. Pick a different task.",
        field: "depends_on_task_id",
      }
    case "no_such_objective":
      return {
        message: "That objective no longer exists. Reload and try again.",
        field: "objective_id",
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
    const parentTaskId = f.uuid("parent_task_id")

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
            parent_task_id: parentTaskId,
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
    const objectiveId = f.uuid("objective_id")

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
      objective_id: objectiveId,
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
          "objective_id",
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

  /**
   * "task_id depends on depends_on_task_id" — same project only. NOT
   * audited, same reasoning as addTask/moveTask: an ordering relationship
   * between two tasks changes nobody's money, employment or rights.
   */
  addDependency: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const taskId = f.uuid("task_id", { required: true })
    const dependsOnTaskId = f.uuid("depends_on_task_id", { required: true })
    if (!f.ok) return fail(400, f.problem("Pick a task to depend on."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        await projects.addDependency(
          tx,
          taskId!,
          dependsOnTaskId!,
          ctx!.employeeId ?? ctx!.userId,
        )
        return { dependencyAdded: true }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },

  removeDependency: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const taskId = f.uuid("task_id", { required: true })
    const dependsOnTaskId = f.uuid("depends_on_task_id", { required: true })
    if (!f.ok) return fail(400, f.problem("That dependency is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        await projects.removeDependency(
          tx,
          taskId!,
          dependsOnTaskId!,
          ctx!.employeeId ?? ctx!.userId,
        )
        return { dependencyRemoved: true }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /**
   * Add a comment on a task. NOT audited — a comment changes nobody's money,
   * employment or rights, same reasoning as addTask.
   */
  addComment: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const taskId = f.uuid("task_id", { required: true })
    const content = f.text("comment_text", { max: 4000, required: true })
    if (!f.ok) return fail(400, f.problem("That comment is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        await comments.addComment(
          tx,
          locals.tenantId!,
          taskId!,
          params.id,
          content!,
          ctx!.employeeId ?? ctx!.userId,
        )
        return { commented: true }
      })
    } catch (e) {
      if (e instanceof CommentWriteRefused) {
        return fail(400, {
          message: "That task no longer exists.",
          field: "task_id",
        })
      }
      throw e
    }
  },

  /** Edit a comment's own text. NOT audited, same reasoning as addComment. */
  editComment: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const commentId = f.uuid("comment_id", { required: true })
    const content = f.text("comment_text", { max: 4000, required: true })
    if (!f.ok) return fail(400, f.problem("That comment is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        await comments.editComment(tx, commentId!, content!)
        return { commented: true }
      })
    } catch (e) {
      if (e instanceof CommentWriteRefused) {
        return fail(400, {
          message: "That comment no longer exists.",
          field: "comment_text",
        })
      }
      throw e
    }
  },

  /** Soft-delete a comment. NOT audited, same reasoning as addComment. */
  deleteComment: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const commentId = f.uuid("comment_id", { required: true })
    if (!f.ok) return fail(400, f.problem("That comment is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        await comments.deleteComment(tx, commentId!)
        return { commentDeleted: true }
      })
    } catch (e) {
      if (e instanceof CommentWriteRefused) {
        return fail(400, {
          message: "That comment no longer exists.",
          field: "comment_id",
        })
      }
      throw e
    }
  },

  /**
   * Attach a file to a task — self-service (document.write is in EVERYONE),
   * NOT audited, same shape as documents/upload. Gated on `projects.write`
   * rather than the folder-permission model documents/[folderId] uses — see
   * `uploadTaskFile` in $lib/server/documents/upload for why.
   */
  uploadTaskFile: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const taskId = f.uuid("task_id", { required: true })
    const taskName = f.text("task_name", { max: 300, required: true })
    if (!f.ok) return fail(400, f.problem("Choose a task."))

    try {
      await attachTaskFile(
        locals,
        locals.tenantId,
        taskId!,
        taskName!,
        ctx!.employeeId!,
        data,
      )
      return { fileUploaded: true }
    } catch (e) {
      if (e instanceof UploadRefused) {
        return fail(400, { message: e.message, field: e.field })
      }
      throw e
    }
  },

  /**
   * Save this project's top-level tasks as a reusable template. NOT audited
   * — a template is a reusable shape, not a financial or employment
   * commitment; the real project's own budget/hours are what's binding, and
   * those are already audited via updateProject.
   */
  saveAsTemplate: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const name = f.text("name", { max: 200, required: true })
    const description = f.text("description", { max: 2000 })
    const category = f.text("category", { max: 100 })
    if (!f.ok) return fail(400, f.problem("That template is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await templates.saveAsTemplate(
          tx,
          locals.tenantId!,
          params.id,
          { name: name!, description, category },
          ctx!.employeeId ?? ctx!.userId,
        )
        return { templateSaved: created.template_id }
      })
    } catch (e) {
      if (e instanceof TemplateWriteRefused) {
        return fail(400, {
          message: "That project no longer exists.",
          field: "name",
        })
      }
      throw e
    }
  },

  /**
   * Set a task's custom field values. NOT audited — same reasoning as
   * addComment: a descriptive attribute on a task changes nobody's money,
   * employment or rights (the financial-calculation boundary is precisely
   * what keeps a `money`-typed custom field out of anything that would).
   *
   * One `setValue` call per definition — a loop over a fixed, admin-defined
   * field list (`definitionsFor`'s own result), never table growth; same
   * shape as `invoice_lines`/`bill_lines`'s own EXEMPT entries in
   * verify-no-loop-queries.mjs.
   */
  setTaskCustomFields: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const taskId = f.uuid("task_id", { required: true })
    if (!f.ok) return fail(400, f.problem("That task is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const defs = await customFields.definitionsFor(tx, "task")
        const values = readCustomFieldValues(f, data, defs)
        if (!f.ok) return fail(400, f.problem("Check the highlighted field."))

        for (const v of values) {
          await customFields.setValue(
            tx,
            locals.tenantId!,
            v.definitionId,
            "task",
            taskId!,
            v.value,
            ctx!.employeeId ?? ctx!.userId,
          )
        }
        return { fieldsSaved: true }
      })
    } catch (e) {
      if (e instanceof CustomFieldWriteRefused) {
        return fail(400, { message: "That field could not be saved." })
      }
      throw e
    }
  },

  /** Set the project's own custom field values. Same reasoning as setTaskCustomFields. */
  setProjectCustomFields: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const data = await request.formData()
    const f = new FormReader(data)

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const defs = await customFields.definitionsFor(tx, "project")
        const values = readCustomFieldValues(f, data, defs)
        if (!f.ok) return fail(400, f.problem("Check the highlighted field."))

        for (const v of values) {
          await customFields.setValue(
            tx,
            locals.tenantId!,
            v.definitionId,
            "project",
            params.id,
            v.value,
            ctx!.employeeId ?? ctx!.userId,
          )
        }
        return { fieldsSaved: true }
      })
    } catch (e) {
      if (e instanceof CustomFieldWriteRefused) {
        return fail(400, { message: "That field could not be saved." })
      }
      throw e
    }
  },
}

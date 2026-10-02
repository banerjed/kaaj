import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as objectives from "$lib/server/objectives/objectives.repo"
import { ObjectiveWriteRefused } from "$lib/server/objectives/objectives.repo"
import * as projects from "$lib/server/projects/projects.repo"
import { ProjectWriteRefused } from "$lib/server/projects/projects.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { pageOf, pageParam } from "$lib/server/db/paged"
import { pickerQuery, searchEmployees } from "$lib/server/pickers"

const { OBJECTIVE_TYPES, OBJECTIVE_STATUSES } = objectives
const { PROJECT_STATUSES, PROJECT_PRIORITIES, PROJECT_HEALTHS } = projects

/** /objectives/[id] — an objective, its rollup, and the projects linked to it. */
const PAGE_SIZE = 25

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const page = pageParam(url)

  return withTenant(actorFrom(locals), async (tx) => {
    const objective = await objectives.byId(tx, params.id)
    if (!objective) error(404, "No such objective")
    const linked = await objectives.projectsFor(
      tx,
      objective.id,
      pageOf(page, PAGE_SIZE),
    )

    return {
      objective,
      projects: linked.rows,
      projectTotal: linked.total,
      page,
      pageSize: PAGE_SIZE,
      types: OBJECTIVE_TYPES,
      statuses: OBJECTIVE_STATUSES,
      projectStatuses: PROJECT_STATUSES,
      projectPriorities: PROJECT_PRIORITIES,
      projectHealths: PROJECT_HEALTHS,
      mayWrite: can(ctx, "projects.write"),
      locations: await locationsRepo.list(tx),
    }
  })
}

function objectiveRefusal(e: ObjectiveWriteRefused) {
  switch (e.reason) {
    case "no_such_objective":
      return { message: "That objective no longer exists.", field: "" }
    case "number_taken":
      return {
        message:
          "Another objective was created at the same moment and took that number. Try again.",
        field: "",
      }
    case "no_such_customer":
      return {
        message: "That client no longer exists. Reload and pick another.",
        field: "customer_id",
      }
  }
}

export const actions: Actions = {
  /** Backs the edit form's owner picker; the form is `projects.write`'s. */
  searchPeople: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "projects.write")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchEmployees(tx, q, { set: "employed" }),
    }))
  },

  /** Edit the objective. Audited — the same reasoning as projects/[id]'s updateProject. */
  updateObjective: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const name = f.text("objective_name", { max: 200, required: true })
    const description = f.text("description", { max: 2000 })
    const type = f.choice("objective_type", OBJECTIVE_TYPES, {
      required: true,
    })
    const status = f.choice("status", OBJECTIVE_STATUSES, { required: true })
    const ownerId = f.uuid("owner_employee_id")
    const targetEnd = f.date("target_end_date")
    const targetRevenue = f.decimal("target_revenue", { scale: 4 })
    const currency = f.currency("currency", { required: true })

    if (!f.ok) return fail(400, f.problem("That change is not valid."))

    const next = {
      objective_name: name!,
      description,
      objective_type: type!,
      status: status!,
      owner_employee_id: ownerId,
      target_end_date: targetEnd,
      target_revenue: targetRevenue,
      currency: currency!,
    }

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const before = await objectives.updateObjective(
          tx,
          params.id,
          next,
          ctx!.employeeId ?? ctx!.userId,
        )

        const changes = audit.diff(before, next, [
          "objective_name",
          "objective_type",
          "status",
          "owner_employee_id",
          "target_end_date",
          "target_revenue",
          "currency",
        ])

        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "objectives",
          entityId: params.id,
          module: "projects",
          changes,
        })

        return { saved: true }
      })
    } catch (e) {
      if (e instanceof ObjectiveWriteRefused) {
        return fail(400, objectiveRefusal(e))
      }
      throw e
    }
  },

  /**
   * A trimmed-down "New project" for this objective — the full field set
   * lives on /projects/[id] for later editing. NOT separately audited:
   * this calls the SAME `projects.createProject` /projects' own `create`
   * action does, which is already registered and already audits the
   * fields that carry money.
   */
  addProject: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const projectName = f.text("project_name", { max: 200, required: true })
    const customerId = f.uuid("customer_id")
    const managerId = f.uuid("project_manager_id")
    const currency = f.currency("currency", { required: true })

    if (!f.ok) return fail(400, f.problem("That project is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await projects.createProject(
          tx,
          locals.tenantId!,
          {
            project_name: projectName!,
            description: null,
            customer_id: customerId,
            project_manager_id: managerId,
            status: "draft",
            priority: "medium",
            health_status: "on_track",
            start_date: null,
            target_end_date: null,
            budget: null,
            currency: currency!,
            estimated_hours: null,
            is_billable: true,
            hourly_rate: null,
            objective_id: params.id,
          },
          ctx!.employeeId ?? ctx!.userId,
        )

        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "projects",
          entityId: created.id,
          module: "projects",
          changes: {
            project_number: { from: null, to: created.project_number },
            project_name: { from: null, to: projectName },
            status: { from: null, to: "draft" },
            budget: { from: null, to: null },
            currency: { from: null, to: currency },
            hourly_rate: { from: null, to: null },
            is_billable: { from: null, to: "true" },
          },
        })

        return { added: created.project_number }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) {
        if (e.reason === "no_such_customer") {
          return fail(400, {
            message: "That client no longer exists. Reload and pick another.",
            field: "customer_id",
          })
        }
        return fail(400, {
          message:
            "Another project was created at the same moment and took that number. Try again.",
          field: "project_name",
        })
      }
      throw e
    }
  },
}

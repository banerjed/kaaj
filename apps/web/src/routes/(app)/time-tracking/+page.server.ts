import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as entries from "$lib/server/time-tracking/time_tracking_entries.repo"
import { TimeEntryWriteRefused } from "$lib/server/time-tracking/time_tracking_entries.repo"
import * as projects from "$lib/server/projects/projects.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

/** /time-tracking — module-time-tracking.md (Phase 5), slice 1: manual entries only. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const userId = locals.user?.id

  const status = url.searchParams.get("status") ?? ""
  const mineOnly = url.searchParams.get("mine") === "1"

  return withTenant(actorFrom(locals), async (tx) => {
    const [me] = await tx<{ employee_id: string | null }[]>`
      SELECT employee_id FROM tenant_users WHERE user_id = ${userId ?? null}
    `
    const myEmployeeId = me?.employee_id ?? null

    return {
      entries: await entries.list(tx, {
        status,
        employeeId: mineOnly ? (myEmployeeId ?? undefined) : undefined,
      }),
      activeProjects: await projects.list(tx),
      tasks: await entries.tasksForActiveProjects(tx),
      myEmployeeId,
      mayApprove: can(ctx, "time_entries.approve"),
      filters: { status, mine: mineOnly },
    }
  })
}

/** Turn a domain refusal into something the page can show on a field. */
function refusal(e: TimeEntryWriteRefused) {
  switch (e.reason) {
    case "no_such_project":
      return { message: "That project no longer exists.", field: "project_id" }
    case "no_such_task":
      return {
        message: "That task does not belong to the selected project.",
        field: "task_id",
      }
    case "number_taken":
      return {
        message:
          "Another entry was logged at the same moment and took that number. Try again.",
        field: "hours",
      }
    case "not_draft":
      return {
        message: "Only a draft entry can be submitted.",
        field: "id",
      }
    case "not_submitted":
      return {
        message: "That entry is not waiting for a decision.",
        field: "id",
      }
    case "self_approval":
      return {
        message: "You cannot decide your own time entry.",
        field: "id",
      }
  }
}

export const actions: Actions = {
  /** Log time as a draft. NOT audited, same reasoning as `addTask` — nothing billed until `decide` snapshots an amount. */
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "time_entries.write")
    const userId = locals.user?.id
    if (!userId) error(403, "No user")

    const f = new FormReader(await request.formData())
    const projectId = f.uuid("project_id", { required: true })
    const taskId = f.uuid("task_id")
    const entryDate = f.date("entry_date", { required: true })
    const hours = f.decimal("hours", {
      scale: 2,
      min: 0.25,
      max: 24,
      required: true,
    })
    const isBillable = f.bool("is_billable")
    const description = f.text("description", { max: 2000, required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const [me] = await tx<{ employee_id: string | null }[]>`
          SELECT employee_id FROM tenant_users WHERE user_id = ${userId}
        `
        if (!me?.employee_id) error(403, "No employee record for this user")

        const created = await entries.create(
          tx,
          locals.tenantId!,
          {
            employee_id: me.employee_id,
            project_id: projectId!,
            task_id: taskId,
            entry_date: entryDate!,
            hours: hours!,
            is_billable: isBillable,
            description: description!,
          },
          me.employee_id,
        )
        return { logged: created.id }
      })
    } catch (e) {
      if (e instanceof TimeEntryWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** draft -> submitted. NOT audited — the employee's own status flip, nothing decided yet. */
  submit: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "time_entries.write")
    const userId = locals.user?.id
    if (!userId) error(403, "No user")

    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const [me] = await tx<{ employee_id: string | null }[]>`
          SELECT employee_id FROM tenant_users WHERE user_id = ${userId}
        `
        if (!me?.employee_id) error(403, "No employee record for this user")
        await entries.submit(tx, id!, me.employee_id)
        return { submitted: id }
      })
    } catch (e) {
      if (e instanceof TimeEntryWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** submitted -> approved/rejected. Approval snapshots `billable_amount`; audited either way, same shape as time-off's `decide`. */
  decide: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "time_entries.approve")
    const userId = locals.user?.id
    if (!userId) error(403, "No user")

    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    const decision = f.choice("decision", ["approved", "rejected"] as const, {
      required: true,
    })
    const rejectionReason = f.text("rejection_reason", { max: 1000 })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const [me] = await tx<{ employee_id: string | null }[]>`
          SELECT employee_id FROM tenant_users WHERE user_id = ${userId}
        `
        if (!me?.employee_id) error(403, "No employee record for this user")

        await entries.decide(
          tx,
          id!,
          decision as entries.Decision,
          me.employee_id,
          rejectionReason,
        )

        if (ctx) {
          await audit.record(tx, ctx, {
            action: decision === "approved" ? "approve" : "deny",
            entityType: "time_tracking_entries",
            entityId: id,
            module: "time_tracking",
            changes: { status: { from: "submitted", to: decision! } },
            reason: rejectionReason,
          })
        }
        return { decided: decision }
      })
    } catch (e) {
      if (e instanceof TimeEntryWriteRefused) return fail(400, refusal(e))
      throw e
    }
  },
}

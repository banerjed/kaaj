import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as groups from "$lib/server/groups/groups.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { pickerQuery, searchEmployees } from "$lib/server/pickers"
import * as audit from "$lib/server/audit/audit.repo"

const PAGE_SIZE = 50

/** /settings/groups/[groupId] — membership for one group. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "it.groups.read")

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const group = await groups.groupById(tx, params.groupId)
    if (!group) error(404, "No such group")
    const members = await groups.membersFor(tx, params.groupId, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
    return {
      group,
      members: members.rows,
      total: members.total,
      page,
      pageSize: PAGE_SIZE,
    }
  })
}

export const actions: Actions = {
  /** Backs the add-a-member picker. */
  searchPeople: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "it.groups.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchEmployees(tx, q),
    }))
  },

  addMember: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "it.groups.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const employeeId = f.uuid("employee_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const added = await withTenant(actorFrom(locals), async (tx) => {
      const changed = await groups.addMember(
        tx,
        tenantId,
        params.groupId,
        employeeId,
        ctx!.employeeId ?? ctx!.userId,
      )
      if (changed) {
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "employee_group_members",
          entityId: params.groupId,
          changes: { employee_id: { from: "", to: employeeId } },
          reason: "member added",
        })
      }
      return changed
    })
    if (!added) {
      return fail(400, { message: "That person is already a member." })
    }
    return { memberAdded: true }
  },

  removeMember: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "it.groups.write")
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const employeeId = f.uuid("employee_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const removed = await withTenant(actorFrom(locals), async (tx) => {
      const changed = await groups.removeMember(tx, params.groupId, employeeId)
      if (changed) {
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "employee_group_members",
          entityId: params.groupId,
          changes: { employee_id: { from: employeeId, to: "" } },
          reason: "member removed",
        })
      }
      return changed
    })
    if (!removed) {
      return fail(400, { message: "That person is not a member any more." })
    }
    return { memberRemoved: true }
  },
}

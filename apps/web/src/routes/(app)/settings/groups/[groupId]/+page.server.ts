import { error } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as groups from "$lib/server/groups/groups.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { formList } from "$lib/server/forms"
import * as audit from "$lib/server/audit/audit.repo"

/** /settings/groups/[groupId] — membership for one group. */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "it.groups.read")

  return withTenant(actorFrom(locals), async (tx) => {
    const group = await groups.groupById(tx, params.groupId)
    if (!group) error(404, "No such group")
    return {
      group,
      members: await groups.membersFor(tx, params.groupId),
      employees: await employees.managerOptions(tx),
    }
  })
}

export const actions: Actions = {
  saveMembers: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "it.groups.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const data = await request.formData()
    const employeeIds = formList(data, "employee_ids")

    await withTenant(actorFrom(locals), async (tx) => {
      const before = await groups.membersFor(tx, params.groupId)
      await groups.setMembers(
        tx,
        tenantId,
        params.groupId,
        employeeIds,
        ctx!.employeeId ?? ctx!.userId,
      )
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "employee_group_members",
        entityId: params.groupId,
        changes: {
          employee_ids: {
            from: before
              .map((m) => m.employee_id)
              .sort()
              .join(","),
            to: [...employeeIds].sort().join(","),
          },
        },
      })
    })
    return { membersSaved: true }
  },
}

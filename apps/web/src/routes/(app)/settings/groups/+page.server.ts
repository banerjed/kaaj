import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as groups from "$lib/server/groups/groups.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /settings/groups — the user groups used to permission ticketing business areas and restricted projects (docs/28-user-groups.md). Membership lives one level down, per group, same split as settings/ticketing. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "it.groups.read")

  return withTenant(actorFrom(locals), async (tx) => ({
    groups: await groups.listGroups(tx),
  }))
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "it.groups.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const displayName = f.text("display_name", { required: true, max: 200 })
    const description = f.text("description", { max: 2000 })
    if (!f.ok) return fail(400, f.problem("Name the group."))

    try {
      await withTenant(actorFrom(locals), (tx) =>
        groups.createGroup(
          tx,
          tenantId,
          { displayName: displayName!, description },
          ctx!.employeeId ?? ctx!.userId,
        ),
      )
      return { created: true }
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archive: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "it.groups.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing group."))

    const archived = await withTenant(actorFrom(locals), (tx) =>
      groups.archiveGroup(tx, id!),
    )
    if (!archived) {
      return fail(400, {
        message: "That group no longer exists. Reload the page.",
      })
    }
    return { archived: true }
  },
}

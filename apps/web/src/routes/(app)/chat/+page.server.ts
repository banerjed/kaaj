import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as chat from "$lib/server/team-chat/team-chat.repo"
import { CHANNEL_VISIBILITIES } from "$lib/server/team-chat/team-chat.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /chat — empty state when nothing is selected. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "team_chat.read")
  return {}
}

export const actions: Actions = {
  createChannel: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const name = f.text("name", { required: true, max: 80 })
    const topic = f.text("topic", { max: 500 })
    const visibility = f.choice("visibility", CHANNEL_VISIBILITIES, {
      fallback: "public",
    })
    if (!f.ok) return fail(400, f.problem())

    try {
      const id = await withTenant(actorFrom(locals), (tx) =>
        chat.createChannel(tx, {
          tenantId: locals.tenantId!,
          creatorEmployeeId: locals.employeeId!,
          name: name!,
          topic,
          visibility: visibility!,
        }),
      )
      redirect(303, `/chat/${id}`)
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  startDm: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const otherEmployeeId = f.uuid("employee_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const id = await withTenant(actorFrom(locals), (tx) =>
      chat.findOrCreateDm(tx, {
        tenantId: locals.tenantId!,
        participantIds: [locals.employeeId!, otherEmployeeId!],
      }),
    )
    redirect(303, `/chat/${id}`)
  },

  joinChannel: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const conversationId = f.uuid("conversation_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), (tx) =>
        chat.joinPublicChannel(tx, {
          tenantId: locals.tenantId!,
          conversationId: conversationId!,
          employeeId: locals.employeeId!,
        }),
      )
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    redirect(303, `/chat/${conversationId}`)
  },
}

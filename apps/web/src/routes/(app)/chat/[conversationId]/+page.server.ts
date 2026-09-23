import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as chat from "$lib/server/team-chat/team-chat.repo"
import { TeamChatRefused } from "$lib/server/team-chat/team-chat.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import * as audit from "$lib/server/audit/audit.repo"

const MESSAGE_PAGE_SIZE = 25

/** /chat/[conversationId] — one thread: header, message history, composer. */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "team_chat.read")
  if (!locals.employeeId)
    error(403, "Chat is for employees, not this kind of account.")

  return withTenant(actorFrom(locals), async (tx) => {
    const convo = await chat.conversation(tx, params.conversationId)
    if (!convo) error(404, "Conversation not found")

    const [memberRows, messageRows, myRole, timezone] = await Promise.all([
      chat.members(tx, convo.id),
      chat.messages(tx, convo.id, { limit: MESSAGE_PAGE_SIZE }),
      chat.myRole(tx, convo.id, locals.employeeId!),
      chat.viewerTimezone(tx, locals.employeeId!),
    ])
    if (
      !myRole &&
      !(convo.kind === "channel" && convo.visibility === "public")
    ) {
      error(403, "You are not a member of this conversation.")
    }

    return {
      conversation: convo,
      members: memberRows,
      // Client renders oldest-first; the repo returns newest-first pages.
      messages: [...messageRows].reverse(),
      myRole,
      myEmployeeId: locals.employeeId,
      timezone,
      pageSize: MESSAGE_PAGE_SIZE,
    }
  })
}

export const actions: Actions = {
  send: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const body = f.text("body", { required: true, max: 8000 })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await chat.postMessage(tx, {
          tenantId: locals.tenantId!,
          conversationId: params.conversationId,
          authorEmployeeId: locals.employeeId!,
          body: body!,
        })
        return { sent: created }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  edit: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const messageId = f.uuid("message_id", { required: true })
    const body = f.text("body", { required: true, max: 8000 })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), (tx) =>
        chat.editMessage(tx, {
          id: messageId!,
          authorEmployeeId: locals.employeeId!,
          body: body!,
        }),
      )
    } catch (e) {
      if (e instanceof TeamChatRefused) {
        return fail(400, { message: "That message can no longer be edited." })
      }
      throw e
    }
    return { edited: true }
  },

  delete: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const messageId = f.uuid("message_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), (tx) =>
        chat.deleteMessage(tx, {
          id: messageId!,
          authorEmployeeId: locals.employeeId!,
        }),
      )
    } catch (e) {
      if (e instanceof TeamChatRefused) {
        return fail(400, { message: "That message can no longer be deleted." })
      }
      throw e
    }
    return { deleted: true }
  },

  loadMore: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "team_chat.read")

    const f = new FormReader(await request.formData())
    const before = f.uuid("before", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const older = await withTenant(actorFrom(locals), (tx) =>
      chat.messages(tx, params.conversationId, {
        before: before!,
        limit: MESSAGE_PAGE_SIZE,
      }),
    )
    return { older: [...older].reverse() }
  },

  markRead: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "team_chat.read")
    if (!locals.employeeId) return { ok: false }

    await withTenant(actorFrom(locals), (tx) =>
      chat.markRead(tx, params.conversationId, locals.employeeId!),
    )
    return { ok: true }
  },

  leave: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    await withTenant(actorFrom(locals), (tx) =>
      chat.leaveConversation(tx, params.conversationId, locals.employeeId!),
    )
    return { left: true }
  },

  addMember: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const employeeId = f.uuid("employee_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const convo = await chat.conversation(tx, params.conversationId)
        if (!convo) error(404, "Conversation not found")

        // Coarse RLS only checks "the actor is already a member" — inviting
        // to a PRIVATE channel is restricted to its owner at this layer, the
        // app-side half of the split docs/20-team-chat.md §3 describes.
        if (convo.kind === "channel" && convo.visibility === "private") {
          const role = await chat.myRole(tx, convo.id, locals.employeeId!)
          if (role !== "owner") {
            return fail(403, {
              message: "Only the channel's owner can add members.",
            })
          }
        }

        await chat.addMember(tx, {
          tenantId: locals.tenantId!,
          conversationId: convo.id,
          employeeId: employeeId!,
        })
        return { added: true }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  removeMember: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    const f = new FormReader(await request.formData())
    const employeeId = f.uuid("employee_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    return await withTenant(actorFrom(locals), async (tx) => {
      const convo = await chat.conversation(tx, params.conversationId)
      if (!convo) error(404, "Conversation not found")

      const actingRole = await chat.myRole(tx, convo.id, locals.employeeId!)
      if (
        convo.kind === "channel" &&
        convo.visibility === "private" &&
        actingRole !== "owner"
      ) {
        return fail(403, {
          message: "Only the channel's owner can remove members.",
        })
      }

      try {
        await chat.removeMember(tx, convo.id, employeeId!)
      } catch (e) {
        if (e instanceof TeamChatRefused) {
          return fail(400, { message: "That person is already not a member." })
        }
        throw e
      }

      await audit.record(tx, ctx!, {
        action: "role_revoke",
        entityType: "team_chat_members",
        entityId: convo.id,
        module: "team_chat",
        changes: { employee_id: { from: employeeId!, to: null } },
        reason: `Removed from ${convo.kind === "channel" ? `#${convo.name}` : "a direct message"}`,
      })
      return { removed: true }
    })
  },

  archive: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "team_chat.write")
    if (!locals.employeeId)
      error(403, "Chat is for employees, not this kind of account.")

    return await withTenant(actorFrom(locals), async (tx) => {
      const convo = await chat.conversation(tx, params.conversationId)
      if (!convo) error(404, "Conversation not found")

      const role = await chat.myRole(tx, convo.id, locals.employeeId!)
      if (role !== "owner") {
        return fail(403, {
          message: "Only the channel's owner can archive it.",
        })
      }

      try {
        await chat.archiveChannel(tx, convo.id)
      } catch (e) {
        if (e instanceof TeamChatRefused) {
          return fail(400, { message: "This channel is already archived." })
        }
        throw e
      }

      await audit.record(tx, ctx!, {
        action: "archive",
        entityType: "team_chat_conversations",
        entityId: convo.id,
        module: "team_chat",
        changes: audit.diff({ archived_at: null }, { archived_at: "now" }, [
          "archived_at",
        ]),
      })
      return { archived: true }
    })
  },
}

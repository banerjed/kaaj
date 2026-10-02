import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as messaging from "$lib/server/messaging/messaging.repo"
import {
  CONVERSATION_STATUSES,
  EMAIL_BODY_MAX,
  SMS_BODY_MAX,
  SUBJECT_MAX,
} from "$lib/server/messaging/messaging.repo"
import {
  deliver,
  prepareSend,
  sendAuditEntry,
  SendRefused,
  type Prepared,
} from "$lib/server/messaging/send"
import { birdProvider } from "$lib/server/messaging/bird"
import * as audit from "$lib/server/audit/audit.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const PAGE_SIZE = 30

/** /messaging/[id] — one thread with one outside person: the messages, the reply box, open/closed. */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "messaging.read")

  return withTenant(actorFrom(locals), async (tx) => {
    const conversation = await messaging.conversationById(tx, params.id)
    if (!conversation) error(404, "No such conversation")
    const [messages, tenant] = await Promise.all([
      messaging.messagesFor(tx, conversation.id, { limit: PAGE_SIZE }),
      tx<{ default_timezone: string; default_locale: string }[]>`
        SELECT default_timezone, default_locale FROM tenants WHERE id = ${locals.tenantId}::uuid
      `,
    ])
    return {
      conversation,
      // The page renders oldest-first; the repository pages newest-first.
      messages: [...messages].reverse(),
      pageSize: PAGE_SIZE,
      statuses: CONVERSATION_STATUSES,
      timezone: tenant[0]?.default_timezone ?? "UTC",
      mayWrite: can(ctx, "messaging.write"),
    }
  })
}

export const actions: Actions = {
  reply: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "messaging.write")
    if (!locals.employeeId) {
      error(403, "Messaging is for employees, not this kind of account.")
    }

    const convo = await withTenant(actorFrom(locals), (tx) =>
      messaging.conversationById(tx, params.id),
    )
    if (!convo) error(404, "No such conversation")

    const f = new FormReader(await request.formData())
    const subject = f.text("subject", { max: SUBJECT_MAX })
    const body = f.text("body", {
      required: true,
      max: convo.channel === "email" ? EMAIL_BODY_MAX : SMS_BODY_MAX,
    })
    if (!f.ok) return fail(400, f.problem())

    let prepared: Prepared
    try {
      prepared = await withTenant(actorFrom(locals), async (tx) => {
        const p = await prepareSend(tx, ctx!, {
          channel: convo.channel,
          endpointId: convo.endpoint_id,
          contactId: null,
          rawAddress: null,
          subject: subject ?? null,
          body: body!,
          conversationId: convo.id,
        })
        await audit.record(tx, ctx!, sendAuditEntry(p))
        return p
      })
    } catch (e) {
      if (e instanceof SendRefused) return fail(400, e.refusal())
      throw e
    }

    const outcome = await deliver(
      actorFrom(locals),
      locals.tenantId,
      birdProvider(),
      prepared,
    )
    if (!outcome.sent) {
      return fail(400, {
        message: `Could not send the message: ${outcome.detail}`,
        errorFields: ["body"],
      })
    }
    return { sent: outcome.messageId }
  },

  setStatus: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "messaging.write")
    const f = new FormReader(await request.formData())
    const status = f.choice("status", CONVERSATION_STATUSES, { required: true })
    if (!f.ok) return fail(400, f.problem())

    const moved = await withTenant(actorFrom(locals), async (tx) => {
      const convo = await messaging.conversationById(tx, params.id)
      if (!convo) error(404, "No such conversation")
      return messaging.setConversationStatus(tx, convo.id, status!)
    })
    return { statusSet: moved }
  },

  loadMore: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "messaging.read")
    const f = new FormReader(await request.formData())
    const before = f.uuid("before", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const older = await withTenant(actorFrom(locals), (tx) =>
      messaging.messagesFor(tx, params.id, {
        before: before!,
        limit: PAGE_SIZE,
      }),
    )
    return { older: [...older].reverse() }
  },

  markRead: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "messaging.read")
    await withTenant(actorFrom(locals), (tx) =>
      messaging.markRead(tx, params.id),
    )
    return { read: true }
  },
}

import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as messaging from "$lib/server/messaging/messaging.repo"
import {
  CHANNELS,
  CONVERSATION_STATUSES,
  EMAIL_BODY_MAX,
  SMS_BODY_MAX,
  SUBJECT_MAX,
  ADDRESS_MAX,
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
import { countCap, pageOf } from "$lib/server/db/paged"
import { pickerQuery, searchCustomerContacts } from "$lib/server/pickers"
import { constraintFailure } from "$lib/server/db/constraints"

const PAGE_SIZE = 25

/** /messaging — the inbox: every SMS and email thread with someone outside the firm, newest activity first. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "messaging.read")

  // The query string is input too (L34): read it through the same reader.
  const q = new FormData()
  for (const [k, v] of url.searchParams) q.set(k, v)
  const f = new FormReader(q)
  const channel = f.choice("channel", CHANNELS)
  const status = f.choice("status", CONVERSATION_STATUSES)
  const unreadOnly = f.bool("unread")
  const page = f.integer("page", { min: 1, max: 100_000 }) ?? 1

  return withTenant(actorFrom(locals), async (tx) => {
    const filters = {
      channel: channel ?? undefined,
      status: status ?? undefined,
      unreadOnly,
    }
    const [{ rows, total }, endpoints] = await Promise.all([
      messaging.listConversations(
        tx,
        filters,
        pageOf(page, PAGE_SIZE),
        countCap(page, PAGE_SIZE),
      ),
      messaging.listEndpoints(tx),
    ])
    return {
      conversations: rows,
      total,
      page,
      pageSize: PAGE_SIZE,
      countCap: countCap(page, PAGE_SIZE),
      filters: { channel, status, unreadOnly },
      endpoints,
      channels: CHANNELS,
      statuses: CONVERSATION_STATUSES,
      mayWrite: can(ctx, "messaging.write"),
    }
  })
}

export const actions: Actions = {
  /**
   * A new thread (or a new message on an existing one) to a contact from the
   * CRM or to a typed address. The send itself happens between two short
   * transactions — `prepareSend`, then `deliver` — so a slow carrier never holds a Postgres
   * connection open.
   */
  compose: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "messaging.write")
    if (!locals.employeeId) {
      error(403, "Messaging is for employees, not this kind of account.")
    }

    const f = new FormReader(await request.formData())
    const channel = f.choice("channel", CHANNELS, { required: true })
    const endpointId = f.uuid("endpoint_id", { required: true })
    const contactId = f.uuid("contact_id")
    const rawAddress = f.text("address", { max: ADDRESS_MAX })
    const subject = f.text("subject", { max: SUBJECT_MAX })
    const body = f.text("body", {
      required: true,
      max: channel === "email" ? EMAIL_BODY_MAX : SMS_BODY_MAX,
    })
    if (channel === "email" && !subject) f.reject("subject")
    if (!contactId && !rawAddress) f.reject("address")
    if (channel === "sms" && body && body.length > SMS_BODY_MAX)
      f.reject("body")
    if (!f.ok) return fail(400, f.problem())

    let prepared: Prepared
    try {
      prepared = await withTenant(actorFrom(locals), async (tx) => {
        const p = await prepareSend(tx, ctx!, {
          channel: channel!,
          endpointId: endpointId!,
          contactId: contactId ?? null,
          rawAddress: rawAddress ?? null,
          subject: subject ?? null,
          body: body!,
          conversationId: null,
        })
        await audit.record(tx, ctx!, sendAuditEntry(p))
        return p
      })
    } catch (e) {
      if (e instanceof SendRefused) return fail(400, e.refusal())
      const refused = constraintFailure(e)
      if (refused) return refused
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
    redirect(303, `/messaging/${outcome.conversationId}`)
  },

  /** Backs the compose form's contact picker, per channel. */
  searchContacts: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "messaging.read")
    const f = new FormReader(await request.formData())
    const q = pickerQuery(f)
    const channel = f.choice("channel", CHANNELS, { required: true })
    if (!f.ok) return fail(400, f.problem())
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchCustomerContacts(tx, q, { channel: channel! }),
    }))
  },
}

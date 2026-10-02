import { withTenant, type Actor, type Tx } from "../db/tenant"
import type { AuthContext } from "../auth/can"
import type { AuditEntry } from "../audit/audit.repo"
import type { MessagingProvider } from "./bird"
import * as messaging from "./messaging.repo"
import type { Channel } from "./messaging.repo"

/**
 * One outbound message, end to end, in three steps on purpose:
 *
 *   1. `prepareSend` inside the page's own short transaction: resolve the
 *      endpoint and the address, refuse an opt-out, open the thread, insert
 *      the row as `queued`. The page records the audit entry
 *      (`sendAuditEntry`) in that SAME transaction — the DECISION to send,
 *      beside the row it describes (L40);
 *   2. `deliver`: the network call to Bird, with no transaction open, then
 *   3. a second short transaction marking the row `accepted` with Bird's id,
 *      or `failed` with Bird's reason.
 *
 * Both pages (compose, reply) call these after their own requireCan.
 */

export type SendInput = {
  channel: Channel
  endpointId: string
  /** A CRM contact to address; its number or email is read under RLS. */
  contactId: string | null
  /** Or a typed address, normalised here. */
  rawAddress: string | null
  subject: string | null
  body: string
  /** Reply into this thread; null opens (or finds) one by address. */
  conversationId: string | null
}

export type Prepared = {
  channel: Channel
  conversationId: string
  messageId: string
  from: string
  to: string
  subject: string | null
  body: string
  inReplyTo: string | null
  companyName: string
}

export type SendOutcome =
  | { sent: true; conversationId: string; messageId: string }
  | { sent: false; conversationId: string; messageId: string; detail: string }

export class SendRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_endpoint"
      | "endpoint_inactive"
      | "wrong_channel"
      | "no_such_contact"
      | "contact_has_no_address"
      | "bad_address"
      | "opted_out"
      | "no_such_conversation"
      | "no_author",
  ) {
    super(reason)
    this.name = "SendRefused"
  }

  /** What the form tells the person, and which field it marks. */
  refusal(): { message: string; errorFields: string[] } {
    switch (this.reason) {
      case "opted_out":
        return {
          errorFields: ["address"],
          message:
            "This person has asked not to be contacted on this channel. Nothing was sent.",
        }
      case "bad_address":
        return {
          errorFields: ["address"],
          message:
            "That is not a valid address for this channel. Use +country code for a number, or a full email address.",
        }
      case "contact_has_no_address":
        return {
          errorFields: ["contact_id"],
          message:
            "That contact has no number or email for this channel. Add one in the CRM first.",
        }
      case "no_such_contact":
        return {
          errorFields: ["contact_id"],
          message: "That contact no longer exists. Pick another.",
        }
      case "wrong_channel":
        return {
          errorFields: ["endpoint_id"],
          message:
            "That sending address does not match the channel. Pick another.",
        }
      case "no_such_conversation":
        return {
          errorFields: ["body"],
          message: "That conversation no longer exists. Reload the page.",
        }
      case "no_author":
        return {
          errorFields: ["body"],
          message: "Only an employee can send a message.",
        }
      default:
        return {
          errorFields: ["endpoint_id"],
          message:
            "That sending number or address is no longer active. Pick another, or set one up under Settings.",
        }
    }
  }
}

/** Step 1: everything that must be true before a message may leave, and the `queued` row. Throws `SendRefused`; writes nothing when it does. */
export async function prepareSend(
  tx: Tx,
  ctx: AuthContext,
  input: SendInput,
): Promise<Prepared> {
  const tenantId = ctx.tenantId
  const authorId = ctx.employeeId
  if (!authorId) throw new SendRefused("no_author")

  const endpoint = await messaging.endpointById(tx, input.endpointId)
  if (!endpoint) throw new SendRefused("no_such_endpoint")
  if (!endpoint.is_active) throw new SendRefused("endpoint_inactive")
  if (endpoint.channel !== input.channel) throw new SendRefused("wrong_channel")

  let conversationId = input.conversationId
  let to: string
  let subject = input.subject

  if (conversationId) {
    const convo = await messaging.conversationById(tx, conversationId)
    if (!convo) throw new SendRefused("no_such_conversation")
    to = convo.counterparty_address
    subject = replySubject(convo.subject, subject)
  } else {
    const contact = input.contactId
      ? await contactAddress(tx, input.contactId, input.channel)
      : null
    if (input.contactId && !contact) throw new SendRefused("no_such_contact")
    if (contact && !contact.address) {
      throw new SendRefused("contact_has_no_address")
    }
    const normalised = messaging.normalizeAddress(
      input.channel,
      contact?.address ?? input.rawAddress ?? "",
    )
    if (!normalised) throw new SendRefused("bad_address")
    to = normalised
  }

  if (await messaging.isOptedOut(tx, input.channel, to)) {
    throw new SendRefused("opted_out")
  }

  if (!conversationId) {
    const match = await messaging.matchContact(tx, input.channel, to)
    conversationId = await messaging.findOrOpenConversation(tx, tenantId, {
      channel: input.channel,
      endpointId: endpoint.id,
      counterpartyAddress: to,
      counterpartyName: match?.name ?? null,
      contact: match,
      subject,
      direction: "outbound",
    })
  }

  const inReplyTo =
    input.channel === "email"
      ? await messaging.lastInboundRfcId(tx, conversationId)
      : null

  const messageId = await messaging.recordOutbound(tx, tenantId, {
    conversationId,
    fromAddress: endpoint.address,
    toAddress: to,
    subject,
    bodyText: input.body,
    bodyHtml: input.channel === "email" ? textToHtml(input.body) : null,
    rfcInReplyTo: inReplyTo,
    authorEmployeeId: authorId,
  })

  const [tenant] = await tx<{ company_name: string }[]>`
    SELECT company_name FROM tenants WHERE id = ${tenantId}::uuid
  `
  return {
    channel: input.channel,
    conversationId,
    messageId,
    from: endpoint.address,
    to,
    subject,
    body: input.body,
    inReplyTo,
    companyName: tenant?.company_name ?? "",
  }
}

/** The entry the page records beside the `queued` row, in the same transaction. */
export function sendAuditEntry(prepared: Prepared): AuditEntry {
  return {
    action: "send",
    entityType: "messaging_messages",
    entityId: prepared.messageId,
    module: "messaging",
    changes: {
      channel: { from: null, to: prepared.channel },
      to_address: { from: null, to: prepared.to },
      conversation_id: { from: null, to: prepared.conversationId },
    },
  }
}

/** Steps 2 and 3: the call to Bird, then the row's outcome. */
export async function deliver(
  actor: Actor,
  tenantId: string,
  provider: MessagingProvider,
  prepared: Prepared,
): Promise<SendOutcome> {
  const idempotencyKey = `msg-${prepared.messageId}`
  const metadata = { tenant_id: tenantId, message_id: prepared.messageId }
  const result =
    prepared.channel === "sms"
      ? await provider.sendSms({
          from: prepared.from,
          to: prepared.to,
          text: prepared.body,
          idempotencyKey,
          metadata,
        })
      : await provider.sendEmail({
          from: { email: prepared.from, name: prepared.companyName },
          to: prepared.to,
          subject: prepared.subject ?? "(no subject)",
          text: prepared.body,
          html: textToHtml(prepared.body),
          inReplyTo: prepared.inReplyTo,
          idempotencyKey,
          metadata,
        })

  if (result.sent) {
    await withTenant(actor, (tx) =>
      messaging.markSent(
        tx,
        prepared.messageId,
        result.providerMessageId,
        prepared.channel === "email"
          ? `<${result.providerMessageId}@${prepared.from.split("@")[1]}>`
          : null,
      ),
    )
    return {
      sent: true,
      conversationId: prepared.conversationId,
      messageId: prepared.messageId,
    }
  }

  const detail =
    result.reason === "not_configured"
      ? "messaging is not configured on this server (no Bird API key)."
      : (result.detail ?? "Bird refused the message.")
  await withTenant(actor, (tx) =>
    messaging.markFailed(tx, prepared.messageId, detail),
  )
  return {
    sent: false,
    conversationId: prepared.conversationId,
    messageId: prepared.messageId,
    detail,
  }
}

async function contactAddress(
  tx: Tx,
  contactId: string,
  channel: Channel,
): Promise<{ address: string | null } | null> {
  const [row] = await tx<{ address: string | null }[]>`
    SELECT CASE WHEN ${channel} = 'sms' THEN phone ELSE email END AS address
      FROM customer_contacts
     WHERE id = ${contactId}::uuid AND is_active
  `
  return row ?? null
}

function replySubject(
  threadSubject: string | null,
  typed: string | null,
): string | null {
  if (typed) return typed
  if (!threadSubject) return null
  return /^re:/i.test(threadSubject) ? threadSubject : `Re: ${threadSubject}`
}

/** A plain-text body as minimal HTML: paragraphs on blank lines, breaks within. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("")
}

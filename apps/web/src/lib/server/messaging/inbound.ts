import { getSharedPool } from "../db/client"
import { withTenant, type Actor } from "../db/tenant"
import type { MessagingProvider } from "./bird"
import * as messaging from "./messaging.repo"
import type { WebhookEnvelope } from "./webhooks"

/**
 * What the Bird webhook route does with a verified event. Three steps for
 * an inbound message: find the tenant from the address it was sent TO
 * (app.messaging_route, the one read that happens before a tenant is
 * known), open a tenant-scoped transaction as the `system` actor, and file
 * the message under that tenant's RLS like any other write.
 *
 * A status event about an outbound message carries the `metadata` Kaaj
 * attached when it sent it; the tenant id in there is only a ROUTE — the
 * row is then found under that tenant's own policies, so a wrong id finds
 * nothing rather than someone else's message.
 */

export type InboundOutcome = "handled" | "duplicate" | "ignored" | "unroutable"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The claim the webhook writes under: a tenant, and no person. */
export function systemActor(tenantId: string): Actor {
  return {
    tenantId,
    employeeId: null,
    customerContactId: null,
    customerId: null,
    role: "system",
    functionalRoles: [],
  }
}

/** Which tenant receives on this address, or null. Runs on the shared pool, before any tenant context. */
export async function routeAddress(
  channel: messaging.Channel,
  address: string,
): Promise<string | null> {
  const sql = getSharedPool()
  const [row] = await sql<{ tenant_id: string | null }[]>`
    SELECT app.messaging_route(${channel}, ${address}) AS tenant_id
  `
  return row?.tenant_id ?? null
}

type Addressed = { email: string; name: string | null }

/** Bird writes an address as a string, as `{email, name}`, or as a list of either. */
function addresses(value: unknown): Addressed[] {
  if (typeof value === "string") return [{ email: value, name: null }]
  if (Array.isArray(value)) return value.flatMap(addresses)
  if (typeof value === "object" && value !== null) {
    const v = value as { email?: unknown; address?: unknown; name?: unknown }
    const email = v.email ?? v.address
    if (typeof email === "string") {
      return [{ email, name: typeof v.name === "string" ? v.name : null }]
    }
  }
  return []
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null
/**
 * Mail is not a form: nothing upstream enforces a column width, and a value
 * over it is a 500 that Bird redelivers for 27 hours and then drops. Clip
 * at the width (code points, as Postgres counts) rather than lose the mail.
 */
export const clip = (v: string | null, max: number): string | null =>
  v === null ? null : [...v].slice(0, max).join("")
const SUBJECT_MAX = 998
const NAME_MAX = 200
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null)

function occurredAt(
  envelope: WebhookEnvelope,
  data: Record<string, unknown>,
): Date {
  const candidate =
    str(data.received_at) ?? str(data.created_at) ?? envelope.timestamp
  const date = new Date(candidate)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

export async function handleBirdEvent(
  envelope: WebhookEnvelope,
  provider: MessagingProvider,
): Promise<InboundOutcome> {
  switch (envelope.type) {
    case "sms.received":
      return receiveSms(envelope)
    case "email.received":
      return receiveEmail(envelope, provider)
    case "sms.accepted":
    case "email.accepted":
      return statusEvent(envelope, "accepted")
    case "sms.sent":
    case "email.processed":
      return statusEvent(envelope, "sent")
    case "sms.delivered":
    case "email.delivered":
      return statusEvent(envelope, "delivered")
    case "sms.failed":
    case "sms.undelivered":
    case "sms.expired":
    case "sms.rejected":
    case "email.bounced":
    case "email.out_of_band_bounce":
    case "email.rejected":
      return statusEvent(envelope, "failed")
    case "email.complained":
    case "email.unsubscribed":
    case "email.list_unsubscribed":
      return recipientOptOut(envelope, "email", "preference")
    case "sms_suppression.created":
      return recipientOptOut(envelope, "sms", "stop")
    default:
      return "ignored"
  }
}

/**
 * What an `sms.received` event must carry for Kaaj to file it, read with
 * the documented names and their obvious variants. Pure, so a recorded
 * delivery can be checked against it without a database
 * (`bird-payloads.test.ts`). Null when a required field is absent.
 */
export function smsFields(
  data: Record<string, unknown>,
): { providerId: string; from: string; to: string; text: string } | null {
  const providerId = str(data.sms_id) ?? str(data.id)
  const from = str(data.from) && messaging.normalizePhone(data.from as string)
  const to = str(data.to) && messaging.normalizePhone(data.to as string)
  const text = str(data.text) ?? str(data.body) ?? ""
  if (!providerId || !from || !to) return null
  return { providerId, from, to, text }
}

/** The same for `email.received`: the sender, and every recipient that could be one of ours, in the order they are tried. */
export function emailFields(data: Record<string, unknown>): {
  providerId: string
  from: string
  senderName: string | null
  recipients: string[]
  subject: string | null
  rfcMessageId: string | null
  rfcInReplyTo: string | null
  spfPass: boolean | null
  dkimPass: boolean | null
} | null {
  const providerId = str(data.inbound_message_id) ?? str(data.id)
  const [sender] = addresses(data.from)
  if (!providerId || !sender) return null
  const from = messaging.normalizeEmail(sender.email)
  if (!from) return null
  const recipients = [...addresses(data.to), ...addresses(data.cc)]
    .map((c) => messaging.normalizeEmail(c.email))
    .filter((a): a is string => a !== null)
  return {
    providerId,
    from,
    senderName: clip(sender.name, NAME_MAX),
    recipients,
    subject: clip(str(data.subject), SUBJECT_MAX),
    rfcMessageId: str(data.message_id),
    rfcInReplyTo: str(data.in_reply_to),
    spfPass: bool(data.spf_pass),
    dkimPass: bool(data.dkim_pass),
  }
}

async function receiveSms(envelope: WebhookEnvelope): Promise<InboundOutcome> {
  const data = envelope.data
  const fields = smsFields(data)
  if (!fields) return "ignored"
  const { providerId, from, to, text } = fields

  const tenantId = await routeAddress("sms", to)
  if (!tenantId) return "unroutable"

  return withTenant(systemActor(tenantId), async (tx) => {
    const endpoint = await messaging.endpointByAddress(tx, "sms", to)
    if (!endpoint) return "unroutable"
    const contact = await messaging.matchContact(tx, "sms", from)
    const conversationId = await messaging.findOrOpenConversation(
      tx,
      tenantId,
      {
        channel: "sms",
        endpointId: endpoint.id,
        counterpartyAddress: from,
        counterpartyName: null,
        contact,
        subject: null,
        direction: "inbound",
      },
    )
    const filed = await messaging.recordInbound(tx, tenantId, {
      conversationId,
      fromAddress: from,
      toAddress: to,
      subject: null,
      bodyText: text,
      bodyHtml: null,
      providerMessageId: providerId,
      rfcMessageId: null,
      rfcInReplyTo: null,
      spfPass: null,
      dkimPass: null,
      occurredAt: occurredAt(envelope, data),
    })
    if (filed.duplicate) return "duplicate"
    if (messaging.isStopMessage(text)) {
      await messaging.recordOptOut(tx, tenantId, {
        channel: "sms",
        address: from,
        reason: "stop",
        notedBy: null,
      })
    }
    return "handled"
  })
}

async function receiveEmail(
  envelope: WebhookEnvelope,
  provider: MessagingProvider,
): Promise<InboundOutcome> {
  const data = envelope.data
  const fields = emailFields(data)
  if (!fields) return "ignored"
  const { providerId, from } = fields

  // The first recipient that routes to a tenant is the one this message is
  // for; a message to two of our addresses files under the first.
  let tenantId: string | null = null
  let to: string | null = null
  for (const address of fields.recipients) {
    tenantId = await routeAddress("email", address)
    if (tenantId) {
      to = address
      break
    }
  }
  if (!tenantId || !to) return "unroutable"

  // Only the headers arrive in the event; the body is a second call. A
  // missing body is still filed, so the thread shows that mail arrived.
  const body = await provider.inboundEmailBody(providerId)
  const bodyText =
    body?.text?.trim() ||
    (body?.html ? stripHtml(body.html) : "") ||
    "(The message body could not be retrieved.)"

  return withTenant(systemActor(tenantId), async (tx) => {
    const endpoint = await messaging.endpointByAddress(tx, "email", to)
    if (!endpoint) return "unroutable"
    const contact = await messaging.matchContact(tx, "email", from)
    const conversationId = await messaging.findOrOpenConversation(
      tx,
      tenantId,
      {
        channel: "email",
        endpointId: endpoint.id,
        counterpartyAddress: from,
        counterpartyName: fields.senderName,
        contact,
        subject: fields.subject,
        direction: "inbound",
      },
    )
    const filed = await messaging.recordInbound(tx, tenantId, {
      conversationId,
      fromAddress: from,
      toAddress: to,
      subject: fields.subject,
      bodyText,
      bodyHtml: body?.html ?? null,
      providerMessageId: providerId,
      rfcMessageId: fields.rfcMessageId,
      rfcInReplyTo: fields.rfcInReplyTo,
      spfPass: fields.spfPass,
      dkimPass: fields.dkimPass,
      occurredAt: occurredAt(envelope, data),
    })
    return filed.duplicate ? "duplicate" : "handled"
  })
}

function tenantFromMetadata(data: Record<string, unknown>): string | null {
  const metadata = data.metadata
  if (typeof metadata !== "object" || metadata === null) return null
  const id = (metadata as { tenant_id?: unknown }).tenant_id
  return typeof id === "string" && UUID.test(id) ? id : null
}

async function statusEvent(
  envelope: WebhookEnvelope,
  status: "accepted" | "sent" | "delivered" | "failed",
): Promise<InboundOutcome> {
  const data = envelope.data
  const providerId = str(data.sms_id) ?? str(data.email_id) ?? str(data.id)
  if (!providerId) return "ignored"
  const tenantId = tenantFromMetadata(data)
  // The product's own transactional mail ($lib/mailer) tags its sends with
  // a source and no tenant: nothing in Kaaj tracks those rows, so their
  // status events are simply not ours to route.
  if (!tenantId) {
    return typeof data.metadata === "object" && data.metadata !== null
      ? "ignored"
      : "unroutable"
  }
  const detail =
    str(data.bounce_description) ??
    str(data.reason) ??
    str(data.failure_reason) ??
    str(data.description) ??
    (status === "failed" ? envelope.type : null)

  const moved = await withTenant(systemActor(tenantId), (tx) =>
    messaging.applyStatusEvent(tx, providerId, status, detail),
  )
  return moved ? "handled" : "ignored"
}

async function recipientOptOut(
  envelope: WebhookEnvelope,
  channel: messaging.Channel,
  reason: messaging.OptOutReason,
): Promise<InboundOutcome> {
  const data = envelope.data
  const tenantId = tenantFromMetadata(data)
  if (!tenantId) return "unroutable"
  const raw = str(data.recipient) ?? str(data.to) ?? str(data.address)
  const address = raw && messaging.normalizeAddress(channel, raw)
  if (!address) return "ignored"
  await withTenant(systemActor(tenantId), (tx) =>
    messaging.recordOptOut(tx, tenantId, {
      channel,
      address,
      reason,
      notedBy: null,
    }),
  )
  return "handled"
}

/** Enough of a text rendering to read a mail that came with no plain part. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

import { randomBytes } from "node:crypto"
import type { Tx } from "../db/tenant"

/**
 * Messaging — conversations with people outside the firm, over SMS and
 * email carried by Bird (docs/37-messaging.md). RLS keyed on
 * app.reads_all_messaging()/app.writes_messaging() is what separates who
 * sees a thread; this file only ever runs inside a tenant-scoped `Tx`.
 */

/** Plain `text` columns with a CHECK behind them; these lists are the vocabulary the pages import (L57). */
export const CHANNELS = ["sms", "email"] as const
export type Channel = (typeof CHANNELS)[number]

export const CONVERSATION_STATUSES = ["open", "closed"] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const MESSAGE_STATUSES = [
  "queued",
  "accepted",
  "sent",
  "delivered",
  "failed",
  "received",
] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const OPT_OUT_REASONS = [
  "stop",
  "preference",
  "bounce",
  "manual",
] as const
export type OptOutReason = (typeof OPT_OUT_REASONS)[number]

export const REGISTRATION_STATUSES = ["none", "pending", "verified"] as const
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number]

/** Column widths, so FormReader's `max` and the schema cannot drift apart. */
export const ADDRESS_MAX = 255
export const LABEL_MAX = 120
export const SUBJECT_MAX = 998
export const SMS_BODY_MAX = 1600
export const EMAIL_BODY_MAX = 20000

export class MessagingRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_endpoint"
      | "no_such_conversation"
      | "no_such_message"
      | "endpoint_inactive"
      | "opted_out"
      | "bad_address",
  ) {
    super(reason)
    this.name = "MessagingRefused"
  }
}

// -----------------------------------------------------------------------------
// Addresses
// -----------------------------------------------------------------------------

const E164 = /^\+[1-9]\d{6,14}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** `+1 (212) 555-0201` -> `+12125550201`; null if it is not a dialable number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, "")
  const candidate = digits.startsWith("00") ? `+${digits.slice(2)}` : digits
  return E164.test(candidate) ? candidate : null
}

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return EMAIL.test(value) && value.length <= ADDRESS_MAX ? value : null
}

export function normalizeAddress(channel: Channel, raw: string): string | null {
  return channel === "sms" ? normalizePhone(raw) : normalizeEmail(raw)
}

/** The words a carrier treats as an opt-out; Bird suppresses on its side too, this is Kaaj's own record. */
const STOP_WORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
])

export function isStopMessage(text: string): boolean {
  return STOP_WORDS.has(text.trim().toLowerCase())
}

// -----------------------------------------------------------------------------
// Endpoints
// -----------------------------------------------------------------------------

export type EndpointRow = {
  id: string
  channel: Channel
  address: string
  label: string
  provider_ref: string | null
  country_code: string | null
  registration_status: RegistrationStatus
  is_active: boolean
  archived_at: Date | null
  created_at: Date
}

export async function listEndpoints(
  tx: Tx,
  filters: { includeArchived?: boolean } = {},
): Promise<EndpointRow[]> {
  const includeArchived = filters.includeArchived ?? false
  return tx<EndpointRow[]>`
    SELECT id, channel, address, label, provider_ref, country_code,
           registration_status, is_active, archived_at, created_at
      FROM messaging_endpoints
     WHERE (${includeArchived} OR is_active)
     ORDER BY is_active DESC, channel, created_at
  `
}

export async function endpointById(
  tx: Tx,
  id: string,
): Promise<EndpointRow | null> {
  const [row] = await tx<EndpointRow[]>`
    SELECT id, channel, address, label, provider_ref, country_code,
           registration_status, is_active, archived_at, created_at
      FROM messaging_endpoints WHERE id = ${id}::uuid
  `
  return row ?? null
}

export async function endpointByAddress(
  tx: Tx,
  channel: Channel,
  address: string,
): Promise<EndpointRow | null> {
  const [row] = await tx<EndpointRow[]>`
    SELECT id, channel, address, label, provider_ref, country_code,
           registration_status, is_active, archived_at, created_at
      FROM messaging_endpoints
     WHERE channel = ${channel} AND address = ${address} AND is_active
  `
  return row ?? null
}

/** The random local-part of an inbound address: 12 characters of [a-z2-9], ~56 bits. */
export function inboundToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz23456789"
  const bytes = randomBytes(12)
  let out = ""
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

export async function createEmailEndpoint(
  tx: Tx,
  tenantId: string,
  input: { label: string; inboundDomain: string; prefix: string },
  actorId: string,
): Promise<{ id: string; address: string }> {
  const slug =
    input.prefix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "inbox"
  const address = `${slug}-${inboundToken()}@${input.inboundDomain.toLowerCase()}`
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO messaging_endpoints (tenant_id, channel, address, label, created_by)
    VALUES (${tenantId}::uuid, 'email', ${address}, ${input.label}, ${actorId}::uuid)
    RETURNING id
  `
  return { id: row.id, address }
}

export async function registerSmsEndpoint(
  tx: Tx,
  tenantId: string,
  input: {
    address: string
    label: string
    providerRef: string | null
    countryCode: string | null
    registrationStatus: RegistrationStatus
  },
  actorId: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO messaging_endpoints (
      tenant_id, channel, address, label, provider_ref, country_code,
      registration_status, created_by
    ) VALUES (
      ${tenantId}::uuid, 'sms', ${input.address}, ${input.label},
      ${input.providerRef}, ${input.countryCode}, ${input.registrationStatus},
      ${actorId}::uuid
    )
    RETURNING id
  `
  return { id: row.id }
}

/** Retires an endpoint; inbound mail to it is unroutable from then on. Reports whether a row actually moved (L68). */
export async function archiveEndpoint(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE messaging_endpoints
       SET is_active = FALSE, archived_at = now()
     WHERE id = ${id}::uuid AND is_active
    RETURNING id
  `
  return rows.length === 1
}

// -----------------------------------------------------------------------------
// Opt-outs
// -----------------------------------------------------------------------------

export type OptOutRow = {
  id: string
  channel: Channel
  address: string
  reason: OptOutReason
  noted_by_name: string | null
  created_at: Date
  revoked_at: Date | null
}

export async function listOptOuts(tx: Tx): Promise<OptOutRow[]> {
  return tx<OptOutRow[]>`
    SELECT o.id, o.channel, o.address, o.reason,
           e.first_name || ' ' || e.last_name AS noted_by_name,
           o.created_at, o.revoked_at
      FROM messaging_opt_outs o
      LEFT JOIN employees e ON e.id = o.noted_by
     ORDER BY o.revoked_at NULLS FIRST, o.created_at DESC
     LIMIT 100
  `
}

export async function isOptedOut(
  tx: Tx,
  channel: Channel,
  address: string,
): Promise<boolean> {
  const [row] = await tx<{ opted_out: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM messaging_opt_outs
       WHERE channel = ${channel} AND address = ${address} AND revoked_at IS NULL
    ) AS opted_out
  `
  return row?.opted_out ?? false
}

/** Records (or re-arms) an opt-out. A repeated STOP is one row, not two. */
export async function recordOptOut(
  tx: Tx,
  tenantId: string,
  input: {
    channel: Channel
    address: string
    reason: OptOutReason
    notedBy: string | null
  },
): Promise<void> {
  await tx`
    INSERT INTO messaging_opt_outs (tenant_id, channel, address, reason, noted_by)
    VALUES (${tenantId}::uuid, ${input.channel}, ${input.address}, ${input.reason}, ${input.notedBy}::uuid)
    ON CONFLICT (tenant_id, channel, address)
    DO UPDATE SET reason = EXCLUDED.reason, noted_by = EXCLUDED.noted_by,
                  created_at = now(), revoked_at = NULL
  `
}

export async function revokeOptOut(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE messaging_opt_outs SET revoked_at = now()
     WHERE id = ${id}::uuid AND revoked_at IS NULL
    RETURNING id
  `
  return rows.length === 1
}

// -----------------------------------------------------------------------------
// Conversations
// -----------------------------------------------------------------------------

export type ConversationRow = {
  id: string
  channel: Channel
  endpoint_id: string
  endpoint_address: string
  endpoint_label: string
  counterparty_address: string
  counterparty_name: string | null
  customer_contact_id: string | null
  customer_id: string | null
  customer_name: string | null
  subject: string | null
  status: ConversationStatus
  has_unread: boolean
  last_message_at: Date
  last_direction: "inbound" | "outbound"
  created_at: Date
}

const CONVERSATION_COLUMNS = `
  c.id, c.channel, c.endpoint_id, ep.address AS endpoint_address,
  ep.label AS endpoint_label, c.counterparty_address, c.counterparty_name,
  c.customer_contact_id, c.customer_id, cu.customer_name,
  c.subject, c.status, c.has_unread, c.last_message_at, c.last_direction,
  c.created_at`

export type ConversationFilters = {
  channel?: Channel
  status?: ConversationStatus
  unreadOnly?: boolean
}

/** The inbox page: newest activity first. `countCap` bounds the count the pager shows (SCALE_SENSITIVE). */
export async function listConversations(
  tx: Tx,
  filters: ConversationFilters,
  page: { limit: number; offset: number },
  countCap: number,
): Promise<{ rows: ConversationRow[]; total: number }> {
  const channel = filters.channel ?? null
  const status = filters.status ?? null
  const unreadOnly = filters.unreadOnly ?? false
  const rows = await tx<ConversationRow[]>`
    WITH page AS (
      SELECT c.id
        FROM messaging_conversations c
       WHERE (${channel}::text IS NULL OR c.channel = ${channel}::text)
         AND (${status}::text IS NULL OR c.status = ${status}::text)
         AND (${unreadOnly} = FALSE OR c.has_unread)
       ORDER BY c.last_message_at DESC, c.id
       LIMIT ${page.limit} OFFSET ${page.offset}
    )
    SELECT ${tx.unsafe(CONVERSATION_COLUMNS)}
      FROM page
      JOIN messaging_conversations c ON c.id = page.id
      JOIN messaging_endpoints ep ON ep.id = c.endpoint_id
      LEFT JOIN customers cu ON cu.id = c.customer_id
     ORDER BY c.last_message_at DESC, c.id
  `
  const [{ total }] = await tx<{ total: number }[]>`
    SELECT count(*)::int AS total FROM (
      SELECT 1 FROM messaging_conversations c
       WHERE (${channel}::text IS NULL OR c.channel = ${channel}::text)
         AND (${status}::text IS NULL OR c.status = ${status}::text)
         AND (${unreadOnly} = FALSE OR c.has_unread)
       LIMIT ${countCap}
    ) x
  `
  return { rows, total }
}

export async function conversationById(
  tx: Tx,
  id: string,
): Promise<ConversationRow | null> {
  const [row] = await tx<ConversationRow[]>`
    SELECT ${tx.unsafe(CONVERSATION_COLUMNS)}
      FROM messaging_conversations c
      JOIN messaging_endpoints ep ON ep.id = c.endpoint_id
      LEFT JOIN customers cu ON cu.id = c.customer_id
     WHERE c.id = ${id}::uuid
  `
  return row ?? null
}

/** How many threads carry something nobody has opened yet — the sidebar badge. */
export async function unreadCount(tx: Tx): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM messaging_conversations WHERE has_unread LIMIT 100
    ) x
  `
  return row?.n ?? 0
}

export type ContactMatch = {
  customer_contact_id: string
  customer_id: string
  name: string
}

/**
 * Who, in the CRM, has this number or address. Phones are compared digit for
 * digit after stripping punctuation, since customer_contacts.phone is typed
 * by hand (`+1-212-555-0201`) and the carrier delivers E.164.
 */
export async function matchContact(
  tx: Tx,
  channel: Channel,
  address: string,
): Promise<ContactMatch | null> {
  const [row] = await tx<ContactMatch[]>`
    SELECT id AS customer_contact_id, customer_id,
           first_name || ' ' || last_name AS name
      FROM customer_contacts
     WHERE is_active
       AND (
         (${channel} = 'email' AND lower(email) = ${address})
         OR (${channel} = 'sms'
             AND regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g') = ${address})
       )
     ORDER BY is_primary DESC, created_at
     LIMIT 1
  `
  return row ?? null
}

/**
 * The thread for (endpoint, outside address), opened on first contact.
 * `ON CONFLICT DO NOTHING` plus a re-read: two inbound messages from the
 * same person in the same second must share one thread.
 */
export async function findOrOpenConversation(
  tx: Tx,
  tenantId: string,
  input: {
    channel: Channel
    endpointId: string
    counterpartyAddress: string
    counterpartyName: string | null
    contact: ContactMatch | null
    subject: string | null
    direction: "inbound" | "outbound"
  },
): Promise<string> {
  await tx`
    INSERT INTO messaging_conversations (
      tenant_id, channel, endpoint_id, counterparty_address, counterparty_name,
      customer_contact_id, customer_id, subject, last_direction
    ) VALUES (
      ${tenantId}::uuid, ${input.channel}, ${input.endpointId}::uuid,
      ${input.counterpartyAddress},
      ${input.counterpartyName ?? input.contact?.name ?? null},
      ${input.contact?.customer_contact_id ?? null}::uuid,
      ${input.contact?.customer_id ?? null}::uuid,
      ${input.subject}, ${input.direction}
    )
    ON CONFLICT ON CONSTRAINT uq_messaging_conversations_thread DO NOTHING
  `
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM messaging_conversations
     WHERE channel = ${input.channel}
       AND endpoint_id = ${input.endpointId}::uuid
       AND counterparty_address = ${input.counterpartyAddress}
  `
  if (!row) throw new MessagingRefused("no_such_conversation")
  return row.id
}

/** Opening the thread clears the tenant-wide unread mark. */
export async function markRead(tx: Tx, id: string): Promise<void> {
  await tx`
    UPDATE messaging_conversations SET has_unread = FALSE
     WHERE id = ${id}::uuid AND has_unread
  `
}

export async function setConversationStatus(
  tx: Tx,
  id: string,
  status: ConversationStatus,
): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE messaging_conversations
       SET status = ${status},
           archived_at = CASE WHEN ${status} = 'closed' THEN now() ELSE NULL END
     WHERE id = ${id}::uuid AND status IS DISTINCT FROM ${status}
    RETURNING id
  `
  return rows.length === 1
}

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------

export type MessageRow = {
  id: string
  direction: "inbound" | "outbound"
  from_address: string
  to_address: string
  subject: string | null
  body_text: string
  body_html: string | null
  status: MessageStatus
  status_detail: string | null
  spf_pass: boolean | null
  dkim_pass: boolean | null
  author_name: string | null
  occurred_at: Date
}

/** One page of a thread, newest first; `before` is keyset on the previous page's oldest id. */
export async function messagesFor(
  tx: Tx,
  conversationId: string,
  opts: { limit: number; before?: string | null },
): Promise<MessageRow[]> {
  const before = opts.before ?? null
  return tx<MessageRow[]>`
    SELECT m.id, m.direction, m.from_address, m.to_address, m.subject,
           m.body_text, m.body_html, m.status, m.status_detail,
           m.spf_pass, m.dkim_pass,
           e.first_name || ' ' || e.last_name AS author_name,
           m.occurred_at
      FROM messaging_messages m
      LEFT JOIN employees e ON e.id = m.author_employee_id
     WHERE m.conversation_id = ${conversationId}::uuid
       AND (${before}::uuid IS NULL OR (m.occurred_at, m.id) < (
             SELECT b.occurred_at, b.id FROM messaging_messages b WHERE b.id = ${before}::uuid))
     ORDER BY m.occurred_at DESC, m.id DESC
     LIMIT ${opts.limit}
  `
}

/** The newest inbound email's Message-ID, so an outbound reply threads under it. */
export async function lastInboundRfcId(
  tx: Tx,
  conversationId: string,
): Promise<string | null> {
  const [row] = await tx<{ rfc_message_id: string | null }[]>`
    SELECT rfc_message_id FROM messaging_messages
     WHERE conversation_id = ${conversationId}::uuid AND direction = 'inbound'
     ORDER BY occurred_at DESC, id DESC
     LIMIT 1
  `
  return row?.rfc_message_id ?? null
}

/**
 * Files an inbound message. A redelivered webhook (Bird retries for ~27
 * hours) hits the provider-id index and files nothing — `duplicate` lets
 * the handler answer 200 without touching the thread again.
 */
export async function recordInbound(
  tx: Tx,
  tenantId: string,
  input: {
    conversationId: string
    fromAddress: string
    toAddress: string
    subject: string | null
    bodyText: string
    bodyHtml: string | null
    providerMessageId: string
    rfcMessageId: string | null
    rfcInReplyTo: string | null
    spfPass: boolean | null
    dkimPass: boolean | null
    occurredAt: Date
  },
): Promise<{ id: string | null; duplicate: boolean }> {
  const rows = await tx<{ id: string }[]>`
    INSERT INTO messaging_messages (
      tenant_id, conversation_id, direction, from_address, to_address, subject,
      body_text, body_html, status, provider_message_id, rfc_message_id,
      rfc_in_reply_to, spf_pass, dkim_pass, occurred_at
    ) VALUES (
      ${tenantId}::uuid, ${input.conversationId}::uuid, 'inbound',
      ${input.fromAddress}, ${input.toAddress}, ${input.subject},
      ${input.bodyText}, ${input.bodyHtml}, 'received', ${input.providerMessageId},
      ${input.rfcMessageId}, ${input.rfcInReplyTo}, ${input.spfPass}, ${input.dkimPass},
      ${input.occurredAt}
    )
    ON CONFLICT (tenant_id, provider_message_id) WHERE provider_message_id IS NOT NULL
    DO NOTHING
    RETURNING id
  `
  if (rows.length === 0) return { id: null, duplicate: true }

  // A reply reopens a closed thread: the person wrote back, so it is not done.
  await tx`
    UPDATE messaging_conversations
       SET has_unread = TRUE, last_message_at = ${input.occurredAt},
           last_direction = 'inbound', status = 'open', archived_at = NULL,
           subject = coalesce(subject, ${input.subject})
     WHERE id = ${input.conversationId}::uuid
  `
  return { id: rows[0].id, duplicate: false }
}

/** The row for a send that is about to leave; `markSent`/`markFailed` record what Bird answered. */
export async function recordOutbound(
  tx: Tx,
  tenantId: string,
  input: {
    conversationId: string
    fromAddress: string
    toAddress: string
    subject: string | null
    bodyText: string
    bodyHtml: string | null
    rfcInReplyTo: string | null
    authorEmployeeId: string
  },
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO messaging_messages (
      tenant_id, conversation_id, direction, from_address, to_address, subject,
      body_text, body_html, status, rfc_in_reply_to, author_employee_id
    ) VALUES (
      ${tenantId}::uuid, ${input.conversationId}::uuid, 'outbound',
      ${input.fromAddress}, ${input.toAddress}, ${input.subject},
      ${input.bodyText}, ${input.bodyHtml}, 'queued', ${input.rfcInReplyTo},
      ${input.authorEmployeeId}::uuid
    )
    RETURNING id
  `
  await tx`
    UPDATE messaging_conversations
       SET last_message_at = now(), last_direction = 'outbound',
           subject = coalesce(subject, ${input.subject})
     WHERE id = ${input.conversationId}::uuid
  `
  return row.id
}

export async function markSent(
  tx: Tx,
  id: string,
  providerMessageId: string,
  rfcMessageId: string | null,
): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE messaging_messages
       SET status = 'accepted', provider_message_id = ${providerMessageId},
           rfc_message_id = ${rfcMessageId}
     WHERE id = ${id}::uuid AND status = 'queued'
    RETURNING id
  `
  return rows.length === 1
}

export async function markFailed(
  tx: Tx,
  id: string,
  detail: string,
): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE messaging_messages
       SET status = 'failed', status_detail = left(${detail}, 500)
     WHERE id = ${id}::uuid AND status IN ('queued', 'accepted', 'sent')
    RETURNING id
  `
  return rows.length === 1
}

/** Delivery states only move forward; a late `sent` after `delivered` is ignored. */
const STATUS_RANK: Record<MessageStatus, number> = {
  queued: 0,
  accepted: 1,
  sent: 2,
  delivered: 3,
  failed: 3,
  received: 3,
}

export async function applyStatusEvent(
  tx: Tx,
  providerMessageId: string,
  status: Extract<MessageStatus, "accepted" | "sent" | "delivered" | "failed">,
  detail: string | null,
): Promise<boolean> {
  const [current] = await tx<{ id: string; status: MessageStatus }[]>`
    SELECT id, status FROM messaging_messages
     WHERE provider_message_id = ${providerMessageId}
  `
  if (!current) return false
  if (STATUS_RANK[status] <= STATUS_RANK[current.status]) return false
  await tx`
    UPDATE messaging_messages
       SET status = ${status}, status_detail = coalesce(left(${detail}, 500), status_detail)
     WHERE id = ${current.id}::uuid
  `
  return true
}

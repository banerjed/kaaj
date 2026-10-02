# Messaging: SMS and email with people outside the firm, through Bird

**Status:** §1–§5 ✅ built (SMS and email, in and out, one webhook, opt-outs,
settings). §6 lists what is deliberately not built yet.
**Created:** 2026-10-02

Customer-facing messaging. A thread is one number or address on the firm's
side (an *endpoint*) and one on the other person's side. Bird
(<https://bird.com/docs>) carries every channel; this document is about the
part Kaaj owns: which tenant an inbound message belongs to, where it is
kept, who may read it, and what must never be sent.

Three things are *not* this feature, and share nothing with it but a UI
shell:

- `team_chat_*` ([20-team-chat.md](./20-team-chat.md)) is employees talking
  to each other.
- `chat_*` ([17-customer-portal.md §4](./17-customer-portal.md)) is a portal
  contact's own view, still unbuilt.
- The transactional email the product sends on its own behalf (invoice
  email, payment reminders, the welcome mail, admin notifications) goes
  through `$lib/mailer.ts`, which sends on the same Bird workspace but
  records nothing: those sends carry `metadata.source = "mailer"` and no
  tenant, and the webhook ignores their status events.

---

## 1. Bird owns the endpoint; Kaaj owns the mapping

One Bird workspace serves the whole product. Bird's isolation is per
workspace, its sub-accounts are being retired, and workspaces are meant for
production versus staging rather than per customer. Tenant isolation is
therefore Kaaj's job, exactly as for every other table.

| Channel | What Bird holds | What Kaaj holds |
|---|---|---|
| SMS | A number in the Kaaj workspace, bought through `POST /v1/numbers/orders` or in Bird's dashboard | `messaging_endpoints` row: the E.164 number and the tenant it serves |
| Email | One catch-all subdomain (`PRIVATE_MESSAGING_INBOUND_DOMAIN`) whose MX records point at Bird | `messaging_endpoints` row: a random local-part at that domain, and the tenant it serves |

**Email addresses are generated, never provisioned.** The catch-all accepts
every local-part, so Kaaj mints `<prefix>-<random token>@<domain>` and
records it. The token is random on purpose: a guessable slug would let a
stranger file mail into another tenant.

**An SMS number is dedicated to one tenant.** The number an inbound SMS was
sent *to* is the only thing that identifies the tenant, so numbers cannot be
shared. One number per tenant per country is the normal shape.

The one cross-tenant read in the whole feature is `app.messaging_route()`:
a `SECURITY DEFINER` function that takes a channel and an address and
returns a tenant id, nothing else. The webhook calls it before any tenant
context exists, then opens an ordinary tenant-scoped transaction.

---

## 2. Schema

Four tables, all `messaging_*`, all with `tenant_isolation` and a
`RESTRICTIVE` visibility policy on top (migration `20261003100000`).

- `messaging_endpoints` — the firm's receiving addresses. `is_active` plus
  `archived_at`; a retired address is unroutable from then on and may be
  re-issued. `UNIQUE (channel, address) WHERE is_active` is the routing
  key, and the one index in the schema that deliberately does not lead with
  `tenant_id` (listed in `verify-invariants.sql`).
- `messaging_conversations` — one per `(endpoint, outside address)`.
  `has_unread` is tenant-wide, not per reader: this is an inbox, not a chat.
  An inbound message reopens a closed thread.
- `messaging_messages` — every message, both directions, with the body.
  Bird keeps a message for 30 days; this row is the copy Kaaj keeps.
  `provider_message_id` is unique per tenant and is how a redelivered
  webhook files nothing twice. Outbound status moves only forward
  (`queued → accepted → sent → delivered | failed`).
- `messaging_opt_outs` — a STOP, a Bird preference or complaint event, a
  bounce, or a note by staff. Every send checks it first. Lifting one sets
  `revoked_at`; nothing is deleted.

Phone numbers and email addresses on these tables are plaintext, the same
decision `customer_contacts.phone`/`.email` already made (17§1): they are
business contact data, not the subject's identifiers.

---

## 3. Who may read and write

`messaging.read` / `messaging.write` in `@kaaj/authz`, held by
`sales_admin`, `marketing_admin`, and the base admins; `auditor` reads
through its `.read` filter. `app.reads_all_messaging()` and
`app.writes_messaging()` mirror that set exactly, plus a `system` role that
only the webhook route ever claims (§4). A portal contact is refused by every
policy outright.

Endpoints cost money and change what the public can reach, so creating,
buying and retiring them is `tenant.settings.write`; opt-outs are part of
messaging itself (`messaging.write`). Every one of those writes, and every
send, is in the audit register.

`messaging.visibility.test.ts` asserts both halves for each role: the
refused actor sees zero rows and cannot insert, the permitted one sees the
fixture's three threads.

---

## 4. The webhook

`POST /webhooks/bird` is the one route with no session. Its authentication
is the Standard Webhooks signature Bird sends (`webhook-id`,
`webhook-timestamp`, `webhook-signature`; HMAC-SHA256 over
`id.timestamp.body` with the `whsec_` secret), verified in
`webhooks.ts` with a five-minute replay window. `webhooks.test.ts` asserts
the refused branches.

What happens to a verified event (`inbound.ts`):

1. **`sms.received`** — route the `to` number to a tenant; open a
   transaction as `{ tenantId, role: "system" }`; match the sender against
   `customer_contacts.phone` digit for digit; find or open the thread; file
   the message. `STOP` (and its siblings) also records an opt-out.
2. **`email.received`** — the event carries headers only. Route the first
   recipient that resolves; fetch the body with a second call
   (`GET /v1/email/inbound-messages/{id}/body`); file it with the SPF/DKIM
   results Bird reports. A body that cannot be fetched still files, so the
   thread shows that mail arrived.
3. **Status events** (`sms.delivered`, `email.bounced`, …) — Kaaj attaches
   `metadata: { tenant_id, message_id }` to every send and Bird echoes it
   back. The tenant id there is only a *route*: the row is then found under
   that tenant's own policies, so a wrong id finds nothing rather than
   someone else's message.
4. **Complaints and unsubscribes** become opt-outs the same way.

The route answers 200 for anything it dealt with, including an event it
ignored or could not route, so Bird does not redeliver for 27 hours; it
answers 500 only for a failure Kaaj wants redelivered.

The relay is poll-based on the browser side: an open thread refreshes
every 30 seconds. There is no `LISTEN`/`NOTIFY` relay yet (§6).

**How the webhook is tested.** Three layers, none of which touches Bird:
`webhooks.test.ts` on the signature; `bird-payloads.test.ts` on checked-in
payloads under `fixtures/bird/` (documentation examples until a captured
delivery replaces each one — the `_source` field says which); and
`webhook-bird.writes.spec.ts`, which posts signed events to the running app
and checks the rows and the pages. What none of them proves is Bird's real
payload shape or a real carrier round trip; that needs a workspace with a
number and a verified domain, and one manual send each way per release.

---

## 5. Sending

`send.ts` is one path for compose and reply, in three steps on purpose:

1. A short transaction: resolve the endpoint and the address, refuse an
   opt-out, open the thread, insert the row as `queued`, and record the
   audit entry — the *decision* to send, in the same transaction as the row
   it describes (L40).
2. The call to Bird, with no transaction open. The idempotency key is the
   message id, so a retry cannot send twice.
3. A second short transaction: `accepted` with Bird's id, or `failed` with
   Bird's reason.

Email replies carry `In-Reply-To`/`References` from the newest inbound
message's `Message-ID`, so they thread in the recipient's mail client.

---

## 6. Deliberately not built yet

- **Dedicated-tier tenants.** `app.messaging_route()` reads the shared
  database. A dedicated tenant's endpoints live in its own database, so its
  inbound is unroutable until the resolver also consults a control-plane
  copy. Same gap, same reason, as team chat's realtime relay.
- **US 10DLC registration.** A US long code may not carry application
  traffic until a brand and campaign are registered with The Campaign
  Registry. The settings page records the status; it does not file the
  registration. Toll-free verification is the simpler first step for US
  tenants.
- **Attachments**, both directions. Inbound attachment metadata is in
  Bird's event; nothing downloads or stores it.
- **A tenant's own sending domain** (`support@acme.com`). Needs a
  DKIM-verified domain per tenant inside the Bird workspace.
- **Realtime.** A `pg_notify` on `messaging_messages` plus the existing SSE
  shape would replace the poll.
- **WhatsApp and Apple Messages.** The tables already carry `channel` as a
  closed list; adding one is a CHECK change, a provider method, and an event
  type in `inbound.ts`.

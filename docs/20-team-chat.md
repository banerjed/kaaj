# Team Chat: DMs, channels, and realtime delivery over Postgres

**Status:** 📋 specification — not implemented.
**Created:** 2026-09-22

Slack-shaped internal messaging for staff: direct messages (one or more
specific people) and named topic channels, delivered to open browser tabs
in real time using `LISTEN`/`NOTIFY` — no new infrastructure, per
[ADR-002](./05-architecture-decisions.md#adr-002-postgresql-as-the-only-datastore)
("PostgreSQL holds relational data, full-text search indexes... nothing
else," and explicitly supersedes a prior spec's Redis/queue stack). This is
also the first feature to actually take the realtime dependency
[17-customer-portal.md §4](./17-customer-portal.md) left open
("ship polling first... take the Realtime dependency only if a feature
genuinely requires it") — staff chat is exactly the case that spec named as
the plausible exception, and §5 below explains why it's a Postgres-native
`LISTEN`/`NOTIFY` pipe rather than Supabase's separate Realtime product.

Reviewed against the Nexus chat reference
(`https://nexus.daisyui.com/apps/chat`) per CLAUDE.md's UI reference rule —
see §6 for what's kept and what's a deliberate, documented divergence (the
template is DM-only; channels are this spec's own addition to that visual
language, not something copied from a template screen that doesn't exist).

---

## 1. Not the same feature as 17§4 — read this before naming anything

`docs/17-customer-portal.md §4` already reserves `chat_threads`,
`chat_messages`, and the `chat.*` permission namespace for **customer ↔
staff** chat, scoped to `customer_id`, for a `customer_contacts` actor who
isn't an employee. That is a different trust boundary and a different
product surface from what's being designed here — internal, employee-only
messaging, with no customer involved at all — and CLAUDE.md is explicit
that the portal's permission namespace exists precisely so it is "never one
missing `if` away from an internal one." Reusing its table or permission
names for this feature would be exactly that mistake.

Every table and permission in this spec is therefore prefixed `team_chat_*`
/ `team_chat.*`, distinct from 17§4's `chat_*` / `chat.*`. The two features
may eventually share a UI shell (a "Chat" nav item with internal and
customer-facing views) but never a table, a permission string, or an RLS
policy.

---

## 2. Schema

One conversation model covers both DMs and channels — a DM is a
conversation with no name and `kind = 'dm'`; a channel has a name, a topic,
and `kind = 'channel'`. Slack treats these as the same underlying object for
the same reason: messages don't care what kind of container they're in.

```sql
CREATE TABLE team_chat_conversations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    kind              TEXT NOT NULL CHECK (kind IN ('channel', 'dm')),
    name              VARCHAR(80),          -- required for channel, optional for a group dm
    topic             TEXT,                 -- channel only
    visibility        TEXT CHECK (visibility IN ('public', 'private')),
    CHECK (
      (kind = 'channel' AND name IS NOT NULL AND visibility IS NOT NULL)
      OR (kind = 'dm' AND visibility IS NULL)
    ),

    -- Denormalized membership, recomputed by trigger whenever
    -- team_chat_members changes — see §3 for why this exists: it is what
    -- lets every RLS policy here avoid a table ever re-querying itself.
    member_ids        UUID[] NOT NULL DEFAULT '{}',

    -- Canonical participant key for a DM ("sorted employee ids, joined"),
    -- so "message Aisha and Marcus" finds the existing thread instead of
    -- creating a duplicate every time. NULL for channels.
    dm_key            TEXT,

    created_by_employee_id UUID NOT NULL REFERENCES employees(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_team_chat_dm_key
    ON team_chat_conversations (tenant_id, dm_key) WHERE kind = 'dm';
CREATE INDEX idx_team_chat_conversations_member_ids
    ON team_chat_conversations USING GIN (member_ids);

CREATE TABLE team_chat_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id   UUID NOT NULL REFERENCES team_chat_conversations(id) ON DELETE CASCADE,
    employee_id       UUID NOT NULL REFERENCES employees(id),

    role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at           TIMESTAMPTZ,          -- soft leave, per "no DELETE in app code"
    last_read_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (conversation_id, employee_id)
);

CREATE TABLE team_chat_messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id   UUID NOT NULL REFERENCES team_chat_conversations(id) ON DELETE CASCADE,
    author_employee_id UUID NOT NULL REFERENCES employees(id),

    body              TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at         TIMESTAMPTZ,
    deleted_at        TIMESTAMPTZ            -- tombstone: renders "message deleted", never removed
);

-- Keyset pagination, newest-first, per conversation — see §7.
CREATE INDEX idx_team_chat_messages_conversation
    ON team_chat_messages (conversation_id, created_at DESC);
```

### Unread counts — recomputed, not maintained

`last_read_at` on `team_chat_members` is the only state kept. Unread count
for a conversation is `COUNT(*) FROM team_chat_messages WHERE
conversation_id = :id AND created_at > :last_read_at` — computed on read,
same "recompute, don't increment" shape as every denormalized figure in
this codebase (L58). There is no `unread_count` column to drift out of
sync.

---

## 3. RLS — and the self-reference trap this design exists to avoid

CLAUDE.md's newest rule: **"A table's own RLS policy must never call a
helper that re-queries that SAME table, even via `SECURITY DEFINER`"**
(L92) — `INSERT ... RETURNING` checks the new row against `SELECT` policies
mid-statement, and a nested subquery against the same table can't reliably
see that row yet. A membership table is the textbook case this bites:
"can I see this row" naturally wants to ask "is the requester *also* a
member of this same conversation" — a subquery against `team_chat_members`
from inside `team_chat_members`'s own policy.

`member_ids` on `team_chat_conversations` exists specifically to make that
question answerable **without** the self-reference — every policy below
checks membership by querying `team_chat_conversations` (a *different*
table), never `team_chat_members` from inside its own policy:

```sql
CREATE POLICY team_chat_conversation_visibility ON team_chat_conversations
FOR SELECT USING (
  app.current_employee_id() = ANY (member_ids)
  OR (kind = 'channel' AND visibility = 'public')   -- browsable before joining
);

CREATE POLICY team_chat_member_visibility ON team_chat_members
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_members.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);

CREATE POLICY team_chat_message_visibility ON team_chat_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_messages.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);

CREATE POLICY team_chat_message_insert ON team_chat_messages
FOR INSERT WITH CHECK (
  author_employee_id = app.current_employee_id()     -- same-row check, inline (L92-safe)
  AND EXISTS (
    SELECT 1 FROM team_chat_conversations c
    WHERE c.id = team_chat_messages.conversation_id
      AND app.current_employee_id() = ANY (c.member_ids)
  )
);
```

`member_ids` is maintained by a trigger, not app code, so it can never drift
regardless of which code path writes `team_chat_members`:

```sql
CREATE OR REPLACE FUNCTION app.team_chat_sync_member_ids() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE team_chat_conversations
  SET member_ids = (
    SELECT coalesce(array_agg(employee_id), '{}')
    FROM team_chat_members
    WHERE conversation_id = NEW.conversation_id AND left_at IS NULL
  )
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;

CREATE TRIGGER team_chat_sync_member_ids
AFTER INSERT OR UPDATE OF left_at ON team_chat_members
FOR EACH ROW EXECUTE FUNCTION app.team_chat_sync_member_ids();
```

**To verify empirically before this ships, not assumed from documentation**
(the standard this codebase already holds itself to — see the tenant-logo
migration's own comment in
`20260921030000_add_tenant_logo_storage.sql`): confirm that inserting a
first `team_chat_members` row for a brand-new conversation, in the same
transaction as the `team_chat_conversations` insert, `RETURNING`s correctly
under `team_chat_member_visibility` — i.e., that the trigger's write to
`member_ids` is visible to the outer statement's own `RETURNING` evaluation
before that evaluation runs. If it is not (statement-level MVCC snapshot
timing is genuinely subtle here), the fallback is to have the app insert
the creator's own `member_ids` entry directly on the `team_chat_conversations`
row at creation time, before any `team_chat_members` row exists, so the
trigger only ever needs to handle *subsequent* membership changes.

Public channels need one more allowance: joining one is a self-service
`INSERT` (`employee_id = app.current_employee_id()`), gated only by
`team_chat_conversations.visibility = 'public'` — no invitation needed.
Joining a **private** channel, or adding someone else to any conversation,
requires the actor already be a member with `role` sufficient to invite —
checked the same way, against `team_chat_conversations.member_ids`, never
against `team_chat_members` itself.

---

## 4. Permissions

```ts
"team_chat.read",
"team_chat.write",
```

Added to `EVERYONE` — the same self-service default as
`ticketing.read.own`/`write.own` and `document.read`/`write`
(18-document-management.md §2). The coarse permission gates whether an
employee can use chat at all; `member_ids`-based RLS governs which
conversations and messages they actually see. `chat.*` (17§1) remains the
customer-portal's own reserved namespace, untouched by this spec — see §1.

---

## 5. Realtime delivery: `LISTEN`/`NOTIFY`, not a new service

### The trigger

```sql
CREATE OR REPLACE FUNCTION app.team_chat_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'team_chat_message',
    json_build_object(
      'tenant_id', NEW.tenant_id,
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id
    )::text
  );
  RETURN NEW;
END $$;

CREATE TRIGGER team_chat_notify
AFTER INSERT ON team_chat_messages
FOR EACH ROW EXECUTE FUNCTION app.team_chat_notify();
```

**The payload carries only ids — never the message body, author name, or
anything else that reads as content.** `NOTIFY`/`LISTEN` is a Postgres
pub/sub primitive with **no concept of row security** — RLS does not apply
to it. A single dedicated `LISTEN` connection (below) receives *every*
tenant's notifications on this channel, so treating the payload as
authoritative content would mean the realtime pipe becomes a second,
unprotected home for a value RLS is supposed to gate — precisely the "a
protected value has more than one home" failure class CLAUDE.md's
disclosure lessons warn about. The payload is a pointer; the content is
only ever read back through the normal `team_chat_message_visibility`
policy.

### The relay

One dedicated, **non-pooled** Postgres connection per running server
instance (Supabase's pgbouncer transaction-mode pooler does not hold a
session open the way `LISTEN` requires — this needs the direct/session-mode
connection string, held for the process lifetime, reconnected with backoff
if it drops):

```
Postgres trigger → pg_notify('team_chat_message', {tenant_id, conversation_id, message_id})
                          │
                          ▼  (every server instance's LISTEN connection receives it)
        in-process relay: look up which of THIS instance's connected
        SSE clients are subscribed to conversation_id
                          │
                          ▼
        push a pointer-only SSE frame to each: {conversation_id, message_id}
                          │
                          ▼
        browser does a normal authenticated GET for that message —
        through the SAME RLS-protected read path as any other fetch
```

`/chat/stream/+server.ts` is a `GET` returning a `ReadableStream` (SSE) —
supported natively by a SvelteKit `+server.ts`, no WebSocket library
needed. At connect time it queries the caller's own conversation
memberships once and registers them in an in-memory
`Map<conversationId, Set<connectionId>>`; on membership change (join,
leave, removed), that map is updated directly rather than re-queried per
incoming message, which would not scale with message volume. The stream
deregisters on `request.signal`'s abort event.

**Deliberately never trust the `NOTIFY` payload's `tenant_id`/membership as
authorization.** The relay only ever decides *who might be interested*; the
browser's follow-up fetch is what actually decides *who is allowed to see
it*, through the one real permission surface (`team_chat_message_visibility`).
This is the same principle as 18-document-management.md §7's search design:
keeping the one real authorization check in exactly one place.

### Why this needs no new infrastructure, and why it scales across instances

`NOTIFY` fans out to **every** connection holding a matching `LISTEN`,
database-wide — so if the app runs on multiple server instances, each
instance's relay independently receives every notification and forwards
only to its own locally-connected clients. Postgres itself is the
cross-instance fan-out; no Redis pub/sub, no message broker, nothing beyond
what ADR-002/006 already run. This is the concrete reason `pg_notify` is
the right choice here, not just the one asked for.

### This is a latency optimization, never a correctness dependency

`NOTIFY` is fire-and-forget — a `LISTEN` connection that is reconnecting
after a drop simply misses whatever was sent during the gap; Postgres does
not queue it. Two independent mitigations, both already necessary for a
sane implementation, not extra work bolted on:

- **On SSE reconnect** (tab backgrounded/foregrounded, brief network blip),
  the client always does one authoritative `GET
  .../messages?after=:last_seen_message_id` to backfill anything missed,
  then resumes streaming. The stream is a "go check now" nudge, not the
  source of truth — durability lives in Postgres, as always.
- **A slow background poll** (30–60s) as an independent safety net for the
  currently open conversation, so a dead relay connection degrades to
  "up to a minute of latency," never "message never arrives." This is the
  same fallback floor 17§4 already named for portal chat
  ("fresh-on-load and polling") — this design sits on top of that floor
  rather than replacing it, and must keep working correctly with the
  realtime layer switched off entirely.

---

## 6. UI — and where this deliberately diverges from the reference

The Nexus chat reference (`/apps/chat`) is DM-only: a sidebar list
(avatar, name, last-message preview, timestamp, unread badge), a thread
pane (avatar, name, presence dot, call/video/add-person/overflow icons),
alternating message bubbles with timestamps, and a composer with an
attach icon. That's the visual language this reuses directly for both DMs
and channels.

**What the template doesn't have, and this spec adds:** a Channels
section in the sidebar alongside Direct Messages (grouped, not tabbed — a
channel and a DM are both just "a conversation" per §2, so switching
between them shouldn't feel like switching modes), and a "browse public
channels" affordance for joining one self-service. Per
[07-app-provenance.md](./07-app-provenance.md)'s own rule, this is
recorded here specifically so it's a documented decision, not silent
drift from the template.

**What the template shows but this spec does not build:** the call/video
icons and the "Active" presence dot. Presence (who's online right now) is
inherently ephemeral state, not a durable fact worth a Postgres row, and a
click-to-call/video affordance implies a telephony/WebRTC integration well
outside this spec's scope — both are flagged as excluded in §8, not
silently dropped.

---

## 7. Pagination

`team_chat_messages` is `SCALE_SENSITIVE` (accumulates per message sent,
unbounded, same shape as tickets and documents) — every list query is
paged, 20–50 rows. Specifically **keyset, never `OFFSET`**: a fast-growing,
newest-first table shifts every offset on each new message, so `OFFSET`
pagination silently skips or repeats rows as people type. Load newest 25
(`ORDER BY created_at DESC LIMIT 25`), then page older with `WHERE
created_at < :oldest_loaded ORDER BY created_at DESC LIMIT 25` — Slack's
own "load more history" shape, and the only one that stays correct against
a table that's still being written to while you scroll it.

`team_chat_conversations`/`team_chat_members` are `NOT_SCALE_SENSITIVE` —
bounded by team size × number of topics a tenant creates, not by an
ever-growing event log.

---

## 8. What this deliberately excludes, and why

| Slack feature | Excluded because |
|---|---|
| Threaded replies | Real threading is a second reply-graph and a second unread-tracking axis; flat, newest-first channels cover the SMB case. Revisit if a channel's volume makes flat scroll genuinely hard to follow. |
| Emoji reactions | No product requirement surfaced one; a `team_chat_reactions` table and its own realtime fan-out for zero validated demand. |
| Typing indicators, presence/"Active" status | Ephemeral, not a durable fact — would need its own short-lived pub/sub concept layered on `NOTIFY`, not a table. Worth adding later if wanted; deliberately not default. |
| File attachments | Reuse [18-document-management.md](./18-document-management.md)'s Storage bucket and upload path rather than a second one — a chat attachment is a `documents` row with `conversation_id` as its `entity_id`, not a new storage convention. Not designed further here; flagged as the obvious next extension. |
| Message editing/deletion **history** | `edited_at`/`deleted_at` mark current state; no `team_chat_message_revisions` table. If a compliance need for edit history surfaces later, that's an append-only table to add, not a retrofit of these two columns. |
| Call/video | Telephony/WebRTC integration, a different product entirely — the reference template's icons are not being built. |
| Cross-tenant or customer-facing chat | That's 17§4, a separate spec, separate tables, separate trust boundary — see §1. |

---

## 9. Audit register and classification

- **Sending, editing, or deleting a message is *not* audited** — exempted
  with reason ("high-volume, non-transactional communication, not a
  business record requiring a justification trail," the same class of
  exemption `./check`'s "writes are audited" step expects on its exempted
  list, not silence).
- **Archiving a channel and removing a member from a private channel** are
  audited — both are the kind of action someone may later be asked to
  justify ("why did I lose access to that channel"), same bar CLAUDE.md
  already applies to role grants and approvals.
- `team_chat_messages.body` is not PII and is not sealed — ordinary
  workplace communication, not the compensation/identity-document class of
  data `$lib/server/pii` exists for. If a tenant's jurisdiction ever treats
  chat content as requiring the same erasure guarantee, that's a deliberate
  follow-up decision, flagged here the same way 17§1 flagged the equivalent
  question for `customer_contacts`.

---

## 10. Open decisions, flagged rather than defaulted

1. **The `member_ids`/`RETURNING` timing question in §3** — needs the
   empirical local-stack verification described there before this ships;
   this spec names the fallback if the trigger-timing assumption doesn't
   hold, but does not assert it holds without having run it.
2. **Whether a channel member (not just an owner) can invite others.**
   Default assumption: only `role = 'owner'` can add members to a private
   channel; any member can post. Worth confirming against how Slack's own
   "anyone can invite" default reads for an SMB audience before building.
3. **Group DM membership changes.** Slack DMs are fixed-membership once
   created (no "add someone to this DM" — you start a new one). This spec
   follows that default rather than letting a DM's `member_ids` grow after
   creation, which keeps `dm_key` a stable, collision-free lookup; revisit
   only if there's a real request to add someone mid-conversation.

# Prospect Chat: anonymous visitors, a bot, and human handoff

**Status:** 📋 specification — not implemented. **Blocked on a prerequisite
migration** — see §1, which must land before any table below is created.
**Created:** 2026-09-22

There are **three** actor classes across this codebase's chat surfaces, not
two — worth stating plainly since this is the one most likely to be
conflated with an existing spec:

| # | Actor | Identity | Spec |
|---|---|---|---|
| 1 | Employee | `employees` via `tenant_users` | [20-team-chat.md](./20-team-chat.md) — ✅ separately designed |
| 2 | Existing customer's contact | `customer_contacts` via `tenant_users`, logged in | [17-customer-portal.md §4](./17-customer-portal.md) — ✅ separately spec'd |
| 3 | **Prospective client** — not yet a customer, no account, arrives from the tenant's public website | **Nothing today** | This document |

This document is about **#3 only**. It is not a variant of `docs/20`
(wrong actor, wrong trust boundary) and not simply "building 17§4" (that
spec is for someone who already has a `customer_contacts` row and a login —
a prospect has neither). `docs/module-marketing.md` §4.4 ("Live Chat &
Chatbots... AI-powered customer agent... team inbox... chat routing...
chat to ticket conversion") names this feature; nothing in the reconciled
schema architects it. This document does.

---

## 1. Prerequisite: `is_portal_contact()`'s exemption shape doesn't survive a third role

**This has to land before `prospect_chat_*` tables exist — it is not a
follow-up.**

Every `RESTRICTIVE` policy added since 17§1 lets staff through with `NOT
app.is_portal_contact()` — verified: **17 occurrences across 4 migrations**
(`20260904090000_customer_portal_identity.sql`,
`20260905090000_ticketing_portal.sql`,
`20260909120000_ticketing_visibility.sql`,
`20260922090000_document_management.sql`). `is_portal_contact()` is:

```sql
RETURN coalesce((claims #>> '{app_metadata,role}') = 'customer', false);
```

It returns `false` for any role it doesn't recognize by name — including a
new `prospect` role introduced by this spec. `NOT false = true`, so a
website visitor with a `prospect` claim would satisfy **every** staff
exemption in the schema — ticketing, documents, everything `is_portal_contact`
gates — the exact shape of [L74](./10-lessons-learned.md), which 17§1
already recorded once for exactly this reason ("the staff exemption must be
a positive role check, never the negation of a narrower one"). Adding a
role without re-reading that lesson reproduces the bug it was written to
prevent.

**The fix:**

```sql
CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
      (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin', 'employee', 'contractor'),
      false
    );
EXCEPTION WHEN OTHERS THEN RETURN false;  -- fails closed to "not staff", same direction as is_portal_contact()
END $$;
```

Replace all 17 `NOT app.is_portal_contact()` exemptions with `app.is_staff()`
(positive, allow-list, fails closed) in one migration, and add a `./check`
invariant that fails on any *new* `NOT app.is_portal_contact()` appearing
in a migration — the same "committed register, not prose" shape every other
rule in this codebase uses to keep a fix from being silently reintroduced.
`is_portal_contact()` itself doesn't need to change or disappear; a
`prospect`-scoped policy still uses a parallel `app.is_prospect()` the same
way `is_portal_contact()` is used today.

---

## 2. Identity model — the `tenant_users` constraint decides this

`tenant_users` already carries `CHECK (num_nonnulls(employee_id,
customer_contact_id) = 1)` (17§1,
`20260904090000_customer_portal_identity.sql:134`). An anonymous prospect
cannot get a `tenant_users` row without violating that constraint as-is —
so this is decided by one of two paths, not assumed:

**Recommended: anonymous Supabase Auth session, `tenant_users` widened to
three identity kinds.**

```sql
ALTER TABLE tenant_users ADD COLUMN prospect_session_id UUID REFERENCES prospect_chat_sessions(id);
ALTER TABLE tenant_users DROP CONSTRAINT ck_tenant_users_one_identity;
ALTER TABLE tenant_users ADD CONSTRAINT ck_tenant_users_one_identity
    CHECK (num_nonnulls(employee_id, customer_contact_id, prospect_session_id) = 1);
```

Supabase Auth's anonymous sign-in issues a real `auth.users` row and JWT
with no email/password — `custom_access_token_hook` stamps
`app_metadata.role = 'prospect'` and `app_metadata.tenant_id` (resolved per
§3) exactly the way it already stamps the other two identity classes. This
keeps **one** authentication mechanism for the whole product, which is the
entire reason ADR-008 chose Supabase Auth in the first place ("weeks of
security-sensitive work... gained outright") — a bespoke prospect token
with its own verification path would be a second auth system existing
specifically to avoid that.

**Rejected alternative:** a signed, unauthenticated token minted by the app
and verified per-request outside Supabase Auth. Faster to stand up, but it
is a second place session validity, expiry, and tenant-binding all have to
be gotten right — the precise failure mode ADR-008 already chose Supabase
Auth to avoid once. Not worth reopening for this feature.

**This is the design's own load-bearing decision — confirm before
building:** if widening `tenant_users`' identity `CHECK` a second time (it
already widened once, for `customer_contacts`) is unwelcome for any reason,
prospects need to live entirely outside `tenant_users`/the claims space,
which changes §4's RLS shape substantially and is not designed as an
alternative here.

---

## 3. Schema

```sql
CREATE TABLE prospect_chat_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Self-reported, optional, never required to start chatting — friction
    -- is the thing a pre-sales widget exists to avoid.
    display_name      VARCHAR(100),
    email             VARCHAR(255),

    status            TEXT NOT NULL DEFAULT 'bot'
        CHECK (status IN ('bot', 'queued', 'agent_assigned', 'closed')),
    assigned_employee_id UUID REFERENCES employees(id),

    -- Conversion seams — nullable, not designed further here.
    -- "Chat to ticket conversion" and lead-to-customer conversion are both
    -- named in module-marketing.md §4.4; this is the FK surface for a
    -- future feature to fill in, not a built workflow.
    converted_to_customer_id UUID REFERENCES customers(id),
    converted_to_ticket_id   UUID,

    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at         TIMESTAMPTZ
);

CREATE TABLE prospect_chat_messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id        UUID NOT NULL REFERENCES prospect_chat_sessions(id) ON DELETE CASCADE,

    -- Exactly one author kind — same shape tenant_users and
    -- documents.uploaded_by_* already use twice each.
    author_bot        BOOLEAN NOT NULL DEFAULT FALSE,
    author_employee_id UUID REFERENCES employees(id),
    -- The prospect's own auth.users id (from their anonymous session),
    -- not a FK to employees/customer_contacts — neither applies here.
    author_prospect_user_id UUID,
    CHECK (
      (author_bot AND author_employee_id IS NULL AND author_prospect_user_id IS NULL)
      OR (NOT author_bot AND num_nonnulls(author_employee_id, author_prospect_user_id) = 1)
    ),

    body              TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospect_chat_messages_session
    ON prospect_chat_messages (session_id, created_at DESC);
CREATE INDEX idx_prospect_chat_sessions_tenant_status
    ON prospect_chat_sessions (tenant_id, status) WHERE status <> 'closed';
```

### Lifecycle is code, not configuration

`status` (`bot → queued → agent_assigned → closed`) is a state machine with
real invariants (can't assign an agent to a closed session, can't reopen
silently) — the same `BILL_STATUSES`-shaped call 17§2 already made for
ticket lifecycle, per [L57](./10-lessons-learned.md): **a fixed vocabulary
in the repository**, never a tenant-configurable list. What *is* legitimately
tenant configuration — routing rules, which employees see which tenant's
queue, business hours — is Tier 3 settings
(`06-customization-model.md`), layered on top of this fixed lifecycle, not
a replacement for it.

---

## 4. Tenant resolution from the widget

A `<script>` embed on a public website identifies a tenant; it must never
be trusted to *authorize* one. Add a separate, rotatable column —
deliberately not the tenant's own UUID, so a leaked embed key can be
rotated without touching any FK:

```sql
ALTER TABLE tenants ADD COLUMN chat_widget_key TEXT UNIQUE
    DEFAULT encode(gen_random_bytes(16), 'hex');
```

The widget's session-creation call sends `chat_widget_key`; the server
resolves it to a `tenant_id` **once**, at anonymous-session creation, and
stamps that `tenant_id` into `app_metadata` via the same
`custom_access_token_hook` every other identity class already goes
through. After that point the client never supplies `tenant_id` again —
every subsequent request is authorized from the claim, not re-resolved from
a value the browser could tamper with.

---

## 5. RLS

```sql
CREATE OR REPLACE FUNCTION app.is_prospect() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce((claims #>> '{app_metadata,role}') = 'prospect', false);
EXCEPTION WHEN OTHERS THEN RETURN true;  -- fails closed the same direction is_portal_contact() does: assume the most restrictive case
END $$;

CREATE OR REPLACE FUNCTION app.current_prospect_user_id() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN (claims #>> '{sub}')::uuid;  -- the anonymous auth.users id itself
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;

CREATE POLICY prospect_session_visibility ON prospect_chat_sessions AS RESTRICTIVE FOR SELECT
USING (
  NOT (SELECT app.is_prospect())
  OR id IN (
       SELECT session_id FROM tenant_users
       WHERE user_id = (SELECT app.current_prospect_user_id())
     )
);

CREATE POLICY staff_session_visibility ON prospect_chat_sessions AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.is_prospect())              -- prospects: this policy doesn't narrow them
  OR (SELECT app.is_staff())
);
```

Both stack, ANDed, each exempting the actor the other governs — same
composition pattern as every other multi-actor table in this schema
(17§3's `portal_document_visibility`, 20§3's team-chat policies). No
self-reference risk here (L92): `prospect_chat_messages`'s policy checks
`prospect_chat_sessions` (a different table), never itself.

`prospect_chat_messages` follows the identical shape, keyed on
`session_id` instead of `id`. Staff `INSERT` additionally requires
`author_employee_id = app.current_employee_id()` (inline, same-row check,
L92-safe) and `status = 'agent_assigned'` — an employee can't post into a
session nobody has claimed.

---

## 6. Staff-side permissions — reusing what already exists, not minting new strings

`module-marketing.md` §4.4 files this feature under Marketing ("team
inbox," "chat routing rules"), and `marketing.read`/`marketing.write`
already exist in `packages/authz/src/index.ts`'s `PERMISSIONS` — unused by
any built code today (the Marketing module hasn't started). This spec
reuses them rather than adding a fourth chat-shaped permission namespace:
`marketing.read` to view the prospect queue and open sessions,
`marketing.write` to claim a session and reply. `marketing_admin` already
holds both. Neither `chat.*` (17§4) nor `team_chat.*` (docs/20) is touched
— three chat features, three non-overlapping namespaces.

---

## 7. Realtime: the same `pg_notify` pipeline as docs/20, one axis simpler

Reuse 20§5's pipeline unchanged — pointer-only `NOTIFY` payload
(`tenant_id`, `session_id`, `message_id`), one dedicated session-mode
`LISTEN` connection per server instance, the recipient's browser re-fetches
real content through the RLS-protected read path. The reasoning for why
that payload must never carry content, and why this needs no new
infrastructure across instances, is identical and not repeated here.

**What's actually simpler here than team chat:** a prospect session has
no membership *set* to maintain — it is always exactly one prospect and,
once claimed, exactly one assigned agent. There is no `member_ids` array,
no L92 concern to design around on the session/message tables at all; the
RLS in §5 is a straight ownership/role check, not a denormalized-array
check.

**What's different:** two distinct relay consumers on the same underlying
mechanism, with two different authorization paths —

- The **prospect's own browser stream** is authorized by their anonymous
  session claim, scoped to exactly the one `session_id` they own.
- The **staff "team inbox" stream** is authorized by `marketing.read`,
  scoped to every open (`bot`/`queued`/`agent_assigned`) session for the
  tenant — a member of the marketing/support team watching a live queue,
  not one conversation.

Both read through the same `prospect_chat_messages` table and the same RLS
— the relay just decides which of a server instance's locally-connected
SSE clients (a prospect's tab, or a staff member's inbox view) get nudged
for a given `session_id`.

---

## 8. Abuse surface — the section that makes this spec worth writing

17§1 named exactly this as the reason anonymous access was deferred the
first time ("abuse protection this codebase has never needed"). Naming it
again as a deferral here would be the same non-answer; this is a public,
unauthenticated write path (anonymous sign-in still admits anyone), and it
needs real controls before it ships:

- **Rate limits, per IP and per session**, on both session creation
  (prevents unbounded `auth.users`/`prospect_chat_sessions` row growth from
  a crawler or a scripted attacker) and message sending. **This codebase
  has no rate-limiting infrastructure today** — no middleware, no token
  bucket, nothing in `hooks.server.ts` that throttles by IP. That is a
  real, named gap this feature depends on closing, not a paragraph to wave
  past.
- **Message size**, through `FormReader.text({max})` like every other
  form-written field (CLAUDE.md's Forms section) — never a bare unbounded
  `TEXT` accepted from an anonymous caller.
- **Abandoned-session cleanup.** A prospect who opens the widget and never
  sends a message still creates a row. Without a retention job, this table
  grows unbounded from bots and accidental opens, on a table that isn't
  scale-sensitive in the "real event" sense the rest of this schema
  reserves that classification for — it's noise, not history. A scheduled
  job (the existing `jobs` table, ADR-002) purging sessions with `status =
  'bot'` and no messages after some window (24h, say) is required, not
  optional.

---

## 9. The bot-specific risk neither existing chat doc has: inference cost

An unauthenticated endpoint that can trigger a paid LLM call per message is
a **financial** denial-of-service vector, not just a spam one — a script
looping session-create + message-send burns real money with no signed-in
actor to hold accountable or rate-limit by identity. (`module-ai-assistant.md`'s
AI Assistant is a *different*, internal, authenticated-user feature —
citing it here only to be clear this document is not reusing or extending
it.) Required before any bot response ships:

- A **per-session** cap on bot replies (e.g., a fixed number of automated
  turns before the session is forced to `queued` for a human anyway).
- A **per-tenant** daily/monthly inference budget, enforced server-side,
  independent of the per-session cap — a single tenant's widget going viral
  or being targeted should not have unbounded blast radius on total spend.
- Both caps are Tier 3 settings (`tenant_settings`, namespace
  `prospect_chat`) with a code-enforced hard ceiling under them — a tenant
  can tighten its own budget, never remove the platform's own outer bound.

---

## 10. PII and lawful basis — a decision on record, not inherited by default

17§1 made this call explicitly for `customer_contacts` ("not sealed —
ordinary B2B directory data"). **That answer does not automatically carry
over here**, and defaulting to it silently would be exactly the kind of
undocumented assumption CLAUDE.md's disclosure lessons warn against: a
prospective client chatting with a business's pre-sales bot may well be an
individual consumer, not a company representative, and `display_name`/
`email` collected through a public widget deserves its own lawful-basis and
retention line rather than inheriting a B2B answer by default. This
spec's position: **flagged open, not decided** — pick this deliberately
before the feature ships, informed by which jurisdictions a given tenant's
own customers are likely to be visited from, not defaulted from a
different table's reasoning.

---

## 11. What this deliberately excludes, and why

| Feature | Excluded because |
|---|---|
| The bot's actual NLU/response generation | Out of scope for this spec, which is the data model, identity, RLS, and realtime pipe a bot plugs into — not the bot itself. §9's caps apply regardless of which model or logic answers. |
| Chat routing rules, business-hours logic | Named in `module-marketing.md` as real features; both are Tier 3 settings layered on the fixed lifecycle in §3, not designed further here. |
| Proactive/triggered chat (a bot that opens unprompted based on page behavior) | A different trigger model (page-view-driven, not message-driven) or the same one entirely — worth its own review once basic reactive chat exists. |
| File attachments in prospect chat | Same reasoning as 20§8 — reuse `documents`' storage path rather than a third convention, not designed further here. |

---

## 12. Build sequencing

1. **§1's `is_staff()` migration** — replaces all 17 `NOT
   app.is_portal_contact()` exemptions. Must land, and must be verified
   with `row-visibility.test.ts`-style refused/permitted pairs on the
   *existing* tables it touches, before anything below starts. This is a
   change to shipped, working RLS — treat it with the same care CLAUDE.md
   already demands for any policy change (`./check --db` immediately
   after).
2. **Identity model** (§2) — the `tenant_users` widening, anonymous
   Supabase Auth wiring, `custom_access_token_hook` extension.
3. **Schema, RLS, tenant resolution** (§3–5).
4. **Realtime** (§7) — the relay already exists from `docs/20`; this adds
   a second notify channel and a second pair of authorized consumers to
   the same running relay process, not a new pipeline.
5. **Abuse controls** (§8) and **inference caps** (§9) — before any bot
   logic is wired to a real model, not after.

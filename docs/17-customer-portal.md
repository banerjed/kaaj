# Customer Portal

**Status:** §1 (portal identity) ✅ built; §2–4 (ticketing, documents, chat)
📋 specified, not implemented — see [11-module-roadmap.md](./11-module-roadmap.md) Phase 8
**Created:** 2026-09-04

A second class of authenticated actor — someone who works for a *customer*,
not the firm — able to submit and read their own support tickets, exchange
documents, and chat with the firm, without ever having an employee record.
This document specifies the pieces of that design already settled, so the
next several building phases (ticketing extension, documents, chat) build on
one identity and one row-visibility pattern instead of inventing a new one
each time.

**Explicitly out of scope here, and why:**

- **Fully anonymous ticket submission** (no account, ever). Considered and
  rejected for this pass: it needs tenant resolution from something other
  than a session (URL/subdomain), a new anonymous-write RLS shape, and abuse
  protection this codebase has never needed — three new risk surfaces at
  once. A logged-in portal contact (§1) covers "outside a logged-in
  *employee*", which is what was actually being asked for.
- **Scheduling / booking** (Calendly-shaped). No precedent anywhere in this
  codebase's docs or schema. Not covered in this pass; will get its own spec.
- **Paying an invoice from the portal.** `product-specification.md` names it
  as a Client Portal feature. A card charge authorized by someone *outside*
  the firm is a materially different trust boundary than
  `recordPayment`/`recordVendorPayment` recording a bank transfer an
  employee already confirmed happened — it needs its own review, not a
  paragraph here.
- **Contracts/proposals access.** Same reasoning; not covered here.

**A note on two documents this supersedes.** `product-specification.md` §10
and `service-provider-modules-overview.md` §5 both describe a
`client_portal_users` table with `password_hash`/`password_reset_token`
columns, referencing `clients`/`contacts` tables that don't exist in the
reconciled schema. That is a pre-[ADR-008](./05-architecture-decisions.md#adr-008-supabase-as-the-backend-platform)
artifact — a home-grown auth system, which is exactly what ADR-008 chose
Supabase Auth to avoid ("weeks of security-sensitive work... gained
outright"). This spec does not follow it. Portal identity goes through
Supabase Auth like everything else in this product.

---

## 1. Portal identity — ✅ built

`supabase/migrations/20260904090000_customer_portal_identity.sql`;
`packages/authz/src/index.ts`; `apps/web/src/lib/server/{auth/can,db/tenant}.ts`;
`apps/web/src/hooks.server.ts`; `apps/web/src/routes/portal/**`. Verified live:
signed in as two portal contacts at two different customers (Acme, Britannia)
and confirmed each sees only their own customer's name on the shell page;
confirmed an anonymous visitor and a signed-in staff member are both bounced
to `/portal/login` rather than shown the shell; confirmed staff sign-in is
unaffected by the hook change. Four test personas seeded
(`packages/database/fixtures/mock-data.sql` — Dana Whitcombe & Felix Ndiaye
at Acme, Imogen Faulkner at Britannia, Theo Bakshi at Helios).

**One thing the design below got wrong the first time, caught by a test, not
by inspection:** see [L74](./10-lessons-learned.md) — the "is this actor
staff" check must be a role check, never `current_customer_id() IS NULL`,
which is also true for a `customer`-role actor with a malformed claim. The
`app.is_portal_contact()` function below is the fix; the code in this
document already reflects it.

**A second thing worth naming for whoever builds §2–4 next:**
`customer_contacts` needed the exact same "chicken-and-egg" fix `tenant_users`
already has (`20260827000002_auth_and_grants.sql` §3) — the access-token hook
runs as `supabase_auth_admin` before any JWT exists, so `tenant_isolation`'s
`app.current_tenant_id() = tenant_id` check has nothing to compare against and
filters out every row, silently. A `GRANT SELECT` alone does not fix this;
`FORCE ROW LEVEL SECURITY` still applies to a granted role. Any new table the
hook itself reads (there is no reason for there to be more, but if one shows
up) needs its own `CREATE POLICY ... FOR SELECT TO supabase_auth_admin USING
(true)`, not just a grant.

### Why this is one piece, not four

Ticketing, documents, and chat all need the same question answered: *who is
this, which customer do they belong to, and which of the tenant's rows may
they see?* Building that once and having three features consume it is the
whole point of this document. Get this section wrong and every feature above
it inherits the mistake.

### The extension point already exists

`tenant_users` is the existing join between `auth.users` and a tenant
membership:

```sql
CREATE TABLE tenant_users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL,          -- auth.users.id
    employee_id           UUID,                   -- nullable already
    role                  TEXT NOT NULL DEFAULT 'member',
    permissions           JSONB NOT NULL DEFAULT '{}'::jsonb,
    ...
    UNIQUE (tenant_id, user_id)
);
```

`employee_id` is already nullable — a `tenant_users` row with no employee was
already anticipated, even though nothing today produces one. That is the
seam this design uses rather than invents.

### Schema

```sql
-- Who the contact is — mirrors what `employees` holds for staff, at the
-- scope a customer contact actually needs: name, email, which company.
CREATE TABLE customer_contacts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id   UUID NOT NULL REFERENCES customers(id),
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(20),
    title         VARCHAR(100),
    is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

ALTER TABLE tenant_users ADD COLUMN customer_contact_id UUID
    REFERENCES customer_contacts(id);

-- A tenant_users row is a staff member OR a portal contact, never both and
-- never neither — this is the constraint that keeps the two identity
-- classes from drifting into an ambiguous third shape by accident.
ALTER TABLE tenant_users ADD CONSTRAINT ck_tenant_users_one_identity
    CHECK (num_nonnulls(employee_id, customer_contact_id) = 1);
```

`customer_contacts` is deliberately **not** `employees` with a different
`FOREIGN KEY` — a portal contact has no compensation, no time off, no
performance review, no attendance. Reusing `employees` would mean every
future employee-only column needs a `NULL`-tolerant read path forever.
Separate table, same shape of relationship to `tenant_users`.

### Roles and permissions

`packages/authz`'s `BASE_ROLES` gains a fifth member:

```ts
export const BASE_ROLES = [
  "owner",
  "firm_admin",
  "employee",
  "contractor",
  "customer",       // new
] as const
```

`PERMISSIONS` gains a small, deliberately separate namespace rather than
reusing existing ones — a portal contact must never be one missing `if`
away from an internal permission:

```ts
"ticket.submit",
"ticket.read.own",
"document.read.own",
"document.upload.own",
// chat.* lands with §4
```

`BASE.customer` grants exactly those, and nothing else. `EVERYONE` (the
grant every base role gets) is **not** extended — that bundle currently
includes `employee.read.self`, `compensation.read.self`, `timeoff.request`,
none of which mean anything for a contact who isn't an employee. A customer
role starts from an empty bundle and is grown deliberately, not inherited
into.

### Authentication flow

Magic link, the same GoTrue mechanism staff already use — no new auth code:

1. A staff member (or an automated "customer signed a contract" trigger,
   later) invites a contact: inserts `customer_contacts`, then calls
   Supabase Auth's admin API to send a magic link to that email.
2. The contact clicks through, GoTrue creates `auth.users` if the email is
   new, session established.
3. On first sign-in, a `tenant_users` row is created (or looked up if the
   email already has one — see multi-tenant note below) with
   `customer_contact_id` set, `employee_id` NULL, `role = 'customer'`.
4. `custom_access_token_hook` — the same Postgres function that already
   stamps `app_metadata.tenant_id`/`role`/`employee_id` at token issue —
   gains two more claims when `customer_contact_id IS NOT NULL`:
   `app_metadata.customer_contact_id` and `app_metadata.customer_id`.

### Reading the new claims

`hooks.server.ts`'s `appMetadataFromToken` (the one place JWT claims are
parsed, per [ADR-003](./05-architecture-decisions.md#adr-003-shared-schema-multi-tenancy-with-row-level-security)
rule 5 — one choke point) grows two more fields, read the same defensive way
the existing four are — absent claim reads as `null`, malformed token reads
as no tenant, never a crash:

```ts
customerContactId: typeof v === "string" && v ? v : null,
customerId: typeof v === "string" && v ? v : null,
```

### Multi-tenant contacts

`tenant_users` already lets one `auth.users` row belong to multiple tenants
(staff switch tenants by re-issuing the token). The same shape covers a
contact who is, in principle, a client of two different firms both running
Kaaj — one email, two `tenant_users` rows, each with its own
`customer_contact_id` pointing at that tenant's own `customer_contacts` row.
Realistically rare, but free to support by not special-casing it away.

### The third RLS pattern

Two shapes exist today: `tenant_isolation` (everyone in the tenant) and
role-aware `RESTRICTIVE` scoped by `app.current_employee_id()`. This adds a
third — **customer-scoped**:

```sql
CREATE OR REPLACE FUNCTION app.current_customer_id() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN (claims #>> '{app_metadata,customer_id}')::uuid;
EXCEPTION WHEN OTHERS THEN RETURN NULL; -- fail closed, same shape as every app.* function
END $$;

-- Whether the actor is a portal contact AT ALL — by role, never by
-- "current_customer_id() IS NULL". Those are not the same question: a
-- customer-role actor with a missing/malformed customer_id claim also has
-- current_customer_id() IS NULL, and an early draft of this policy treated
-- that as "must be staff" — granting every customer's rows to exactly the
-- actor the policy exists to restrict (L74). Fails closed the OTHER
-- direction from current_customer_id() on purpose: an error here means
-- "assume the most restrictive case", not "assume staff".
CREATE OR REPLACE FUNCTION app.is_portal_contact() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce((claims #>> '{app_metadata,role}') = 'customer', false);
EXCEPTION WHEN OTHERS THEN RETURN true;
END $$;
```

Applied per table that a portal contact may touch — first on
`ticketing_tickets`:

```sql
CREATE POLICY portal_visibility ON ticketing_tickets AS RESTRICTIVE FOR SELECT
USING (
  NOT (SELECT app.is_portal_contact())          -- staff: this policy doesn't narrow them
  OR customer_id = (SELECT app.current_customer_id())
);
```

Two things to get right that a first draft will miss — the first of which
this design *did* miss once, per [L74](./10-lessons-learned.md):

- **The "staff" exemption is `NOT is_portal_contact()`, never
  `current_customer_id() IS NULL`.** The two are only the same for a
  well-formed token; for a `customer`-role actor with a missing or malformed
  claim they diverge in exactly the wrong direction, granting the broadest
  access to the actor with the least trustworthy claim. Test both a missing
  claim AND a `customer`-role actor with a missing claim as two separate
  cases — they must both see nothing.
- **This is `AS RESTRICTIVE`, not a replacement policy.** Per
  [L63](./10-lessons-learned.md), omitting that turns "must satisfy
  tenant_isolation AND this" into "either one" — a cross-tenant leak, not a
  cross-customer one, which is worse.
- **A ticket's *updates* need their own filter, inside the row, not just at
  the table.** `ticketing_updates.is_internal`/`visibility` already exist for
  exactly this — a portal contact who CAN see a ticket still must not see its
  internal-only updates. That is a `CASE WHEN` in the SELECT, per the
  disclosure rule in CLAUDE.md ("resolve it in SQL, not after the query") —
  the same shape as `pii.reveal`, not a new pattern.

### PII: an open decision, not a silent default

CLAUDE.md's PII rule is "keys are per **employee**" — `customer_contacts`
isn't covered by that mechanism at all. Name and business email for a
company contact is ordinary B2B directory data, not the same sensitivity
class as an employee's compensation or a home address, so this spec's
default is: **`customer_contacts` is not sealed.** If a future requirement
needs it (a jurisdiction that treats a business contact's data as personal
data requiring the same erasure guarantee), that is a deliberate follow-up,
not something to retrofit quietly — flagging it here so it's a decision on
record, per CLAUDE.md's own rule about writing findings down before moving
on.

### Sign-in surface

A separate `/portal/login` route, not the staff `/login`. Reasoning: the
permission model, the branding (per `docs/06-customization-model.md`'s
neutral-token recolour), and the destination after sign-in are all different
enough that sharing one entry point means every future staff-login change
has to reason about whether it affects portal contacts too.

---

## 2. Ticketing, portal-side — demonstrating the configuration model

### What's already schema-ready

`ticketing_business_areas.categories`/`custom_fields`/`settings` are
Tier-1/2/3 configuration per `docs/06-customization-model.md`, already on
the table, unwired to any application code. `custom_field_definitions`
(entity_type-keyed, typed, validatable) exists too and is what actually
answers the "missing metadata" gap that doc calls out — real
`custom_field_definitions` rows with `entity_type = 'ticket'`, not raw
`ticketing_business_areas.custom_fields` JSONB trusted blind.

**What stays code, not config, on purpose:** the ticket *lifecycle*
(`Pending → Assigned → Active → Closed`) is a state machine with real
invariants (can't close with an unresolved blocker, etc.) — that's
`BILL_STATUSES`-shaped: a fixed vocabulary in the repository, per L57.
**Categories and custom fields are data** — a tenant genuinely should be
able to name their own without a migration. The line is exactly
`06-customization-model.md`'s own test: does it participate in a real state
machine (code), or is it descriptive/filterable (data)?

### Three configured business areas, same schema, different needs

Each is a real `ticketing_business_areas` row plus its
`custom_field_definitions` rows — nothing here is a new table, only new
configuration data, which is the whole point being demonstrated.

**1. IT Support — internal only, never portal-visible**

```sql
INSERT INTO ticketing_business_areas
  (tenant_id, prefix, name, categories, settings, roles)
VALUES (
  '<tenant>', 'IT', 'IT Support',
  '[{"name":"Networking"},{"name":"Desktop Support"},
    {"name":"Application Support"},{"name":"Access Request"}]'::jsonb,
  '{"portalVisible": false,
    "defaultDueDateDays": 3,
    "statuses": {"available": ["Pending","Assigned","Active","Closed"]}}'::jsonb,
  '{"admins": ["it_admin"], "analysts": ["employee"]}'::jsonb
);
```

```sql
INSERT INTO custom_field_definitions
  (tenant_id, entity_type, field_key, label, data_type, options, is_required)
VALUES ('<tenant>', 'ticket', 'affected_system', 'Affected system', 'select',
  '[{"value":"laptop","label":"Laptop"},{"value":"vpn","label":"VPN"},
    {"value":"email","label":"Email"},{"value":"other","label":"Other"}]'::jsonb,
  TRUE);
```

`settings.portalVisible: false` is the field that keeps this business area
out of every portal-side query — a portal contact should never even see
"IT Support" as an option, let alone a ticket filed into it. That's a
`WHERE` clause the portal route adds (`business_area.settings->>'portalVisible'
= 'true'`), not an RLS policy — RLS is per-row identity, this is per-tenant
configuration, and the two are deliberately different mechanisms for
different questions.

**2. Client Success — portal-visible, one field pulled from the customer's own data**

```sql
INSERT INTO ticketing_business_areas
  (tenant_id, prefix, name, categories, settings)
VALUES (
  '<tenant>', 'CS', 'Client Success',
  '[{"name":"Billing Question"},{"name":"Feature Request"},
    {"name":"Bug Report"},{"name":"Access Issue"}]'::jsonb,
  '{"portalVisible": true,
    "defaultDueDateDays": 5,
    "statuses": {"available": ["Pending","Assigned","Active","Closed"]}}'::jsonb
);
```

```sql
INSERT INTO custom_field_definitions
  (tenant_id, entity_type, field_key, label, data_type, options, is_required)
VALUES
  ('<tenant>', 'ticket', 'related_project', 'Related project', 'select',
   NULL,  -- options populated per-request from that contact's own projects, not stored statically
   FALSE),
  ('<tenant>', 'ticket', 'severity_impact', 'How much is this affecting you?',
   'select',
   '[{"value":"blocking","label":"Blocking my work"},
     {"value":"annoying","label":"Annoying but I can work around it"},
     {"value":"question","label":"Just a question"}]'::jsonb,
   TRUE);
```

`related_project` with `options: NULL` is the one field in this set that
isn't purely static config — the *definition* is tenant-wide, but the
*choices* are scoped to the logged-in contact's own customer (their
projects, via `projects.client_id` — see the gap noted below). The
`CustomFieldInput.svelte` component `06-customization-model.md` describes
needs one more branch: a `select` whose `options` come from a query, not the
definition row, when `field_key` names one of a short allow-list of
dynamic sources. This is the one place "configurable" and "someone's own
data" meet, and it's worth being explicit that it's a different code path
than the static-options case, not a variant of it.

**3. Professional Services Requests — portal-visible, different numbering and SLA**

```sql
INSERT INTO ticketing_business_areas
  (tenant_id, prefix, name, categories, settings)
VALUES (
  '<tenant>', 'PSR', 'Professional Services Requests',
  '[{"name":"Change Order"},{"name":"Scope Question"},
    {"name":"Deliverable Feedback"}]'::jsonb,
  '{"portalVisible": true,
    "defaultDueDateDays": 2,
    "ticketNumberFormat": "{prefix}-{number}",
    "statuses": {"available": ["Pending","In Review","Approved","Closed"]}}'::jsonb
);
```

```sql
INSERT INTO custom_field_definitions
  (tenant_id, entity_type, field_key, label, data_type, options, is_required)
VALUES ('<tenant>', 'ticket', 'project_phase', 'Project phase', 'select',
  '[{"value":"discovery","label":"Discovery"},{"value":"build","label":"Build"},
    {"value":"testing","label":"Testing"},{"value":"launch","label":"Launch"}]'::jsonb,
  TRUE);
```

A **faster default due date** (2 days vs. 5), a **different status set**
entirely (`In Review`/`Approved` instead of `Assigned`/`Active` — a
different approval-shaped workflow, still expressed as the same
`statuses.available` array), and its own numbering — three tenant
decisions, zero application code changed, three `INSERT`s. That's the
demonstration: one `ticketing_tickets` table, one route, one repo file,
serving three genuinely different-feeling ticket systems because the
difference lives in rows, not branches.

### Portal-side route shape

```
/portal/tickets           list — WHERE business_area.settings->>'portalVisible' = 'true'
                                  AND customer_id = current contact's customer_id (RLS)
/portal/tickets/new       create — logger becomes the customer_contact, not an employee
/portal/tickets/[id]      detail — internal updates filtered in SQL, not after
```

`ticketing_tickets.logger_id UUID NOT NULL` currently assumes an employee.
A portal-created ticket needs `logger_id` to accept a `customer_contacts.id`
too — either loosen the column to a bare UUID with no FK (matching how
`reported_by`/`reported_by_name`/`reported_by_email` already work as
unconstrained TEXT) or add a second nullable `logger_contact_id` column,
symmetric with the `tenant_users` pattern above. The second is more
consistent with this document's own reasoning in §1 and is the
recommendation: **`logger_employee_id` / `logger_contact_id`, exactly one
set**, same `CHECK (num_nonnulls(...) = 1)` shape.

---

## 3. Document portal (internal and client-facing)

### The gap

No generic document table exists. `hr_employee_documents` is
employee-specific (I-9s, offer letters). `ticketing_attachments` has its own
`storage_key`/`file_url` columns, scoped to one ticket. Nothing today models
"a file attached to a project, visible to that project's client, uploaded by
either side."

### Schema

```sql
CREATE TABLE documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Polymorphic owner, same shape as custom_field_definitions.entity_type —
    -- a document can hang off a project, a customer, a ticket, or nothing
    -- (a general firm document).
    entity_type     TEXT,               -- 'project' | 'customer' | 'ticket' | NULL
    entity_id       UUID,

    customer_id     UUID REFERENCES customers(id),  -- denormalized for the RLS
                                                      -- policy below; NULL for
                                                      -- internal-only documents

    file_name       TEXT NOT NULL,
    storage_key     TEXT NOT NULL,      -- Supabase Storage object path
    mime_type       TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,

    visibility      TEXT NOT NULL DEFAULT 'internal'
        CHECK (visibility IN ('internal', 'client_visible', 'public')),

    uploaded_by_employee_id UUID,
    uploaded_by_contact_id  UUID REFERENCES customer_contacts(id),
    CHECK (num_nonnulls(uploaded_by_employee_id, uploaded_by_contact_id) = 1),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_entity ON documents (tenant_id, entity_type, entity_id);
CREATE INDEX idx_documents_customer ON documents (tenant_id, customer_id)
    WHERE customer_id IS NOT NULL;
```

`visibility` mirrors the three-word vocabulary
`product-specification.md`'s Document Management section already names
("internal, client-visible, public") — a real precedent, kept rather than
invented fresh. `'public'` here means "reachable via a signed link without a
portal login at all" (a signed contract handed to someone who isn't a
`customer_contacts` row yet) — narrower than it sounds, and worth a
dedicated signed-URL expiry policy when it's actually built, not a bare
"public bucket."

### RLS — the same pattern, third time

```sql
CREATE POLICY portal_document_visibility ON documents AS RESTRICTIVE FOR SELECT
USING (
  NOT (SELECT app.is_portal_contact())
  OR (customer_id = (SELECT app.current_customer_id())
      AND visibility IN ('client_visible', 'public'))
);
```

A portal contact never sees `visibility = 'internal'` documents on their own
customer, and never sees another customer's rows at all — both halves
matter, and `row-visibility.test.ts`'s existing convention (assert the
refused actor gets nothing *and* the permitted one still gets rows) applies
here unchanged.

**Upload** is the write direction that matters more here than read: a
contact attaching a file to their own ticket, or uploading a signed
contract. The `WITH CHECK` has to be narrow —

```sql
CREATE POLICY portal_document_upload ON documents AS RESTRICTIVE FOR INSERT
WITH CHECK (
  NOT (SELECT app.is_portal_contact())
  OR (customer_id = (SELECT app.current_customer_id())
      AND uploaded_by_contact_id = (SELECT app.current_customer_contact_id())
      AND visibility = 'client_visible')
);
```

— a portal contact can only insert a row scoped to their own `customer_id`,
attributed to themselves, and can't mark their own upload `internal` (which
would otherwise let them plant a row that reads as staff-authored).

### Supabase Storage — first real use

Nothing in this app touches Supabase Storage yet (ADR-008 names it, nothing
calls it). This is the first feature that does, so the bucket structure
gets decided once, here:

- One bucket, objects keyed `{tenant_id}/{entity_type}/{entity_id}/{document_id}-{file_name}`
  — tenant-prefixed for the same reason every table leads its index with
  `tenant_id`.
- **Storage RLS is a separate policy system from Postgres RLS** — Supabase
  Storage's own bucket policies, evaluated against the same JWT claims, but
  written and tested independently. `documents.storage_key` existing in
  Postgres does not imply the object is actually protected; the bucket
  policy is the thing that does, and needs its own test the same way
  `verify-rls.sql` tests table policies.
- Size/type limits: `module-ticketing.md`'s existing `globalSettings`
  example (`maxAttachmentSizeMB: 10`, a fixed extension allow-list) is a
  reasonable Tier-3 `tenant_settings` default — namespace `documents`,
  not re-invented per feature.

### Internal vs. client-facing, in one table

A project deliverable an employee uploads defaults to `visibility =
'internal'` until someone explicitly flips it to `client_visible` — never
the reverse default. A contact-uploaded document is `client_visible` by
construction (the `WITH CHECK` above enforces it) — a client's own upload
being invisible to them would look exactly like data loss.

### Cleanup flagged, not forced

`ticketing_attachments` keeps its own `storage_key`/`file_url` today. Once
`documents` exists, ticket attachments are a natural candidate to migrate
onto it (one storage model instead of two), but that's a follow-up, not a
prerequisite — shipping `documents` for projects/contracts doesn't require
touching ticketing's existing attachment path first.

---

## 4. Chat

### Nothing exists

No message/thread schema anywhere in this codebase. Fully greenfield,
unlike ticketing and documents which had real schema to extend.

### Schema

```sql
CREATE TABLE chat_threads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id   UUID NOT NULL REFERENCES customers(id),
    ticket_id     UUID,                 -- optional: a thread attached to a ticket
    subject       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    thread_id     UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,

    author_employee_id UUID,
    author_contact_id  UUID REFERENCES customer_contacts(id),
    CHECK (num_nonnulls(author_employee_id, author_contact_id) = 1),

    body          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`chat_threads.customer_id` (not derived from messages) is what
`portal_visibility`-shaped RLS keys on, same as tickets and documents — a
fourth application of the same one pattern from §1.

### Realtime vs. polling — an open decision, not resolved here

ADR-008 explicitly deferred Supabase Realtime: *"'Real-time' in the module
specifications means fresh-on-load and polling. Do not take the dependency
until a feature genuinely requires it."* Support chat is the first feature
in this product where that might actually be true — a contact waiting on a
reply notices multi-second lag in a way nobody has noticed a dashboard
refreshing on load.

This spec's default, consistent with the ADR until proven otherwise: **ship
polling first** (a `load` function plus a short client-side interval, or
invalidate-on-window-focus), measure whether response latency is a real
complaint, and take the Realtime dependency only if it is. That is a product
decision made with usage data, not an engineering guess made now — flagging
it here so it doesn't get silently decided either way when someone starts
building it.

### Notifications reuse `jobs`

A new `chat_messages` row enqueues a `jobs` row (`job_type: 'notify_chat_message'`)
— the background-queue table ADR-002 already designed for exactly this
shape of async work, not a new mechanism.

---

## 5. Test personas

Four `customer_contacts`, grounded in the fixture's three real `customers`
rows (`ACME`, `BRITCO`, `HELIOS`), each exercising a different corner of the
design — mirroring how the employee fixture cast (Sarah Johnson, Marcus
Chen, ...) already exists to exercise internal workflows.

| Persona | Customer | Role | Project (PM) | What they exercise |
|---|---|---|---|---|
| **Dana Whitcombe** | Acme Manufacturing (`e40d0f18-...`) | Operations Director, `is_primary` | PRJ-001 Acme ERP Integration (Aisha Okafor) | An established, engaged customer: paid invoice history (INV-2026-001), an active project, the full ticket → document → chat path |
| **Felix Ndiaye** | Acme Manufacturing | IT Lead, not primary | same project | A second contact at the same customer — permission parity between primary and non-primary, and that neither sees the other flagged as more/less trusted by the RLS policy (both share `customer_id`) |
| **Imogen Faulkner** | Britannia Retail Group (`ac7a04b4-...`) | IT Manager | PRJ-002 Britannia Loyalty Platform (James Reid) | Multi-currency (GBP) invoice display in the portal, an open (non-closed) support ticket |
| **Theo Bakshi** | Helios Energy (`df492f8b-...`) | Data Lead | PRJ-003 Helios Data Migration (Nadia Hassan) | A brand-new portal user: zero invoice/payment history, zero documents, zero prior tickets — every empty state in the portal has to read correctly, not just the populated ones |

### End-to-end workflow narratives

**Dana Whitcombe — the golden path.** Signs in via magic link for the first
time. Lands on `/portal` showing Acme's one active project (PRJ-001, 35%
progress, on track) and the two invoices already on the books
(BILL-AWS-... no — `INV-2026-001`, paid). She opens **Client Success →
Billing Question**, fills the `related_project` custom field (scoped to
just her own company's projects, per §2), submits. Aisha Okafor sees it
land in the internal ticket queue with `reported_by` correctly attributed
to Dana rather than to a generic "external" placeholder. Aisha replies with
an internal note (Dana never sees it) and an external summary (Dana does).
Dana uploads a signed change-order PDF to the project — `visibility` is
`client_visible` by construction, so it's immediately visible to both
sides. She opens the project's chat thread and asks a follow-up question.

**Felix Ndiaye — the "am I seeing my own company's data, and only that"
check.** Signs in separately from Dana. Sees the *same* PRJ-001 project and
the *same* invoice history (both are Acme's, not Dana's personally) —
confirms visibility is scoped by `customer_id`, not by which contact
created a row. Opens the ticket Dana filed: sees it (same customer), sees
her external summary, does not see Aisha's internal note. Tries — via a
crafted request, not the UI — to read a Britannia document by guessing its
`documents.id`: refused by RLS, not by the UI declining to render a link.
This is the pair of assertions `row-visibility.test.ts` already requires
for every table it covers (refused actor gets nothing, permitted actor
still gets rows), applied to the new pattern.

**Theo Bakshi — the empty-state check.** First login, ever, for this
customer. `/portal` shows PRJ-003 with no invoices yet (Helios has none in
the fixture) — the page must say "nothing billed yet," not render a blank
table that looks like a bug. No prior tickets, no documents, no chat
history. Theo files the *first* ticket this customer has ever created,
in **Professional Services Requests** (a different business area than Dana
used, with its own `In Review`/`Approved` status set and 2-day default due
date) — proving business-area configuration is genuinely per-tenant-area,
not accidentally shared state from the other personas' activity.

---

## 6. What's deferred, and where it actually stands

1. **Anonymous ticket submission** — considered, explicitly declined for
   this pass (see top of document).
2. **Scheduling / booking** — no schema, no precedent, not covered here.
   Gets its own spec when it's next.
3. **Paying an invoice from the portal** — named in
   `product-specification.md`, not designed here; the trust boundary is
   different enough from an employee recording a payment that it needs its
   own review before it reuses any of `accounting.repo.ts`'s write path.
4. **Contracts/proposals access** — not covered here.
5. **Realtime chat** — explicitly left open in §4, a usage-driven decision
   rather than a default.
6. **`projects.client_id` has no FK to `customers.id`.** Confirmed while
   writing this document: the fixture's own projects (`PRJ-001`, `client_id
   = 0bacfcac-...`) don't match any real `customers.id` (`e40d0f18-...` for
   the same Acme Manufacturing) — the link exists only by name coincidence
   today. "View project progress" in the portal needs this wired for real
   before it can query anything; recommend fixing the FK (or repointing
   `client_id` at `customers.id` outright, since that's what it was always
   meant to reference) as the first migration of the implementation phase,
   ahead of any portal-specific schema.

---

## 7. Build sequencing

1. **Portal identity** (§1) — ✅ done. `customer_contacts`, the `tenant_users`
   extension, the new base role, the JWT claim, the third RLS pattern.
   Everything below depends on this; nothing below should start before it —
   and now nothing has to wait.
2. **Ticketing, portal-side** (§2) — the business-area/custom-field wiring,
   the `/portal/tickets` routes, `logger_contact_id`.
3. **Documents** (§3) — also the first real Supabase Storage integration,
   which is its own piece of unglamorous but necessary work.
4. **Chat** (§4).
5. **Scheduling** — separate spec, not sequenced here yet.

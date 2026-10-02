# CRM — Gap Tracking

What's built, what's deliberately deferred and why, and the two gaps found
after Phase 1 shipped. Written so the remaining work can be picked up in a
later session without re-deriving the reasoning behind it.

**Status key:** ✅ done · ⛔ not built, deferred with a reason · 🚫 decided
against, not merely postponed.

**Sources:** `docs/pending-modules-spec.md` (2026-09-01 draft — ranks CRM,
Proposals and Contract Lifecycle Management as separate R1 modules, but its
CRM section is a bullet list with no schema and predates the discovery
below); `docs/21-prospect-chat.md` (2026-09-22 — a mature, unimplemented
live-chat spec, referenced under Phase 2); `docs/service-provider-modules-overview.md`
(2025-12-06 — the original, now-stale source of the module list; its
Proposals/Contracts schema sketches were not used, see "Decided against"
below).

**The load-bearing discovery that shaped all of this:** `customers` was
extended in `20260926180000_merge_clients_into_customers.sql` with
`relationship_status` (`'prospect'|'active'|'inactive'|'churned'`),
`account_manager_id`, `industry`, `company_size`, `acquisition_source`,
`acquisition_date`, and `customer_type` (including `'individual'`) — before
either of the CRM planning docs above knew about it. CRM was built as a
layer on top of `customers`/`customer_contacts`, not as new company/contact
tables.

---

## Phase 1 — Companies, contacts, activity timeline, deal pipeline

✅ **Done.** Migration `20260927120000_crm_core.sql` — three new tables
(`crm_pipeline_stages`, `crm_deals`, `crm_activities`), both hanging off the
existing `customers`/`customer_contacts`. Routes under `apps/web/src/routes/(app)/crm/`:
`companies` (list + detail), `contacts` (list + detail), `pipeline` (Kanban,
reusing the `/projects` select-and-auto-submit stage-move pattern), `deals/[id]`.
Repos: `$lib/server/customers/` (shared — `customers`/`customer_contacts` had
no repo at all before this, every other module hand-writes ad hoc SQL
against them, deliberately left alone) and `$lib/server/crm/` (deals,
activities, pipeline stages). Nav and `crm.read`/`crm.write` permissions were
already reserved in `packages/authz` — unconsumed until this shipped.

**The modeling decision worth restating:** `customer_contacts.customer_id` is
`NOT NULL` — a contact cannot exist without a client. Rather than relax that,
a client who is a *person* is both rows: a `customers` row carrying
`customer_type = 'individual'` and the single `customer_contacts` row that is
them. In the UI this is enforced by construction: contacts can only be
created from a client's own detail page, never from a bare "new contact"
form — there is no combobox-with-inline-create anywhere in this module on
purpose.

> **Corrected 2026-10-01.** Phase 1 claimed those two rows were "created
> together". They were not: `customers.create` was called only from the list
> page's `save`, `contacts.create` only from the detail page's `addContact`,
> and no transaction anywhere wrote both. Capturing a person meant typing
> their name as a *company*, opening it, and typing the same name again as a
> contact. `customers.repo.ts`'s `createIndividual` now does what the
> paragraph above always described — one action, one transaction, with
> `customer_name` derived from the person's name so the two cannot drift,
> and `updateIndividual` keeping them in step on a rename.
>
> Two consequences worth stating, because neither is visible in the schema:
>
> - **`customer_contacts.email` is nullable** since
>   `20261001100000_contact_email_optional.sql`. A walk-in client often has a
>   phone and no email; the column was `NOT NULL` only because a contact used
>   to be a portal sign-in identity, and the portal is off
>   (`20260930130000`). `UNIQUE (tenant_id, email)` is untouched — Postgres
>   treats NULLs as distinct.
> - **"An individual has exactly one contact" is held by construction, not by
>   the schema.** `createIndividual` is the only code that makes one and an
>   individual's page offers no "New contact". Enforcing it in Postgres would
>   mean denormalising `customer_type` into `customer_contacts` to make a
>   partial unique index possible (the composite-FK idiom in
>   `20260928030000_ticketing_area_integrity.sql`) — disproportionate for one
>   caller. Because the invariant is not enforced, the detail page gates the
>   person layout on `customer_type === 'individual' && contacts.length === 1`
>   and falls back to the company layout otherwise, so a row typed individual
>   before this shape existed cannot hide contacts it has no other way to
>   show.
>
> The nav, headings and prose say **Clients**, not Companies: the product is
> sold to SMBs whose own clients are usually people. The `customers` table and
> every identifier on it are deliberately unchanged — that is a different
> layer and a much larger question.

**Deliberately not built in Phase 1:** attachments on `crm_activities`, and
any merge between CRM's activity log and ticketing's conversation thread —
both are new findings, covered below rather than bolted on without a plan.

---

## Phase 2 — Lead-capture forms

⛔ **Not built.** A public, unauthenticated endpoint — modeled on the
existing `(marketing)/contact_us/+page.server.ts`, which already does an
unauthenticated form → email send — that creates a `customers` (prospect) +
`customer_contacts` pair in one transaction, tagged with
`acquisition_source`.

**Live chat widget is excluded from this phase, not merely unstarted.**
`docs/21-prospect-chat.md` is a mature, unimplemented spec with a *stated
blocking prerequisite*: a new `app.is_staff()` function must replace every
`NOT (SELECT app.is_portal_contact())` staff-exemption check across the
schema, because a negated-narrow-role check would let a new anonymous
`prospect` role slip through every staff gate that uses that pattern. As of
this writing that prerequisite still hasn't landed, and the pattern it must
replace has kept growing — `20260923050000_team_chat.sql` added another
instance of it *after* the spec was written warning against exactly that.
Building chat before the prerequisite lands means building on ground the
spec itself says isn't ready. Re-check `grep -rn "app.is_staff"
supabase/migrations` before starting this — if it still returns nothing, the
prerequisite is still open.

---

## Phase 3 — One-to-one email send + auto-log

⛔ **Not built.** Reuse `apps/web/src/lib/mailer.ts` (Resend — already real
infrastructure, already used for invoice/welcome/admin sends via
`sendTemplatedEmail`/`sendUserEmail`/`sendAdminEmail`) to send from a
company/contact/deal page, auto-creating a `crm_activities` row of type
`email` on send.

**Explicitly out of scope, not just deferred:** full Gmail/Outlook inbox
sync (OAuth, bidirectional, open tracking). No OAuth-email infrastructure
exists anywhere in this codebase, and building it is a materially larger,
separate integration — flagged here so it isn't attempted piecemeal inside
what should be a small feature.

---

## Phase 4 — Marketing email / newsletters

⛔ **Not built.** `packages/spec-tests/src/marketing.ts` already has a
designed consent/suppression state machine (`evaluateMarketingSend`,
`ConsentEvent` types: `consent_granted`, `consent_withdrawn`, `hard_bounce`,
`spam_complaint`, `suppressed`, `consent_expired`, double-opt-in variants;
`MarketingSendAttempt.channel: "bulk-campaign" | "workflow-email" |
"ab-test" | "manual-resend"`) — tested in
`packages/spec-tests/tests/marketing-consent-invariants.spec.test.ts`, but
not wired to any table or route. **Read it before building this** so the
consent model isn't re-derived from scratch. Sends go through the same
`mailer.ts`/Resend path as Phase 3. Un-disables the existing `marketing` nav
entry (`apps/web/src/routes/(app)/menu.ts`) and the already-reserved
`marketing.read`/`marketing.write` permissions.

---

## Phase 5 — Meeting-scheduling links

⛔ **Not built.** A lightweight per-employee weekly-availability config and a
public booking page that logs a `crm_activities` meeting entry on booking.
**Not** Google/Outlook calendar sync — no OAuth-calendar infrastructure
exists; a real Calendly-equivalent needs that, and it's separate, larger
work than a simple fixed-slots booking page.

---

## Decided against — Proposals and Contract Lifecycle Management

🚫 **Decided against for now, not merely postponed.** `docs/pending-modules-spec.md`
ranks a full Proposals module (line items, versioning, e-signature) and
Contract Lifecycle Management as R1, same tier as CRM. Real usage data
supplied by the product owner (what service providers actually use in a
HubSpot-like tool) doesn't mention contracts or e-signature at all, and
"proposal sent" only appears as a **pipeline-stage label** — which
`crm_pipeline_stages` already provides, seeded by default. Revisit only if
a real need for an actual document-builder/e-signature system surfaces;
until then, treat the pipeline stage as sufficient.

---

## Two gaps found after Phase 1 shipped

Surfaced by the question "can we capture and display customer conversations
properly, including attachments" — answered honestly (see below), not yet
acted on.

### Gap 1 — `crm_activities` has no attachment support

`crm_activities` is a single log entry: who (`created_by`), when
(`occurred_at`), what (`activity_type`, `subject`, `body`) — no file. If
someone logs "sent the proposal PDF," there is nowhere to attach the PDF
itself.

**Ticketing already solves this** for support conversations:
`ticketing_attachments` (`file_name`, `mime_type`, `storage_key`,
`uploaded_by`, `file_size_bytes`, linked via `update_id`) is the model to
copy — a `crm_activity_attachments` table in the same shape, FK'd to
`crm_activities.id`. Small: one migration, one repo function, one upload
control on the activity-logging form. Reuse the same storage mechanism
`ticketing_attachments`/`documents` already use rather than inventing a
third.

### Gap 2 — No unified "everything about this customer" timeline

Three systems currently hold customer-facing history, and none of them talk
to each other:

| System | Threaded? | Attachments? | Who can author | Visible where |
|---|---|---|---|---|
| `ticketing_updates` | Yes (per ticket) | Yes (`ticketing_attachments`) | Staff and the customer's own portal contact (`author_employee_id`/`author_contact_id`) | Ticket detail page, and the portal |
| `crm_activities` | No — single entries, no replies | No (Gap 1) | Staff only | Company/contact/deal detail pages |
| `documents` (`entity_type = 'customer'`) | N/A — plain file storage | N/A, it IS the attachment | Staff (`uploaded_by`), portal contact (`uploaded_by_contact_id`) | Documents module, filtered by entity |

A support conversation about a customer lives in ticketing; a sales call log
lives in CRM with no attachment; a contract PDF lives in documents with no
link back to which activity or ticket it belongs to. Closing this — merging
`ticketing_updates` (scoped to that customer's tickets) and `crm_activities`
into one chronologically-sorted feed on the company detail page — is
medium-sized: no new tables, a repo function on each side already exists
(`ticketing.repo.ts`'s ticket-scoped queries, `crm/activities.repo.ts`'s
`listForCustomer`), the work is in the merge/sort and a shared rendering
shape for two differently-typed rows. Attachments (Gap 1) should land first,
or the merged feed will visibly show ticketing entries with attachments and
CRM entries that can never have any, which reads as broken rather than as a
sequencing choice.

**Not proposed:** a threaded/reply model for `crm_activities` itself (making
it behave like `ticketing_updates`, with replies rather than flat log
entries). Nobody has asked for that; the original usage brief described CRM
activities as discrete logged events, not back-and-forth conversations. If
that need surfaces later, it's a bigger schema change than either gap above
and deserves its own plan rather than being folded into this one.

---

## Benchmarked against Twenty CRM (2026-10-01)

Read the whole of <https://docs.twenty.com/> — core concepts (data model,
layout, workflows, calendar/email, AI, dashboards, glossary) and the
developer data-model, relations, roles and API pages. Twenty is the closest
open-source comparator to this module, so it is a useful mirror; it is not a
target to converge on, for reasons set out under *Deliberate divergence*.

### How Twenty works, in one paragraph

**It is a CRM-shaped object database, not a CRM.** Everything is "objects and
fields": five standard objects ship (Companies, People, Opportunities, Tasks,
Notes) and *custom objects are indistinguishable from them* — same REST and
GraphQL endpoints, same views, same permissions, same workflow triggers. That
one decision drives the whole product. Around it: ~25 field types including
composites (`FULL_NAME`, `ADDRESS`, `EMAILS`, `PHONES`, `LINKS`, `CURRENCY`
as amount+code, `ACTOR`, `FILES`) plus `RICH_TEXT`, `RATING` and a
server-managed `TS_VECTOR`; bidirectional relations with explicit `onDelete`
and many-to-many via junction objects; table/kanban/calendar **views** that
each save their own filters, sorts, grouping and field visibility; a timeline
that records created/updated/linked/unlinked automatically and fans events
out to related records; workflows (triggers: record events, manual, cron,
webhook × actions: CRUD, email, HTTP, custom JS, branches, loops, delays,
mid-flow forms, AI agents); Google/M365 calendar and email sync auto-matched
to records; permissions at object, field and record level; and Core +
Metadata APIs in REST and GraphQL, generated per workspace, with webhooks.

### Gaps this document already tracks

Four of the differences are already covered above and are **not** restated as
new work — the comparison confirms the existing sequencing rather than
changing it:

| Twenty has | Tracked here as |
|---|---|
| Attachments on timeline entries | Gap 1 — `crm_activities` has no attachment support |
| One timeline per record, fanned out from every source | Gap 2 — no unified "everything about this customer" timeline |
| Send email from a record, auto-logged | Phase 3 |
| Full Gmail/Outlook sync | Phase 3, *explicitly out of scope* — unchanged by this comparison |

### Gaps this document did NOT have

Ordered by what an SMB feels first. None of these are started.

1. **CSV import.** ⛔ The largest adoption blocker and the cheapest to fix. A
   firm switching from spreadsheets or another CRM currently cannot get its
   data in at all. CSV *export* infrastructure already exists in accounting
   (`accounting/*/export`) and nothing in CRM uses it in either direction.
   Twenty treats import with field mapping and duplicate detection as table
   stakes.
2. **Filters, sorts and saved views.** ⛔ Clients has one status dropdown;
   Pipeline and Contacts have nothing. In Twenty the saved view *is* the
   primary interaction — unlimited per object, each carrying its own filters,
   sorts and column visibility. Worth taking the idea without the
   generality: a handful of filters on the three list pages, with the state
   in the URL (the pattern `ticketing` and `crm/contacts` already use),
   closes most of the value.
3. **Global search.** ⛔ None. There is one combobox on the contacts page and
   no cross-object search anywhere in the product. Postgres full-text is
   already the ADR-002 answer for search; nothing uses it.
4. **Automatic timeline events.** ⛔ `crm_activities` only ever holds what a
   person typed. Nothing records "stage changed", "owner reassigned",
   "status moved to churned" — and **`audit_log` does not have them either**:
   every CRM write is in the register's `NOT_AUDITED` list, each with a
   stated reason ("a deal record is the firm's own sales plan, not anyone's
   pay"). `crm/pipeline::moveStage` is there too, so a deal moving stage
   currently leaves no trace anywhere in the system.

   That classification is right and should not be changed. The audit trail
   answers *"who must justify this later"* — a compliance question, in a
   table that can never be deleted from. A CRM timeline answers *"what has
   happened to this client"* — a sales question, in a feed people read daily.
   Same events, different purpose, different retention; routing the second
   through the first would quietly widen what the audit trail is for. An
   automatic timeline therefore needs its own mechanism (a trigger or a
   repo-level write into `crm_activities` with a system `activity_type`),
   which is a design decision this document has not made. It belongs with
   Gap 2: the unified feed wants three sources, not two.
5. **Follow-up tasks on a client or deal.** ⛔ "Call back Tuesday" is core
   CRM and there is no way to express it. `tasks` exists but is
   project-scoped; whether this reuses that table or gets its own is an open
   question.
6. **Pipeline reporting.** ⛔ No win rate, cycle time, forecast or
   stage-conversion anywhere. The board now computes per-stage totals per
   currency, which is the data the first report would need.
7. **Public API and webhooks.** ⛔ None, for any module. For a suite whose
   buyers already run other tools this is how anything integrates. Larger
   than it looks: it needs an auth model (API keys scoped to permissions),
   rate limiting and a versioning commitment.
8. **Composite field types.** ⛔ Custom fields support 7 scalar types (text,
   number, money, date, boolean, select, multiselect). No address, phones,
   emails, links or rating. `ADDRESS` is the one that bites: `customers`
   stores `billing_address`/`shipping_address` as JSONB with no typed editor
   behind them.

### Where this product is ahead, and should stay there

- **Tenant isolation is enforced in the database** — RLS with `FORCE ROW
  LEVEL SECURITY`, a non-owner application connection, and 672 isolation
  assertions. Twenty's record-level predicates are a paid-plan feature.
- **PII encryption per employee**, with GDPR Art. 17 erasure by destroying
  the key. Twenty has no comparable mechanism.
- **The CRM customer IS the accounts-receivable customer.** `customers`
  carries `ar_account_id`, `tax_rate_id`, `payment_terms` and `credit_limit`
  and feeds invoices, payments and tax. In Twenty that is an integration
  project.
- **Audit coverage enforced by CI**, against a committed register.

### Deliberate divergence — do not converge

**Custom objects are Twenty's central bet and are incompatible with ours.**
`docs/06-customization-model.md` says customization is data — rows, custom
field definitions, settings — never per-tenant schema. ADR-002/003 put
everything in one Postgres under shared-schema RLS. The typed repositories,
the disclosure matrix, `verify-query-scale.mjs` and the constraint registry
all depend on a schema known at build time; a metadata-driven one would
invalidate every check in `./check` that starts from the schema. Twenty buys
flexibility with a dynamic schema and pays for it with a Metadata API and
weaker static guarantees. Both are coherent. Mixing them is not.

Also not to be copied: **field-level permissions as a general configurable
mechanism** (ours is stronger where it matters — per-column classification,
encryption, `_pvt`/`_ct` naming enforced both ways — and deliberately less
configurable), and **apps/plugins and autonomous AI agents**, which are out
of scope.

### One place Twenty's model is better than ours

**Twenty makes People and Companies peers.** A person-only client is simply a
Person. `customer_contacts.customer_id` is `NOT NULL` here, which is what
forced the person-account shape built on 2026-10-01: one `customers` row plus
its single contact, `customer_name` derived from the person's name so the two
cannot drift, and "an individual has exactly one contact" held by
construction rather than by the schema (see `customers.repo.ts`'s
`isPersonAccount`). That works and is tested, but Twenty's split is cleaner
for exactly the market this product targets — SMBs whose own clients are
individuals.

**Not proposed:** re-modelling `customers`/`customer_contacts` into peer
entities. It would touch accounting, documents, ticketing and the portal, all
of which FK to `customers`, and the current shape is correct and covered. This
is recorded so the next person to meet the awkwardness knows it was seen,
measured and left alone on purpose — not missed.

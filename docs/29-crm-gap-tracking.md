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
`NOT NULL` — a contact cannot exist without a company. Rather than relax
that (it would ripple into the portal-identity JWT claims and the
`UNIQUE(tenant_id, email)` login semantics), every new lead gets **both** a
`customers` row (`relationship_status = 'prospect'`, `customer_type =
'individual'` for a solo contact with no real company) **and** a
`customer_contacts` row, created together. In the UI this is enforced by
construction: contacts can only be created from a company's own detail page,
never from a bare "new contact" form — there is no combobox-with-inline-create
anywhere in this module on purpose.

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

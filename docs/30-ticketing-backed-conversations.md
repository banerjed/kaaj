# Ticketing-Backed Conversations — Parked Design

**Status:** ⏸ parked 2026-09-28, to be revisited within the larger CRM
scope (custom attributes on companies and deals). Nothing below is built
except where marked ✅.

**Goal:** every conversation about a record — a deal, a customer, a
project, a task — runs on the regular ticketing infrastructure instead of
a table of its own, so threading, attachments, subscribers, visibility and
search are built once.

---

## Already done

✅ `20260928030000_ticketing_area_integrity.sql` — a ticket's business area
is NOT NULL; its category must belong to that area and its subcategory to
that category, by composite foreign keys that include `tenant_id`
([L109](./10-lessons-learned.md)).

✅ Settings → Ticketing has a visible settings icon per area.

---

## ⚠ Open security gap — fix independently of this design

A portal contact can read rows of other customers' tickets in three tables
that carry only `tenant_isolation`: `ticketing_ticket_assignees` (which
staff work which ticket), `ticketing_ticket_subscribers`, and
`ticketing_ticket_links` (ticket ids, including other customers' and
internal tickets). `ticketing_business_area_members` is readable too.
Probed 2026-09-28 as Imogen (Britannia): 1 visible ticket, but 7 assignee,
3 subscriber and 4 link rows. Ids only — no titles or content — but it
breaks "a customer never sees anything of another customer's".

Fix: a RESTRICTIVE SELECT policy on each, "the row's ticket is visible"
(both ends for links); area membership hidden from portal contacts. Test
as the portal contact, watch it fail first.

---

## Business areas — per-tenant defaults

Written for each new firm by the **setup script** (a data file run by
`provision-tenant.mjs` and a new shared-tier `create-tenant.mjs`), not by
app code. After that they are ordinary rows the firm edits in Settings.

| Area | Prefix | Locked category | Default editable categories |
|---|---|---|---|
| Sales | SAL | Deal | — |
| Customers | CUS | Interactions | — |
| Projects | PRJ | Discussions | — |
| Tasks | TSK | Discussions | — |
| IT | IT | — | Hardware · Software · Access |
| Staffing | STF | — | Hiring · Leave · Payroll & benefits |
| Finance | FIN | — | Invoices · Expenses · Payments |
| External | EXT | — | Question · Problem · Billing · Request |

- **Only the category is locked**, never the area. A locked category
  carries a purpose tag (`deal`, `customer`, `project`, `task`; `none` for
  every other). It cannot be renamed, archived, re-tagged or given
  subcategories — refused by the database. Admins may add any category to
  any area. An area holding a locked category cannot be archived.
- **External** carries an area-level `portal` tag and cannot be archived.
  The portal reaches External only; the per-area `portalVisible` setting
  goes away.

## Record threads

- One ticket per record in its locked category, created on first post
  with the record's row locked (`SELECT … FOR UPDATE`).
- Tickets gain `deal_id`, `project_id`, `task_id` (composite FKs with
  `tenant_id`); customer threads use `customer_id`. Each ticket carries its
  category's purpose tag, in the composite FK to the category; a CHECK ties
  the tag to the link — a `deal` ticket must have `deal_id`, no other may.
  The tag is NOT NULL (`none`) because Postgres skips a composite FK if any
  column is NULL.
- **Visibility follows the record**: a new arm on `staff_ticket_visibility`
  — readable by whoever can read the linked record.

## Tables replaced (agreed)

`pm_task_comments` and `crm_activities` become ticket updates.
`team_chat_*` stays — chat is not a thread about a record.

| Used today | Becomes, on `ticketing_updates` |
|---|---|
| `is_internal` | `visibility` (always `internal` on Tasks) |
| comment edit / soft delete | new `edited_at`, `deleted_at`; prior text to the audit log |
| `activity_type` | `update_type` gains call / email / meeting / note |
| `occurred_at`, `subject` | new columns (`occurred_at` defaults to creation) |
| activity's `customer_contact_id` | new `about_contact_id` |

Dropped, used nowhere: `is_pinned`, `parent_comment_id`,
`mentioned_users`, `attachment_ids`. Migration: an activity with a deal
goes to that deal's thread; without a deal, to the company's Interactions
thread if a customer, else to a new first-stage deal.

## Leads vs existing customers

- One `customers` table, with a lifecycle: lead → customer → former
  customer, or disqualified. Becoming a customer is an event —
  `became_customer_at`/`_by`, CHECK-tied to the status, never reversible
  by a form — automatic on the first Won deal or by "Mark as customer".
- Before the sale, conversations live on deals (every lead has one).
  After, the company gets its Interactions thread; the database refuses one
  for a lead. Upsells are ordinary deals.
- Only customers' contacts get portal access or External tickets — checked
  where the portal claim is issued. Every External ticket names its
  customer.

## Open decisions

1. `private` stays off for External tickets (isolation comes from
   `customer_id`; `private` only narrows staff visibility)?
2. Former customers: no portal access?
3. Leads visible to all staff for now?
4. Automatic conversion on the first Won deal?
5. Should the read-every-ticket roles (owner, firm admin, IT admin,
   auditor) also read record threads, and Staffing/Finance tickets?

## Order, when resumed

1. Portal isolation (the gap above, External-only, required customer).
2. Purpose tags, locked categories, setup script.
3. Record links and record-following visibility.
4. Task comments → tickets; drop `pm_task_comments`.
5. CRM activities → tickets; drop `crm_activities`.
6. Settings: rename/restore categories, locked-category display.

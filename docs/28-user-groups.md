# User Groups

**Status: ✅ built.** `20260926163000_user_groups.sql`, `groups.repo.ts`,
`/settings/groups`, wired into ticketing business areas
(`ticketing_business_area_group_grants`) and projects
(`project_group_grants` + `projects.is_restricted`). `./check` is green
(25/25); see [What shipped](#what-shipped) and [Test plan](#test-plan) at
the bottom.

## Overview

`employee_user_groups`/`employee_group_members` were scaffolded wholesale in
the initial schema pass — like `pm_task_attachments` before it
([L101](10-lessons-learned.md)) — and had zero real consumers: no route, no
repo function, linked to each other only by a `group_name` TEXT string with
no FK (the naming-convention shape [L100](10-lessons-learned.md) warns
about), and `employee_user_groups.approver_id`/`backup_approver_id` were
`NOT NULL` with no UI to ever set them.

The request: build groups for real, as the general permissioning primitive
for a small organization — simplest implementation that suffices — and use
them to grant a whole team access to a ticketing business area or a
restricted project at once, instead of adding people one at a time.

This is Tier 1 of `docs/06-customization-model.md` — "data the customer
defines," rows in tenant-scoped tables, no per-tenant schema.

## What already existed, and what changed

| Table | Before | Now |
|---|---|---|
| `employee_user_groups` | Group definitions; `approver_id`/`backup_approver_id` `NOT NULL`, unused | Same table; those two columns are now nullable — a small-org group has no approval workflow |
| `employee_group_members` | Linked to its group by `group_name` TEXT, no FK, no uniqueness constraint | Linked by a real `group_id UUID` FK; `group_name` dropped; `is_active` added (no DELETE grant); `UNIQUE(tenant_id, group_id, employee_id)` added |
| `employee_group_roles` | Department/location-scoped role grants per group; zero consumers | **Untouched — stays scaffolding.** Not part of this ask; see [Still out of scope](#still-out-of-scope) |
| `projects.team_members` | `JSONB`, never read or written by any app code | **Dropped.** `docs/27-project-management-gap-tracking.md` had already predicted this removal when groups shipped |

Deliberately narrower than `employee_user_groups`' own scaffolded columns:
no nested hierarchy (`parent_group_name`), no approval workflow, no
department/location binding, no email-like naming, no group-level ACL verbs.
A small organization's groups are just named lists of people —
`docs/product-specification.md`'s "User Groups" section describes a much
larger surface (hierarchical groups, `group@domain` addressing, seven
`groups:*:*` permission verbs); none of that is built, and none of it is
needed for what was asked.

## Ticketing business areas — additive

`ticketing_business_area_members` already gives individual, per-employee
visibility into a business area's non-private tickets
(`20260909120000_ticketing_visibility.sql`), with a real settings UI at
`/settings/ticketing/[businessAreaId]`. Groups add one more OR-arm to the
same `staff_ticket_visibility` RESTRICTIVE policy: every current and future
member of a group granted to a business area (via the new
`ticketing_business_area_group_grants` table) sees the same thing an
individually-added member would. Nothing about the existing individual-member
mechanism changed — group access is a second path to the same outcome, not a
replacement.

## Projects — opt-in restriction

Projects had no visibility mechanism at all before this: `/projects`'s own
`load()` comment read "No read gate: the board is firm-wide," and
`docs/27-project-management-gap-tracking.md` named this a real gap,
"declined twice."

**Decided:** visibility is **opt-in per project**, not restrictive by
default. A new `projects.is_restricted BOOLEAN DEFAULT FALSE` — every
existing project, on day one, stays visible to everyone, exactly as before.
An admin (or the project's own manager — the toggle is gated on the same
`projects.write` permission as everything else on `/projects/[id]`) ticks
"Restricted," and only then does the project narrow to:

- its `project_manager_id`
- members of any group granted to it (`project_group_grants`)
- `app.reads_all_projects()` — owner, firm_admin, or the `project_manager`
  functional role; mirrors `app.reads_all_tickets()` exactly

This is the same shape as `ticketing_tickets.private`, chosen deliberately
over the alternative (restrictive by default for every project): opt-in
means the change is purely additive — no fixture rewrite forced by a
default-behavior change, no smoke test at risk of a page going blank,
nothing existing changes until someone opts a project in. A "group-gated
only, no PM fallback" design was also considered and rejected: it would mean
a project's own manager could lose access to it by forgetting to also grant
their own group, which is a footgun with no offsetting benefit for a small
organization.

### A task's visibility follows its project's, not a copy of the rule

```sql
CREATE POLICY task_visibility ON tasks AS RESTRICTIVE FOR SELECT
USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = tasks.project_id));
```

A task is visible exactly when its parent project's row is — the same
"read through the parent, don't restate the rule" shape
`ticketing_updates` already uses reading `ticketing_tickets`. This also
avoids a real trap: the `projects` policy does **not** read `tasks` (an
earlier draft's "I'm assigned a task in this project" visibility arm was
dropped for exactly this reason) — each table's policy reading the other
would make the pair recursive. PM + group-grant + `reads_all` is the
complete rule for a project; a task inherits it, it doesn't get its own copy.

Both new policies are `FOR SELECT` only. A bare `AS RESTRICTIVE USING(...)`
with no `FOR` clause also gates INSERT/UPDATE, and Postgres reuses `USING`
as `WITH CHECK` — which would refuse `INSERT ... RETURNING id` for a
freshly created project (no group grants exist yet) even from a
`projects.write` holder. Verified directly against the local stack before
this shipped.

## `/settings/groups` — the group management screen

List + create at `/settings/groups`, membership at
`/settings/groups/[groupId]` — modeled directly on
`/settings/ticketing`/`/settings/ticketing/[businessAreaId]`'s own
list/detail split and replace-whole-checkbox-list pattern
(`setBusinessAreaMembers`'s shape, reused as `groups.setMembers`).

Gated on `it.groups.read`/`it.groups.write` — `it.groups.write` already
existed in `@kaaj/authz`, already granted to `it_admin`, and was dead code
until now; this is its first real consumer. `it.groups.read` is new,
following the standing rule ([L79](10-lessons-learned.md)) that a page's
`load()` needs its own read permission, never just the write check reused.

## Audit

Membership and grants change who can see what — CLAUDE.md's audit section
names "role grants" explicitly as something someone may be asked to
justify, and this is that shape:

- **Audited** (`action: "update"`, `audit.diff()`): `groups.setMembers`
  (`/settings/groups/[groupId]`), `ticketing.setBusinessAreaGroups`
  (`/settings/ticketing/[businessAreaId]`), `projects.setProjectGroups` and
  `projects.setRestricted` (`/projects/[id]`).
- **Not audited**: `groups.createGroup`/`archiveGroup` — an empty named
  container changes nobody's access by itself, same reasoning as `addTask`.

## Still out of scope

- **`employee_group_roles`** stays scaffolding — a third table in this
  family (department/location-scoped role grants per group), zero
  consumers, not part of what was asked. Wiring it up would be a second,
  parallel permissioning mechanism alongside groups; if it's ever built, it
  should be a deliberate decision, not a "might as well while I'm here."
- Nested/hierarchical groups (`parent_group_name`).
- Email-like group naming/addressing (`group_name` stays unused by the app;
  `display_name` is what every screen shows).
- The specification's `groups:*:*` permission-verb set (`groups:create:all`,
  `groups:members:manage:owned`, etc.) — this codebase's coarse
  `it.groups.read`/`.write` pair covers what was asked; per-group ownership
  and finer verbs are a different, larger feature.
- Group-level column/field permissions (the v2 project-management spec's
  "everyone/owner/admins/pm_only" per-column edit permission) — unrelated to
  this ask, and blocked on the same column-type engine `docs/26`'s "Still
  out of scope" section already declines to build.
- A group used for anything beyond ticketing-business-area and
  project visibility (e.g., a document-folder ACL, a chat channel
  membership) — the two targets named in the request; extending groups to a
  third surface is a future addition, not a gap in this one.

## `./check` gates this satisfies

- **tenant isolation / fixtures are complete** — `employee_user_groups`,
  `employee_group_members`, `project_group_grants`,
  `ticketing_business_area_group_grants` all carry real fixture rows, not
  placeholders — including a restricted project (PRJ-004) and a group grant
  that covers one fixture employee and not another, so the row-visibility
  test can assert both halves.
- **tables classified by scale** — both new grant tables registered
  `NOT_SCALE_SENSITIVE` in `scripts/verify-query-scale.mjs` (bounded by
  project/business-area count × group count).
- **structure snapshot** — regenerated via `supabase db reset && pnpm db:snapshot`.
- **writes are audited / actions are authorized** — every new action
  registered in `apps/web/src/lib/server/audit/register.ts`.
- **security** — `row-visibility.test.ts` asserts a non-member gets zero
  rows and a group member still gets the row, for both the ticketing and
  the project case.

No new entry was needed in `apps/web/src/lib/server/db/constraints.ts`: every
write here goes through `ON CONFLICT ... DO UPDATE` (the same
replace-whole-list shape `setBusinessAreaMembers` already uses), so the new
UNIQUE constraints are never reached as a raw violation the way a plain
INSERT's would be.

## Test plan

| Area | Status |
|---|---|
| `groups.repo.ts` unit tests (create/archive, `setMembers` replace-whole-list-not-delete, the fixture's own group as real coverage) | ✅ `groups.repo.test.ts`, 7 tests |
| Ticketing: a group grant is additive to individual membership, scoped to its own business area | ✅ `row-visibility.test.ts` |
| Projects: unrestricted stays open, restricted narrows to PM/group/admin, both halves asserted, `reads_all_projects()`, a task follows its project | ✅ `row-visibility.test.ts`, 4 tests |
| `INSERT ... RETURNING id` still works for a `projects.write` holder post-migration (the `FOR SELECT` concern) | ✅ verified directly against the local stack |
| `/settings/groups` renders | ✅ `smoke.spec.ts` |
| Manual walkthrough: create a group, add members, grant it to a business area and a restricted project, confirm visibility from both a member's and a non-member's session | ✅ done via direct RLS queries against the local stack (`psql` as `app_user` with a claim set per role) — not yet re-verified through the live browser UI |

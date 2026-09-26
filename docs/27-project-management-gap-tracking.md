# Project Management v2 — Gap Tracking

A section-by-section pass over `module-project-management-v2.md` against
what's actually built, to replace guesswork with a single place that says
what's done, what's done *differently* (and why), what's still deferred,
and what doesn't apply to this codebase's architecture at all.

**Status key:** ✅ done · 🟡 done differently / partially · ⛔ not built,
deferred with a reason · 🚫 doesn't apply (an architectural divergence, not
a gap) — `docs/07-app-provenance.md` is where divergences from the
reference get recorded generally; this doc is the project-management-specific
detail behind that.

Sources: `docs/23-project-management-phase1.md`,
`docs/25-project-management-phase2.md`,
`docs/26-project-management-custom-fields.md` (✅ built).

---

## Hierarchy & Architecture

✅ **Done.** Tenant → Objective → Project → Task → Subtask, one level of
subtask (Phase 1). Matches the spec's four-level hierarchy exactly.

## Database Schema

| Spec table | Status |
|---|---|
| `objectives` (as `pm_objectives`) | ✅ done, Phase 1 |
| `projects` | ✅ done (pre-existing, extended Phase 1) |
| `tasks` | ✅ done (pre-existing, extended Phase 1: subtasks, dependencies) |
| `column_definitions` / `task_column_values` | 🟡 **superseded**, not built as spec'd — see [Column Type System](#column-type-system) |
| `dashboards` / `dashboard_widgets` | ⛔ not built |
| `automations` / `automation_executions` | ⛔ not built |
| `task_comments` (as `pm_task_comments`) | ✅ done, Phase 2 |
| `project_templates` (as `pm_project_templates`) | 🟡 done, task-list only — no columns, no automations (neither exists) |
| `task_time_entries` (as `pm_task_time_entries`) | 🚫 **superseded, permanently** — duplicates the already-shipped `time_tracking_entries`; stays scaffolding (L101) |
| `task_attachments` (as `pm_task_attachments`) | 🚫 **superseded, permanently** — duplicates the already-shipped `documents` module; stays scaffolding (L101) |

## Column Type System

✅ **Superseded by `docs/26-project-management-custom-fields.md` (built),
deliberately narrower than this section.** The spec's 30+
polymorphic types, stored in one `value JSONB` column, collide with two
hard rules already in this codebase: `money/jsonb-is-text` can't register a
runtime-typed column, and a tenant-authored formula expression is an eval
surface in multi-tenant SaaS (both reasons on record since Phase 1). Kaaj's
own version is 7 real-typed scalar columns — `text`/`number`/`money`/`date`/
`boolean`/`select`/`multiselect` — reached through Tier 2
(`custom_field_definitions`, `docs/06-customization-model.md`), not a new
engine. **Future addition, explicitly deferred, not built:** aggregating a
`number`/`money` custom field up from tasks to their project — see docs/26's
"Still out of scope" for the two open design questions (live-vs-stored
rollup, and where the financial-calculation boundary sits for a `money`
total specifically).

Type-by-type:

| Spec type | Status |
|---|---|
| Text, Long Text, Number, Checkbox, Date | 🟡 covered by docs/26 (`long_text` is a same-column UI variant, not yet asked for) |
| Status, Dropdown | 🟡 covered by docs/26 as a single `select` type — no storage-level Status/Dropdown distinction, since nothing yet keys off it (no automation engine) |
| Tags (multi-select) | 🟡 covered by docs/26's `multiselect` |
| Timeline | 🚫 tasks already have `start_date`/`due_date` as real columns — a distinct "Timeline" column type would duplicate that |
| Person/People | 🚫 **Kaaj already has the real thing** — `assigned_to`/`project_manager_id` are actual `employees` references, which is what the ChatGPT-thread review concluded Monday's generic People column is trying to approximate for an integrated SaaS |
| Auto Number | 🚫 already real — `T-nnn`/`PRJ-nnn`/`OBJ-nnn`/`TPL-nnn` numbering exists per entity |
| Creation Log, Last Updated | 🚫 already real — `created_at`/`created_by`/`updated_at`/`updated_by` |
| Time Tracking | 🚫 **superseded** by the real `time_tracking_entries` module + Phase 2's "Log time" link, not a column type |
| Dependency | ✅ **already built, and more capable than a column type** — `depends_on_task_ids`/`blocks_task_ids`, cycle-checked (Phase 1) |
| Formula, Mirror | ⛔ not built — eval surface (formula) and cross-entity sync (mirror) are real, separate design problems; deferred since Phase 1 |
| Connect Boards (relation) | ⛔ not built — docs/26 explicitly leaves this out; Kaaj's existing system-field relations (`client_id`, `assigned_to`) already cover the highest-value cases |
| Email, Phone, Link, Location, Country, Rating, File, Button, Vote, World Clock, Color Picker, Doc | ⛔ not built, not requested — smaller-value types nobody has asked for yet; cheap to add to docs/26's `data_type` list later since it's a Tier-2 row insert, not a migration, EXCEPT File (superseded by task files via `documents`, Phase 2) and Button (meaningless without an automation engine) |

## API Endpoints

🚫 **Doesn't apply, by architecture.** The spec describes a REST-style API
surface. Kaaj is SvelteKit front-and-back (ADR-004) — the equivalent
capability is page `load()` + form actions, not a separate API layer. Every
capability the spec's endpoint list describes has a route-and-action
equivalent already built (Phase 1/2) or tracked elsewhere in this doc; there
is no standalone "build the API" gap to track.

## Automation Engine

⛔ **Not built.** The single largest remaining block, and blocked on two
things, not one: a tenant-authored condition/action expression is an eval
surface (same class of risk as formula columns), and this codebase has no
background job runner at all yet — nothing polls or schedules (search
integrates through Postgres per ADR-002, which isn't the same thing). Both
need a real design pass before a Phase 4 here, not a "wire it up" slice like
Phase 2's pieces were.

## Dashboards & Widgets

⛔ **Not built.** Depends on the typed-column engine for anything beyond
counting rows (most of the spec's widget examples — budget vs. actual,
profit margin — are formula/mirror-derived), and is a large surface on its
own regardless (layout persistence, per-widget caching, 10+ widget types).

## Views & Visualizations

| Spec view | Status |
|---|---|
| List | ✅ done (pre-existing) |
| Kanban | ✅ done, Phase 1 — one column per status, `moveTask` shared with List, no drag-and-drop (deferred, see below) |
| Gantt | 🟡 done, Phase 2 — bars only, day granularity; no critical-path highlighting, no baseline comparison, no drag-to-adjust |
| Calendar | 🟡 done, Phase 2 — month view only, click-through navigation; no week/day view, no drag-to-reschedule |
| Workload | 🟡 done, Phase 2 — single-project, open-task hours per assignee; no cross-project rollup (needs dashboard machinery), no capacity line/overallocation warning (no per-employee capacity concept exists yet) |
| Chart view | ⛔ not built — same shape as a dashboard widget, deferred with dashboards |
| Swimlanes, WIP limits (Kanban) | ⛔ not built, not requested |
| Real drag-and-drop (any view) | ⛔ not built — Phase 1's own documented deferral: this is the first drag-and-drop surface in the app; the accessible `<select>`-based move control was chosen deliberately over committing to HTML5 DnD + keyboard fallback + tests for a v1 |
| Multi-column sort/group/filter (List) | ⛔ not built — today's List view has no client-side sort/group/filter UI at all |

## Business Logic

| Spec behavior | Status |
|---|---|
| Objective status/health rollup | 🟡 done differently, Phase 1 — `progress_percentage`/`health_status`/`actual_revenue` recomputed in SQL, never incremented; `status` deliberately left as the objective owner's own field, NOT auto-derived — the spec's own pseudocode has a real bug here (an unreachable `health_status` branch), documented and intentionally not reproduced |
| Project metrics rollup (hours, completion) | ✅ done — `task_count`/`completed_task_count` (Phase 1), `actual_hours` (via `time_tracking_entries.refreshHours`) |
| Project actual_revenue from paid invoices | ⛔ not built — `projects.total_billed` exists as a column but nothing currently writes it from the accounting module; this is the Accounting integration gap below, restated as a rollup |
| Formula column calculation | ⛔ not built — see Column Type System |
| Mirror column sync | ⛔ not built — see Column Type System |
| Template application with columns/automations | 🚫 **superseded** — docs/25's template captures task shape only (name/description/priority/hours/day-offset); there are no columns or automations to capture yet, so this isn't a partial version of the spec's flow, it's the whole flow that currently exists |

## Integration Points

| With | Status |
|---|---|
| **Time Tracking** | 🟡 mostly done — hours roll up to project/task (pre-existing), "Log time" deep-link (Phase 2). Not done: starting a timer directly from a task row (Phase 2 only links out to `/time-tracking`, no inline timer widget); Workload's capacity/allocation view is project-scoped only, not team-wide |
| **Accounting** | ⛔ not built — no budget→invoice conversion flow, no billable-time-via-custom-field (would need docs/26 built first, and even then the financial-calculation boundary forbids a custom field from feeding a real invoice), no formula-derived revenue/margin (needs Formula columns) |
| **Client Portal** | ⛔ not built — repeated deferral since Phase 1: `client_portal` is a listed dependency of the v2 module and has no project/task-facing surface yet at all. `is_visible_to_clients`/`client_visible` flags exist on the rows but nothing reads them from a client-facing route, because no such route exists |
| **Document Management** | ✅ done, Phase 2 — task files via `documents`, `entity_type = 'task'`. Not done: deliverable version control (neither `pm_task_attachments`' own version columns nor `documents` itself has file versioning built — this is a real, standalone gap, not just a PM one) |
| **Proposals Module** | 🚫 doesn't apply yet — Proposals itself isn't a built module in this codebase (`soon` in the sidebar); nothing to integrate with until it exists |
| **CRM Module** | 🚫 doesn't apply yet — same reason, CRM is `soon` |

## Permissions & Access Control

⛔ **Not built — the RLS track, declined twice now** (once implicitly by
Phase 1's own documented "no read gate: the board is firm-wide" decision,
once explicitly when scoping Phase 2). The spec wants row-level visibility
scoped to PM/team-member/client, and column-level edit permissions
(everyone/owner/admins/pm_only). Today: `projects.write` is the one trust
boundary for the whole board, every signed-in employee sees every project,
and no column has its own edit permission.

**Decision, settled, not yet built:** when this is implemented, project team
membership is modeled through `employee_user_groups`
(`group_type = 'project'`) + `employee_group_members` — **not** a new
PM-specific membership table, and not the dead `projects.team_members`
JSONB column (never read or written by any app code today; would be
removed, not populated, when this ships). `docs/product-specification.md`'s
"User Groups" section already specifies this shape (`group_type` includes
`'project'` and `'team'`), and both tables already exist with RLS and
fixture rows — but, same as `pm_task_attachments`/`pm_task_time_entries`
(L101), scaffolded in the initial schema pass with zero real consumers:
no route, no repo function, and `it.groups.write` is never checked anywhere
in app code. Building project RLS on this means being the FIRST real
consumer of Groups, not inventing membership from nothing.

One concrete schema gap to close when this is built:
`employee_user_groups` has no column linking a group to a specific project
— `department_code`/`location_code`/`parent_group_name` exist, `project_id`
does not. A migration adding `project_id UUID REFERENCES projects(id) ON
DELETE CASCADE` (nullable — only `group_type = 'project'` rows populate it)
is the real fix; a `group_name` naming convention encoding the project
number was considered and rejected — a committed string convention is
exactly the kind of thing L100 already caught silently drifting once in
this codebase (a table-name typo in a check script, unnoticed for months).
A real FK is checked by Postgres itself; a naming convention is checked by
nobody.

Still an open "yes, now or not yet" call — this entry records WHAT the
membership model will be when it's built, not that it's being built now.

## Migration v1.0 → v2.0

🚫 **Doesn't apply.** This section narrates a hypothetical prior-version
migration for Monday's own reference customers; Kaaj has no v1.0 PM release
this maps onto — actual development history is the git log, not this
section.

## Performance Considerations

🚫 **Nothing actionable yet.** Every item (GIN indexes on `config`/`value`/
`data_sources`, widget-data caching, formula-calculation caching, dashboard
layout caching, materialized views for dashboard queries) is scoped to the
column-type engine, dashboards, or automations — none of which exist. This
section becomes real work only once one of those three is actually being
built, not before.

---

## What's actually left, roughly ordered by value

~~1. Custom fields (docs/26)~~ — ✅ **built.** Closed the "arbitrary fields"
gap that started this review, with none of the other deferred items'
unresolved risk (no eval surface, no relation-modeling problem). One real
finding along the way, worth carrying forward as a general check: a
value-clearing write path should be checked against `app_user`'s DELETE
grant (there isn't one, anywhere, by design) before it's designed as a
`DELETE` — see docs/26 "What shipped."

1. **Accounting integration** (`actual_revenue` rollup, budget→invoice) —
   real value, no new hard risk, but touches the accounting module and needs
   its own design pass for exactly how a project's billing ties to real
   invoices — not a "wire it up" slice.
2. **Client Portal surface** — blocked on the Client Portal module itself
   existing in any project-facing form, which is a bigger prerequisite than
   this module alone.
3. **Automation engine** — real product value, but the largest remaining
   risk surface (eval + no job runner) and should not be attempted until
   both have a real design, not a phase-scoped slice.
4. **Dashboards** — depends on custom fields for anything beyond row
   counts, which are now built; still a large surface on its own
   (layout persistence, per-widget caching, 10+ widget types).
5. **Row-level PM visibility (RLS)** — a real decision to make explicitly,
   not a technical gap; worth resolving with a yes/no before it's implicitly
   declined a third time. The team-membership shape it would use
   (`employee_user_groups`/`employee_group_members`) is settled — see
   Permissions & Access Control above — building on it is a separate
   decision from having decided what it would look like.
6. **Drag-and-drop, richer view controls (List sort/filter, Gantt
   critical-path, Calendar week/day)** — genuine UI investment, lowest risk,
   lowest urgency; good candidates for "whenever there's a quiet week," not
   a dedicated phase.

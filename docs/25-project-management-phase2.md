# Project Management — Phase 2: Comments, Files, Templates, and Three More Views

`docs/module-project-management-v2.md`, `docs/23-project-management-phase1.md` ·
0 new tables, 3 new repositories (`comments.repo.ts`, `templates.repo.ts`, and
two functions added to the existing `documents.repo.ts`), 1 migration-free
schema extension (a new `entity_type` value on an already-unconstrained
column).

## Where this starts

Phase 1 shipped objectives, subtasks, task dependencies and a Kanban view,
and named four scaffolded tables — `pm_task_comments`, `pm_task_time_entries`,
`pm_task_attachments`, `pm_project_templates` — as ready to "wire up": schema
exists, bare `tenant_isolation` RLS exists, three of the four are
scale-classified and fixture-complete. The user chose two Phase 2 tracks:
wire up the scaffolded tables, and add read-only Gantt/Calendar/Workload
views alongside List/Kanban. Typed custom fields and row-scoped project
visibility (RLS) were declined again.

## What research changed before any code was written

Two of the four scaffolded tables turned out to be dead duplicates of
features already built, for real, under different names:

- **`pm_task_time_entries` duplicates `time_tracking_entries`.**
  `time_tracking_entries` already has `project_id`/`task_id` columns, a real
  route (`/time-tracking`), real RLS, and its `refreshHours()` already writes
  `tasks.actual_hours`/`billable_hours`/`non_billable_hours` and
  `projects.actual_hours` in the same transaction — `/projects/[id]` was
  already displaying those numbers per task before this phase touched
  anything. Building `pm_task_time_entries` for real would have meant two
  disconnected time-entry mechanisms feeding the same counter column.
- **`pm_task_attachments` duplicates `documents`.** `documents` is the one
  real, Storage-backed file pipeline in this codebase (bucket, Storage RLS,
  a download proxy that re-checks permission before streaming bytes).
  `pm_task_attachments` has no `storage_key` column at all — just a bare
  `file_url TEXT` — and would have needed its own bucket, RLS, upload action
  and download proxy built from nothing, duplicating `documents` almost
  exactly. Same shape as `ticketing_attachments`, left dead by the ticketing
  module for the same reason.

Both stay scaffolding, same status `ticketing_attachments` already has.
[L101](./10-lessons-learned.md) records the general lesson: grep for the
*concept*, not the scaffolded table's own name, before building its pipeline.

That left Phase 2 as five pieces, three of them genuinely new:

1. **Task comments** (`pm_task_comments`) — new.
2. **Project templates** (`pm_project_templates`) — new.
3. **Task files** — an extension of `documents` (`entity_type = 'task'`),
   not a new table.
4. **Time on a task** — a "Log time" link into the existing `/time-tracking`
   route, not a new table.
5. **Gantt / Calendar / Workload views** — client-side, over data
   `/projects/[id]` already loads.

## 1. Task comments

`comments.repo.ts` (new): `commentsForProject` (one query for every task in
a project, grouped by task id — the page renders a thread per task, and
fetching per-task would be a query inside a loop over the task list),
`addComment`, `editComment`, `deleteComment` (soft delete only —
`deleted_at`, this app never hard-deletes). Numbered `TC-nnn`, same
`nextNumber`-style pattern as `tasks`/`projects`/`objectives` — a third
un-shared copy of the idiom, matching the existing precedent of two.

Gated on `projects.write` — the same trust boundary as every other action on
`/projects/[id]`, not a new permission string, and (like `moveTask`) not
restricted to the comment's own author: this page has one shared write
boundary for the whole board, not per-row ownership.

`is_internal` is always written `true` explicitly, never left to the
column's own default (`false`) — there is no client-portal task surface yet
(Phase 1's own deferral), so every comment is employee-only in practice; a
future client-facing read must opt a comment IN, never rely on a default it
doesn't control.

NOT audited, same reasoning as `addTask`: a comment changes nobody's money,
employment or rights.

## 2. Project templates

`templates.repo.ts` (new): `saveAsTemplate` snapshots a project's TOP-LEVEL
tasks only (name, description, priority, estimated hours, and a day-offset
from the earliest due date among them) into `template_data` JSONB —
deliberately not assignees, dates, subtasks or dependencies, all per-run
decisions. `tasksFromTemplate` reads the snapshot back; `createFromTemplate`
was folded into `/projects`' existing `create` action rather than a second
action — an optional `template_id` field, and if present, a task is created
per template entry (`due_date` offset from the new project's own
`start_date`, `status` always `todo`, `assigned_to` always null) and
`recordUse` increments the template's `use_count` (a plain increment —
correct here, unlike a recomputed counter, because `use_count` is monotonic
by definition, never derived from other rows).

The template-seeding loop (`for (const tt of templateTasks) { ... }` in
`/projects/+page.server.ts`) calls `projects.createTask` once per template
task — a `tx` query inside a loop, lexically. Not flagged by
`verify-no-loop-queries.mjs` because the query it finds lives inside
`createTask`'s own function body, not inlined in the loop; if that ever
changes, the loop is bounded by how many tasks are IN THE TEMPLATE — a
human-curated list from "Save as template," never by table growth — the
same shape as the `invoice_lines`/`bill_lines` exemptions already
committed there.

Gated on `projects.write`. NOT audited — a template is a reusable shape, not
a financial or employment commitment; the real project's own budget/hours
(already audited via `updateProject`) are what's binding.

## 3. Task files (extends `documents`, not `pm_task_attachments`)

No migration: `documents.entity_type` is already an unconstrained `TEXT`
column (docs/17-customer-portal.md §3), so `'task'` is a new value, not a
schema change.

**The design decision this phase actually had to make, found by reading the
RLS source rather than assuming the migration's own comment was current:**
`staff_document_visibility`'s policy only grants visibility via
`folder_id IS NOT NULL AND app.can_see_folder(folder_id)`, or an
`owner`/`firm_admin` claim role. A document with `folder_id = NULL` —
which the migration's own "entity-rooted document" comment describes as a
supported case — is in practice invisible to everyone but the uploader's own
claim role, because the folder-less branch the comment describes was never
actually wired into the visibility policy. Task files therefore go through a
real per-task folder, not a bare `entity_type`/`entity_id` tag on a
folder-less row:

- `documents.defaultFolderForEntity` (new, generalising the existing
  per-employee `defaultFolderFor`): lookup-or-create ONE `company`-visibility
  folder per task, named after the task, `entity_type = 'task'`.
- `documents.folderForEntity` (new): read-only lookup, for a `load()` that
  must not create a folder just to render an empty file list.
- `documents.forEntities` (new): every document for a SET of entity ids of
  one type, in one query, grouped by entity id — same "batch, don't loop"
  shape as `commentsForProject`.

**A second thing the RLS source ruled out:** `documents.repo.ts`'s
`folderPermission()` only grants "edit" to a folder's own `owner_employee_id`
or an admin claim role — a `company`-visibility folder is `view`-only to
everyone else under that model. A task needs every teammate with
`projects.write` to be able to attach a file, not just whoever's upload
happened to create the folder first. `upload.ts` gained
`uploadTaskFile` (new), a second orchestration function alongside the
existing `uploadDocument` — it shares the extracted `putFileInStorage`
helper (same bucket, same storage-key shape, same validation) but skips
`folderPermission`/`atLeast` entirely, gated instead by the caller's own
`requireCan(ctx, "projects.write")` — the correct trust boundary for a task
write, not a widening of the generic folder-permission model for every
OTHER document feature too.

Download reuses the existing `/documents/download/[id]/+server.ts` proxy
as-is — it's already generic (looks up by document id, checks
`document.read`, streams). `document.read`/`document.write` are in
`EVERYONE`, so no new permission string anywhere in this piece.

## 4. Time on a task

No new table, no repo change to `time_tracking_entries.repo.ts` — its
`create` already accepts `project_id`/`task_id`. `/time-tracking`'s `load()`
reads `project_id`/`task_id` query params (same pattern as its existing
`status`/`mine`/`page`) and the page seeds `creating`/`creatingProjectId`
from them — a genuine one-time seed (`svelte-ignore state_referenced_locally`,
with the reasoning inline), not a value that should keep tracking `data`,
since arriving here from another route always remounts the page fresh and
the person's own in-modal choices afterward must not snap back.

`tasksForActiveProjects` (pre-existing) filters `status <> 'done'`, so a
"Log time" link on an already-`done` task pre-fills the project but the task
select has nothing to select — a graceful, pre-existing degrade, not a bug
this phase introduced.

## 5. Gantt / Calendar / Workload views

Same client-side pattern as List/Kanban: one `view` state, computed
entirely from `data.tasks` already loaded, no new route or query, no network
request on toggle. Day granularity only; no drag-to-reschedule.

- **Gantt** — a bar per top-level task with a `start_date` or `due_date`,
  positioned as a percentage of the whole date range in view.
- **Calendar** — a month grid (client-side month navigation, `$state`, no
  reload), tasks plotted on `due_date`, top-level only.
- **Workload** — open (not `done`) top-level tasks' `estimated_hours`,
  summed per assignee, project-scoped only (a cross-project rollup needs the
  still-deferred dashboard machinery).

All three are pure presentation — no new permission, audit entry,
constraint, or RLS change.

## Still explicitly out of scope

Unchanged from Phase 1's own reasoning, or from this session's scoping
question: the typed-column system, formula/mirror columns, the automation
engine, full cross-project dashboards, project-visibility RLS, and real
drag-and-drop. `pm_task_attachments` and `pm_task_time_entries` move from
"not yet built" to permanently superseded — see L101.

## Test plan

**Status key**, same discipline as Phase 1's: `DONE` — an automated test
asserts exactly this and passes. `PARTIAL` — the claim has a test for part
of it, or was checked by hand once. `PENDING` — code inspection only.

### A. Task comments

1. **DONE.** Adding a comment is visible via `commentsForProject`, grouped
   by task id, with the right author and content.
   `comments.repo.test.ts` › "adds a comment...".
2. **DONE.** Refused for a task in a different project, or a task that does
   not exist at all. › "refuses a task that does not belong to...", "...does
   not exist at all".
3. **DONE.** Editing sets `edited_at` and the new text.
4. **DONE.** Deleting is soft — the row survives with `deleted_at` set, and
   disappears from `commentsForProject`.
5. **DONE.** Editing/deleting a comment that no longer exists is refused.
6. **DONE.** `commentsForProject` never leaks a comment across projects.
7. **DONE**, via the browser: added a real comment through the deployed
   `addComment` action on a running `pnpm dev` instance, confirmed the
   success banner, the badge count updating from 1 to 2, and the new
   comment's timestamp rendering in the tenant's own timezone via
   `instant()`.

### B. Task files

8. **DONE.** `folderForEntity` returns null before any file exists for an
   entity; `defaultFolderForEntity` is idempotent (a second call returns the
   SAME folder id) and creates a `company`-visibility, `entity_type='task'`
   folder. `documents.repo.test.ts`.
9. **DONE.** `forEntities` groups by entity id and never crosses entity
   types (a `task`-scoped query does not see a document tagged for a
   different entity type at the same id).
10. **PENDING.** The live upload/download round trip through
    `uploadTaskFile`/the download proxy, in a browser. Attempted and could
    not be completed this session — see the note below.
11. **DONE**, by code reading against the live RLS/permission source
    (`supabase/migrations/20260922090000_document_management.sql`), not
    just the migration's own out-of-date comment: confirmed
    `staff_document_visibility` requires a real folder for visibility, and
    `folderPermission()`'s "edit" tier excludes non-owner `company`-folder
    viewers, which is why `uploadTaskFile` deliberately bypasses that gate
    in favour of `projects.write`.

### C. Project templates

12. **DONE.** `saveAsTemplate` captures exactly the project's top-level
    tasks — a subtask is never included. `templates.repo.test.ts`.
13. **DONE.** `due_offset_days` is relative to the EARLIEST due date among
    top-level tasks (0 for that task, positive and correctly ordered for
    the rest).
14. **DONE.** The captured shape is exactly
    `{task_name, description, priority, estimated_hours, due_offset_days}` —
    no assignee, no absolute date, no dependency.
15. **DONE.** Refused for a project or a template that does not exist.
16. **DONE.** `recordUse` is a plain increment, confirmed against a real
    before/after read.
17. **DONE.** `listTemplates`' `task_count` matches the captured array's
    length.
18. **DONE.** Numbering takes the next free `TPL-nnn`, never a reused one,
    correctly threading through the fixture's own non-sequential
    `TPL-DELIVERY-01` row.
19. **PARTIAL.** The "Save as template" modal was confirmed opening with the
    project name pre-filled, and the form fields fillable, through the real
    running app. The submit itself, and the "create a project from a
    template" flow on `/projects`, are covered only by code reading (the
    action wiring mirrors `addComment`'s, which DID complete live) — not by
    an automated test or a completed live click, for the reason below.

### D. Views

20. **DONE**, live: Gantt renders a bar per top-level task with the correct
    relative position and overdue/done colouring, confirmed against the
    real fixture data in a running browser.
21. **DONE**, live: Calendar renders the correct month grid, correctly
    excludes a subtask (`Write up discovery findings`, due Jul 31, never
    appears — top-level only, same as Gantt/Workload), and month
    navigation (prev/next) moves the grid and preserves state across a
    view switch.
22. **DONE**, live: Workload sums `estimated_hours` per assignee for open
    top-level tasks only, confirmed against the real fixture (Tom
    Whitfield 260h, Marcus Chen 120h — matching the two open tasks with
    hours in PRJ-001).
23. **DONE.** Found and fixed live, before it shipped: the Calendar view's
    day-of-week header used the letter itself as the keyed-each key
    (`{#each [...] as d (d)}`), and "S"/"T" each appear twice in a week —
    Svelte's `each_key_duplicate` fired in the console the moment Calendar
    was reached. Fixed to key by index, the documented exception for a
    small, static, never-reordered literal.

### E. Regression and mechanics

24. **DONE.** `./check` passes in full (25/25) with every new registry
    entry: `constraints.ts` (the two UNIQUE business keys plus
    `fk_pm_task_comments_task_id`), `verify-constraint-registry.mjs`'s
    `FORM_WRITTEN`/`CANNOT_BE_TRIPPED` for both new tables'
    `tenant_id_fkey`s, `audit/register.ts`'s five new `NOT_AUDITED` entries.
25. **DONE.** The full unit suite passes (1185 tests); two unrelated,
    pre-existing flakes (an invoice-creation test and an accounting
    deadlock, both shared-database parallelism races in modules this phase
    never touched) were confirmed to pass on rerun in isolation, and are
    not new.
26. **DONE.** `svelte-check` is clean (0 errors, 0 warnings) — including an
    a11y fix (`role="menu"` on the dropdown-content list, matching the
    existing `Sidebar.svelte` precedent) needed before an earlier dropdown
    design was replaced (item 27).

### A design correction found live, not by reading

27. During browser verification, a per-task actions menu (a daisyUI
    `dropdown` inside the list table's `overflow-x-auto` cell) rendered
    visibly clipped/unstyled — `overflow-x-auto` forces `overflow-y` to
    `auto` too under the CSS overflow spec, which clips an absolutely
    positioned `dropdown-content` the same way. Replaced with four plain
    inline icon buttons (Dependencies/Comments/Files/Log-time) — simpler,
    and immune to the clipping ancestor. Worth naming as its own item
    because it is exactly [L64](./10-lessons-learned.md)'s pattern — the
    only checks that render anything are e2e — surfaced one step earlier,
    by hand, before it reached that suite.

### Note on live verification of items 10 and 19

Browser automation in this session became unreliable partway through
verification — click events intermittently failed to reach the page (a
`chrome-extension://` focus-stealing error unrelated to this app, reproduced
across multiple fresh tabs) after several successful interactions (login,
navigation, the comment write-path, all five view toggles, the time-tracking
query-param prefill). Comments' full write path, all three new views, and
the time-tracking deep link were each confirmed live before the tooling
degraded. The file-upload and template-save SUBMIT actions were not; the
`saveAsTemplate` modal opening correctly (pre-filled name field) was
confirmed via the accessibility tree even after screenshots stopped
working. Both remaining actions share the exact action/form shape
(`FormReader` → `withTenant` → repo call → `fail`/redirect) already proven
live by `addComment`, and are additionally covered end-to-end at the
repository layer by items 8, 9 and 12–18 — but a live click-through of
`uploadTaskFile`'s Storage write and `saveAsTemplate`'s form submit are
open items for whoever next has a working browser session.

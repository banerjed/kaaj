# Project Management — Phase 1: Objectives, Subtasks, Dependencies, Kanban

`docs/module-project-management-v2.md`, `docs/module-project-management-mockups.md` ·
0 new tables, 1 new repository, 2 migrations (CHECK/FK only), 1 fixture fix.

## Where this starts

[11-module-roadmap.md](./11-module-roadmap.md) Phase 7 already shipped
`projects` and `tasks`: create, edit, add a task, move a task across statuses,
counters recomputed and audited where money is involved. It says plainly:
**"objectives and dashboards are not built."** The v2 spec
(`module-project-management-v2.md`) additionally asks for a typed-column
engine, formula/mirror columns, a visual automation builder with AI, six view
types, and cross-project dashboards.

The schema for most of that was scaffolded wholesale during an earlier pass —
`pm_objectives`, `pm_dashboards`, `pm_dashboard_widgets`, `pm_automations`,
`pm_automation_executions`, `pm_project_templates`, `pm_task_comments`,
`pm_task_attachments` all exist, all carry a bare `tenant_isolation` policy,
all are scale-classified, all have fixture rows. **None have a repository, a
route, or a form.** This document scopes what actually gets built now, and
names what stays scaffolding.

## Phase 1 scope

Built this session:

1. **Objectives** — the strategic layer over projects. List, create, view,
   edit. A project can belong to one objective. An objective's progress,
   health and revenue are **rolled up from its projects**, recomputed, never
   incremented — same discipline as `task_count` on `projects`.
2. **Subtasks** — one level of nesting under a task (`parent_task_id`,
   `depth_level`), via the existing "Add task" form.
3. **Task dependencies** — `depends_on_task_ids` (source of truth) and
   `blocks_task_ids` (a recomputed reverse index of it), scoped to tasks in
   the same project, with server-side cycle detection.
4. **Kanban view** — a second, client-side view of a project's tasks on
   `/projects/[id]`, grouped by `status` into columns, alongside the existing
   list view.

Explicitly **not** built, and why — these are deferrals from hard rules, not
just effort:

- **Typed column system / formula / mirror columns.** `task_column_values.value
JSONB` holding an arbitrary typed figure is the exact shape CLAUDE.md's L41
  names, and `money/jsonb-is-text` verifies money-in-JSONB by walking a
  **registered list of paths** — a polymorphic column whose shape depends on a
  runtime `column_type` cannot be put on that list. Formula columns compound
  this: the spec's own headline formulas (`{Budgeted Amount} - {Actual
Cost}`, profit margin, revenue-per-hour) are exactly what "custom fields must
  never feed payroll or accounting calculations" forbids, and the spec's
  reference implementation is `math.evaluate()` on a tenant-authored string —
  an eval surface in multi-tenant SaaS. Both need a real design, not a Phase 1
  add-on.
- **Automation engine + AI suggestions.** Same eval-surface problem for
  condition expressions, plus a scheduler/executor this codebase has no
  precedent for (no background job runner exists yet — search integrates
  through Postgres per ADR-002, but nothing here polls or schedules).
- **Dashboards & widgets.** Depends on the typed-column engine for anything
  beyond counting rows, and is genuinely a separate, large surface (layout
  persistence, per-widget caching, 10+ widget types).
- **Gantt, Calendar, Workload, Chart views.** Real UI investment each; Kanban
  and List cover the two highest-value views for a first pass.
- **Project templates, client-visible task collaboration.** `client_portal`
  is a listed dependency of the v2 module and isn't itself built out for
  project-facing surfaces yet; templates need the column system to be worth
  building (a template today is just a project + task list, which "duplicate"
  already covers informally).
- **True pointer drag-and-drop on the Kanban board.** The existing list view's
  "move a task" control is an accessible `<select>` that submits on change,
  with a `<noscript>` fallback button. The Kanban board reuses exactly that
  control on each card. This is a first drag-and-drop surface for the app;
  committing to real HTML5 DnD, its keyboard-accessible fallback, and testing
  it is a follow-up, not a Phase-1 requirement to call this "Kanban" — Trello
  and Monday.com both still expose an accessible non-drag move as well.

## Design decisions

**No new tables, no new permission strings.** `pm_objectives` already exists
and is scale-classified. Objectives are gated on the same `projects.write`
permission projects already use — they are the same trust boundary (the
`project_manager` functional role), and splitting them into
`objectives.write` today would fragment the model without a caller that needs
the difference. Reads are firm-wide with no permission check, matching
`/projects`' own documented exception ("No read gate: the board is
firm-wide") — there is no `projects.read` permission to gate on.

**Objective status is set by its owner, not derived.** The spec's
`updateObjectiveStatus` auto-sets `status` from child-project counts. That
overwrites a PM's own call (an objective genuinely on hold shouldn't flip back
to `active` because one project moved) and its `health_status` branch is
unreachable dead code in the original (`blockedProjects > 0` before a
`> 0.3` check on the same variable that can never both fire). Phase 1 rolls up
only what is genuinely derived — `progress_percentage`, `health_status`,
`actual_revenue` — and leaves `status` as a field the objective's owner sets,
same as a project's own `status`.

**Rollup formula**, recomputed in SQL in the same transaction as any write
that could invalidate it (project created under the objective; project's
`objective_id`, `status`, `health_status` or `total_billed` changed) — mirrors
`refreshTaskCounters`:

```
progress_percentage = completed_projects / total_projects * 100   (0 if no projects)
actual_revenue      = SUM(total_billed) over non-archived linked projects
health_status       = 'off_track' if any linked project is off_track
                       else 'at_risk' if at_risk_projects / total_projects > 0.3
                       else 'on_track'
```

**Dependencies are same-project only**, for Phase 1. Cross-project
dependencies are Monday.com's "Connect Boards" column — deferred with the rest
of the typed-column system. `blocks_task_ids` is never written directly; it's
recomputed project-wide in one statement whenever `depends_on_task_ids`
changes anywhere in the project, the same "recompute, don't increment"
discipline CLAUDE.md states for counters, applied to a derived array instead
of a number. Cycle detection is one recursive CTE per write (no loop): adding
edge `U depends on V` is refused if `V` can already reach `U` by following
existing `depends_on_task_ids` edges forward from `V`.

**Dependencies annotate, they don't gate.** An incomplete dependency shows as
"Blocked by T-003 (in progress)" on the dependent task; it does not prevent
marking the dependent task done or auto-set its `status` to `blocked`. Two
independent status-setting mechanisms (a person's own status field, and an
automatic one derived from dependencies) racing on the same column is exactly
the kind of silent-overwrite shape this codebase's security section warns
about elsewhere; keeping it informational avoids inventing that class of bug
on day one.

**Subtasks are exactly one level.** `parent_task_id` non-null implies
`depth_level = 1`; a subtask cannot itself have a parent. Enforced by a CHECK,
not just app code, since it's a genuine data invariant:

```sql
ALTER TABLE tasks ADD CONSTRAINT tasks_depth_matches_parent CHECK (
  (parent_task_id IS NULL AND depth_level = 0) OR
  (parent_task_id IS NOT NULL AND depth_level = 1)
);
```

**Two new FKs, deliberately narrow.** Neither `projects` nor `tasks` has a
single `REFERENCES` constraint today (the spec's schema had them; the
migration that actually shipped dropped every one when translating arrays to
JSONB and money to `NUMERIC`, apparently as a side effect rather than a
decision — `contact_person_id`, `client_id`, `project_manager_id`,
`proposal_id`, `contract_id`, `parent_project_id`, `template_id` are all
unenforced foreign keys today). That gap is real, pre-existing, and out of
scope: retrofitting it touches columns nothing in this phase writes.
Phase 1 adds exactly the two relationships it makes load-bearing, both
currently satisfied by existing fixture data so backfill is safe:

```sql
ALTER TABLE tasks    ADD CONSTRAINT fk_tasks_parent_task_id  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)    ON DELETE SET NULL;
ALTER TABLE projects ADD CONSTRAINT fk_projects_objective_id FOREIGN KEY (objective_id)   REFERENCES pm_objectives(id) ON DELETE SET NULL;
```

`no_self_dependency` (a task cannot appear in its own `depends_on_task_ids`)
is added as a CHECK for the same reason — cheap, and directly on the column
this phase makes live:

```sql
ALTER TABLE tasks ADD CONSTRAINT no_self_dependency
  CHECK (NOT (depends_on_task_ids @> to_jsonb(id::text)));
```

All three are registered in `constraints.ts` with a field-level message, since
each is reachable from a form (a race between two writers, not the app's own
validation, is what actually trips them — the app's own `no_such_*` checks
catch the common case first).

**The money-scale divergence is inherited, not fixed here.** `projects.budget`
/ `actual_cost` / `total_billed` and `pm_objectives.target_revenue` /
`actual_revenue` are `NUMERIC(18,4)` — the _rate_ scale CLAUDE.md reserves for
hourly rates and quantities, not the `NUMERIC(15,2)` scale for money. Both are
still exact `NUMERIC` (no float precision loss), so `./check`'s
`money/numeric-not-float` invariant doesn't catch it, and nothing in this
phase performs mixed-scale arithmetic between the two conventions. Recorded
here rather than silently carried forward again; a real fix is a dedicated
migration touching already-populated financial columns, orthogonal to this
feature.

**The fixture's placeholder sweep hit `depends_on_task_ids`, `blocks_task_ids`
and (unrelated to this phase) `checklist_items`.** This is
[L90](./10-lessons-learned.md)'s pattern a fourth time — see the lesson added
alongside this phase. Every column this phase makes live is replaced with
real, meaningful values (a real two-edge dependency chain, a real subtask
row); `checklist_items` is untouched because nothing in Phase 1 reads it.

**`enumerations.json`'s `projects`/`tasks` entries are not authoritative for
the app.** They were generated in the same mechanical pass as the schema and
disagree with what `projects.repo.ts` actually ships (`planning` vs.
`planned`, `off_track` vs. `behind`/`blocked`, no `archived` status — these
are plain `text` columns, not Postgres enums, so nothing enforces either
list). `objectives.repo.ts` follows `projects.repo.ts`'s precedent — the
repository module is the vocabulary (L57) — not `enumerations.json`.

## What ships

| Layer                                                                                                       | Change                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration                                                                                                   | 2 CHECKs, 2 FKs (above), all registered in `constraints.ts`                                                                                                                                                                                                         |
| Fixture                                                                                                     | Real dependency chain (T-002 depends on T-001, T-003 depends on T-001); one new subtask row under T-001; bogus `["standard"]` sweep values on the two dependency columns replaced                                                                                   |
| `objectives.repo.ts` (new)                                                                                  | `list`, `byId`, `projectsFor`, `createObjective`, `updateObjective`, `refreshRollup`, vocab consts, `ObjectiveWriteRefused`                                                                                                                                         |
| `projects.repo.ts`                                                                                          | `objective_id` on `NewProject`/`ProjectEdit`; `parent_task_id` on `NewTask`, computing `depth_level`; `addDependency`/`removeDependency` with cycle check and reverse-index recompute; `TaskRow` carries `parent_task_id`, `depends_on_task_ids`, `blocks_task_ids` |
| `/objectives`, `/objectives/[id]` (new routes)                                                              | list + create; detail + rollup + linked projects + "add project under this objective"                                                                                                                                                                               |
| `/projects`                                                                                                 | create form gains an optional Objective select                                                                                                                                                                                                                      |
| `/projects/[id]`                                                                                            | edit form gains an Objective select; "Add task" gains an optional Parent task select; task rows show subtask nesting and a "Blocked by" annotation; new "Manage dependencies" action per task; a List/Kanban view toggle (client-side, no new route)                |
| `apps/web/src/lib/server/audit/register.ts`                                                                 | `objectives` create/update (money + status, same reasoning as `projects`)                                                                                                                                                                                           |
| `apps/web/e2e/smoke.spec.ts`                                                                                | `/objectives`; the Add-task Parent select's scoping; the Kanban board's structure; the List↔Kanban toggle firing no network request                                                                                                                                 |
| `apps/web/e2e/form-errors.spec.ts`                                                                          | creating an objective with an invalid field; a dependency cycle refused as a sentence, not a crash                                                                                                                                                                  |
| `apps/web/src/lib/server/auth/action-authz.test.ts`                                                         | 4 new MATRIX entries: `projects`, `projects/[id]`, `objectives`, `objectives/[id]` — closed a pre-existing gap for `/projects` too                                                                                                                                  |
| `apps/web/src/routes/(app)/objectives/page.server.test.ts`, `.../objectives/[id]/page.server.test.ts` (new) | the real `create`/`updateObjective` actions' audit-entry content, against a real `Request`                                                                                                                                                                          |
| `apps/web/src/routes/(app)/projects/[id]/kanban.test.ts` (new)                                              | a source-level check that the Kanban board and List view share one `moveTask` control, not two                                                                                                                                                                      |
| `docs/22-test-inventory.md`                                                                                 | new unit and e2e test files, and updated counts                                                                                                                                                                                                                     |
| `docs/10-lessons-learned.md`                                                                                | L100, the fourth sweep-filler recurrence                                                                                                                                                                                                                            |
| `docs/11-module-roadmap.md`                                                                                 | Phase 7 entry updated: objectives no longer "not built"                                                                                                                                                                                                             |

---

## Test plan

Independent of the implementation above — written to be checked against it,
not derived from it. Anything not explicitly listed here is out of scope for
this phase's testing (dashboards, automations, typed columns: not built).

**Status key** — `DONE`: an automated test (unit or e2e) asserts exactly
this, and it passes. `PARTIAL`: part of the claim has an automated test; the
rest is either true by code construction (read, not tested) or was only
checked once by hand in a browser. `PENDING`: not verified by anything
committed — code inspection only, or not checked at all.

**34 DONE** (34 items) — the 11 items originally PARTIAL or PENDING each
got a real test in a second pass; see each item for which one.

### A. Objective rollup (the invariant that must hold, same role `staleCounters()` plays for tasks)

1. **DONE.** An objective with zero linked projects: `progress_percentage = 0`,
   `actual_revenue = 0`, `health_status = 'on_track'`.
   `objectives.test.ts` › "is zero for an objective with no linked projects".
2. **DONE.** Linking a project to an objective (via project create or edit)
   recomputes that objective's rollup in the same transaction. The CREATE
   path was already covered ("recomputes when a project is created under
   the objective, even the first one"); the EDIT-path gap is now closed by
   "recomputes the NEW objective when an already-existing,
   previously-unlinked project is edited onto it" — a fresh project created
   with `objective_id: null`, then moved onto OBJ1 via `updateProject`,
   asserting `project_count` rises by one.
3. **DONE.** Moving a project OUT of an objective (edit, clear the Objective
   field) recomputes the OLD objective's rollup, not just the new one (or
   "none"). `objectives.test.ts` › "recomputes the OLD objective when a
   project moves to a different one".
4. **DONE.** Two projects under one objective, one `completed` one `active`:
   `progress_percentage = 50`. › "progress_percentage is completed / total,
   not an average of percentages" (50.0000, `numeric(18,4)`).
5. **DONE.** One `off_track` project among three: objective
   `health_status = 'off_track'` regardless of the other two's health — the
   "any" branch, tested so it can't regress into the buggy "count > 0 AND
   fraction > 0.3" shape the spec had. › "health_status is off_track if ANY
   linked project is off_track, regardless of the others".
6. **DONE**, with the fixture's real shape rather than the plan's illustrative
   numbers: OBJ1 has 4 linked projects, not 5, so the ratio case is "2 of 4"
   (`0.5 > 0.3`) and "1 of 4" (`0.25`, not) rather than "2 of 5" — same
   branch, same conclusion. › "health_status is at_risk when more than 30%…
   (2 of 4)" and "…stays on_track when at_risk is 30% or less (1 of 4)".
7. **DONE.** `actual_revenue` sums `total_billed` only over non-archived
   linked projects — an archived project's billed amount must not still
   count. › "excludes an archived project's total_billed from
   actual_revenue".
8. **DONE.** Recompute is a `SET x = (SELECT ...)`, not an increment. ›
   "recompute is SET, not increment — a corrupted stored value self-heals".

### B. Subtasks

9. **DONE.** Creating a task with a Parent task selected sets
   `depth_level = 1` and the given `parent_task_id`. ›
   `projects.writes.test.ts` "computes depth_level 1 and stores the parent
   when one is given".
10. **DONE.** Creating a task with no parent sets `depth_level = 0`,
    `parent_task_id = NULL`. › "computes depth_level 0 when no parent is
    given".
11. **DONE.** The Parent task select only offers `depth_level = 0` tasks in
    the SAME project — never a task from another project, never an existing
    subtask. `smoke.spec.ts` › "the Add-task Parent select only offers this
    project's own top-level tasks" — opens the real modal and reads the
    option list, asserting it contains the project's own top-level tasks
    and neither an existing subtask nor a task from a different project.
12. **DONE.** Attempting to create a task whose chosen parent is itself a
    subtask, or belongs to a different project, is refused server-side even
    if the client-side option list were bypassed — the CHECK constraint is
    the backstop. › "refuses a parent that is itself a subtask — one level
    only" and "refuses a parent from a different project"; the CHECK itself
    (`tasks_depth_matches_parent`) was also fired directly with `psql` during
    development and confirmed to reject the bad row.
13. **DONE.** The project's task list groups a subtask directly under its
    parent, regardless of `task_number` order. › "sorts a subtask directly
    after its parent in tasksFor, regardless of task_number" (repo-level);
    also visually confirmed in the browser (T-008 and a newly-created T-009
    both nested under T-001).
14. **DONE.** `refreshTaskCounters`'s `task_count` includes subtasks. › "counts
    a subtask toward the project's task_count — a subtask is still a task".

### C. Task dependencies

15. **DONE.** Adding "T-B depends on T-A" (same project) succeeds and is
    visible from both sides without a second action. › "updates both sides in
    one call: depends_on and the reverse blocks index".
16. **DONE.** Attempting to add a dependency on a task in a DIFFERENT project
    is refused. › "refuses a dependency on a task in a different project".
17. **DONE.** Attempting `T-A depends on T-A` (self) is refused. The
    APP-LEVEL guard has a test ("refuses a task depending on itself"), and
    the CHECK backstop now has its own, separate from the repository:
    "the no_self_dependency CHECK refuses a self-reference even bypassing
    addDependency entirely" fires a raw `UPDATE` directly against `tasks`
    and asserts it rejects with `no_self_dependency` in the error.
18. **DONE.** A direct cycle — `T-A depends on T-B`, then `T-B depends on
T-A` — is refused on the second write, both at the repo level ("refuses
    a direct cycle: T2 already depends on T1, so T1 depending on T2 is
    refused") and now at the form level: `form-errors.spec.ts` › "adding a
    dependency that would create a cycle is refused with a sentence, not a
    crash page" — reachable from a pristine fixture with no setup write
    (T-002 already depends on T-001), asserts the exact banner text, and
    that the page and the still-open dependencies modal survive it.
19. **DONE.** A longer, transitive cycle — build `T-A→T-B→T-C`, then attempt
    `T-C depends on T-A` — is also refused. › "refuses a transitive cycle
    across more than one hop".
20. **DONE.** Removing a dependency recomputes `blocks_task_ids` on the far
    side in the same transaction. › "removing a dependency clears the reverse
    index on the far side too".
21. **DONE.** `blocks_task_ids` recompute is project-scoped and does not
    touch tasks in other projects. › "recomputing blocks_task_ids for one
    project never touches a task in a different project" — records
    T-004's (PRJ-002) `blocks_task_ids` before two writes to PRJ-001's
    dependency graph and asserts it is byte-for-byte unchanged after.
22. **DONE.** A task with an incomplete dependency shows "Blocked by", the
    annotation disappears once the dependency is resolved, and the
    dependent task's OWN `status` is untouched through either transition. ›
    the same test, extended: "…and the annotation disappears once the
    dependency is resolved — still without touching status" now also
    resolves T-3 (via `setTaskStatus`) and re-reads T-2, asserting the
    incomplete list is empty and T-2's own status is identical across all
    three snapshots (before, blocked, resolved).

### D. Kanban view

23. **DONE.** The Kanban board shows one column per value in
    `TASK_STATUSES`, in order, and only `depth_level = 0` tasks as cards. ›
    `smoke.spec.ts` "the Kanban board groups tasks by status, in order, and
    never gives a subtask its own card" — reads the five column headers in
    DOM order, reads every card title, and asserts the subtask never
    appears as one while its parent's subtask-progress badge does.
24. **DONE**, by a structural test rather than a functional one — the claim
    is about the SOURCE having only one status-writing form, which a
    functional test proving Kanban "works" wouldn't actually rule out (a
    second, divergent form could coincidentally behave the same in one
    scenario and diverge in the next). `routes/.../projects/[id]/kanban.test.ts`
    reads `+page.svelte` and asserts: exactly one `{#snippet statusControl(`
    definition, more than one `{@render statusControl(` call site, and
    exactly one `action="?/moveTask"` form — the shape that fails the moment
    someone pastes in a second, independent status control.
25. **DONE.** Switching List ↔ Kanban is client-side only — no network
    request either direction. › `smoke.spec.ts` "switching List ↔ Kanban is
    client-side only — no request fires either way" — attaches a
    `page.on("request")` listener after the page settles, clicks Kanban then
    back to List, and asserts the listener never fired.

### E. Permissions, audit, and the mechanical obligations

26. **DONE**, and it closed a pre-existing gap for `/projects` too.
    `lib/server/auth/action-authz.test.ts` — the data-driven MATRIX that
    already covered compensation/employees/settings/performance, and had
    never had a `projects` or `objectives` entry despite existing
    infrastructure ready to take one — now has four: `projects` (`create`),
    `projects/[id]` (`updateProject`/`addTask`/`moveTask`/
    `addDependency`/`removeDependency`), `objectives` (`create`),
    `objectives/[id]` (`updateObjective`/`addProject`). Each asserts
    `employee`/`contractor` get a real 403 and `employee+project_manager`/
    `owner` get past the gate, by calling the deployed action directly with
    a synthetic `Request` — the same technique the file already used for
    every other module, just never pointed at these two.
27. **DONE.** Creating and editing an objective each write exactly one audit
    entry, diffing only the fields the form actually submits.
    `routes/.../objectives/page.server.test.ts` and
    `routes/.../objectives/[id]/page.server.test.ts` call the REAL `create`/
    `updateObjective` actions (not repo functions in isolation) with a real
    `FormData` `Request`, then read the row back via `audit.forEntity` and
    assert the `changes` object is exactly the intended shape — in the
    update case, proving a changed-but-not-audited field (`description`)
    and four resubmitted-but-unchanged fields are BOTH absent from the
    diff, not just that the intended two are present. `audit_log` is
    append-only (`app_user` has no DELETE grant, confirmed directly when
    this file's first draft tried it) so the entry these tests write is
    permanent, same as a real create's would be; the throwaway objective
    row itself is archived afterward, not deleted (deletion isn't granted
    there either — the app never hard-deletes anything, tests included).
28. **DONE**, via a static check rather than a runtime one.
    `verify-audit-coverage.mjs` (`./check`'s `writes are audited` step) parses
    `addDependency`/`removeDependency`/`addTask` and confirms no
    `audit.record` call appears in their bodies, matching their `NOT_AUDITED`
    registration — this fails the build if someone adds one without updating
    the registry, which is the property this item cares about.
29. **DONE.** `./check` passes in full, including every named sub-bullet — run
    repeatedly during this work, most recently as a clean 25/25 pass after
    the database was reset to a pristine fixture.
30. **DONE.** `apps/web/e2e/smoke.spec.ts` loads `/objectives` and finds an
    `<h1>` by role — run directly (`playwright test e2e/smoke.spec.ts -g
Objectives`) and as part of the full 139-test e2e suite.
31. **DONE**, with one wording difference from the plan: the committed case
    ("creating an objective with an invalid target end date is refused,
    marked, and the modal stays open") exercises a DATE-ORDER rejection
    (`f.reject("target_end_date")`), not a blank-required-field rejection as
    originally sketched — chosen because it's a rule `FormReader` can't
    express on its own, the more interesting of the two paths. It still
    proves all three parts of the rule: the field is marked
    (`aria-invalid`/`input-error`), the modal stays open, and the good field
    (`objective_name`) survives untouched. Run directly and as part of the
    full suite.

### F. Regression guard on what Phase 1 must NOT change

32. **DONE**, with a caveat worth naming: `projects.writes.test.ts`'s existing
    literals DID need a new `objective_id` field added (TypeScript now
    requires it on `NewProject`/`ProjectEdit`), so "unmodified" means
    unmodified in _behavior_ — the edited tests still assert exactly what
    they asserted before, and the new field is set to `null` or to the row's
    own pre-existing value so it's a no-op on that dimension. All pre-existing
    cases still pass.
33. **DONE.** `staleCounters()` still passes, as part of
    `projects.writes.test.ts`'s full 33-test run (18 pre-existing + 15 new across two passes).
34. **DONE.** The pre-existing 7-task, 4-project fixture story still reads
    sensibly — confirmed visually in the browser walkthrough (task names,
    the new dependency chain, and the new subtask all read as a coherent
    project, not just schema-valid noise).

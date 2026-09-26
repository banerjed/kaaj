# Project Management — Custom Fields on Projects and Tasks

**Status: ✅ built.** `20260926150000_custom_field_values.sql`,
`custom-fields.repo.ts`, `CustomFieldInput.svelte`, `LabelBadge.svelte`,
`/settings/project-management`, wired into `/projects` and `/projects/[id]`.
`./check` is green (25/25); see [What shipped](#what-shipped) and
[Test plan](#test-plan) at the bottom. `docs/module-project-management-v2.md`'s
"Column Type System" section is the feature this replaces — see
[Why not the v2 spec's column-type engine](#why-not-the-v2-specs-column-type-engine)
for why it's a different design, not a smaller version of the same one.

## Overview

Monday.com lets a board add an arbitrary typed column to any item. The
request behind this doc is the same capability, scoped to `projects` and
`tasks`: a tenant should be able to add "Client Sign-off Status" to every
task, or "Estimated Licensing Cost" to a project, without a Kaaj engineer
writing a migration.

This is Tier 2 of `docs/06-customization-model.md` — "extra attributes on
our entities," a mechanism that already exists and already has one working
consumer (ticketing). This spec extends it to `projects`/`tasks` with a
typed value store, rather than building the v2 spec's own polymorphic
column-type engine from scratch.

## What already exists

- `custom_field_definitions` — tenant-scoped field metadata: `entity_type`,
  `field_key`, `label`, `data_type`, `options`, validation, display order.
  Currently has rows for `entity_type = 'employee'` (3), `'ticket'` (6), and
  one unused example row for `'task'` (`client_billable`, boolean) that
  nothing reads.
- `projects.custom_fields` / `tasks.custom_fields` — JSONB columns, already
  on both tables, currently empty, currently unread by any app code.
- Ticketing's own custom fields: values live in `ticketing_tickets.custom_fields`
  JSONB, keyed by `field_key`, set through `ticketing/[id]`'s `setCustomFields`
  action. This is the ONE proven consumer of `custom_field_definitions` today
  — and it's untyped-JSONB-per-entity, not the typed value table this spec
  proposes. **Out of scope: this spec does not touch ticketing's existing
  mechanism.** It works, it's tested, and migrating it buys nothing this
  request asked for.
- No `CustomFieldInput.svelte` exists. Ticketing built its own rendering
  path rather than a shared component ever getting extracted.

## Why not the v2 spec's column-type engine

`module-project-management-v2.md` describes `column_definitions` +
`task_column_values.value JSONB`, with 30+ types including `formula` and
`mirror`. Phase 1 deferred this (`docs/23-project-management-phase1.md`) for
two concrete reasons that still apply:

- **`value JSONB` is exactly what `money/jsonb-is-text` exists to catch**
  (L41) — it verifies JSONB money by walking a *registered list of paths*,
  which a column whose shape depends on a runtime `column_type` can't be put
  on. `information_schema.columns`-driven guards (`money/numeric-not-float`)
  can't see inside it at all.
- **Formula columns are an eval surface.** The spec's own reference
  implementation is a tenant-authored expression evaluated at read time —
  in multi-tenant SaaS, that is not a Phase-3 add-on either.

This spec sidesteps both: no column type here evaluates an expression, and
every numeric type gets its own real, typed Postgres column instead of a
polymorphic JSONB one.

## Storage design

### Rejected: one table per data type

Considered and rejected in favor of the design below. A `task_custom_money_field`,
`task_custom_date_field`, etc. would make each type's storage fully native
(real `NUMERIC`, real `DATE`, automatically covered by
`money/numeric-not-float`) — a genuine win. But it multiplies the ongoing
`./check` surface by the number of types (RLS policy × N, scale
classification × N, fixture rows × N, constraint registry × N), and worse,
it turns "add a new field TYPE" back into a migration — which defeats the
actual point of Tier 2 ("adding a field for a customer becomes a row
insert, not a deployment," docs/06). Rejected on that basis.

### Adopted: one value table, several typed columns

```sql
CREATE TABLE custom_field_values (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    field_definition_id  UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,

    -- Polymorphic owner, same shape as documents/document_folders — this
    -- spec's entity_type is 'project' | 'task' only; ticketing/employee
    -- custom fields stay on their own existing JSONB columns.
    entity_type          TEXT NOT NULL,
    entity_id            UUID NOT NULL,

    -- Exactly one of these is set, matching field_definition_id's data_type.
    value_text           TEXT,
    value_number         NUMERIC(18,4),  -- rate/quantity scale (CLAUDE.md's "Money" table)
    value_money          NUMERIC(15,2),  -- MONEY scale — deliberately a separate column from value_number
    value_date            DATE,
    value_boolean         BOOLEAN,
    value_multi            JSONB,        -- array of option value-keys, for multiselect

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by            TEXT NOT NULL,

    CONSTRAINT custom_field_values_one_typed_value CHECK (
        num_nonnulls(value_text, value_number, value_money, value_date,
                     value_boolean, value_multi) = 1
    ),
    CONSTRAINT custom_field_values_unique UNIQUE (field_definition_id, entity_type, entity_id)
);

CREATE INDEX idx_custom_field_values_entity
    ON custom_field_values (tenant_id, entity_type, entity_id);
```

**`value_number` and `value_money` are deliberately two columns, not one.**
CLAUDE.md's money section is explicit that money (`numeric(15,2)`) and
rates/quantities (`numeric(18,4)`) are two scales chosen deliberately, never
conflated. A custom "Estimated Hours" field and a custom "Estimated
Licensing Cost" field are different `data_type`s (`number` vs `money`)
writing to different columns, exactly like `projects.estimated_hours` vs
`projects.budget` already are.

**`num_nonnulls(...) = 1` is a direct reuse of an existing idiom** —
`documents_uploader_check` on the `documents` table is the same shape
(`num_nonnulls(uploaded_by_employee_id, uploaded_by_contact_id) = 1`), just
two columns instead of six.

**No `currency` column on the value row.** A custom money field is
denominated in its parent entity's own currency (`projects.currency`,
inherited by a task through its project) — there is no per-field currency
picker to build, and no risk of a custom field silently disagreeing with the
project's own currency.

### `custom_field_definitions` extensions

- `entity_type` gains real usage for `'project'` and `'task'` (project
  management's `tasks`, via the definitions-management screen below — the
  existing example `client_billable` row can become the first real one, or
  be superseded; it's fixture data, not depended on by any code).
- `data_type` vocabulary, extending docs/06's current
  `text|number|date|boolean|select|multiselect`, adds **`money`**. No
  separate `status` type — see below.
- `options` (`[{value, label, label_i18n?}]`) gains a **`tone`** key for
  `select`/`multiselect` fields: `[{value, label, label_i18n?, tone}]`. See
  [Color](#color-a-fixed-palette-not-free-form) below. Validated in the app
  when a definition is written (same as every other JSONB shape in this
  schema — `checklist_items`, `recurrence_rule` — none of which are
  DB-validated either); not a CHECK constraint, to avoid a function-based
  JSONB CHECK for what a form-level validator already covers.

**Status is not a separate storage type.** Monday distinguishes Status
(ordered workflow state, `done` flag per label) from Dropdown (unordered
classification) because its automation engine keys on the distinction. Kaaj
has no automation engine yet (deferred, `docs/23-project-management-phase1.md`).
A tenant calling a field "Status" vs "Category" is a difference in `label`,
not `data_type` — both are `select`, storing into `value_text`. Revisit if
an automation engine is ever built and needs to trigger on a status
transition specifically.

## Color: a fixed palette, not free-form — settled

Tenants do not supply a hex code. The reason is on the record in this
codebase: `badge-soft` measured 1.32:1–3.27:1 contrast in the light theme
before anyone checked (L73) — exactly the failure mode a tenant-supplied
color reopens, except now nobody on this team even picked the color.

**Not an extension of `StatusBadge`/`Tone`.** `status-tone.ts` is explicit
in its own docstring that `Tone` is "the five tones a status can carry —
**meaning only**": `positive`/`caution`/`critical`/`progress`/`neutral` each
encode a real semantic ("settled and safe," "failed or refused"). A custom
field option like a region ("APAC") or a service line ("Web") has no such
meaning — forcing it through `Tone` would either misuse a meaningful tone
for a meaningless label, or require inventing tones that aren't meanings at
all, corrupting the type for every other caller that relies on it actually
meaning something.

**New, sibling component: `LabelBadge.svelte` + a `LabelColor` type**,
structurally identical to `StatusBadge` (a `Record<LabelColor, string>` of
complete, solid class strings — never assembled) but semantically separate:
decoration, not status. Eight values — daisyUI's own native color roles,
solid style, matching the "solid not soft" rule already established:

| `LabelColor` | Class | AA status |
|---|---|---|
| `success` | `badge badge-success` | already measured (`StatusBadge`'s `positive`) |
| `warning` | `badge badge-warning` | already measured (`StatusBadge`'s `caution`) |
| `error` | `badge badge-error` | already measured (`StatusBadge`'s `critical`) |
| `info` | `badge badge-info` | already measured (`StatusBadge`'s `progress`) |
| `primary` | `badge badge-primary` | **not yet measured in THIS theme — required before shipping** |
| `secondary` | `badge badge-secondary` | **not yet measured — required before shipping** |
| `accent` | `badge badge-accent` | **not yet measured — required before shipping** |
| `neutral` | `badge badge-neutral` | **not yet measured — required before shipping** |

The first four reuse `StatusBadge`'s already-verified classes (a different
component is fine reusing the same underlying daisyUI class — the
measurement is a property of the class+theme pair, not of which Svelte
component emits it). The last four are daisyUI defaults nobody in this
codebase has measured against `corporate`/`night` yet — a fresh grep
confirms zero existing use of `badge-primary`/`-secondary`/`-accent`/`-neutral`
anywhere in `apps/web/src`. **Do not assume they pass** — that's the exact
mistake L73 documents (assuming a daisyUI default holds without checking
the specific theme). Measure via canvas pixel read before this ships, same
method as every other color decision in this app.

The field-definition picker offers exactly these 8 named roles (shown to
the tenant as plain color swatches, not "primary"/"accent" jargon), nothing
else.

## API / application surface (new)

- **`$lib/server/custom-fields/custom-fields.repo.ts`** (new) —
  - `definitionsFor(tx, entityType)` — a project/task's available field
    definitions, ordered by `display_order`.
  - `valuesFor(tx, entityType, entityIds)` — batched, one query for a set of
    entities (same "no query inside a loop" discipline as
    `comments.commentsForProject`/`documents.forEntities` from Phase 2).
  - `setValue(tx, fieldDefinitionId, entityType, entityId, value, actorId)`
    — upsert on the unique `(field_definition_id, entity_type, entity_id)`,
    writing to whichever typed column the definition's `data_type` selects.
  - `createDefinition` / `archiveDefinition` — admin-side management,
    `entity_type` restricted to `'project' | 'task'` here (ticketing keeps
    managing its own through its existing screen).
- **`$lib/components/CustomFieldInput.svelte`** (new — described in docs/06,
  never built) — switches on `data_type`: text input, number input
  (`inputmode="decimal"`), money input (`inputmode="decimal"`, suffixed with
  the parent project's currency, never `type="number"` — L-money rules
  apply to a custom money field exactly as they apply to a system one), date
  input, checkbox, select, multiselect. Ticketing is not required to adopt
  this — it may, later, as a separate cleanup.
- **`$lib/components/LabelBadge.svelte`** (new) — resolves a stored value
  key through the definition's `options` to a label + `LabelColor`, renders
  via its own class table. See [Color](#color-a-fixed-palette-not-free-form--settled).
- **A definitions-management screen at `/settings/project-management`**
  (settled — see below) — CRUD for field definitions, `entity_type`
  restricted to `'project' | 'task'` here (ticketing keeps managing its own
  through its existing screen).
- **Wiring:** `CustomFieldInput` rendered inline on `/projects/[id]`'s task
  rows/edit form and `/projects/+page.svelte`'s project create/edit form,
  reading `definitionsFor`/`valuesFor` from each page's existing `load()`.

## The financial-calculation boundary still applies, unchanged

A custom `money` field is typed and validated now — `NUMERIC(15,2)`, no
float, automatically covered by `money/numeric-not-float`. That is a
storage-correctness improvement, not a change to the governance rule:
**custom fields must never feed payroll or accounting calculations**
(docs/06, "The financial-calculation boundary"). A custom money field may be
captured and *displayed* (via `money()`, never `approxMoney()` — an
ad-hoc tracked figure deserves the same exactness discipline as a system
one), but must never be read by the accounting or payroll modules, never
summed into `projects.budget`/`actual_cost`, and never appear on an invoice
line. Enforce in code review, same mechanism as the existing rule: any read
of `custom_field_values` inside `lib/server/accounting/` or
`lib/server/payroll/` is a defect.

## `./check` gates this will need to satisfy

- **RLS:** bare `tenant_isolation` on `custom_field_values` — no extra
  row-visibility policy, matching `projects`/`tasks`' own "firm-wide, no row
  policy" decision (Phase 1). A custom field on a firm-wide-visible task is
  itself firm-wide-visible; there's no narrower boundary to enforce.
- **Scale classification:** `custom_field_values` is `SCALE_SENSITIVE` —
  grows with tasks × fields × tenants, unbounded over the life of a tenant.
  `custom_field_definitions` stays `NOT_SCALE_SENSITIVE` (bounded by how
  many fields an admin defines, not by row volume).
- **Fixtures:** at least one real, non-placeholder value per `data_type`
  (text/number/money/date/boolean/multiselect) — six rows minimum, each
  exercising a genuinely different typed column, so "fixtures are
  complete"'s no-NULL-column rule has real coverage rather than a sweep
  filler (L90's pattern — CLAUDE.md is explicit this has already recurred
  three times in this codebase; a fourth in a brand-new table would be an
  avoidable repeat).
- **Constraints:** `custom_field_values_unique` and the FK to
  `custom_field_definitions` both belong in `constraints.ts`'s registry once
  a form can trip them (a race between two writers setting the same field on
  the same entity at once).
- **Audit:** provisionally `NOT_AUDITED` for both writing a value and
  creating/archiving a definition — matching `settings/ticketing`'s existing
  `addCustomField`/`archiveCustomField` ("a field definition, not a value
  belonging to any person") and `addComment`'s reasoning (changes nobody's
  money, employment or rights in the ledger sense — the financial-boundary
  rule above is precisely what keeps a custom money field out of anything
  that WOULD need an audit trail). Flagged as a judgment call worth a second
  look before implementation, the same way Phase 2's `saveAsTemplate`
  classification was.

## Still out of scope

Unchanged from Phase 1/2's own reasoning: formula/mirror columns
(eval-surface), relations/"Connect Boards" (a real cross-entity reference
type is a bigger design than this spec — Kaaj's own system fields already
cover the highest-value cases: `client_id`, `assigned_to`,
`project_manager_id`), the automation engine, dashboards, and
project-visibility RLS. `long_text` (a textarea variant of `text`) is a
free extension of this design if wanted — same `value_text` column, no
schema change — but isn't in this spec's initial field-type list unless
asked for.

**Future addition, not built: aggregating a `number`/`money` custom field
up from tasks to their project.** Confirmed directly (no `SUM`/aggregation
query anywhere in `custom-fields.repo.ts`, and neither
`projects.repo.ts` nor `objectives.repo.ts` references
`custom_field_values`): a project-level total across its tasks' custom
field values does not exist today, and nothing in this spec ever covered
it — only storing and displaying one value per entity. Two open design
questions to resolve before building it, not implementation details to
default silently:

- **Live vs. stored.** Recomputed on every read
  (`SUM(...) FROM custom_field_values WHERE field_definition_id = ... AND entity_id = ANY(...)`),
  or stored and refreshed the same "`SET x = (SELECT ...)`, never
  incremented" way `task_count`/`actual_hours` already are (CLAUDE.md's
  denormalised-counter rule)? And a task-level field only aggregates
  cleanly to its project if the SAME field definition is meant to apply
  consistently across every task in it — worth deciding explicitly, not
  assuming.
- **Where the financial-calculation boundary actually sits, for `money`
  specifically.** Summing a descriptive custom money field into a
  project-level *display* total is arguably still "descriptive" — it never
  touches `projects.budget`/`actual_cost`, never reaches accounting or
  payroll. The moment that rolled-up figure feeds anything real — a budget
  check, an invoice line, a profit calculation — that is exactly what
  `docs/06-customization-model.md`'s boundary forbids. That line needs to be
  drawn explicitly in whatever spec builds this, the same way this
  document drew it for the base feature.

## Settled

1. **Screen placement: `/settings/project-management`, flat, no nested
   dynamic segment.** Ticketing nests under `[businessAreaId]` because a
   business area is a real sub-resource with its own settings; project
   management custom fields have no equivalent sub-scoping — just two
   `entity_type`s. One page, two sections ("Project fields" / "Task
   fields"), not a per-entity route.
2. **No reorder control in v1.** An option's position is its position in
   the `options` JSONB array, set by insertion order at creation time.
   Reordering an existing field's options isn't supported yet — matches
   CLAUDE.md's "don't build beyond what's asked"; add a control later if a
   real need shows up (delete-and-re-add is the workaround until then).
3. **`NOT_AUDITED` confirmed, both for definition CRUD and value writes** —
   matches `settings/ticketing`'s existing `addCustomField`/`archiveCustomField`
   precedent, and `addComment`'s reasoning for values. The financial-boundary
   rule (custom fields never feed real calculations) is precisely what
   keeps a custom money field out of needing a trail in the first place.
4. **Palette confirmed at 8** — see
   [Color](#color-a-fixed-palette-not-free-form--settled) above. Four
   daisyUI roles still need a real AA measurement against `corporate`/`night`
   before shipping; that measurement is a required implementation step, not
   optional polish.

---

## What shipped

One migration (`20260926150000_custom_field_values.sql`): `custom_field_values`
exactly as specced, plus `'money'` added to `custom_field_definitions`'s
`data_type` CHECK. No `'status'` type, no relation type — unchanged from the
spec above.

**One deviation from the spec above, found by the database, not planned:**
`setValue`'s "clear a value" path was designed as a `DELETE`. The very first
test against the real database refused it — `permission denied for table
custom_field_values`. `app_user` has no `DELETE` grant anywhere in this
schema (`20260830120000_append_only.sql`: this app never hard-deletes,
full stop — an established rule this spec's first draft simply didn't check
against). Fixed by relaxing `custom_field_values_one_typed_value` from
`= 1` to `<= 1` and having a clear UPDATE every typed column to `NULL`
instead; `valuesFor` excludes an all-`NULL` row so "has a value" stays a
simple question for every caller. Documented here rather than silently
edited into the spec above, because it's exactly the kind of thing worth
knowing to check FIRST next time a value-clearing path is designed.

**The 8-role `LabelColor` palette is implemented but not yet AA-verified**
for the four unmeasured roles (`primary`/`secondary`/`accent`/`neutral`) —
that measurement (canvas pixel read against `corporate` and `night`, per
CLAUDE.md's colour-measurement rule) was not performed this session and
remains a real open item before those four roles should be trusted. The four
reused `StatusBadge` roles (`success`/`warning`/`error`/`info`) are already
covered by its own existing measurement.

**Options syntax, settled during implementation, not specced above:** the
settings screen's options textarea accepts `Label` or `Label|tone` per line
(tone optional, round-robins from the palette when omitted) — a small,
concrete resolution of "no reorder control in v1" above: a tenant picks the
colour at creation time via text, not a picker widget, and re-ordering or
re-colouring means editing the whole options list (archive and re-add).

**Wiring:** `/settings/project-management` (flat, two sections — not nested
like `settings/ticketing/[businessAreaId]`, since there's no per-field
sub-resource the way a business area is one) manages definitions.
`/projects/[id]` renders `CustomFieldInput` for both the project itself (a
"Fields" button beside "Save as template") and each task (a "Fields" icon
alongside Dependencies/Comments/Files/Log-time) — new actions
`setProjectCustomFields`/`setTaskCustomFields`, `NOT_AUDITED`, gated on the
same `projects.write` boundary as everything else on that page. `/projects`
itself is not wired — custom fields are set after a project exists, via its
own edit surface, same as ticketing's `setCustomFields` pattern.

## Test plan

Same DONE/PARTIAL/PENDING discipline as `docs/23`/`docs/25`.

1. **DONE.** `custom-fields.repo.test.ts` (11 tests, against the real
   database): definitions CRUD (slugify, display_order, soft archive);
   `setValue`/`valuesFor` round-trip every one of the six typed columns,
   never a shared one; an empty value clears to `NULL` rather than deleting
   (the DELETE-grant finding above, asserted directly); refuses a value for
   a missing/wrong-entity-type definition; refuses a `select`/`multiselect`
   value outside the definition's own `options`; `valuesFor` is batched and
   excludes an all-`NULL` row.
2. **DONE.** `documents.repo.test.ts`-adjacent coverage isn't needed here —
   task files (Phase 2) and custom fields are independent features sharing
   no code.
3. **DONE, live**, in a real browser against `pnpm dev`: added a `select`
   field ("Risk Level") with two coloured options through
   `/settings/project-management`, confirmed it appeared with the right
   options; opened a project's Fields modal and confirmed the fixture's own
   `money` (`4200.00`, currency-prefixed) and `multiselect`
   (`Web`/`Data` checked, `Mobile` not) values rendered correctly; set
   `Risk Level` to "High," saved, reopened the modal, confirmed it persisted;
   opened a task's Fields modal and confirmed fixture `text` (`APAC`) and
   `date` (`2026-02-10`) values rendered correctly, with `number` and
   `select` correctly blank where the fixture never set them; set the
   `boolean` field and a `number` field (`3.25` → stored and redisplayed as
   `3.2500`, confirming the `numeric(18,4)` scale), saved, reopened,
   confirmed both persisted. No console errors at any point.
4. **DONE.** `./check` passes in full (25/25), including the new
   `custom_field_values` entries in scale classification, the constraint
   registry (`FORM_WRITTEN`, `CANNOT_BE_TRIPPED`, and the one genuinely
   form-reachable UNIQUE), and the new `NOT_AUDITED` register entries.
5. **PENDING.** The four unmeasured `LabelColor` roles' AA contrast — see
   "What shipped" above. Do not add them to a real tenant-facing picker
   recommendation without measuring first.
6. **PENDING.** The team-membership/RLS decision recorded in
   `docs/27-project-management-gap-tracking.md` is unrelated to this feature
   and remains unbuilt — noted here only so it isn't mistaken for a
   dependency this feature is blocked on. It isn't.

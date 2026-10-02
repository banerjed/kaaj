# Coding Guidelines

This file gives the patterns to write code in Kaaj, with real GOOD and BAD
examples. This file teaches the pattern. **CLAUDE.md, `.claude/rules/*.md` and
`docs/*.md` are the authority** for the rules of this repository, and
`./check` enforces most of these rules. If this file and `./check` do not agree, `./check` is correct and
this file is out of date.

Read this file before you write a new route, a new table or a new form. You do
not have to derive again a rule that CLAUDE.md already states. This file shows
how code that obeys a rule looks in practice, and how code that does not obey
it looks. Most of the entries below are patterns that failed in this codebase
at least one time. `docs/10-lessons-learned.md` records these failures, and
this file refers to them as `Lnn`.

---

## The checklist

- **Authorize before you write, at both layers.** In each action, put
  `requireCan()` before the first `withTenant(...)` call. *Also* add an RLS
  policy that refuses the row when the guard in the application is absent.
  One layer without the other is not defense in depth.
- **`withTenant` takes the actor, never a bare tenant id.** Use
  `actorFrom(locals)`, not `locals.tenantId`. A bare id passes tenant
  isolation. Then a visibility policy returns zero rows, with no error.
- **A new table gets `tenant_isolation` immediately, and a decision about a
  visibility policy before you release it.** Do not wait until the table
  "needs" a decision. The choice between tenant-only and role-aware visibility
  is a real design decision. See `docs/15-row-level-visibility.md`.
- **Never recreate an RLS policy with `DROP`/`CREATE`.** If you do not write
  `AS RESTRICTIVE`, `FOR`, `TO` and `WITH CHECK` again, Postgres removes them.
  The statement succeeds with no error. This caused a cross-tenant disclosure
  of 12 rows one time already (L63).
- **Money is a string, end to end.** Use `NUMERIC` in Postgres, `string` in
  TypeScript and `inputmode="decimal"` in the browser. Never use `Number()` on
  an amount. Never use `type="number"` for an amount. Never add or subtract
  amounts in JavaScript.
- **A `timestamptz` renders in the zone of the *office*; a `DATE` renders in
  UTC.** Never use the zone of the user. Never use a bare `::date` cast on a
  timestamp.
- **Never hardcode a currency-to-locale or country-to-locale mapping.** Read
  the real value from `firm_locations` through `localeForCurrency`. We released a ternary that knew only GBP and INR, and we
  had to correct it three times.
- **A write that someone may have to justify later gets an audit entry, in the
  *same* transaction as the write.** If the application writes the entry
  after the write, the trail records what the application believed occurred.
  It does not record what occurred (L40).
- **An error that goes to a log goes through `safeError`, never raw.** The
  `detail` of a `PostgresError` can contain the row that caused the error.
- **Never assemble a Tailwind class name.** The static analysis of Tailwind
  cannot see `` `badge-${size}` ``. Tailwind does not generate the class, and
  no error occurs. Map each state to a complete string.
- **Every field that a form action writes goes through `FormReader`.**
  `required` and `type` are browser UX, and a crafted POST does not have them.
  The reader is the last defense before the type of the column itself.
- **A refused write gives a sentence that names the field, on a form that is
  still on screen.** Do not return `fail(400)` and render nothing. Do not do a
  full-page reload that discards what the user typed (L68).
- **On a request path, nothing reads more rows than it returns, apart from a
  capped count.** First select the rows of the page, then join other data to
  these rows only. Read an aggregate that is large by nature from a
  precomputed table. Never calculate it again for each request.

---

## 1. Authorizing a new API call — read and write

Each `(app)` route has a `load` function and form actions. In each of these
places, a user can get to a row that they must not see. Two layers protect
these places, and each layer answers a different question:

- **`can()` / `requireCan()`** (`$lib/server/auth/can`) answers *"can this
  actor do this operation on this row?"* This layer examines a permission.
- **RLS** (the visibility policies of the database) answers *"do these rows
  exist for this actor?"* RLS gives this answer also when the application did
  not remember to ask.

If the table has a visibility policy, the route needs both layers. If the
table is tenant-only by design, the route needs only the guard in the
application (see §2). This convention prevents one type of incident: code
that relies on only one layer. For weeks, the accounting tables were
tenant-only in the database, but the application was already correct. Thus,
one query path without `requireCan` could show each invoice of the
organization to all users of the tenant.

**GOOD**: the example below shows:

- a read that a permission guard controls
- a write that a permission guard controls, with the guard *before* the
  transaction opens
- a write that records an audit entry
- a constraint refusal that becomes a message for one field

```ts
// +page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "widgets.read")) error(403, "You cannot see widgets.")

  return withTenant(actorFrom(locals), async (tx) => ({
    widgets: await widgets.list(tx),
  }))
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "widgets.write") // <- BEFORE any write, not after

    const f = new FormReader(await request.formData())
    const name = f.text("name", { required: true, max: 255 })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await widgets.create(tx, { name: name! })
        await audit.record(tx, ctx, {
          action: "create",
          entityType: "widgets",
          entityId: created.id,
          module: "widgets",
          changes: { name: { from: null, to: name } },
        })
        return { created: created.id }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}
```

**BAD**: three real failure modes. `./check` found each of them one time:

```ts
// 1. No guard at all — a plain tenant check is not an authorization check.
create: async ({ request, locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  // requireCan(...) missing entirely — verify-authz.mjs fails the build on this.
  return withTenant(actorFrom(locals), async (tx) => {
    await widgets.create(tx, { name: formString(await request.formData(), "name") })
  })
}

// 2. Guard exists, but AFTER the transaction opens — not a guard.
create: async ({ request, locals }) => {
  return withTenant(actorFrom(locals), async (tx) => {
    requireCan(contextFrom(locals), "widgets.write") // too late; verify-authz.mjs's
    await widgets.create(tx, {/* ... */})            // authz/guard-before-write catches this
  })
}

// 3. A bare tenant id instead of the actor.
return withTenant(locals.tenantId, async (tx) => ...) // row-visibility policies
                                                        // deny this — silent zero rows (L21)
```

---

## 2. Row-level security for a new table

Each table that a tenant owns always gets `tenant_isolation`. For each new
table, there is a second question: does the table also need a visibility
policy? **If a colleague in the same tenant reads this row, does real harm
occur?** Examples of harm are pay, PII and the financial records of the
organization. Or is the row directory data that all users in the tenant can
already see? For the full criterion and the current list of tiers, see
`docs/15-row-level-visibility.md`.

**GOOD**: the example below shows:

- tenant isolation, always
- a role-aware RESTRICTIVE policy in addition, if the table needs one
- the full text of each modifier
- a helper function that parses the claim and fails closed (never parse the
  claim inline)

```sql
ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE widgets FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON widgets
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- Only if this table needs role-aware visibility on top of tenant isolation:
CREATE OR REPLACE FUNCTION app.reads_all_widgets() RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE claims jsonb;
BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    RETURN coalesce(
        (claims #>> '{app_metadata,role}') IN ('owner', 'firm_admin')
        OR (claims #> '{app_metadata,functional_roles}') ?| ARRAY['widget_admin'],
        false);
EXCEPTION WHEN OTHERS THEN RETURN false; -- fail closed on a malformed claim
END $$;

CREATE POLICY widget_visibility ON widgets AS RESTRICTIVE FOR SELECT
USING (
  (SELECT app.reads_all_widgets())
  OR owner_id = (SELECT app.current_employee_id())
);
```

**BAD**: three shapes. Each of them caused a real incident in this codebase:

```sql
-- 1. Parsing the claim inline instead of through a fail-closed function.
-- A malformed claim raises INSIDE the policy expression (no EXCEPTION
-- handler is possible there) — a 500, not an empty page, and only on
-- SOME query plans (L62).
CREATE POLICY widget_visibility ON widgets AS RESTRICTIVE FOR SELECT
USING (
  (current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata,role}')
    IN ('owner', 'firm_admin')
);

-- 2. Recreating a policy with DROP/CREATE, restating only the USING clause.
-- This SUCCEEDS and silently drops AS RESTRICTIVE, turning "must satisfy
-- both tenant_isolation AND widget_visibility" into "either one" —
-- a 12-row cross-tenant leak, once, from exactly this (L63).
DROP POLICY widget_visibility ON widgets;
CREATE POLICY widget_visibility ON widgets
USING (owner_id = (SELECT app.current_employee_id()));
-- Missing: AS RESTRICTIVE, FOR SELECT, the reads_all_widgets() OR-arm.

-- 3. A protected column falling back to an unprotected cache.
-- RLS hides the ROW; COALESCE puts the value back anyway.
SELECT COALESCE(wp.protected_value, w.cached_value_unprotected) FROM widgets w
  LEFT JOIN widget_protected wp ON wp.widget_id = w.id -- (L47's exact shape)
```

Run `./check --db` immediately after each change to an RLS policy.
`verify-rls.sql` runs tests on each table in two directions: the refused
actor gets no rows, and the permitted actor still gets rows. This script is
the step that finds #2 above.

---

## 3. Money and currency

Use `NUMERIC` in Postgres and `string` in TypeScript, on the full path from
the browser to the database and back. A float at any point on that path loses
digits with no error. A measurement on this schema shows this: if Postgres
stores `99999.99` as `real`, it returns `100000`.

**GOOD**:

```ts
// Reading a form field — never Number(), stays a string:
const amount = f.decimal("amount", { scale: 2, required: true })

// Comparing two money strings — never through Number():
if (compareDecimal(amount!, "0") <= 0) f.reject("amount")

// Displaying it — through $lib/format.ts, nowhere else:
money(invoice.total, invoice.currency, locale) // "$1,234.56"
approxMoney(dashboardTotal, "USD", locale)     // "$1.2M" — dashboards ONLY, never a payslip
```

```svelte
<!-- inputmode="decimal", never type="number" (which round-trips through a
     browser float) -->
<input name="amount" inputmode="decimal" class="input" />
```

**BAD**:

```ts
// Parses through a float64 — silent precision loss on any real amount.
const amount = Number(formData.get("amount"))

// Arithmetic in JS instead of SQL — this is string concatenation, not addition.
const total = invoiceLine1.amount + invoiceLine2.amount

// A money column typed as a float.
// column: total  real  <- ./check's money/numeric-not-float invariant fails this
```

```svelte
<!-- Rounds through a float in the browser before it ever reaches the server. -->
<input name="amount" type="number" step="0.01" />
```

Money in JSONB (the `earnings`/`taxes` documents of payroll) needs the same
rules and one more rule: **store `"95000"`, never `95000`**. Postgres keeps a
JSON number in JSONB exactly. When JavaScript reads the number back, the
number becomes a float64, and a float64 can lose digits. No `./check` step
that reads the schema can see inside a JSONB column, so no step finds this
bug. For the full list of JSONB money paths that this rule applies to, see
CLAUDE.md § Money.

---

## 4. Dates and timezones

A `timestamptz` is an instant. The same instant is a 9am start in Bangalore
and a 10:30pm finish in New York. A `DATE` has no zone. The bug is to use the
wrong one of `instant()` / `calendarDate()` for a column. The two functions
exist so that you do not have to remember the rule each time.

**GOOD**:

```ts
// timestamptz -> the OFFICE's zone, never the viewer's, never bare UTC:
instant(shift.clock_in_time, { locale, currency, timezone: office.timezone })

// DATE -> UTC, always (a hire date is that day everywhere):
calendarDate(employee.hire_date, locale)

// Deriving a LOCAL date from a timestamptz -> AT TIME ZONE, never ::date:
// SELECT (clock_out_time AT TIME ZONE l.timezone)::date AS attendance_date
```

**BAD**:

```ts
// The viewer's browser zone, not the office's — wrong for anyone not
// physically in that office.
new Date(shift.clock_in_time).toLocaleTimeString()

// A ::date cast on a timestamptz — a shift ending 11pm in New York is
// 4am UTC the NEXT day, so this silently reports the wrong day (L35).
// SELECT clock_out_time::date AS attendance_date

// Comparing a DB timestamp to the app server's clock — different machines,
// and a Docker VM's clock drifts across a host sleep.
if (row.created_at.getTime() > Date.now() - 3600_000) { /* ... */ }
```

---

## 5. Locale and international formatting

**Never hardcode which countries or currencies exist.** A ternary such as
`currency === "GBP" ? "en-GB" : currency === "INR" ? "en-IN" : "en-US"` looks
safe. But this shape went into production three times in this codebase, and
each time a person had to find it and correct it. Each time, it formatted a
market incorrectly (or did not format it) with no error, because the ternary
did not know that market. The real locale of each office is already in
`firm_locations` (the `country`, `currency` and `locale` columns). Read the
locale from there.

**GOOD**:

```ts
// +page.server.ts — load the real per-office data alongside whatever else
// the page needs:
locations: await locationsRepo.list(tx),
```

```svelte
<script lang="ts">
  import { localeForCurrency } from "$lib/format"
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const localeFor = (currency: string) =>
    localeForCurrency(data.locations, currency, tenantLocale)
</script>
{money(invoice.total, invoice.currency, localeFor(invoice.currency))}
```

To add a new market (for example, a French or German office), add only the
`firm_locations` row. No application code changes, and no application code
must "learn" about the new country.

**BAD**:

```ts
// A closed list masquerading as generality. Correct for exactly the
// countries someone thought of when they wrote it, silently wrong (falls
// through to "en-US") for every other one.
const locale =
  currency === "GBP" ? "en-GB" : currency === "INR" ? "en-IN" : "en-US"
```

**Translated *data* that a tenant configures** is a different subject from UI
text. Examples are the name of an organization in more than one language, and
the name of a benefits package. This data already has a real pattern:

- a `name_i18n JSONB` column next to the plain `name`, with one key for each
  locale
- the `i18n()` reader of `FormReader` reads the column
- the reader limits the keys to `supported_locales`

For a real example, see `firm_locations.name_i18n` or
`payroll_pay_schedules.name_i18n`.

**UI text i18n does not exist in this codebase yet.** UI text i18n shows each
label that the user reads in the language that the user selects. The
application has no message-catalog library and no locale switcher. Today, each
string in each `.svelte` file is in English.

Until a full design exists, do not make a local translation mechanism for one
page only. That mechanism makes a shape that the conventions of this codebase
prevent: "two copies of one concern, and they disagree". For the rule, see "a
vocabulary lives in one place" in CLAUDE.md (`L57`).

Do full UI-text i18n as a separate, basic piece of work with its own design.
The design must decide the library, whether the language preference is per
user or per tenant, and how to extract the strings. Do not add i18n one page
at a time.

---

## 6. Audit logging

Some writes are writes that a user can later ask you to justify: a pay change,
an approval, a role grant, an erasure. Each of these writes adds an entry to
`audit_log`, in the **same transaction** as the change. Do not write the entry
after the change, on a second connection, or with an error that the code
ignores. If you do, the audit trail records what the application *believed*
happened. Then the trail and the real data are different exactly when a user
asks why (L40).

Nobody can delete rows from `audit_log`, so both directions are important:

- If an action must audit and does not, the trail has a gap, with no error.
- If an action audits and must not, the result is permanent noise that
  nobody can remove.

`apps/web/src/lib/server/audit/register.ts` classifies each write action in
one list or the other. If an action is in neither list, `./check` fails.

**GOOD**:

```ts
return await withTenant(actorFrom(locals), async (tx) => {
  const before = await widgets.byId(tx, id) // read the OLD value first
  const updated = await widgets.update(tx, id, { name: newName })

  await audit.record(tx, ctx, {           // same `tx` — same transaction
    action: "update",
    entityType: "widgets",
    entityId: id,
    module: "widgets",
    changes: audit.diff(before, updated, ["name"]), // only fields that MOVED
  })

  return { saved: true }
})
```

**BAD**:

```ts
// 1. Outside the transaction — if the audit write fails, or the process
// dies between the two, the change happened and nothing recorded it.
await widgets.update(tx, id, { name: newName })
await tx.commit()
await audit.record(pool, ctx, { /* ... */ }) // separate connection entirely

// 2. A row dump instead of what changed — burying the one field that
// moved among twenty that didn't is the same as not recording it, in a
// table that can never be pruned.
await audit.record(tx, ctx, {
  action: "update", entityType: "widgets", entityId: id, module: "widgets",
  changes: { ...updated }, // the WHOLE row, as a value dump, not {from, to}
})

// 3. A JSON number instead of a string — this table can never be corrected
// after the fact, and a JSON number inside JSONB round-trips through
// JavaScript as a lossy float64 (L41).
changes: { amount: { from: 148000, to: 152000 } } // should be "148000"/"152000"
```

---

## 7. Error handling

Send an error to a log or to the browser only through an allowlist. Never send
the raw error. The `detail`/`where`/`query` fields of a `PostgresError` can
hold the row that caused the error. For example, if a date of birth fails the
type validation, the date of birth IS the error message. `handleError` is the
only place where SvelteKit lets that error go to a log.

**GOOD**:

```ts
// A write the database can refuse — turn it into a field-level message,
// never let it become an unhandled 500 with the form's contents gone (L66):
try {
  return await withTenant(actorFrom(locals), async (tx) => { /* ... */ })
} catch (e) {
  const refused = constraintFailure(e) // keys on constraint_name, not message text
  if (refused) return refused
  throw e // an UNREGISTERED constraint should still crash loudly — that's
          // what gets it registered, rather than hidden behind a generic message
}

// Anything that reaches a log goes through the allowlist:
log.error({ id, msg: message, error: safeError(e) }) // never `error: e` directly
```

**BAD**:

```ts
// The raw error, straight to a log — `e.detail` may be a row's contents.
console.error(e)
log.error({ error: e })

// A shape check instead of a real parse — accepts 2026-13-45, which a Date
// cast then silently rolls into a real (wrong) date with no error (L67).
if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) { /* looks like a date; isn't validated as one */ }

// Swallowing every failure the same way, including ones that should crash:
try {
  await widgets.update(tx, id, input)
} catch {
  return fail(400, { message: "Something went wrong." }) // no field named,
                                                            // no distinction between
                                                            // a refusal and a real bug
}
```

Every *unexpected* error gets an id. `handleError` makes the id, writes the
error to the log with that id, and returns `{ id, message }`. SvelteKit
replaces the real message before the message gets to the browser. Without the
id, a bug report has nothing that we can search for.

---

## 8. UI code

Before you say that UI work is complete, compare each new page with **the
Nexus reference** (<https://nexus.daisyui.com/dashboards/ecommerce>). Compare
the spacing, the density, the empty states and loading states, and the
behavior of the shell at each breakpoint.

`docs/07-app-provenance.md` records each intentional difference between this
application and Nexus. Two examples are solid badges instead of `badge-soft`,
and no lakh/crore code, because `Intl` already has that knowledge. Before you
"correct" a difference, examine that file. The difference can be a decision
that a measurement supports.

**Never assemble a class name.** Tailwind reads the *source text* to find
which classes it must generate. Tailwind cannot evaluate a template
expression. Thus, Tailwind does not generate an assembled class, and the
element shows with no style and with no error.

**GOOD**:

```svelte
<script lang="ts">
  const BADGE: Record<Tone, string> = {
    positive: "badge badge-sm badge-success",
    caution: "badge badge-sm badge-warning",
    critical: "badge badge-sm badge-error",
    progress: "badge badge-sm badge-info",
    neutral: "badge badge-sm badge-ghost",
  }
</script>
<!-- Or: use the shared component instead of a local BADGE table -->
<StatusBadge tone={statusTone(invoice.status)}>{invoice.status}</StatusBadge>
```

**BAD**:

```svelte
<!-- Invisible to Tailwind's static analysis. Renders with NO badge classes
     at all, and nothing errors — this is L72's exact shape, found eleven
     times in one sweep. -->
<span class={`badge badge-${size} badge-${tone}`}>{status}</span>
```

Each of the items below took much time to find:

- **Use daisyUI theme tokens, never a hardcoded color.** Use
  `text-base-content/70` for secondary text. A value below `/70` fails WCAG
  AA on light backgrounds: `/60` gives 4.26:1, and AA requires 4.5. In the
  dark theme, these values pass. Thus, if you examine only one theme, you do
  not see the failure (L22). Use `bg-base-100`/`border-base-300`, never
  `bg-white`/`border-gray-200`. The application has no copy of the palette:
  the two themes are daisyUI's own `corporate` and `night`.
- **Let the *browser* convert a color pair before you measure it.** Paint the
  color on a canvas, and read the pixel. Do not parse a computed color string
  by hand. In this codebase, each of these hand methods already gave a wrong
  contrast number:
  - The code read `oklab()` components as RGB.
  - The code put an alpha color over white, not over its real background.
  - A simple regex read `oklch(...)`.
- **Every page needs a real `<h1>`** that a test can find by its role. It is
  not sufficient that the heading is visible. `apps/web/e2e/smoke.spec.ts`
  renders every page. That test found that no page in the product had an
  `<h1>` (L64).
- **A modal form needs `update({ reset: false })`, not the default.** When
  the application refuses a submission, the default reset deletes the edit
  that the user must correct (L68). For a modal form, use
  `use:enhance={closeOnSuccess(...)}` from `$lib/form-enhance`. For a
  full-page form, use `keepValues` from `$lib/form-enhance`.

---

## 9. Form validation

Each field that a form action writes goes through `FormReader`
(`$lib/server/forms`). Do not use `formString()` for a value that goes into a
column. A crafted POST does not obey the browser attributes `required`/`type`.
The type of the column (`varchar(n)`, a Postgres enum, `uuid`) is the *last*
defense. If that type refuses a value, the result is an unhandled 500, not an
error on the field.

| Column | Reader | What it prevents |
|---|---|---|
| `varchar(n)` / `text` | `text(name, { max: n })` | `value too long`, which is a 500. The `max` value must agree with the column |
| `uuid` | `uuid(name)` | `invalid input syntax for type uuid` from a crafted hidden field |
| a Postgres enum | `enumValue(name, "<type>")` | `invalid input value for enum` |
| a fixed `varchar` set | `choice(name, ALLOWED)` | a value that is not on the list and gets to the display code |
| `date` | `date(name)` | `2026-13-45`: the shape is correct, the date is not real, and the cast gives a 500 |
| money / rates | `decimal(name, { scale })` | a conversion through a float and back, and a third decimal that the column rounds with no error |
| `int4` | `integer(name, { min, max })` | a value out of range, which is also a 500 |
| locale / zone / currency | `locale(name)` / `timezone(name)` / `currency(name)` | a `RangeError` inside `Intl`, on each page that later formats a number for that office |

**GOOD**:

```ts
const f = new FormReader(await request.formData())
// Every reader ABOVE the gate — never inside the object built after it,
// or a rejection is raised too late to report (L33):
const name = f.text("name", { required: true, max: 255 })
const startDate = f.date("start_date", { required: true })
const rate = f.decimal("hourly_rate", { scale: 4, min: 0 })

// A rule the reader can't express — a clash, an inversion — through the
// same path as every other failure, so the page can put the cursor on it:
if (startDate && endDate && endDate < startDate) f.reject("end_date")

if (!f.ok) return fail(400, f.problem()) // names the field(s), not "some fields need attention"

await widgets.create(tx, { name: name!, start_date: startDate!, hourly_rate: rate })
```

**BAD**:

```ts
// formString for a value that reaches a column — no length check, no type
// check, and the browser's `required` didn't survive a crafted POST.
const name = formString(data, "name")

// A reader called INSIDE the object built after the gate — this runs once
// !f.ok has already been checked, so a rejection here is too late to
// report, and a non-required field returns null on rejection — the column
// saves NULL and the action still answers `saved: true` (L33):
if (!f.ok) return fail(400, f.problem())
await widgets.update(tx, id, {
  name: f.text("name", { max: 255 }), // <- reported too late
})

// A shape regex standing in for a real parse:
if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fail(400, /* ... */)
// accepts 2026-02-31; postgres.js then rolls it into a real (wrong) date
// via a JS Date round-trip, with no error and `saved: true` (L67).

// type="number" on a money field — rounds through a browser float before
// the server ever sees it.
```

---

## 10. Queries on a request path

**Nothing reads more rows than it returns, apart from a capped count. An
aggregate that is large by nature comes from a precomputed table.** If the
content on screen limits the work of a query, Postgres has no very slow plan
to choose. A query can read the whole table to return twenty rows. On the
approximately twelve rows of the fixture, that query is fast. In the second
year of a tenant, or after a new `ANALYZE`, the query becomes slow, with no
error (L118).

**GOOD**: first select the rows for the page, then add data only to those
rows (`employee-profile/employees.repo.ts`):

```ts
const rows = await tx<(EmployeeRow & { total: string })[]>`
  WITH page AS (
    SELECT e.id, count(*) OVER ()::text AS total
      FROM employees e
     WHERE ...filters...
     ORDER BY e.last_name ASC, e.first_name ASC, e.id
     LIMIT ${limit} OFFSET ${offset}
  )
  SELECT e.id, e.first_name, ..., cp.amount::text AS base_amount_pvt, page.total
    FROM page
    JOIN employees e ON e.id = page.id
    LEFT JOIN LATERAL (            -- one index probe per row ON the page
      SELECT amount, currency, pay_frequency
        FROM compensation_base
       WHERE employee_id = e.id AND effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY effective_from DESC
       LIMIT 1
    ) cp ON true
`
```

That count has no limit, because the size of the organization limits
`employees`. A table can get one more row for each event that occurs
(`SCALE_SENSITIVE`). On such a table, the count stops at
`countCap(page, size)` (`$lib/server/db/paged.ts`). `Pagination` then shows
"of N+" through its `atLeast` prop. This is the `count` function in
`time_tracking_entries.repo.ts`:

```ts
const total = await entries.count(tx, filters, countCap(page, PAGE_SIZE))
// SELECT count(*) FROM (SELECT 1 FROM ... WHERE ... LIMIT ${cap}) x
```

If a value is a sum of all rows, read it from a precomputed table. Do not
calculate the sum for each request. The ledger reports read
`gl_daily_balances`. Triggers keep this table current, with one row for each
account, day and tax rate. The reports do not read each `journal_entry_lines`
row. You must prove that a precomputed table agrees with its rows. Use an
invariant in `./check`, and a test after each type of write.

**BAD**:

```ts
// Ranks EVERY deal in the firm to show 20 per stage (crm/deals.repo.ts
// listForBoard, today). The cost grows with the table, not the board, and
// the same data read 5,278 or 14,162 pages depending on the statistics
// sample.
WITH ranked AS (
  SELECT id, stage_id,
         row_number() OVER (PARTITION BY stage_id ORDER BY created_at DESC) AS rn
    FROM crm_deals
)
SELECT ... WHERE d.id IN (SELECT id FROM ranked WHERE rn <= ${perStage})

// Joins the whole table, THEN pages: every employee's pay history is read to
// show twenty of them.
SELECT e.*, cp.amount
  FROM employees e LEFT JOIN compensation_base cp ON cp.employee_id = e.id ...
 ORDER BY e.last_name LIMIT 20

// Sums every journal line in the firm on each report load.
SELECT account_id, sum(base_debit_amount) FROM journal_entry_lines ... GROUP BY 1

// "Do it in code instead": the same reads, now crossing the wire, and the
// next step is a query per stage inside a loop, which ./check's loop step
// exists to stop.
const deals = await tx`SELECT id, stage_id, created_at FROM crm_deals`
```

To correct the board, use one `LATERAL (... ORDER BY created_at DESC LIMIT n)`
for each stage row. This query reads a maximum of n deals for each stage,
independent of the statistics.

---

*This document teaches the pattern. `./check` enforces most of it. These are
the real guarantees: `verify-authz.mjs`, `verify-audit-coverage.mjs`,
`verify-matrix-complete.mjs`, `verify-constraint-registry.mjs`,
`verify-no-backtick-in-sql.mjs`, and the SQL test scripts in
`packages/database/tests/`. If this file and `./check` do not agree,
`./check` is correct, and you must correct this file.*

# Coding Guidelines

Patterns for writing code in Kaaj, with real GOOD/BAD examples. This file
teaches the pattern; **CLAUDE.md and `docs/*.md` are the authority** on
repo-specific rules, and `./check` is what actually enforces most of them —
where this file and `./check` disagree, `./check` is right and this file is
stale.

Read this before writing a new route, a new table, or a new form. It won't
make you re-derive anything CLAUDE.md already states as a rule; it exists to
show what following that rule actually looks like in code, and what breaking
it looks like, since most of the entries below are patterns that have already
broken in this codebase at least once (see `docs/10-lessons-learned.md`,
referenced inline as `Lnn`).

---

## The checklist

- **Authorize before you write, at both layers.** `requireCan()` before the
  first `withTenant(...)` call in every action, *and* an RLS policy that would
  refuse the row even if the app-layer guard were missing. One without the
  other is not defense in depth.
- **`withTenant` takes the actor, never a bare tenant id.** `actorFrom(locals)`,
  not `locals.tenantId` — a bare id passes tenant isolation and then silently
  returns zero rows under a row-visibility policy.
- **A new table gets `tenant_isolation` immediately, and a row-visibility
  decision before it ships**, not before it "needs" one. Tenant-only vs
  role-aware is a real design call — see `docs/15-row-level-visibility.md`.
- **Never recreate a policy with `DROP`/`CREATE`.** `AS RESTRICTIVE`, `FOR`,
  `TO`, `WITH CHECK` are lost by omission and the statement still succeeds —
  this produced a 12-row cross-tenant leak once already (L63).
- **Money is a string, end to end.** `NUMERIC` in Postgres, `string` in
  TypeScript, `inputmode="decimal"` in the browser. Never `Number()` it,
  never `type="number"` it, never add/subtract it in JavaScript.
- **A `timestamptz` renders in the *office's* zone; a `DATE` renders in UTC.**
  Never the viewer's zone, never a bare `::date` cast on a timestamp.
- **Never hardcode a currency-to-locale or country-to-locale mapping.** Read
  the real value from `firm_locations` via `localeForCurrency`/
  `localeForCountry`. A ternary that only knows GBP/INR has already shipped
  and had to be fixed three times.
- **A write someone may later be asked to justify gets an audit entry, in the
  *same* transaction as the write.** Written afterwards, the trail records
  what the app believed happened, not what happened (L40).
- **An error reaching a log goes through `safeError`, never raw.** A
  `PostgresError`'s `detail` can carry the offending row.
- **Never assemble a Tailwind class name.** `` `badge-${size}` `` is invisible
  to Tailwind's static analysis — the class is never generated, and nothing
  errors. Map each state to a complete string.
- **Every field a form action writes goes through `FormReader`.** `required`
  and `type` are browser UX and vanish on a crafted POST; the reader is the
  last line of defense before the column's own type is.
- **A refused write is a sentence naming the field, on a form still on
  screen** — not `fail(400)` with nothing rendered, and not a full-page
  reload that discards what the person typed (L68).

---

## 1. Authorizing a new API call — read and write

Every `(app)` route's `load` and every form action is a place someone could
reach a row they shouldn't. Two layers protect it, and they answer different
questions:

- **`can()` / `requireCan()`** (`$lib/server/auth/can`) answers *"may this
  actor do this to this row"* — a permission check.
- **RLS** (the database's row-visibility policy) answers *"do these rows even
  exist for this actor"* — independent of whether the app remembered to ask.

A route needs both wherever the table carries a row-visibility policy, and
needs the app-layer check alone where the table is tenant-only by design (see
§2). Relying on only one is exactly the shape of the incidents this
convention exists to prevent — accounting was tenant-only at the database for
weeks while the application was already correct, so one query path that
missed `requireCan` would have disclosed every invoice in the firm.

**GOOD** — a read gated on a permission, a write gated *and* guarded before
the transaction opens, an audited write, and a constraint refusal turned into
a field-level message:

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

**BAD** — three real failure modes, each already caught once by `./check`:

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

Every tenant-owned table gets `tenant_isolation` — no exception. The separate
question, for every new table, is whether a row-visibility policy on top of
it is warranted: **does a same-tenant colleague reading this row cause real
harm** (pay, PII, a firm's own financial records), or is it directory-shaped
data everyone in the tenant may already see? See
`docs/15-row-level-visibility.md` for the full criterion and the current
tier list.

**GOOD** — tenant isolation always, a role-aware RESTRICTIVE policy layered
on top when the table warrants it, with every modifier spelled out and the
claim parsed through a fail-closed helper function (never inline):

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

**BAD** — the three shapes that have each caused a real incident here:

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

Run `./check --db` immediately after any policy change — `verify-rls.sql`
tests every table both ways (the refused actor gets nothing, the permitted
one still gets rows), and it is the thing that actually catches #2 above.

---

## 3. Money and currency

`NUMERIC` in Postgres, `string` in TypeScript, from the browser to the
database and back. A float anywhere in that path loses digits silently —
measured on this schema: `99999.99` stored as `real` comes back as `100000`.

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

JSONB money (payroll's `earnings`/`taxes` documents) needs the same
discipline and an extra one: **store `"95000"`, never `95000`** — a JSON
number inside JSONB is exact in Postgres and becomes a lossy float64 the
moment JavaScript reads it back out, and no schema-level check can see inside
a JSONB column to catch this. See CLAUDE.md § Money for the full list of
JSONB money paths this applies to.

---

## 4. Dates and timezones

A `timestamptz` is an instant — the same moment is a 9am start in Bangalore
and a 10:30pm finish in New York. A `DATE` carries no zone at all. Using the
wrong one of `instant()` / `calendarDate()` for a given column is the
mistake; both exist so you don't have to remember the rule each time.

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

**Never hardcode which countries or currencies exist.** A ternary like
`currency === "GBP" ? "en-GB" : currency === "INR" ? "en-IN" : "en-US"` looks
harmless and has shipped — and had to be found and fixed — three separate
times in this codebase, each time because it silently mis-formatted (or
failed to format) a market the ternary didn't know about. The real per-office
locale already lives in `firm_locations` (`country`, `currency`, `locale`
columns); read it from there.

**GOOD**:

```ts
// +page.server.ts — load the real per-office data alongside whatever else
// the page needs:
locations: await locationsRepo.list(tx),
```

```svelte
<script lang="ts">
  import { localeForCurrency, localeForCountry } from "$lib/format"
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const localeFor = (currency: string) =>
    localeForCurrency(data.locations, currency, tenantLocale)
</script>
{money(invoice.total, invoice.currency, localeFor(invoice.currency))}
```

Adding a new market — a French or German office — is then just adding the
`firm_locations` row. Nothing in application code needs to change or "learn"
about the new country.

**BAD**:

```ts
// A closed list masquerading as generality. Correct for exactly the
// countries someone thought of when they wrote it, silently wrong (falls
// through to "en-US") for every other one.
const locale =
  currency === "GBP" ? "en-GB" : currency === "INR" ? "en-IN" : "en-US"
```

**Tenant-configurable translated *data*** (a firm's own name in multiple
languages, a benefits-package name) is a different concern from UI text, and
already has a real pattern: a `name_i18n JSONB` column beside the plain
`name`, keyed by locale, read through `FormReader`'s `i18n()` reader and
scoped to `supported_locales` — see `firm_locations.name_i18n` or
`payroll_pay_schedules.name_i18n` for a working example.

**UI text i18n — every label the user reads, in their own chosen language —
does not exist in this codebase yet.** There is no message-catalog library
wired in, and no locale switcher. Every string in every `.svelte` file is
English today. Don't invent a local, one-off translation mechanism for a
single page in the meantime — that produces the exact "two copies of one
concern, and they disagree" shape this codebase's own conventions exist to
avoid (see CLAUDE.md's "a vocabulary lives in one place" rule, `L57`). Treat
full UI-text i18n as a separate, foundational piece of work with its own
design (library choice, per-user vs per-tenant language preference,
extraction strategy) rather than something to bolt on page by page.

---

## 6. Audit logging

A write someone may later be asked to justify — a pay change, an approval, a
role grant, an erasure — gets an entry in `audit_log`, written in the **same
transaction** as the change. Written afterwards, on a second connection, or
best-effort with a swallowed error, the trail records what the application
*believed* happened, and the two diverge exactly when someone is asking why
(L40). `audit_log` cannot be deleted from, so both directions matter: an
action that should audit and doesn't is a silent gap, and one that audits but
shouldn't is permanent noise nobody can prune. Every write action is
classified one way or the other in
`apps/web/src/lib/server/audit/register.ts`, and `./check` fails on an
action in neither list.

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

An error reaching a log — or the browser — goes through an allowlist, never
raw. A `PostgresError`'s `detail`/`where`/`query` fields can carry the
offending row (a date of birth that failed a type check IS the error
message), and `handleError` is the one place SvelteKit lets that reach a log
at all.

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

Every *unexpected* error gets an id (`handleError` mints one, logs the error
against it, and returns `{ id, message }` — SvelteKit replaces the real
message before it reaches the browser). Without the id, a bug report has
nothing to search for.

---

## 8. UI code

Compare new screens against **the Nexus reference**
(<https://nexus.daisyui.com/dashboards/ecommerce>) before calling UI work
done — spacing, density, empty/loading states, and how the shell behaves at
each breakpoint. What this app deliberately diverges from Nexus on (solid
badges instead of `badge-soft`, no lakh/crore code because `Intl` already
knows) is recorded in `docs/07-app-provenance.md` — check there before
"fixing" a divergence that was actually a measured decision.

**Never assemble a class name.** Tailwind reads *source text* to decide which
classes to generate — it cannot evaluate a template expression, so an
assembled class is silently never generated and the element renders
unstyled, with no error anywhere.

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

A few more that have each cost real time to find:

- **daisyUI theme tokens, never a hardcoded color.** `text-base-content/70`
  for secondary text (below `/70` fails WCAG AA on light backgrounds — `/60`
  measures 4.26:1 against a 4.5 requirement, and passes in dark either way,
  which is why the failure hides if you only check one theme, L22).
  `bg-base-100`/`border-base-300`, never `bg-white`/`border-gray-200` — the
  app owns no copy of the palette; the two themes are daisyUI's own `nord`
  and `night`.
- **Measure a color pair by letting the *browser* convert it** — paint to a
  canvas, read the pixel — never by hand-parsing a computed color string.
  `oklab()` components read as RGB, an alpha color composited over white
  rather than its real backdrop, and a naive regex over `oklch(...)` have
  each produced a wrong contrast number in this codebase already.
- **Every page needs a real `<h1>`**, reachable by role, not just visually
  present — `apps/web/e2e/smoke.spec.ts` is the only check that actually
  renders a page and found one entirely missing one (L64).
- **A modal form needs `update({ reset: false })`, not the default.** The
  default reset discards exactly the edit the person is being asked to fix,
  the moment their submission is refused (L68) — use
  `use:enhance={closeOnSuccess(...)}` (modal) or `keepValues` (full-page),
  from `$lib/form-enhance`.

---

## 9. Form validation

Every field a form action writes goes through `FormReader`
(`$lib/server/forms`) — no `formString()` for a value that reaches a column.
Browser `required`/`type` vanish on a crafted POST; the column's own type
(`varchar(n)`, a Postgres enum, `uuid`) is the *last* line of defense, and its
failure mode is an unhandled 500, not a field-level error.

| Column | Reader | What it stops |
|---|---|---|
| `varchar(n)` / `text` | `text(name, { max: n })` | `value too long` — a 500. `max` must match the column |
| `uuid` | `uuid(name)` | `invalid input syntax for type uuid` from a crafted hidden field |
| a Postgres enum | `enumValue(name, "<type>")` | `invalid input value for enum` |
| a fixed `varchar` set | `choice(name, ALLOWED)` | anything off-list reaching display code |
| `date` | `date(name)` | `2026-13-45` — well-shaped, not real, and a 500 on the cast |
| money / rates | `decimal(name, { scale })` | a float round-trip, and silent third-decimal rounding |
| `int4` | `integer(name, { min, max })` | out-of-range — also a 500 |
| locale / zone / currency | `locale(name)` / `timezone(name)` / `currency(name)` | a `RangeError` inside `Intl` on every page that later formats a figure for that office |

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

*This document teaches the pattern. `./check` enforces most of it —
`verify-authz.mjs`, `verify-audit-coverage.mjs`, `verify-matrix-complete.mjs`,
`verify-constraint-registry.mjs`, `verify-no-backtick-in-sql.mjs`, and the SQL
harnesses in `packages/database/tests/` are the actual guarantees. If this
file and `./check` ever disagree, trust `./check` and fix this file.*

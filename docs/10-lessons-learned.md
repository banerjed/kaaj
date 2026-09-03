# Lessons Learned

**Running document.** Append as things are learned; do not rewrite history.

Every entry here cost real debugging time. They share a shape: **the system kept
working and told you nothing.** An empty page, a silently unstyled component, a
control nobody can reach with a keyboard. None of them threw.

Code comments point here rather than restating the reasoning inline — see
[Conventions](#conventions) at the end.

---

## Tenancy and authentication

### L1 — The tenant claim is `request.jwt.claims`, not `app.tenant_id`

[ADR-003](./05-architecture-decisions.md) rule 4 writes
`SET LOCAL app.tenant_id = ...`. **That prose is stale.**
`app.current_tenant_id()`, as rewritten by
`20260827000004_harden_tenant_context.sql` and called by all 98 policies, reads
`current_setting('request.jwt.claims')` and extracts `{app_metadata,tenant_id}`.

The authority is `packages/database/tests/verify-rls.sql` — the harness that
proves isolation actually works. Copy from there, so the application and the
proof cannot drift apart.

### L2 — Two ways to set the tenant that silently do nothing

Both are in `$lib/server/db/tenant.ts`, which is why that function exists.

1. **`set_config(..., true)` is a no-op outside an explicit transaction.** The
   setting is discarded immediately, so every subsequent query runs with no
   tenant and returns nothing.
2. **postgres.js cannot parameterise `SET`.** It must be
   `set_config($1, $2, true)`. Never build the statement by concatenation — the
   value derives from a token.

### L3 — Connect as `app_user`, never the owner

`FORCE ROW LEVEL SECURITY` is bypassed by the table **owner**. An application
connected as `postgres` has row-level security in name only, and every isolation
bug stays invisible until production.

Hence `APP_DATABASE_URL`, deliberately a different variable from the harnesses'
`DATABASE_URL` (owner) and `SUPABASE_DB_URL` (production, read-only).

**Defence in depth:** `withTenant` also issues `SET LOCAL ROLE app_user`, so
isolation survives a misconfigured DSN. That is a safety net, not a licence —
`./setup` still asserts the connection sees zero rows without a claim.

### L4 — `user.app_metadata` never carries the tenant claim

The most expensive hour of the build. `custom_access_token_hook()` rewrites the
claims of the **token being issued**; it does not touch the `auth.users` row.
`getUser()` returns that row, so `user.app_metadata` holds only
`{provider: "email", providers: ["email"]}`.

Reading it yields `undefined` for every user, every page renders empty, and
**nothing anywhere reports an error.** Read the claim from
`session.access_token` — safe in `hooks.server.ts` precisely because
`safeGetSession` has already validated that token through `getUser()`.

### L5 — Creating the access-token hook is not registering it

The function exists in a migration. Registration is separate and non-SQL:
`[auth.hook.custom_access_token]` in `config.toml` locally, **Authentication →
Hooks** in the dashboard for a hosted project. Until registered, login succeeds
and stamps no claim.

### L6 — A hook that errors is a 500 on `/token`, not a degraded login

GoTrue invokes the hook as `supabase_auth_admin`, whose `search_path` excludes
`public`. An unqualified table reference fails with

```
ERROR: relation "tenant_users" does not exist (SQLSTATE 42P01)
```

which reads as a permissions problem and is not. Any function reachable by
another role should pin `SET search_path = ''` and schema-qualify every
reference. Fixed in `20260828000001`.

### L7 — `config.toml` changes need a full stack restart

`supabase db reset` restarts the containers but does **not** re-read the config.
Use `supabase stop && supabase start`. Otherwise the hook stays unregistered,
login still succeeds, and it looks like the hook is working until you decode the
token.

### L8 — PostgREST is deliberately unreachable

`20260827000002_auth_and_grants.sql` §5 grants nothing to `authenticated` or
`anon`, so `/rest/v1/*` returns 42501 for every table, by design (ADR-008,
ADR-009). `locals.supabase` is for auth and storage only; all module data goes
through postgres.js. Do not "fix" this by adding a grant.

---

## UI: daisyUI, Tailwind and the Nexus template

### L9 — daisyUI is a component layer *on* Tailwind

Layout utilities (`flex`, `grid`, `gap`, `mt-4`) are the intended usage, not a
failure of it. Nexus's own code — written by the daisyUI template author — is
`<tr class="hover:bg-base-200/40 cursor-pointer *:text-nowrap">`.

The real rule is narrower: **do not rebuild a component that exists.** Check
`node_modules/daisyui/components/` before hand-rolling. `list`, `footer`,
`card`, `menu`, `stat`, `timeline`, `steps`, `status` and `fieldset` are all
there and easy to miss.

### L10 — Do not put a display utility on a daisyUI component

`.list` carries `display: flex`; `md:hidden` on the same element is a cascade
race between two utility layers. Put the responsive class on a **wrapper**.

### L11 — `list-row` children are grid columns

`list-row` is `grid-auto-flow: column`. Every direct child becomes a column, so
a bare badge alongside `list-col-grow` forms its own implicit `auto` column —
which, with `list-row`'s `word-break: break-word`, squeezed the growing column
until a location name wrapped **one character per line**.

Keep it to two children: the `list-col-grow` column and the `list-col-wrap`
one. Anything else goes inside them.

### L12 — Touch targets belong in one rule, not on every element

daisyUI sizes controls from `--size-field`; `btn-sm` is 32px, under doc 04's
44px floor. `min-h-11` per element has to be remembered at every call site
forever and is invisible when forgotten.

One `@media (pointer: coarse)` block in `src/app.css` covers controls nobody has
written yet, and leaves the dense desktop layout alone.

### L13 — daisyUI already prevents the iOS input zoom

It ships
`@media (pointer: coarse) { @supports (-webkit-touch-callout: none) { .input:focus { --font-size: 1rem } } }`.
Doc 04's "16px inputs" requirement is handled by the library for `.input` and
`.textarea`. Do not hand-roll it.

### L14 — Never suppress framework warnings wholesale

Nexus's `svelte.config.js` carried a `warningFilter` that hid every
accessibility warning. Declining to copy it surfaced **73 real errors**: an
entire settings panel operable only by mouse (WCAG 2.1.1, 4.1.2), ~35
self-closing non-void tags, unlabelled icon buttons, and a Svelte 5 reactivity
bug where seeded `$state` captured only the initial props.

Their filter also tested for `"ally_"` when the prefix is `a11y_`, so it never
worked as intended. A suppression nobody can read is a suppression nobody can
review.

### L15 — Remove template demo features; do not rewire them

The ⌘K palette over a hardcoded list, the five-language switcher, the invented
notification tray, the fake team roster, the "Upgrade — save 30%" panel. Each
looked finished and behaved broken, and each would have to be un-shipped before
the real feature could land. An absence is honest; a convincing shell is not.

### L16 — Tailwind 4 `@plugin` needs the Vite plugin

`@tailwindcss/postcss` does not process `@plugin` or `@variant`. With it,
daisyUI silently contributes **no themes at all** — the page renders, unstyled
in a way that looks like a design choice.

### L17 — Two daisyUI themes can coexist

One Tailwind entry point; themes selected by the nearest `data-theme` ancestor.
`(marketing)` and `(admin)/account` claim `saasstartertheme` on a
`display: contents` wrapper; `(app)` lets `ConfigProvider` set `data-theme` on
`<html>`. Only one theme may declare `default: true`.

### L18 — Fonts belong in `app.html`, not in CSS

`@import url(...)` inside a stylesheet is a chained request: the browser must
fetch and parse the CSS before it discovers the font CSS, before it discovers
the font files. `<link rel="preconnect">` + `<link>` in the head is found by the
preload scanner immediately.

### L22 — Nexus's palette fails WCAG AA, in every theme

Measured, not eyeballed. Two independent causes:

**Low-alpha text, light themes only.** `--color-base-content` at 50–60% alpha
on a light background gives 3.17:1 and 4.26:1 against the 4.5:1 AA needs.
**70% is the floor** (5.88:1). Dark themes pass at any of these alphas, because
light-on-dark loses less contrast per unit of transparency — so a value that
looks fine in dark mode can fail in light. Always check the light family.

**White on the brand colours, every theme.** White on `#167bff` is 3.95:1;
on `#378dff`, 3.27:1. This is not a light-mode problem — it is the palette.

The fixes differ by family, and the obvious one is wrong for dark:

| Family | Fix | Why not the other way |
|---|---|---|
| light, contrast, material | darken the brand: `#167bff→#1169dd`, `#9c5de8→#9050da` | — |
| dark, dim, material-dark | keep the hue, darken `*-content` to `#101418` | Darkening the brand fixes white-on-brand but drops brand-as-text on the dark background to 3.3–3.8:1. You cannot win both directions by darkening in a dark theme |

**`contrast` is not an accessibility theme** despite the name — it failed
identically to `light`.

**Stock daisyUI themes were evaluated and rejected** (nord, corporate, winter,
lofi, autumn). `nord` fails `text-primary` at 3.50:1, which is live in
`SidebarMenuItemBadges`. Only `lofi` (monochrome) and `autumn` (red) passed
outright, and neither keeps the product's identity. Any stock theme also needs
a custom block anyway, because Nexus's layout reads `--root-bg`,
`--layout-sidebar-background` and `--layout-topbar-background`, which no stock
theme defines.

Verified afterwards: 13 checks × 6 themes, all pass.

**How to re-run this.** Contrast cannot be computed from the CSS source —
daisyUI emits `oklch` and `color-mix`, and alpha has to be composited against
whatever ancestor actually paints a background. Resolve colours through a
canvas (`ctx.fillStyle = <any css colour>`, then read the pixel), walk up for
the first ancestor with alpha > 0.95, and let the theme settle for two frames
after setting `data-theme` — measuring in the same tick returns stale values
and invents failures that are not real.

### L23 — `group/html` on `<html>` is load-bearing

Nexus's `app.html` carries `class="group/html"`. Ours did not, because the file
was edited rather than copied. **25 styles across three components silently
stopped working:**

| Component | What broke |
|---|---|
| `ThemeToggle` | sun/moon/palette icon never swapped — one glyph in every theme |
| `Rightbar` | no selected-state tick on any theme or font option |
| `Sidebar` | the peek-toggle icon never changed state |

Every one is written `group-data-[theme=dark]/html:opacity-100` — a Tailwind
*named group*, which needs `group/html` on the element it names. Without it the
selector matches nothing. No error, no warning, no failing test: the icons just
sit at their default opacity and look deliberate.

It survived a full a11y pass, a lint pass, `./check`, and four rounds of
screenshots. It was caught by a human asking **"what is that button supposed to
do?"** — the same shape as [L19](#l19--structural-verification-is-not-visual-verification).

**When copying a template, copy `app.html` too**, or diff it. Framework wiring
hides in the shell file: the group class here, and Nexus's `data-theme`
attribute handling.

---

## SvelteKit application foundation

### L24 — Never serialize cookies or auth internals into page data

`cookies.getAll()` belongs inside the server-side Supabase client adapter only.
Returning it from `+layout.server.ts` sends authentication material through the
SvelteKit data channel, where it can be inspected by client JavaScript and
browser tooling.

Server loads should return user-facing data: `session`, `user`, `profile`, and
similar shaped values. Universal/client loads should create browser-only clients
behind `browser` checks. If a browser component cannot safely construct its
client during SSR, render the dependent UI only after the client exists.

### L25 — Authenticate once per request, in `hooks.server.ts`

`safeGetSession()` is deliberately expensive: it validates the session with
`getUser()` and may fetch MFA assurance data. Calling it again from every
layout, action, and page duplicates network work and makes tests lie about the
real request lifecycle.

Resolve `session`, `user`, `amr`, `tenantId`, and `tenantRole` once in
`hooks.server.ts`. Downstream server loads and actions should read
`locals.session`, `locals.user`, and friends. Tests should build `locals` in that
post-hook shape.

### L26 — No module-level writable state for request or UI context

A Svelte module script is shared by every instance in the process. A writable
store declared there is not a component-local value, and on the server it risks
cross-request state and subscriber leaks.

Create context stores in the instance script, call `setContext` per component
instance, and clean up every manual subscription from an effect. If the value is
derivable from route state, prefer `$derived(page.url...)` over context entirely.

### L27 — Use Svelte 5 state APIs consistently

`$app/stores` is the legacy compatibility path. New code should use
`$app/state` and read `page`, `navigating`, and `updated` directly in runes
components.

Do not seed `$state` from props or route data when the value should follow later
navigation. Use `$derived(...)`. For repeated DOM or component lists, key
`{#each}` blocks by stable identifiers, never by array index, so state and focus
survive insertions, removals, and client navigation.

### L28 — Browser-only libraries must be browser-only in the bundle

If a dependency touches DOM concepts or only improves a client interaction, keep
it out of SSR. Use a type-only import plus `import("package")` inside an effect
or `onMount`, and dispose of the instance when the component unmounts.

The warning "imported but never used" in an SSR build is often a clue that a
client library was pulled into the server graph for no runtime benefit.

### L29 — Search should be lazy, bounded, and history-safe

Do not fetch a full search index on every page visit if the user has not opened
or used search. Do not run fuzzy search on every keystroke without a debounce,
and do not call `goto()` for hash updates on every input event.

Load the index on focus or when a hash query exists, debounce the search, cap the
result count, key results by path, and use `replaceState` for shareable URL state
that should not create a browser-history entry per character.

### L30 — Interactive HTML semantics are not optional

An anchor navigates. A button performs an action. Nesting `<button>` inside
`<a>` is invalid HTML and creates unpredictable focus, click, and assistive
technology behavior.

Style links with `btn` classes when the action is navigation. Style buttons as
buttons when the action mutates UI state or submits a form. Treat Svelte a11y
warnings as defects until proven otherwise; a local suppression needs a local
reason.

### L31 — The adapter is an architecture decision

`adapter-auto` is fine for experiments, but this product specifies Node LTS and
`@sveltejs/adapter-node` in ADR-005 and the product specification. Leaving
`adapter-auto` means local builds can pass while production target assumptions
remain implicit.

Keep `svelte.config.js`, `package.json`, the lockfile, Docker/runtime docs, and
environment variables aligned. For Node builds, remember that `ORIGIN` is part
of the runtime contract.

### L32 — Repeated Svelte markup wants data, not copy-paste

When a component renders the same control shape many times, model the choices as
typed option data and render one keyed `{#each}` block. This keeps labels,
selected-state classes, icons, handlers and accessibility semantics in one
place; the settings drawer only needed one typo to prove the point.

Use tiny shared helpers for repeated boundaries too: browser-only Supabase
client creation, avatar initials/display names, form-field extraction and
form-error checks. Keep these helpers narrow and boring. The goal is one source
of truth for repeated behavior, not a generic framework inside the app.

### L24 — There is no per-user locale column

`module-firm-profile.md` § UI i18n Requirements says monetary values, dates and
numbers are "formatted per **user's** locale". No such column exists anywhere in
the 98 tables — `tenants.default_locale`, `tenants.supported_locales`,
`firm_locations.locale` and `translations.locale` are all there is. A user
preference cannot be stored, so it cannot be honoured.

**What is used instead, and why it is not a fudge.** Money is formatted in the
locale of the OFFICE that uses that currency (`firm_locations.locale`, which the
fixture populates: `IN-BLR → en-IN`, `UK-LON → en-GB`). An INR band is what
Bangalore pays, and it reads correctly only in `en-IN` — ₹18,00,000 with lakh
grouping, not ₹1,800,000. Formatting every currency in the tenant default gets
the symbol right and the grouping wrong, which looks fine to a reader who does
not use that currency and wrong to everyone who does.

This is the correct default even once a user preference exists: the market's
convention belongs to the money, not to the reader.

Closing the gap needs a column (`tenant_users.locale` is the natural home) and
a migration. Until then, `localeForCurrency()` in `$lib/format.ts` is the single
place that decides, so there is one thing to change.

### L25 — Money columns disagree on scale, and Postgres truncates silently

`compensation_base.amount` is `numeric(12,2)`. `employees.base_amount`, the
denormalised copy the directory falls back to, is `numeric(18,4)`.

The cache can therefore hold precision the authoritative column cannot. Writing
`12345678.9052` to both stores `12345678.91` in one and `12345678.9052` in the
other, and the directory then shows a different figure depending on whether an
effective-dated row happens to be current that day.

**Postgres ROUNDS to scale, silently. It does not truncate** — this entry
originally said it did, which a review caught. `12345678.9052::numeric(12,2)` is
`.91`, not `.90`. The distinction matters because someone implementing the rule
below with `trunc()` would recreate the very drift it exists to prevent. The
original test used `.9012`, which passes under either semantics and so pinned
nothing; it now uses `.9052`.

`addRaise` now rounds to the authoritative scale before writing the cache, so
the two always agree. A test asserts it.

**The real fix is a migration** reconciling the two columns, and it should
happen before payroll (Phase 6) reads either. Until then, `addRaise` is the
single place that writes both, which is what makes the workaround safe.

**General rule:** when a value is stored in two places, one of them is
authoritative and the other must be derived from it in the same transaction, at
the authoritative type, with `round()` — matching what the cast does. Do not
assume the two column definitions match; check.

The full set of money rules now lives in CLAUDE.md under **Money**, and
`./check` enforces the type choice via the `money/numeric-not-float` invariant.

### L33 — A parser that returns `undefined` for garbage deletes the field

`readOptionalNumber` in the payroll-policies action returned `undefined` for
blank, for unparseable, and for negative alike:

```ts
const n = Number(trimmed)
return Number.isFinite(n) && n >= 0 ? n : undefined   // three cases, one answer
```

The caller then wrote the key only when the value was defined, so an overtime
multiplier of `abc` — or `1,5`, which is how half the world types 1.5 —
produced `{"daily_threshold_hours": 8}` with **no multiplier at all**, a `200`,
and `saved: true`. Overtime silently computes at 1x. Confirmed by POSTing it:
the row landed with the field missing and the user was told it saved.

**"Absent" and "invalid" are different answers and need different return
values.** A parser for an optional field returns three states, not two:
`null` for blank, the value, or a rejection the caller must surface. The same
shape is wrong in `sort_order: Number(...) || 0`, which turns garbage into 0.

### L34 — Unvalidated form input reaches Postgres as a 500, not a field error

Every write action guards `if (!id) fail(...)` and then passes the id straight
into a query. Postgres, not the action, is doing the validating — and it
answers with an exception, which SvelteKit renders as `Internal Error`. Four
POSTs against the running app, all `500`:

| Input | What Postgres said |
|---|---|
| a 300-character department name | `value too long for character varying(255)` |
| `id=not-a-uuid` on any archive/remove | `invalid input syntax for type uuid` |
| `compensation_type=NOT_AN_ENUM` on a raise | `invalid input value for enum` |

None is a crash a user can reach through the UI, and that is exactly why it
survived review: the browser's own `required` and `maxlength` hide it, and the
fixture never carries a bad value. It is reachable by any crafted POST, and by
a paste into a field with no `maxlength`.

### L64 — No page in the application had an `<h1>`

The first end-to-end run failed on eighteen of twenty-one pages, all with the
same message: *did not render its heading*.

`PageTitle.svelte` rendered the page's title as
`<p class="text-lg font-medium">`. It looked exactly right — same size, same
weight, same position — so nothing objected. `<p>` is valid markup, eslint's
a11y rules have nothing to say about it, and `svelte-check` is a type checker.
The suites were green and every screen in the product was missing its level-one
heading.

What that costs someone using a screen reader: pressing `1` to jump to the
page's subject lands nowhere, and every section `<h2>` beneath it is a heading
under no heading — WCAG 1.3.1 and 2.4.6. It is invisible to anyone testing with
their eyes, which is everyone who had looked at it so far.

The fix is one tag and changes nothing visually.

**The general point is about how it was found, not what it was.** Sixteen
`./check` steps prove the schema, the policies, the classifications and the
units, and not one of them loads a URL. This is the first check that asks the
page a question *by role* rather than by text — the same question assistive
technology asks — and it found the defect on its first execution.

Asserting `getByRole("heading", ...)` rather than `getByText(...)` is what made
it visible. A text assertion would have passed against the `<p>` and the bug
would still be here.

### L62 — A claim cast inside a policy cannot be made to fail closed

`./check` went red on `G/claim-malformed` without any function having changed:
a JWT claim of `not-json` raised `invalid input syntax for type json` from
inside the `employees` row policy instead of returning zero rows.

Four of the seven `app.*` functions that parse `request.jwt.claims` wrapped the
`::jsonb` cast in an `EXCEPTION` handler — `current_employee_id()` even says
why: *"a malformed claim means 'no employee', never 'every employee'"* — and
three did not. Guarding those three fixed nothing, because
`employees.employee_visibility` did the cast **inline in the policy
expression**, where no handler can reach it. A policy expression cannot carry
one; the only fix is to move the parsing into a function that can
(`app.claim_role()`).

Two things worth keeping:

- **No rows ever leaked.** The safety property held throughout — an exception
  is fail-closed. What was lost is fail-closed *quietly*, which is the
  difference between a 500 and an empty page, and it is the behaviour the
  harness asserts because it is the one an application can render.
- **It was latent, not new.** Whether the policy raises depends on whether the
  planner evaluates that arm at all, so the same schema passed for days and
  then began failing. A bug that comes and goes with the query plan will not be
  found by running the suite once.

`verify-invariants.sql` now CALLS every zero-argument `app.*` function that
mentions the claim with a malformed one and fails if any raises — nine checks,
watched failing before being trusted — and separately refuses any policy whose
expression casts the claim itself. A grep for the word `EXCEPTION` would have
passed a handler that was present and wrong.

### L63 — `DROP` + `CREATE POLICY` silently loses `AS RESTRICTIVE`

While fixing L62, the `employee_visibility` policy was dropped and recreated.
The original read `CREATE POLICY ... ON employees AS RESTRICTIVE FOR SELECT`;
the replacement omitted those two words.

**Postgres defaults a policy to PERMISSIVE, and permissive policies on the same
command are OR-ed together.** `employees` also carries `tenant_isolation`, so
the two stopped being *both* and became *either* — and every row that satisfied
the visibility rule came back regardless of which tenant it belonged to. The
next run reported `C/no-leak | employees | LEAK: 12 foreign rows visible`.

This is the one in this file that did **not** fail silently, and that is the
whole point: 587 isolation checks exist because this class of mistake is a
single missing word in a statement that succeeds. Nothing in the SQL looked
wrong, nothing errored, and the page would have rendered.

Two rules follow. **Recreating a policy means restating every modifier** — the
`DROP`/`CREATE` pair is not a diff, and `AS RESTRICTIVE`, `FOR`, `TO` and the
`WITH CHECK` half are all lost by omission. And **run `./check --db` after any
policy change, before anything else** — it is one second, and it is the only
thing standing between a two-word omission and cross-tenant disclosure.

### L61 — L50 applies to tests, not just to fixtures

A test asserted that a foreign-currency invoice's journal ties to its base
total. It passed. Then the code it was testing was deliberately broken — base
figures rounded from the gross instead of summed from the rounded parts — and
it **still passed**.

The only foreign-currency invoice in the fixture carries **zero tax**. With a
tax of zero, `round(sub × r) + round(0 × r)` and `round((sub + 0) × r)` are the
same number, so the test could not tell the two implementations apart. It was
green over an empty column, which is exactly L50 — except inside a test rather
than inside a fixture, where nothing was looking for it.

The replacement picks values where the two differ: at a rate of 1.27, a
subtotal and a tax of 100.01 each round to 127.01 and sum to **254.02**, while
the gross of 200.02 rounds to **254.03**. One cent, in the direction that makes
`base_total` disagree with its own parts — which is what
`ck_invoices_amounts_reconcile` forbids, and what a period close would surface
weeks later.

**Choosing a test value is choosing what the test can see.** The same trap as
L25's `.9052` versus `.9012`: a value that cannot distinguish two behaviours
tests neither. And the only reliable way to find out is to break the code and
watch — a passing test says nothing about what it would catch.

### L59 — A duplicate column arms itself the moment something can write

`payroll_runs` carries two status columns. `run_status` is authoritative and
holds all three CHECK constraints — a closed vocabulary, the stage/timestamp
rule, separation of duties. `status` is a duplicate: unused, read by nothing,
constrained by nothing, and carrying an index on `(tenant_id, status)`.
`20260831140000` said so in a `COMMENT` and left it, because dropping it needs
the API surface checked first.

That was safe for exactly as long as the module was read-only. The two agreed
because nothing could move either. Adding the lifecycle writes made them
divergeable, and a statement that moved `run_status` alone would have left
`status` behind — no error, no failing CHECK (they constrain `run_status`
only), and an index pointing at a value nothing else believes.

**A `COMMENT` is prose, and prose is applied unevenly (L54).**
`20260902040128` adds `CHECK (status = run_status)`, which turns the divergence
into a loud failure instead of a convention, and it was watched refusing a
one-column write before being relied on. Dropping the column is still the end
state; the constraint costs nothing and closes the hole meanwhile.

The general shape: **a dead column is not inert, it is dormant.** Ask of any
duplicate, denormalised or legacy column left in place: what happens the first
time something writes its twin?

### L60 — `rejects.toThrow(SomeError)` passes on the wrong error

Three separation-of-duties tests went green without ever reaching the code they
were testing.

Each did setup — create a draft run, move lines onto it, calculate it — and
then asserted `await expect(...).rejects.toThrow(RunRefused)`. A bug in the
transition map made the *setup* throw `RunRefused` two lines early. The
assertion was satisfied, the tests passed, and `approve` was never called.

`toThrow(Class)` asserts a type, and a typed domain error is deliberately used
for every refusal in the module — so every refusal satisfies every assertion
about any refusal. The tests were checking that something went wrong, which is
not the same as checking that the right thing went wrong.

The fix is a helper that asserts the REASON:

```ts
await refusedBecause(() => runs.approve(tx, id, RACHEL), "self_approval")
```

and which fails loudly if the call succeeds at all. It caught the transition
bug immediately.

**Where a module funnels every failure through one error type — which is the
pattern this codebase wants — the type carries no information and the test has
to assert the discriminant.** The same applies to `RaiseRefused`,
`DecisionRefused` and `ProjectWriteRefused`.

### L57 — A create form and a filter that disagree hide the row that was just written

`/projects` filtered on a status list of `planning, active, on_hold, completed,
cancelled`. `projects.status` defaults to **`draft`**, and the list omitted it.

That was harmless for exactly as long as nothing could create a project. The
moment the create action landed, the first project anyone made would have been
written correctly, returned no error, shown a success message — and then been
absent from the list under every filter including the unfiltered one, because
the page reads through the same vocabulary.

The shape is worth naming: **a vocabulary list that lives next to the reader is
half a definition.** These are plain `text` columns with no enum and no CHECK,
so the list IS the constraint, and two copies of a constraint are one
constraint that will disagree. The lists now live in `projects.repo.ts` and the
pages import them, so the filter, the create form and the edit form cannot
drift apart — and `projects.writes.test.ts` asserts that a freshly created
project is findable by the filter, which is the assertion that would have
caught it.

The general question, asked of any new write: **can the thing this creates be
found again by the page that lists it?** A write whose result is invisible is
indistinguishable from a write that did not happen.

### L58 — A denormalised counter is recomputed, never incremented

`projects.task_count` and `completed_task_count` are stored on the project row
and feed a progress bar. Adding the task write path made them writable for the
first time.

An increment (`SET task_count = task_count + 1`) is correct only if every
writer remembers it, forever, and no write ever fails partway. A recount
(`SET task_count = (SELECT count(*) ...)`) is correct whatever happened before
it — so a row that is ALREADY wrong is repaired by the next write rather than
carrying the error forward. The fixture shipped with exactly that kind of
drift once, claiming 3 tasks on projects that had one or two.

Two things make it hold rather than merely being intended:

- the recount runs in the **same transaction** as the task write, so it cannot
  be the half that is lost;
- `staleCounters()` was already the diagnostic, and is now the regression
  guard — `projects.writes.test.ts` asserts it is empty *after* a write, and
  one case deliberately corrupts a counter and proves the next write repairs
  it.

Removing the recount was tried before trusting it: six of the eighteen write
tests fail. A guard that has never been observed to fail is not evidence.

### L56 — The next step is written down, because the context will not survive

L47 and L55 were both found by looking, not by testing, and the analysis of why
took longer than either fix. That analysis is perishable: it lives in a
conversation, and the next session starts without it.

[docs/16-disclosure-verification.md](docs/16-disclosure-verification.md)
specifies the mechanisation — an exhaustive taint check over every read path ×
every actor, driven by the disclosure matrix rather than by diffing RLS — and,
as importantly, the seven things it will still not catch: inference and
aggregation, existence oracles in 404-vs-403, timing, error text, unclassified
tables, missing fixture scenarios, and the actor sample.

The rule the document exists to enforce: **a check believed to be exhaustive
and is not is worse than no check**, because a passing suite is taken as
evidence. Every limitation is stated in the spec so that nobody later reads
"330 assertions" as "proven secure".

### L55 — Auditing a value copies it, and the copy needs the same protection

Asked to confirm that nothing sensitive reaches the audit trail, the answer was
no — in two ways, one of them created hours earlier by the audit work itself.

**The trail had no row policy.** `audit_log` carried tenant isolation and
nothing else, so every employee could read every entry in the firm. That was
tolerable while it held leave approvals. It stopped being tolerable the moment
pay changes were audited, because the entry records

```json
{"amount": {"from": "139000.00", "to": "148000.00"}}
```

and a plain employee could read it for anyone. This is L47 exactly — a
protected value reachable by an unprotected path — arriving through a route
nobody had looked at, because the trail was designed as a WRITE and never as a
READ.

The general rule: **whatever protects the original must protect the copy.**
`compensation_base` has had a row policy since the day it was written; the
table recording its changes did not, and one was worth nothing without the
other.

**The redaction set had fallen behind the schema.** `NEVER_LOGGED` matches
field NAMES, and ten encrypted columns were absent from it — `address_ct`,
`email_ct`, `phone_primary_ct`, `phone_secondary_ct`, `tax_id_ct`,
`swift_code_ct`, `certification_number_ct`, `account_number_encrypted` and both
vendor bank columns. Any caller passing one would have written plaintext into a
table that can never be deleted from. A committed list drifts unless something
compares it to the schema; `verify-audit-coverage.mjs` now does, and fails when
a `_ct` column exists without an entry.

**One path redaction cannot defend**, recorded here because it is a real
residual risk rather than a solved problem: `reason` is free prose, so a
sentence containing an account number has no field name to match. It is
defended by never putting values in it — a UI and training matter, not
something a filter catches without mangling legitimate text.

The check that would have caught all of this earlier is one question asked of
any new write: **who can read what this writes?** The audit work answered "who
may write it" carefully and never asked the other half.

### L54 — A rule that is prose is applied unevenly

CLAUDE.md required an audit entry for "a write that someone may later be asked
to justify". Nothing enforced it, and of 26 write actions, **3** recorded one.
Not hiring someone. Not editing their employment record. Not the payroll policy
that decides how overtime is computed.

The convention was not ignored out of carelessness — it was applied by whoever
happened to think of it, which is what an unenforced rule always produces. The
same lesson as L48, in a different place.

**Structured, never prose.** The decisive argument is local: `NEVER_LOGGED`
redacts by field NAME. A change stored as a sentence — "Changed IBAN from
GB29… to GB94…" — carries the values straight past it, into a table that holds
INSERT and SELECT only. Structure also stays queryable, survives a UI rewrite
and can be re-rendered in any language; a stored sentence freezes one rendering
decision permanently.

The shape that resulted:

```ts
type FieldChange = { from: string | null; to: string | null }
changes?: Record<string, FieldChange>   // the type refuses a flat value
reason?: string | null                  // prose for WHY, never for what
```

Four things earned themselves while building it:

- **Values are STRINGS.** A JSON number in JSONB returns to JavaScript as a
  float64 (L41). Everywhere else that is a bug to fix; here it cannot be fixed.
  The fixture already held `{"to": 148000}` as a number.
- **A closed `action` vocabulary** immediately caught `submitted` and
  `acknowledged` where the verbs are `submit` and `acknowledge` — tense drift
  that would have made the trail unfilterable.
- **`diff()` records only what MOVED.** Writing every field of a settings row
  buries the one that changed among twenty that did not, in a table nobody can
  prune. That is the same as not recording it.
- **Redaction replaces BOTH sides.** Replacing only the new value leaves the
  old one — which for a rotated account number is the number that was actually
  in use.

`verify-audit-coverage.mjs` enforces it in three directions: an audited
operation that stops auditing fails, a not-audited one that starts auditing
fails, and an action on neither list fails. That last is the one that matters —
a new write cannot ship until somebody decides, rather than defaulting to
silence. Both failure modes were verified by probe.

The line itself is a judgement, recorded in `register.ts` with a reason per
entry: 21 audited, 4 not. Renaming a department is not audited because it
changes a label rather than an outcome; changing a job LEVEL is, because levels
carry the published salary bands. `audit_log` can never be pruned, so
over-auditing is permanent noise — which is why a line exists at all rather
than auditing everything.

### L53 — An untyped row makes every value downstream `any`

The banking page rendered a sync time as `4:00 AM` — no date. The call was

```ts
instant(a.last_synced_at, tenantZone, tenantLocale)
```

and `instant` takes a **FormatContext object** second, with an optional
`"time" | "datetime"` third. So `ctx` was a string (its `.locale` and
`.timezone` both `undefined`), and `parts` was `"en-US"`, which is not
`"datetime"` — so `dateStyle` was never applied and only the time rendered.

`svelte-check` passed. The cause is one line in the layout:

```ts
const [row] = await tx`SELECT id, company_name, default_timezone, ... FROM tenants`
return row
```

An untyped `tx` query returns a loose row, so `data.tenant?.default_timezone`
is effectively `any` — and **`any` satisfies every parameter**, including one
expecting an object. The wrong-shaped argument was not merely allowed, it was
unexaminable. Typing the query (`tx<TenantSettings[]>`) makes the same call
fail with *Argument of type 'string' is not assignable to parameter of type
'FormatContext'*, which was verified by reintroducing it.

This is L45's neighbour and its inverse. There, a cast PROMISED columns the
query did not select; here, the absence of a type promised nothing and
therefore forbade nothing. Both end the same way — a value rendering as
`undefined`, or a date silently missing — because the type system was told
something untrue in one case and nothing at all in the other.

`data.tenant` is read by almost every page in the product for locale, currency
and timezone. It was the single loosest value in the codebase, and every
formatting call site that touched it lost its type checking.

### L52 — A soft-delete marker is state, and filling it deletes everything

L51 named the category — a column where NULL means something — from one
instance, `applies_to_location_code`. The category is larger, and the next
instance stopped a whole module dead.

`projects.archived_at` was filled on all four projects, so
`WHERE archived_at IS NULL` returned nothing and the Projects list was empty.
The same pass closed every ticket, deleted every task comment and archived the
only objective. Nothing failed: the coverage guard was satisfied (the columns
had values), the tests had not been written yet, and the page simply had no
rows.

The general shape: **`archived_at`, `deleted_at`, `closed_at`, `cancelled_at`,
`revoked_at` and their relatives are STATE.** NULL is the live case and the
common one. They belong to the same family as `effective_to` and take the same
treatment — set on exactly one row per table, so both paths exist and the live
rows outnumber the dead ones.

Two smaller things surfaced building on top of it:

- **A backtick inside a SQL comment ends the JavaScript template literal.**
  Quoting a column name as `` `tasks.assigned_to` `` inside a `tx\`...\`` query
  produced an esbuild parse error, not a SQL error, and the file failed to load
  at all. Use plain quotes in SQL comments.
- **`tasks.assigned_to` is TEXT holding a uuid, with no foreign key.** Joining
  it to `employees.id` raises `operator does not exist: uuid = text`. Cast the
  UUID side to text rather than the text side to uuid: a malformed value then
  matches nothing and the task shows as unassigned, instead of raising
  `invalid input syntax for type uuid` and taking the whole board down. Several
  other `_by` and `_id` columns are typed the same way — worth a migration one
  day, and worth knowing about before then.

### L51 — Completing the fixture is a test, and it found three things

L50 completed the eighteen personal-data tables. Extending that to the whole
schema — 602 empty columns across 103 tables, and eight tables holding no rows
at all — was not bookkeeping. Filling them ran every existing guard against
data for the first time, and three separate faults fell out immediately.

**Five `_ct` columns had never held a value.** `bank_accounts.iban_ct`,
`swift_code_ct`, `clients.tax_id_ct` and both `vendors.bank_*_ct` columns were
empty, so `pii/ciphertext-is-sealed` and `pii/encrypted-name-is-honest` had
passed over them without ever examining one. Filling them with plaintext made
both fail at once — the guards were correct and had simply never been reached.
They are now sealed to the TENANT subject, because the firm's own banking and
its counterparties' identifiers must survive an employee's erasure.

**`dev-users.sql` was missing from `[db.seed] sql_paths`.** `supabase db reset`
left `auth.users` EMPTY and reported success, so after any reset nobody could
sign in — and the symptom is a login that redirects, not an error mentioning
seeds. CLAUDE.md already warns about a *wrong* `sql_paths`; this is the second
form, a *missing* one, and it is harder to see because the file exists and
looks seeded.

**`firm_payroll_policies` had no INSERT anywhere.** Only the generated UPDATEs
referred to it, and they matched zero rows in silence. Overtime thresholds and
rounding differ by jurisdiction — 40 hours weekly in the US, 48 in the UK and
India, with different multipliers — so a table with no rows meant the one place
those rules live had never been exercised.

Two things about doing this safely, both learned by getting them wrong:

- **A generated value must satisfy the constraints, not just the type.** A
  literal in a UNIQUE column collides on the second row; `'Company Size 1'`
  fails a CHECK that lists five permitted strings; a date that ignores an
  ordering constraint aborts the whole seed. Derive unique values from the
  row's own id, and read the CHECK before inventing a value.
- **Never generate into a column named `_ct` or `_pvt`.** The suffixes exist to
  say "this is not an ordinary string" (L49), and a generator that ignores them
  writes plaintext into a column whose name promises ciphertext. Envelopes come
  from `sealField` or they are wrong.

Seed order matters too: `profiles` and `stripe_customers` are foreign keys into
`auth.users`, so they belong in `dev-users.sql` rather than `mock-data.sql`,
and they must be UPSERTs because Supabase's own trigger already created the
profile row.

Three columns remain deliberately empty — `projects.contract_id`,
`projects.proposal_id`, `tasks.assigned_team_id` — because the tables they
reference do not exist yet. Those are committed exemptions with that reason,
and they should be deleted when the modules land.

### L50 — An empty fixture column is a check that has stopped testing

`compensation_premiums` held zero rows. The five JSONB compensation columns on
`employees` were `{}`. `total_pretax_deductions` was `0.00` on every payroll
line. In each case a check ran, passed, and proved nothing — a test whose
subject is NULL does not fail, it reports the absence of data as the absence of
a problem.

Completing the fixture across the eighteen tables holding data about a person
turned up a guard that had been passing for the wrong reason for months:

```sql
-- PAY-math, as it stood
abs(gross_pay - (net_pay + total_taxes + total_posttax_deductions)) < 0.02
```

`total_pretax_deductions` is missing from that identity. It passed only because
every fixture row had zero pre-tax deductions, so the check asserted a special
case rather than the rule. Give one employee a 401(k) and the payslip
reconciles wrongly with nothing failing. The repository's own
`inconsistentLines()` had the identity right, which is the independent-suites
argument working exactly as intended — but nothing compared them until the
fixture made the disagreement reachable.

`scripts/verify-fixture-coverage.mjs` now fails the build on any column of a
personal-data table with no non-empty value, with a committed sparse list —
and "we did not get round to it" is explicitly not a reason there.

Three things worth knowing when filling one:

- **A numeric `0` and a `false` ARE data.** Excluding them would recreate the
  blind spot the check exists to close.
- **Set `effective_to` on exactly one row per table.** Everywhere, and every
  arrangement has ended; nowhere, and the superseded-record path is untested.
- **Ciphertext must be generated through the real sealing pipeline.** Envelopes
  bind `tenant | table | column | row` as AAD and are wrapped by the
  per-employee keys in `pii_keys`, so one copied from another column simply
  fails to open — and it fails *silently*, because the column still looks
  populated and the coverage check is satisfied. `pii.test.ts` now opens every
  sealed fixture value; that is the only assertion that proves the ciphertext
  is real.

### L49 — Make the name assert the classification, never infer it

The disclosure matrix records which columns are restricted. The column names
did not, so `base_amount` sat beside `first_name` looking equally ordinary and
`COALESCE(cp.amount, e.base_amount)` read as unremarkable in review (L47).

Sensitive columns on `employees` now carry `_pvt`, beside the existing `_ct`
for ciphertext. The property that buys: **a column on `employees` with neither
suffix is directory data, by construction**, and a restricted read is visible
in a diff — `e.base_amount_pvt` shows the problem where `e.base_amount` showed
nothing.

This looks like the name-based oracle that L48 rejects, and it is the opposite
operation. L48 refuses to *infer* sensitivity from a name, because a regex
misses a renamed column, JSONB interiors and innocuously-named PII. Here the
matrix decides and the name is required to *agree* — checked in both
directions, so neither a restricted column without the suffix nor a suffixed
column nobody classified can ship. Inference is a guess; assertion is an
invariant.

Scope follows the same asymmetry as the matrix: only `employees`, because only
a broadly-visible row needs per-column marking. Where a row policy scopes the
whole row, the table name already says it and fifty suffixes would be noise.

Renaming a column is a forward-only migration and moves the structure snapshot,
which must be regenerated from a migration-built database — never from a
hand-modified one.

### L48 — Protection is applied per mechanism; disclosure happens per value

After L47 the question was not "what else is broken" but "why did nothing
catch it". The answer is that every guard in this codebase inspects a
different unit than the one that leaks:

| Guard | Unit it inspects | Why L47 was invisible to it |
|---|---|---|
| tenant isolation (587) | tenant A vs tenant B | the leak was *within* a tenant |
| row visibility (75) | what a TABLE returns for a claim | the leak was in a *projection* |
| schema invariants (133) | `information_schema` | cannot see a query, or inside JSONB |
| repository tests | a repo's output, as an OWNER | the restricted branch is unreachable |

Each had a principled reason not to see it. That is a gap with a shape, not
bad luck — and every `./check` step is a tombstone for a specific incident,
which means the set of things it catches is exactly the set of things that
have already happened once.

The missing question is **value-centric**: for this *value*, what are all the
read paths, and what holds each one. `apps/web/src/lib/server/security/matrix.ts`
asks it. Three things about its design earned themselves:

**`defense` is the spine, not `audience`.** On a broadly-visible row RLS
*cannot* hide a column, so "the test saw NULL" proves nothing — the five JSONB
compensation columns on `employees` are empty in the fixture and would have
passed any visibility assertion while protected by nothing at all. Each field
names the mechanism that holds it, and the test asserts that mechanism is in
force.

**Per-column declarations are only needed where the row is broadly visible.**
`employees` is a staff directory, so every colleague reads the row and each
value must name its own defense. On `compensation_*` the row policy scopes the
whole row, so one declaration covers thirty columns — and thirty per-column
entries would be thirty restatements of one fact, and thirty places to be
wrong.

**Exhaustiveness is a build step, not a test.** `verify-matrix-complete.mjs`
enumerates the schema and fails on any column that is neither classified nor
on a committed not-sensitive list. This is the only part that catches the
CLASS rather than the instances: `employees.base_amount` was not
mis-classified, it was *unclassified*, and so were the five JSONB columns
beside it. Deliberately not a regex over column names — the name-based sweep
that found L47's neighbours would miss a renamed column, anything inside a
JSONB document, and PII with an innocuous name. Both were verified by probe:
adding `employees.bonus_target` and `employees.notes_internal` each fail the
build.

Two things fell out of building it that are lessons in themselves:

- **`compensation_premiums` held zero rows**, so every "a colleague cannot see
  this" assertion against it passed with nothing to hide, and the table was
  missing from the row-visibility suite entirely. A policy with no fixture row
  has never been tested. The matrix now asserts a fixture row exists for its
  subject before trusting any negative case.
- **`supabase db reset` drops the `app_user` password**, and every visibility
  test then fails with `password authentication failed` — which reads as a
  security regression and is a setup artifact. `./setup` restores it; running
  `db reset` alone does not.

### L47 — RLS hides the row; a COALESCE puts the value back

`compensation_base` carries a row-visibility policy: as a plain employee you
see your own pay and nobody else's, and the database enforces it. The directory
query then read:

```sql
COALESCE(cp.amount, e.base_amount)::text AS base_amount
```

`employees.base_amount` is a denormalised **cache** of that same figure,
maintained by `syncCache`, on a table with no such policy. So the policy did
its job, `cp.amount` came back NULL for every colleague — and the query
substituted the unprotected copy. **Every employee could read every
colleague's salary from the directory page.** No error, no empty state, no
failing test: just the right-looking number in the right-looking column.

Three things made it survive:

- **It reads correctly to its author.** Whoever writes the query is usually
  privileged, and a privileged actor never reaches the fallback branch.
- **The repository suites run as an owner.** `time_off.test.ts` says so out
  loud, for a good reason — an owner actor stops a policy silently narrowing
  what a repository test sees. The cost is that the fallback branch of *every*
  `COALESCE` in the codebase is unreachable from those tests.
- **The row-visibility suite proved the wrong thing.** It proved the *table*
  was protected, which it was. Nothing proved the *figure* was unreachable, and
  the leak was in the projection, not the table.

The rule: **a protected column may not fall back to an unprotected one.** Read
the protected column alone and let it be NULL — a blank figure is the correct
answer for someone who may not see it. `./check` runs
`scripts/verify-no-unprotected-fallback.mjs`, which fails on exactly this
shape, with the usual committed-literal exemption list.

And the wider one: **a regression test for an access rule has to run as the
actor who is meant to be refused.** `employees.test.ts` is that test; it fails
on the old query and passes on the new one, and it asserts both halves — a
colleague's pay is NULL *and* your own still is not, because a policy that
blanks everything reads as a broken page rather than as a rule (L21).

### L46 — A subtotal whose children do not add up

The payslip listed taxes and deductions under one **Taxes** heading. The
subtotal was ₹37,333.38; the rows beneath it were Social 11,200.01, Income Tax
26,133.37 — and Pension 13,333.35, which is a *deduction*. The first two sum to
the subtotal exactly. The third does not belong to it.

So the page showed a heading, a figure, and a list of children that visibly
failed to equal it, on the one document a person checks arithmetic on. Net pay
was right; the explanation of it was not, which on a payslip is the same
severity — an employee who cannot reconcile their own slip has to ask, and the
answer is that the page grouped it wrongly.

Every subtotal owns its children. Taxes and deductions each get their own
heading and their own total, and the column then reconciles down to net.

The total is summed in **SQL**, not by adding the two strings in JavaScript:
that is the float64 round trip, and once the fields are correctly typed as
strings it becomes silent concatenation with no type error.

### L45 — A cast can promise columns the query does not select

`forEmployee` joined `payroll_runs` and declared its return type as the line
type widened with `pay_date`, `currency` and `run_id`. The select list — a
shared `LINE_SELECT` constant — names only `pe.*`. The three columns were never
selected, and `as never` silenced the compiler.

What the page rendered was `undefined 216000.27` as a take-home figure, next to
a date of `—`.

Two multipliers:

- **`money()` printed it.** Its fallback for a currency `Intl` rejects is
  `` `${currency} ${value}` `` — deliberate, so an unknown three-letter code
  stays visible rather than being shown as dollars. But a *missing* currency is
  a caller bug, not an unknown currency, and sharing that path turned it into
  the word "undefined" beside real money. It now throws in development and
  keeps the verbatim-code fallback only for well-formed codes.
- **The ordering test passed vacuously.** It asserted
  `[...dates].sort().reverse()` equalled `dates` — over a column of
  `undefined`, which is trivially true. A test that reads a field must first
  assert the field is *there*.

Widen a return type only where the query widens too, and never with a cast that
cannot fail.

### L44 — A hidden link is not a permission

Every entry in the sidebar was shown to everyone, so a plain employee was
offered **Pay Runs** — the firm's whole payroll — and got an error page. The
`load` refused them correctly; the navigation had simply never been told.

The fix is that a menu entry may carry a `permission`, and one the viewer lacks
is removed. Two things about it that are easy to get backwards:

- **It is not access control.** It stops the app offering a route that answers
  403. Every load and every action still checks for itself, and must keep doing
  so — treating a hidden link as the guard is how an unguarded route ships.
- **The permission list is sent to the browser.** It is the viewer's own
  capability list, which is not a secret; the data behind those routes is what
  is protected, server-side.

The related product point: refusing a page is not the same as having nothing to
offer. An employee has no business reading the firm's pay runs and every
business reading their own payslips, so **My Payslips** is the entry they get.

### L43 — A test that compares two machines' clocks tests neither

`audit.test.ts` proved `occurred_at` is stamped by the database and not by the
caller — by asserting `Date.now() - occurred_at < 60s`. It passed for weeks and
then failed once, in a `./check` run that passed again nineteen seconds later.

Nothing about auditing had changed. The host had been asleep for two days; on
wake, macOS corrects its clock immediately and the Docker VM Postgres runs in
catches up a moment later. For that moment the two disagreed by more than a
minute, and the assertion — which spans both machines — reported it as an audit
defect.

A wall-clock comparison is only meaningful against **the clock that produced the
value**. The column defaults to `now()`, so the honest test compares it to
`clock_timestamp()` in the same query, and states the real claim separately:

```sql
SELECT abs(extract(epoch FROM clock_timestamp() - occurred_at)) AS drift,
       occurred_at = now() AS is_default        -- nobody supplied it
```

`occurred_at = now()` is the stronger assertion and the one actually worth
making: `now()` is transaction start, so only the column default can equal it
exactly. It cannot drift, because both sides come from the same clock.

The general rule: **in a test that spans the app and the database, any
comparison whose two sides come from different machines is measuring the
infrastructure.** It will be flaky, the flake will look like a product bug, and
— worst — a second run will "fix" it, which is how a real intermittent failure
gets waved through.

### L42 — A narrowing policy turns a missed call site into a wrong number

Adding row-level RLS meant every `withTenant` had to carry the actor, not just
the tenant. A scripted replace updated 17 route files by matching
`withTenant(locals.tenantId` — and missed the one call written across two
lines:

```ts
const { jobTitles } = await withTenant(
  locals.tenantId,        // <- still a bare tenant id
```

Nothing failed. `./check` was green, 414 tests passed, the page rendered. It
just said **"0 people"** under every job title while the directory listed those
same people, because the headcount subquery joins `employees` and a claim with
no role is denied by the policy. Found by taking a screenshot.

**This is the shape of every RLS regression: not an error, a wrong number.** A
policy that narrows converts a forgotten parameter into silently missing rows,
and the smaller the number the less it looks wrong — 0 people under a job title
nobody holds is indistinguishable from 0 people under one four people hold.

Two things follow:

- **Grep for the call, not for the argument.** A regex over
  `withTenant(locals.tenantId` cannot see a line break. `scripts/verify-actor.mjs`
  matches `withTenant\(\s*(locals\.tenantId|tenantId)\s*,` across newlines and
  is a `./check` step, so the next one fails the build instead of the page.
- **After adding a narrowing policy, look at the pages.** The tests asserted
  that the right rows come back for a given claim; they could not assert that
  the application sends the right claim.

### L41 — An invariant that cannot see a column is not guarding it

`money/numeric-not-float` has guarded monetary columns since Phase 1, and it
reads `information_schema.columns`. A JSONB column is therefore invisible to it
**by construction** — the rule cannot fail on data it never looks at.

That is how payroll came to hold every earning, tax and deduction as a JSON
number, on the largest money surface in the product, months after CLAUDE.md
recorded that money inside JSONB is a string. `earnings.base` equalled
`gross_pay` on every row: the same money in two places, one exact `numeric` and
one that becomes a float64 the moment a driver reads it.

**When a rule is written, say what it CANNOT see.** The fix is not a bigger
regex — it is a second rule (`money/jsonb-is-text`) walking a registered list of
JSONB paths, because a pattern match over document contents would either miss
nested values or absorb the next mistake.

And it found one immediately that the migration had missed:
`payroll_tax_deposits.tax_breakdown`, whose fixture re-inserted numbers after
the migration had converted them. Migrations run *before* the seed — a data
migration alone never fixes a fixture.

### L40 — "Append-only" that permits UPDATE is not append-only

`20260830120000` revoked DELETE across the schema and the repository called
itself append-only. `audit_log` still granted UPDATE, and for that table it is
the same hole wearing a different name: an audit log whose entries can be
edited answers "what happened?" with whatever the last writer preferred. The
whole value of the record is that nobody could have changed it afterwards.

It survived because DELETE is the word everyone checks. Nothing about the
grant looked wrong, `deletion/app-cannot-delete` passed, and the table had the
right indexes and the right shape.

**For a table whose point is that it is evidence, enumerate the privileges it
should have rather than the one it should not.** `audit_log` holds INSERT and
SELECT. A correction is a new row — the same discipline as forward-only
migrations, and as a ledger.

Two more things fall out of the same reasoning:

- **`occurred_at` must not be caller-supplied.** It is what an auditor sorts
  and filters by, so a row claiming to have happened last year sits quietly in
  the middle of the history. It now defaults to `now()`.
- **The trail is written in the SAME TRANSACTION as the change it describes.**
  Written afterwards, or best-effort with a swallowed error, it records what
  the application *believed* happened — and the two diverge exactly when it
  matters, because the interesting failures are the ones where the write
  succeeded and something else did not.

### L39 — A promise the schema records but cannot keep

`hr_feedback` stores `from_employee_id` and `is_anonymous` in the same row.
Both are correct. The anonymity promise still breaks the moment any page joins
to `employees` and renders the author — no error, no type failure, no test
failure, and nobody finds out until the person who wrote the note does.

The same shape appears wherever a flag says "do not show this" while the value
sits beside it: `hr_reviews.manager_assessment` before it is submitted,
`employees.ssn_tax_id_ct` for a role holding `pii.read` but not `pii.reveal`.

**A flag that governs disclosure has to be enforced where the data is read,
once, and the governed value must not be in the returned type at all.** In
`hr_feedback.repo.ts` the author's name is resolved in SQL with
`CASE WHEN is_anonymous THEN NULL`, so the id never leaves the database — a
repository that fetched it and dropped it in TypeScript would still have put it
in a result set, a log line and a heap dump. A test asserts the id does not
appear anywhere in the serialised rows.

And the fixture had no anonymous row, so none of this was exercised. **A rule
with no fixture row that triggers it is a rule nobody is testing** — the same
lesson `verify-rls.sql` already encodes by failing when a table has no fixture
rather than passing vacuously.

### L38 — A key derived from an identifier is not a key

`module-employee-profile.md` specifies
`encryption_key = DERIVE_KEY(org_prefix + org_4digit_code)`, and it reads like
cryptography: there is a KDF, PBKDF2 and Argon2 are named, AES-256-GCM is
required. It is not. A public prefix plus four digits is ten thousand
candidates — about 13 bits — and a KDF raises the cost of one guess, not of ten
thousand. Both inputs are also *stored in the database the encryption
protects*, so the recipe ships with the ciphertext.

Implemented as written, `./check` would have passed, the column would have held
real AES-256-GCM ciphertext, and the whole thing would have been decryptable in
seconds by anyone with a dump.

**A specification can be confidently wrong about security, and it will not look
wrong.** The tell is not the algorithm — that part was fine — but the *entropy
of the key input*. When a spec names a KDF, ask what is being derived from and
count the possibilities. Here the fix preserved the spec's stated storage
format (`{prefix}-{4digit}` is a key *label*) while replacing the key material
with 32 random bytes.

### L35 — A `timestamptz` fixture written as wall-clock time is invisible

`hr_attendance.clock_in_time` is `timestamptz` — an instant. The fixture wrote
`'2026-01-06T09:00:00Z'` for a Bangalore employee, which is **14:30 IST**. Every
row inserted, `./check` stayed green through 575 isolation checks and 167
specification checks, and the data looked entirely reasonable in `psql`, because
`psql` prints UTC and 09:00 is a plausible start time.

It is only wrong once something renders it in the office's zone, which is the
one thing a specification check does not do.

**`AT TIME ZONE` the office, then read it.** And a second rule falls out of the
same table: **`attendance_date` is the LOCAL date and cannot be derived from the
timestamps.** A shift ending 23:00 in New York is 04:00 UTC the next day, so
`clock_out_time::date` is legitimately a day ahead of the day the shift belongs
to. A `::date` cast in a query is the bug; the fixture now carries exactly one
such shift so a test can fail on it.

### L36 — `types: {}` adds parsers, it does not remove them

`client.ts` passes `types: {}` to postgres.js with the comment "Keep NUMERIC as
a string". That works — but not for the reason it reads as. The option
*registers custom* type handlers; it does not disable the built-in ones.
`NUMERIC` survives as a string because postgres.js has no built-in parser for
it, while `timestamptz` does and arrives as a **`Date`**.

So two columns of the same row come back as different kinds of thing. Declaring
a `timestamptz` as `string` in a repository type compiles, passes review, and
throws `\`.slice is not a function\`` at runtime. Check what the driver
actually returns before writing the type.

### L37 — `''` is not a safe placeholder for any cast, not just `uuid`

L-time-off recorded that `(${x} = '' OR id = ${x}::uuid)` still raises, because
SQL does not short-circuit. The same expression with `::date` fails **earlier
and differently**: postgres.js reads the `::date` hint, serialises the parameter
itself, and throws `RangeError: Invalid time value` from `new Date("")` before
the query is ever sent — a driver error, not a Postgres one, so it does not look
like SQL at all.

Pass `null` and test `IS NULL`. It casts cleanly through both mechanisms, for
every type.

**A validator that runs after its own gate is not a validator.** The fix for
L33/L34 reintroduced L33 in the three files it patched in place rather than
rewrote: the readers sat inside the object literal passed to `update()`, which
is evaluated after `if (!f.ok)`. Thirteen fields — every optional one on the
employee record among them — accepted anything and saved NULL with a 303.

Two things made it invisible. TypeScript is happy: the reader returns
`string | null` and the column is nullable, so the types line up exactly as
they would if it worked. And the unit tests all read a field and *then* check
`ok`, which is the correct order — they cannot see a call site that does it in
the wrong one. The sweep that found it was structural: for each action, the
line number of the gate, then a grep for readers below it.

**The column type is not the validator.** `varchar(n)`, `uuid` and enum types
are the last line, and their failure mode is a 500. Check length, shape and
enum membership in the action, where a `fail(400, { errorFields })` puts the
user back in the form. `@kaaj/enums` already has the enum values, and
`./check` keeps them current.

---

## Process

### L19 — Structural verification is not visual verification

The `list` rewrite passed every probe: three rows, correct names, `.list-row`
computing to `display: grid`, table correctly hidden. It also rendered the
location name **one character per line**, and none of the assertions could have
caught it.

**Look at the page.** Assertions prove what you thought to ask; a screenshot
shows what you did not.

### L20 — Regenerate the schema snapshot only from a migration-built database

`supabase db reset && pnpm db:snapshot`. Generating from a hand-modified
database bakes local experiments into the baseline. Already happened once: a
manual `ALTER` left `invoices.total` as `numeric(18,2)` when the migration says
`numeric(15,2)`.

### L26 — `supabase db reset` drops the `app_user` password

The migration deliberately creates `app_user` with `LOGIN` and no password
("set out of band — never in a migration"), and `./setup` sets it. A bare
`supabase db reset` therefore leaves the role unable to authenticate, and every
database-backed test fails at once with `password authentication failed`.

It reads like the tests broke. They did not; the credential went away.

```bash
psql "$DATABASE_URL" -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"
```

or just re-run `./setup`, which does it and re-verifies RLS.

### L21 — A page that renders empty is the default failure mode here

Multi-tenancy fails closed by design: no tenant means no rows, not an error
(L1–L5 are all instances). When a page is blank, walk the chain outward —
claim in the token → `locals.tenantId` → `withTenant` → RLS → fixture rows —
rather than debugging the component.

---

## Conventions

**Explanation lives here; code carries a pointer.** A comment that restates a
lesson goes stale in place and makes the file harder to scan. Reference the
lesson instead:

```ts
// L2: set_config is a no-op outside a transaction; SET cannot be parameterised.
```

Comments still earned inline, without a lesson reference:

- a non-obvious *local* invariant a reader cannot infer from the code
- a deliberate deviation that looks like a mistake
- a `why not the obvious thing` that would otherwise be re-attempted

**Compare against the live template before calling UI work done.**
<https://nexus.daisyui.com/dashboards/ecommerce> is canonical — spacing, card
and table treatment, type scale, density, empty and loading states, breakpoint
behaviour. It is also the fastest way to settle "is this how Nexus does it, or
did we invent it?", which is the question behind L9-L18 and L23.

**SQL is the exception.** `supabase/migrations/` and
`packages/database/fixtures/` keep their long headers: the four pre-existing
migrations set that house style, they are the authoritative schema, and they are
read in isolation by people who will not have this document open.

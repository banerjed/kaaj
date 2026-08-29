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

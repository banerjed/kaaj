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

### L18 — Fonts are self-hosted, not loaded from a third-party CDN

A `<link rel="stylesheet">` to an external origin blocks paint until it
resolves, regardless of `font-display: swap` — that setting governs how TEXT
renders once the CSS has loaded, not whether the browser waits on the fetch
first. `preconnect` only removes DNS/TLS negotiation, not the response itself:
measured, the Google Fonts stylesheet alone cost ~100ms of a ~120–200ms total
page load. `@fontsource-variable/inter` / `@fontsource/instrument-serif`
(imported in `typography.css`, bundled by Vite like any other local file)
removed the external hop entirely.

This entry previously said fonts belong in `app.html`, true only for an
external `@import url(...)`, which chains (fetch+parse the CSS, discover the
import, fetch that). A LOCAL import of a bundled package is resolved once at
build time — not a runtime chain — so it now lives with the rest of the
typography config instead.

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

### L73 — Owning a copy of someone else's palette means owning its bugs

Two themes lived as ~98 lines of hand-written tokens copied out of the Nexus
template. Nobody had measured them. `--color-info-content`,
`--color-success-content` and `--color-error-content` were all `#ffffff`,
paired with mid-bright colours white cannot sit on, so 3 of 4 solid coloured
badges — and every solid `btn-*` and `alert-*` on the same pairs — failed WCAG
AA in the light theme. `--color-warning-content` was near-black, which is the
only reason `warning` passed and the only reason the problem was visible at all
when soft badges were trialled against it.

Replacing both with daisyUI's built-in `nord` and `night` fixed every one of
them and deleted the 98 lines. Nothing was "fixed" in the sense of tuning a
colour; the copy was simply given back to the people who maintain it.

**A vendored palette is a dependency you have hidden from your dependency
manager.** It cannot be updated, nothing tells you it is stale, and no test
covers a colour. The same argument applies to a copied icon set, a copied type
scale, or any other design token block.

Two things fell out of it. `theme.spec.ts` asserted `--color-base-100` equalled
`#ffffff` — a literal from the palette we no longer own, which is the coupling
the change existed to remove; it now asserts the variable RESOLVED and lets the
painted brightness say which palette applied. And the theme NAMES are now
daisyUI's, written to `data-theme`, while the labels a person reads stay Light
and Dark — a stored `light` or `dark` from before falls through the existing
unknown-theme guard to `system`, so no migration was needed.

**Every hand-parsed colour string in this session was wrong.** Three separate
times: `oklab()` components read as RGB 0-255 (reported 10.28:1 for a 1.94:1
pair), an alpha colour composited over white instead of its real backdrop
(1.4:1 for 4.63:1), and a `/\d+/g` channel regex over `oklch(0.20768 …)`
scoring a near-black surface at brightness 20788. Paint the colour to a canvas
and read the pixel; the browser is the only correct parser, and it is three
lines.

### L72 — We drifted from the template's badge idiom, and only a third tool saw it

The complaint was "lots of very complex class definitions, against the grain of
daisyUI". Measured, the product code was the opposite: `(app)` had **8**
elements with 7+ classes; `nexus-sveltekit-ref`, the template it derives from,
has **744**. The long chains were all in `(marketing)` and the vendored shell.
Checked against daisyUI's own rule set, `(app)` had zero dynamically built
class names, zero arbitrary colour utilities, and zero component-fighting
overrides — every apparent override was `card bg-base-100 shadow`, which is
required because `.card` sets no background, and which Nexus itself writes 62
times to our 63.

What WAS wrong was invisible to that complaint: eleven pages had independently
written the same status→badge ternary. That consolidated cleanly.

**The interesting part is what happened next.** Nexus uses `badge-soft` 28
times and solid never, and daisyUI's own guidance prefers soft — two
authorities agreeing against us — so the badges were switched. Rendering them
and MEASURING the contrast said otherwise: in the light theme soft is worse on
every tone, and takes warning from 9.57:1 (passing AA) to 1.94:1. The change
was reverted and the divergence recorded.

Two authorities agreeing is not evidence about YOUR theme. Both were reasoning
about daisyUI's default palette; this product's `--color-*-content` tokens pair
white with mid-bright colours, which soft's tinted background makes worse. The
measurement is the only thing that knew that — and 3 of 4 solid badges fail AA
in light as well, which nobody had measured either (docs/07-app-provenance.md).

A trap inside the trap: the first two contrast figures were wrong. daisyUI
emits `oklab(0.982 0.003 0.012)`, and a hand-rolled parser reads those as RGB
0-255, producing a confident 10.28:1 for a pair that is actually 1.94:1. Let
the browser convert the colour — paint it to a canvas and read the pixel.

**A style guide nobody diffs against is decoration.** `./check` proves the
schema, the policies and the units; nothing in it can see that the product
stopped looking like the template it is supposed to look like. The tiebreaker
was already committed in `nexus-sveltekit-ref` and one `grep` answered it.

Two smaller things from the same change. `badge-ghost` and `badge-soft` are
both *style* modifiers and are mutually exclusive — combining them silently
drops one. And a screenshot found what no test could: an invoice whose status
IS `overdue` rendered a grey badge, because the vocabulary listed `void`,
`sent` and `viewed` — none of which occur — and omitted the one that does
(L57 again, in a colour rather than a filter).

### L71 — An `Intl` default is a moving target, and CI is on a different Node

`approxMoney` set `maximumFractionDigits: 2` and let the MINIMUM come from the
currency. `style: "currency"` gives USD a minimum of 2, and whether compact
notation overrides that is an ICU judgement rather than a fixed rule. It
changed:

    Node 25 (local)  ->  $950
    Node 22 (CI)     ->  $950.00

Same commit, same code, same test — green locally, red in CI. The comment
beside the option said "a cap, not a minimum", which was the intent and not
what the code stated; it only read as true on the machine it was written on.

**State every `Intl` option the assertion depends on.** An inherited default
is a dependency on the runtime's ICU data, and the test that pins it is exactly
the test that will disagree across environments.

Worth generalising past `Intl`: this surfaced only because CI finally ran the
suite. It had been failing to start for long enough that nobody had seen the
application tests execute there at all, so a version-dependent assertion had
nowhere to show up. A check that cannot run is not a check that passes.

### L70 — A permission model the database does not know about protects one path

`accounting.read` and `accounting.write` were granted to `finance_admin`
alone, every accounting route called `requireCan`, and `./check` proved all of
them did. Fifteen accounting tables still carried `tenant_isolation` and
nothing else — so every member of a firm could read every invoice, payment,
journal entry and bank account it holds, and write them, the moment any query
path reached those tables without passing a route guard.

Nothing was failing. The application was right, the harness was right about the
application, and the database had simply never been told the same thing. That
is the "protection is applied per MECHANISM, disclosure happens per VALUE" shape
from CLAUDE.md § Security, in its least visible form: not a missing guard, but
two layers holding different opinions with only one of them tested.

`docs/15-row-level-visibility.md` had it as Tier 3 — "tenant-only, **and should
stay that way**" — on the reasoning that these are "business records that
everyone in a function reads". The reasoning is what to notice: it was written
about firm CONFIGURATION and extended to finance by adjacency. A plain employee
is not in the finance function, and `packages/authz` already said so.

Two predicates, not one, because `auditor` reads everything and writes nothing;
four RESTRICTIVE policies per table, because `FOR ALL` cannot express that
split. Measured after: employee, `hr_admin`, `it_admin` and a malformed claim
all see zero; `finance_admin`, `auditor` and `owner` see the fixture's rows;
`auditor` updates zero rows without an error, because a RESTRICTIVE `UPDATE`
policy filters rather than raises.

**Ask of any permission: which layer enforces it, and what does the OTHER layer
think?** A route guard and a row policy that disagree are not defence in depth.
They are one defence and one assumption.

### L69 — `PostgresError.detail` is the row, and whether you see it depends on the ROLE

A unique-violation error from this database carries the values that collided:

    detail: Key (tenant_id, department_code)=(07fb03f8-…, ENG) already exists.

The surprise is that this is role-dependent, and the two measurements disagree
in the way most likely to mislead. Connected as `postgres` — the table owner —
`detail` is populated. Under `SET LOCAL ROLE app_user`, which is what every
request runs as (L3), Postgres withholds it and `detail` is `undefined`. Same
statement, same constraint, same driver.

So a probe run from a script "proves" the leak, and the same probe through the
running app "proves" there is nothing to worry about. Both are correct about
the path they exercised. The owner-role path is not hypothetical: `./check`,
the migrations, `packages/database/tests/verify-remote.sh` and anything holding
`PRIVATE_SUPABASE_SERVICE_ROLE` all connect that way.

`message` is not role-dependent and echoes the submitted value at any
privilege — `invalid input syntax for type uuid: "not-a-uuid"`, and the same
shape puts a date of birth in the log for a `date` column.

`safeError` in `$lib/errors.ts` is an allowlist for this reason, and
`errors.test.ts` is where the rule is observable, because the request path
cannot produce the field it exists to drop.

**When a security probe passes, check which credential ran it.** A defence
measured on one path says nothing about another, and the privileged path is
usually the one nobody tests.

### L68 — A refused form closed the form, and an archive that did nothing said it had

Two halves of the same failure: the page asserted an outcome that had not
happened.

**The modal.** Every settings form lives in `{#if editing}`, where `editing` is
`$state`. A plain `<form method="POST">` reloads the page on submit, which
reconstructs that state as `null` — so a `fail(400, …)` came back, the alert
rendered, and *the form it described was gone*, along with everything typed
into it. The action had named the offending field in `errorFields` the whole
time; the control it named was no longer in the document. `departments` even
returned `editing: id || "new"` in its failure payload, for a page that never
read it.

**The archive.** All eight `archive` actions ran `UPDATE … WHERE id = $1`
against a repository returning `Promise<void>`, then answered
`{ archived: true }`. An id matching nothing — a stale tab, a crafted POST, a
row this actor's policies hide — is indistinguishable from a successful
archive. Observed as the OWNER, so it is not an RLS artifact; it wrote an audit
entry for the archiving too.

`use:enhance` with `update({ reset: false })` fixes the first: no reload, so
the modal stays and the typed values with it. **The default `update()` RESETS
the form**, which discards the person's work at exactly the moment they need it
back. The second is `RETURNING id` and a boolean the action checks before it
claims anything, or writes an audit entry.

**Ask what the page would look like if the write silently did nothing.** If
that is identical to success, the page is not reporting the write, it is
reporting that the request was received.

### L67 — `/^\d{4}-\d{2}-\d{2}$/` accepted 2026-02-31, and it was stored as 2026-03-03

`FormReader.date()` exists because a shape check is not a date check, and says
so in its own docstring. Two files validated dates with the bare regex anyway —
`employee-form.ts` for `start_date`, `end_date` and `birth_date`, and the pay
schedules action for `anchor_date`.

Posted against the running app:

| Input | Result |
|---|---|
| `start_date=2026-02-31` | **303, saved, stored as `2026-03-03`** |
| `end_date=2027-06-31` | **303, saved, stored as `2027-07-01`** |
| `birth_date=2026-13-45` | 500 |

The rollover is the dangerous one. `2026-02-31` has the right shape, so the
regex passes it; postgres.js then serialises it through a JS `Date`, which
rolls the overflow forward and hands Postgres a date that is real. Nothing
errors, `saved: true`, and the hire date is three days wrong — which is a wrong
first pay period and a wrong leave accrual. A browser's `<input type="date">`
will not submit it, so it is crafted-POST reachable, exactly like L34.

`f.date()` round-trips the parse — `new Date(t).toISOString().slice(0,10) ===
raw` — so a day that does not exist cannot come back as one that does.

**A regex validates a STRING. Only a parse validates a date.** The same is true
of anything the driver serialises on the way out: the check has to be in the
same units as the thing being stored.

### L66 — Every database refusal a form could provoke was an "Internal Error" page

`FormReader` is thorough about the shape of a value and knows nothing about
what is already in the table. Everything in that second category reached the
user as a crash page with the form's contents gone. Posted against the running
app, all `500`:

| Input | SQLSTATE |
|---|---|
| a second office with `location_code=US-NYC` | 23505 |
| a second department with `department_code=ENG` | 23505 |
| a second holiday with `holiday_id=US-NEWYEAR` | 23505 |
| a second employee with `employee_id=E003` | 23505 |
| `company_size=gigantic` — a CHECK, not an enum | 23514 |
| a benefit item pointing at an archived package | 23503 |
| a job level pointing at an archived title | 23503 |

None is exotic. Four are "somebody already used that code", which is the most
ordinary thing a person can do to a form, and two are a stale tab. Only
`projects.repo` and `payroll_runs.repo` mapped a SQLSTATE to a sentence, and
`firm_locations.repo` carried a comment *admitting* a second headquarters
raises a raw constraint violation.

The registry in `$lib/server/db/constraints.ts` answers them, keyed on
**`constraint_name`, never the message text**: the message is prose Postgres
composes and may change, the name is in the migration, and SQLSTATE 23505
alone cannot say which field to put the cursor on. An unregistered constraint
still crashes loudly rather than collapsing into "something went wrong" — that
is what gets the next one registered instead of hidden.

`./check`'s `refusals have a message` step compares the registry against the
live schema in both directions, so a new UNIQUE or CHECK on a form-written
table fails until somebody decides what the person should be told. This is the
third time a rule that existed only in prose turned out to be followed
unevenly (L54, L48).

### L65 — A test that waits for nothing can pass before the code runs

Three theme cases asserted `data-theme` is null, and would have passed against
an application that never executed.

`data-theme` is written by an `$effect` after hydration. Reading the attribute
straight after `page.reload()` is a race — the dark case came back null one run
in five, failing in a full suite and passing when run alone, which is the worst
combination to debug. The obvious fix, polling for the attribute, repairs the
race and **breaks the null cases**: before hydration there is no attribute
either, so `toBeNull` is satisfied by a page that has done nothing at all.

The fix is to wait on something only the application can produce.
`applyConfig` writes the config it settled on back to `localStorage`, so
polling for that value is a synchronisation point *and* an assertion — it is
what proves the stale `"material"` was rewritten to `"system"` rather than
merely ignored.

**A negative assertion needs a positive synchronisation point.** "The attribute
is absent" and "the code has not run yet" look identical from outside, and only
a value the code must have written distinguishes them.

Two smaller things from the same session, both about locating elements rather
than timing: `button[type="submit"]` matched the OAuth provider buttons before
it matched Sign in, and `getByLabel("Assistant")` matched the panel's own
"Close assistant" control as a substring. Both failed loudly on the first run,
which is the difference between them and the one above.

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

### L74 — "the claim is NULL" is not the same question as "is this actor staff"

Building the customer-portal identity (`docs/17-customer-portal.md`), the
first draft of `portal_contact_visibility` on `customer_contacts` read:

```sql
USING (
  (SELECT app.current_customer_id()) IS NULL
  OR customer_id = (SELECT app.current_customer_id())
)
```

The intent was "staff aren't restricted; a portal contact sees only their own
customer." What it actually says is "an actor with no resolvable
`customer_id` claim is unrestricted" — and a `customer`-role actor with a
missing or malformed claim **also** has `current_customer_id() IS NULL`. The
policy handed that actor every customer's contacts instead of none: the
opposite of fail-closed, on the exact actor the table exists to restrict.

Caught by a unit test (`row-visibility.test.ts`'s "shows nothing with no
customer claim at all"), not by inspection — the SQL reads correctly at a
glance, which is the point. The fix is a second function that checks the
*role*, not the claim's nullness, and fails closed the other direction on
error:

```sql
CREATE FUNCTION app.is_portal_contact() RETURNS boolean ... AS $$
  ...
  RETURN coalesce((claims #>> '{app_metadata,role}') = 'customer', false);
EXCEPTION WHEN OTHERS THEN RETURN true;  -- error => assume the MORE restrictive case
END $$;

USING (
  NOT (SELECT app.is_portal_contact())
  OR customer_id = (SELECT app.current_customer_id())
)
```

**"Who is this" and "what may they see" are two different claims, and a
NULL in one is not evidence about the other.** Any RESTRICTIVE policy shaped
"exempt X, else narrow by Y" needs X checked on its own terms — never
inferred from Y being absent, or the exemption swallows the ID's own failure
mode.

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

### L75 — A real env var beats a `.env` file, silently, machine-wide

`PUBLIC_SUPABASE_URL` was exported in a shell profile, pointing a plain
`pnpm dev` at the hosted project instead of `apps/web/.env.local`'s local
stack — with nothing in the UI to say so. Signing in as the seeded fixture
user returned "Invalid login credentials", which reads as a broken seed or a
stale reseed, not a wrong target; the local Supabase auth service, called
directly with the same credentials, accepted them fine. Only reading the
actual network request (`.../auth/v1/token` against `<ref>.supabase.co`, not
`127.0.0.1`) surfaced it.

Vite's precedence is the trap: a real environment variable always wins over a
`.env` file, and that is correct for CI/deploy but wrong for a developer's
shell. This doc used to show `env $(grep -v '^#' .env.prod | xargs) npm run
dev` as the way to point dev at production for one run — nothing about that
command keeps the value scoped to it, and a copy into a profile file
recreates the same bug, silently, for every future `pnpm dev` in every
project on that machine.

`vite.config.ts` now fails closed instead: it reads the effective
`PUBLIC_SUPABASE_URL` the same way Vite itself resolves it and refuses to
start `vite dev` — or the vitest runner, which starts a dev server the same
way — unless it resolves to `127.0.0.1`/`localhost`. No override flag: an
opt-out env var for this check is the identical footgun one level up. The
"point dev at prod for one run" workflow this doc used to document is gone;
use the hosted project's own Supabase Studio instead.

### L76 — A loose `waitForURL` regex after a racy click resolves against the URL you were already on

Writing a Playwright helper to sign in as someone other than the suite's
default owner (`e2e/helpers.ts`'s `signInAs`, for `access-lifecycle.spec.ts`
and `portal.spec.ts`), the sign-in button was clicked once and the test moved
on to `waitForURL(/\/(portal|employees|login)/)`. That regex was written to
be lenient — sign-in landing back on `/login` is itself a legitimate outcome
for a persona whose access should be refused — but it also matches the
`/login/sign_in` URL the browser was *already on* before the click. The
auth-ui-svelte form's submit handler attaches on hydration
(`auth.setup.ts`'s `openModal`-adjacent comment already names this race for
form fills); a click landing before that leaves the page exactly where it
was, and the loose regex resolves immediately against the stale URL instead
of waiting for a real navigation.

This produced two different silent failures from the same root cause: a
false PASS (a terminated employee's access looked refused, because her
sign-in never actually submitted — not because anything revoked her
session) and a false FAIL (a customer contact's landing page read as
`/login/sign_in` when the real question — staff app or `/portal` — was
never exercised). Both looked like real results; neither was.

Fix: retry the click itself until the URL demonstrably leaves
`/login/sign_in`, the same `toPass`-wrapped-click pattern `openModal` uses
for a race on the other end of a form:

```ts
await expect(async () => {
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).not.toHaveURL(/\/login\/sign_in/, { timeout: 2_000 })
}).toPass({ timeout: 15_000 })
```

A `waitForURL` regex that includes the page's own starting URL as an
acceptable destination cannot tell "arrived" from "never left" — write it to
exclude the starting URL, or verify the click's effect some other way,
whenever the outcome you're waiting for is allowed to include "no
navigation happened."

### L77 — `fail()` answers HTTP 200 with the real status inside the body, for anything that isn't a full-page form submission

Writing adversarial e2e cases against `/employees/new` (`ADV-05`–`ADV-07`,
`form-errors.spec.ts`), a raw `page.request.post()` carrying a deliberately
invalid `birth_date` came back `response.status() === 200` — read as "the
bad value was accepted," which would have been a real, serious finding, if
it had been true.

It wasn't. The body was
`{"type":"failure","status":400,"data":[...,"employee_id","Someone already
has that employee ID...`. SvelteKit's `fail(400, ...)` is built for
progressive enhancement: a full browser form submission (the shape every
other test in that file already uses, via a real `<form>` and a real click)
gets a genuine non-200 status and a re-rendered page, but a request that
looks like a `fetch` — which a raw `page.request.post` is — gets the
`ActionResult` serialized as JSON with the transport status pinned at 200
and the real status embedded inside. `error()`-thrown refusals (an
authorization check, not a validation one — `requireCan`, used by
`rbac-boundaries.spec.ts`) are unaffected: those throw all the way out and
carry a genuine HTTP status either way, which is why those tests' plain
`response.status()` checks were correct without needing this.

`response.status()` is therefore not a reliable signal for whether a
`fail()`-returning form action refused a raw, non-browser POST. Parse the
body:

```ts
const raw = await response.text()
const parsed = JSON.parse(raw) as { type: string; status: number }
// parsed.status is the one that matters; response.status() is always 200 here.
```

A test asserting `response.status() === 400` against a `fail()` path will
pass or fail for the wrong reason on every SvelteKit form action in this
codebase — check which of `fail()` or `error()` the target action actually
uses before writing the assertion, not after it passes unexpectedly.

### L78 — Seeding an inactive `tenant_users` row silently deletes the login along with the access

Fixing DEFECT-01 (a terminated employee kept full access) meant seeding one
membership — Nadia's — as `is_active = FALSE`, to model someone whose
termination the application has already caught up with. The e2e test written
against it (`access-lifecycle.spec.ts`) failed anyway, but not on the
assertion: `signInAs` never got her past `/login/sign_in` at all, retried the
sign-in click for the full 15s, and gave up. It read exactly like the L76
click race.

It wasn't. `dev-users.sql` builds `auth.users` and `auth.identities` — the
rows GoTrue actually authenticates against — by selecting `FROM tenant_users
tu ... WHERE tu.is_active`. That filter was written when every seeded
membership was active, to mean "every membership gets a login." Once one
membership wasn't, it silently meant "every *active* membership gets a
login" instead — Nadia had no `auth.users` row at all, so Supabase Auth
rejected her password outright and the page never left `/login/sign_in`.
Nothing raised: `dev-users.sql`'s own verification block only checks for
orphans among *active* memberships, so an inactive one missing a login
passed it without being examined.

The fix inverts the filter's assumption: `is_active` on `tenant_users` is an
application-level access decision, not a statement about whether the person
can authenticate at all — a terminated employee's Supabase Auth account is
exactly what has to survive so the *application* can be the thing that
refuses them. Both `auth.users` and `auth.identities` are now seeded for
every `tenant_users` row regardless of `is_active`; only the orphan check
stays scoped to active rows, since that's the one that should still fail if
someone who's supposed to have working access doesn't.

Seeding any fixture row in a state a real user could reach — inactive,
archived, revoked — needs the same question asked of every seed script it
touches: does this filter assume the state that's changing?

### L79 — A page's `load()` inherits nothing from its own `actions`

DEFECT-02's sweep (`rbac-boundaries.spec.ts`) found eight `/settings/*` pages
whose `load()` checked only `if (!locals.tenantId)` — no role, no
permission — while every one of their write `actions` already called
`requireCan(ctx, "firm.settings.write")`. A plain employee with zero admin
hats could read all eight pages; the sidebar just didn't link to them, which
is not a permission (L44). The layout gate one level up
(`(app)/+layout.server.ts`) only separated staff from portal contacts — it
was never meant to, and can't, express a page-specific read permission.

`load()` and `actions` are separate functions, checked separately, and nothing
connects them. Writing a permission check into `actions` protects exactly the
POST — the GET that renders the page first is a different code path with no
guard unless it has its own. This is the same shape as L34 (browser
attributes vanish on a crafted request) one level up: the thing that looks
like protection (a write check, a hidden sidebar link) covers a different
surface than the one being judged safe.

The fix is one line, first in `load()`, matching the pattern already used by
`payroll/runs`, every `accounting/*` page and `ticketing`:

```ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")
  ...
```

Adding a new `(app)` page: give `load()` its own `requireCan` for whatever it
reads, even when the module's only mutating action already checks write
access. A read permission and a write permission are different strings in
`packages/authz` for exactly this reason — reusing the write check in `load()`
would have been the second version of this bug, one page-load ago.

### L80 — `overflow-x-auto` on a table clips an absolutely-positioned dropdown inside it, to a few pixels, with nothing erroring

Building the bill-entry form (`/accounting/bills/new`), the per-line expense
account `Combobox` sat inside a `<td>` — the first time this component was
used inside a table cell rather than a top-level `<fieldset>`. Clicking it
focused the input; typing filtered results; nothing ever appeared. No
console error, no failed request, no red text — a control no mouse could
reach, exactly the class of failure this file exists to catch.

The mechanism: CSS resolves `overflow-x: auto` with `overflow-y` left at its
default `visible` by forcing `overflow-y` to `auto` too — a wrapper cannot
scroll one axis and clip nothing on the other. The Lines table sits in
`<div class="overflow-x-auto">` for small-viewport horizontal scrolling, so
that div is a clipping context, and `Combobox`'s listbox was
`absolute`, positioned relative to its own `rootEl`. Confirmed directly:
`document.querySelector('[role="listbox"]').getBoundingClientRect()` showed
the right row (`"Cash at Bank 1000"`) at `bottom: 636`, while the scroll
wrapper's own `getBoundingClientRect().bottom` was `602` — the listbox
existed, with the right content, entirely below its clipping ancestor's
visible edge.

The invoice-creation form (`/accounting/invoices/new`) was not precedent that
Combobox works generally: its one picker (customer) lives in a `<fieldset>`
above the table, never inside a cell, so it never exercised this ancestor.
Copying that page's shape for a new per-line picker was the natural move and
would have reproduced the bug.

Fixed in the component, not the call site — `Combobox.svelte` now measures
`rootEl.getBoundingClientRect()` and renders its listbox `position: fixed` at
that rect's `bottom`/`left`/`width`, escaping any scrolling ancestor
(unless one imposes a `transform`/`filter`/`contain`, none of which appear
between it and any current call site). Repositioned on `open`, and again on
`scroll`/`resize` — the `scroll` listener is registered on `window` with
`capture: true`, since `scroll` does not bubble and only the capture phase
sees it fire on a nested scrollable ancestor.

A new `Combobox` usage inside anything that scrolls or clips (a table
wrapped in `overflow-x-auto`, a modal body, a sticky panel) needs no special
handling now — verify it in a real browser anyway; a passing `smoke.spec.ts`
asserts the page's `<h1>` and nothing about whether an interactive control
inside it can actually be reached, which is exactly how this one shipped
undetected.

### L81 — `supabase db reset` leaves `app_user` unable to log in, and the failure reads like a test bug

Adding the journal-entry-immutability RLS policy meant running `supabase db
reset` to apply the new migration, then `pnpm db:snapshot` per this file's
own rule ("Regenerate the snapshot only from a migration-built database").
Every accounting test then failed with `password authentication failed for
user "app_user"` — seven failures with no connection to anything just
changed, the kind of error that looks like a broken test harness rather than
environment state.

The cause: `20260827000002_auth_and_grants.sql` creates the role with `CREATE
ROLE app_user LOGIN NOINHERIT` — no password — and says so in its own
comment (`ALTER ROLE app_user WITH PASSWORD '<from your secret store>';`,
manual, deliberately not in the migration). `./setup` sets the real one
afterward, once, as its own step:

```bash
psql "$DATABASE_URL" -X -q -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"
```

`supabase db reset` runs only the migrations and the fixture seed — never
`./setup` — so it silently undoes that password every time. A machine that
ran `./setup` once and has been fine ever since will still hit this the
first time anything in the session calls `db reset` directly (a policy
change, a schema experiment, this Tier), because the reset undoes a step the
original setup ran that nothing about `db reset` re-runs.

The fix is the same one-liner, run again after any `db reset`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -X -q -c "ALTER ROLE app_user WITH PASSWORD 'app_user'"
```

Before concluding a test failure means the change under test is wrong: if
every accounting/db test fails identically with a connection or auth error
rather than an assertion mismatch, and `supabase db reset` ran recently, this
is very likely why — not a defect in whatever you just wrote.

---

### L82 — A `tx.unsafe()` fragment with more than one bind parameter, nested inside another query via `${...}`, doesn't bind past the first

Two repo functions (`cashFlowStatement`/`cashFlowTotals`, both taking
`from`/`to`) shared one SQL shape — the per-account begin/end balance CTE —
differing only in which two values filled its two placeholders. The natural
move was to factor it into one `tx.unsafe(sql, [from, to])` fragment and
interpolate it into both queries with `` tx`WITH ${frag}...` ``, the same way
this codebase already interpolates a plain, *parameter-free* `tx.unsafe(SELECT)`
string dozens of times (`accounting.repo.ts`'s `INVOICE_SELECT`,
`LEDGER_SELECT`; the same pattern across `hr_*`, `payroll_runs`,
`ticketing.repo.ts`). Nothing about that existing pattern hints that adding
parameters changes anything.

It does. `postgres.js`'s fragment-merging code
(`node_modules/postgres/cjs/src/types.js`, `fragment()`/`stringify()`) only
forwards `q.args[0]` — the FIRST bind value — from a nested `Query` into the
outer one; it isn't built to splice a multi-argument `unsafe()` call into
another template's own parameter list. The failure is loud, not silent —
`bind message supplies 0 parameters, but prepared statement requires 2` —
but only if you actually run the query. `svelte-check`, `./check`'s SQL
static checks, and TypeScript all pass a broken query built this way; nothing
type-checks the shape of a template string.

Confirmed with a five-line throwaway script against the real local database
before it reached committed code — this is exactly the case for testing a
library composition empirically rather than trusting that a working single-
parameter pattern generalizes to two. The fix was to stop trying to share
the fragment: `cashFlowStatement`/`cashFlowTotals` each inline their own copy
of the CTE, using ordinary `${from}`/`${to}` template interpolation (the
well-tested path), accepting the duplication.

### L83 — `AccountingRefused`'s `field:` never reached `fieldErrors()`, which reads `errorFields`

Six `refusal(e: AccountingRefused)` functions (invoices/bills new and
`[id]`, banking, and the new receive-payment page) returned `{ message,
field: "amount" }` from `fail(400, ...)`, copying the shape of the FIRST such
function written. `fieldErrors()` (`$lib/form-errors.ts`) reads
`form?.errorFields` — an array, populated correctly by `f.problem()` — so
`field` was a property nothing downstream ever looked at. `err.input()` and
`err.aria()` silently returned `""`/`undefined` for every one of these
refusals: the alert banner still showed the right sentence (`form.message` is
read directly), so the page looked correct in the one way anyone was
checking it, while the affected input never got its red border or
`aria-invalid`. No test caught it because none of `form-errors.spec.ts`'s
cases exercise an `AccountingRefused`-derived refusal specifically — every
existing case there hits a plain `FormReader` rejection (`f.problem()`)
instead, which was never broken.

Found while adding a seventh such function and noticing its own `field:`
wouldn't satisfy the assertion `toHaveClass(/input-error/)` in a new e2e
case — the two-property shapes (`{ message, field }` vs `{ message,
errorFields }`) look interchangeable enough that nothing about writing the
sixth broken copy would have caught the first five. Fixed by renaming
`field: "x"` to `errorFields: ["x"]` in all six. A `refusal()` function
should return exactly `f.problem()`'s shape — `{ message, errorFields }` —
never a shape that merely looks similar.

### L84 — `service_role` bypassed RLS but had no table GRANTs at all, so every existing service-role write path was silently broken

`BYPASSRLS` and table-level `GRANT`s are two separate permission layers in
Postgres; nothing in any migration ever granted `service_role` SELECT,
INSERT or UPDATE on anything, on top of the RLS bypass it does have
(`pg_roles.rolbypassrls = true`). A `postgres.js`/`withTenant` query never
exercises this, since the app always connects as `app_user` — and a
`supabaseServiceRole.from(table).insert(...)` call through the Supabase JS
SDK swallows the failure into an `{ error }` return rather than throwing,
so a caller that doesn't check it (as none did) reports success with
nothing written. Found only by calling the real PostgREST endpoint
directly with the service-role key and reading the actual response:
`permission denied for table contact_requests` — against a file already on
`verify-service-role.mjs`'s own PERMITTED list, meaning the public
marketing site's "Contact Us" form had been silently discarding every
submission on this database, unrelated to whatever feature was being
built when this was found. Fixed with the same `GRANT` +
`ALTER DEFAULT PRIVILEGES` pair `20260827000002_auth_and_grants.sql`
already uses for `app_user` (`20260914090000_service_role_table_grants.sql`),
minus `DELETE`, matching this codebase's own "no DELETE in app code" rule.
**Never trust that a role passing `verify-service-role.mjs`'s import check
can actually write — call the real endpoint and read the response**, the
same way `L48` says a guard never observed failing is not evidence a guard
exists.

### L85 — an index that textually matches `ORDER BY ... DESC NULLS LAST` was never used, because a DESC btree index defaults to NULLS FIRST

`idx_hr_feedback_date ON hr_feedback (tenant_id, feedback_date DESC, feedback_id)`
looks like it satisfies `ORDER BY feedback_date DESC NULLS LAST, feedback_id ASC`
— same columns, same directions — but Postgres's default null placement for a
DESC column is NULLS FIRST, the opposite of what the query asks for. The
planner correctly refuses to use it (using it would return the wrong order for
NULL rows) and falls back to a full scan + sort, silently: no error, no
warning, just a query that never gets faster no matter how obviously "right"
the index looks in a migration diff. `feedback_date` is nullable; `invoice_date`,
`bill_date` and `entry_date` are not, and none of those pages ask for
`NULLS LAST` at all — which is why the same class of index worked immediately
for invoices, bills and journal entries and silently didn't for feedback. Found
only by forcing the index with `enable_seqscan = off` and confirming the
planner *still* wouldn't pick it, then checking the column's nullability.
**Any index built to support `ORDER BY <nullable column> DESC` must spell out
`DESC NULLS LAST` explicitly if that's what the query asks for** — the column
list matching is not enough; the null-ordering has to match too, and it never
will by accident for a DESC sort on a nullable column.

### L86 — a load-test seeder cloned a table's rows without re-pointing their foreign key, so every clone attached to the SAME original parent, corrupting it

`scripts/loadtest.mjs` clones one existing row N times to simulate a
SCALE_SENSITIVE table at scale — realistic for a table like `invoices`, where
the clone's own id becomes the new parent for anything referencing it. It is
NOT realistic for a *child* table cloned the same way: `invoice_lines`,
`journal_entry_lines`, `bill_lines` and `tasks` all clone the template row
verbatim, foreign key included, so 200,000 new lines all still point at the
ONE original invoice/entry/bill/project — not at 200,000 new parents. Two
distinct failures came out of this: an invoice's real `line_subtotal` now sums
200,000 lines instead of a handful (the timeout this session started from),
and a real journal entry's debits and credits now disagree by billions (a
genuine, if reversible, corruption of `unbalanced()`'s invariant for as long as
the seed is loaded) — while 200,000 newly-inserted invoice/bill/project rows
end up with ZERO lines/tasks each, which is its own fixture-invariant
violation (`accounting.test.ts`'s "every invoice has lines" assertion fails
against seeded data, correctly). **A seeder that clones a PARENT row is safe;
a seeder that clones a CHILD row and reuses the parent's foreign key
concentrates every clone onto one real parent instead of spreading load
realistically** — worth knowing before trusting a "large table" load test's
per-row costs, and worth fixing in the seeder itself if it needs to keep
being the load-bearing regression fixture the team is running against
indefinitely rather than a one-off stress test.

---

### L87 — a fixture's generic "no empty column" backfill wrote placeholder text into columns no code had ever read, and it surfaced as real rule conditions the moment a feature finally read them

`mock-data.sql`'s completeness sweep fills any NULL column, table by table,
with a generic value keyed on type — `'Transaction Type 1'` for an unclassified
varchar, `100.00` for a numeric, a boilerplate sentence for a free-text column
(`'Seeded so this column is never empty — an empty column is a check that has
stopped testing.'`). This is harmless as long as nothing reads the column: it
exists only to satisfy "no column anywhere may be empty in the fixture," not to
mean anything. `bank_reconciliation_rules`' one seeded row had exactly this —
`description_regex`, `amount_equals`/`amount_min`/`amount_max` and
`transaction_type` had sat as generic filler since the table was created,
invisible because no application code queried them.

US-ACC-029 (bank reconciliation rules) was the first feature to actually read
those columns, and the filler stopped being inert the moment it did: the new
`/accounting/banking/rules` page rendered `'Transaction Type 1'` as a real rule
condition, and — worse — `applyReconciliationRules()`'s matching logic would
have treated the placeholder `transaction_type` as a real constraint,
permanently disabling the seeded rule (no real transaction is ever typed
`'Transaction Type 1'`). No test caught this: every existing assertion about
that row only checked `status`/`matching_rule_id` after a hand-seeded match,
never the rule's own matching columns, because nothing before this feature had
a reason to. Found by looking at the live page, not by a failing test.

**A column a generic backfill filled is not verified data — it is exactly as
untested as a NULL, just harder to notice.** Before shipping a feature that is
the first reader of a long-dormant column, check whether its seeded value came
from the completeness sweep rather than a deliberate INSERT, and replace it
with something consistent with that row's own story if so — the fix here was
to set `description_regex`/`amount_*`/`transaction_type` explicitly in the
`bank_reconciliation_rules` INSERT itself, values consistent with the rule's
own "JetBrains, -299.00, debit" story, so the backfill's `WHERE ... IS NULL`
UPDATE became a no-op for that row.

---

### L88 — Supabase Storage's `storage.objects`/`storage.buckets` reject direct SQL DELETE, by an on-table trigger

`storage.protect_delete()` raises `Direct deletion from storage tables is not
allowed. Use the Storage API instead` on any raw `DELETE` against those two
tables — discovered while cleaning up a scratch bucket created to verify a new
RLS policy by hand. This bites test cleanup specifically: every other
tenant-scoped table in this schema can be reset with a plain `DELETE ...
WHERE tenant_id = ...` inside a rolled-back transaction (or, for the handful
of tables written by the service role, a superuser connection cleaning up
its own rows explicitly — `fx_rates.test.ts`'s existing pattern), but a
Storage object cannot — cleanup has to go through the Storage API's own
DELETE endpoint (`supabase.storage.from(bucket).remove([key])` /
`DELETE /storage/v1/bucket/:id` for a whole bucket), not a query. It also
means a test that uploads to Storage is never covered by `inRollback`'s
Postgres-transaction rollback: the object survives even if the surrounding
`tx` never commits, so a real cleanup call in `afterEach`/`finally` is not
optional the way it is for an ordinary table row.

Separately, and worth confirming again the first time a new feature needs it:
Storage's own service (`storage-api`) sets `request.jwt.claims` per request
exactly like PostgREST does, so an existing tenant-scoping RLS function
(`app.current_tenant_id()`, already used everywhere else in this schema) works
unchanged on `storage.objects` policies — verified by minting a real session
via password sign-in and curling the local storage endpoint directly, both
for a same-tenant object (succeeds) and a cross-tenant one (a write is
rejected with a genuine RLS violation; a read reports 404, not the content).
No service-role workaround was needed for tenant-scoped Storage access.

---

### L89 — `invoices.reference` and `invoices.notes` carried the fixture's generic completeness-sweep filler, and the first real reader put it on a customer-facing document

Same shape as L87, a second time, on a different table. `mock-data.sql`'s
blanket "no empty column" sweep had filled every invoice's `reference` with
the literal string `'Reference 1'` and `notes` with `'Seeded so this column
is never empty...'` — harmless while nothing read them, which nothing did:
`grep` confirms no repository function selected either column before this
session. Building the invoice PDF (US-ACC-001) was the first real reader,
and a live-rendered PDF showed both placeholders verbatim, on what would be
a real document handed to a customer.

Caught by actually looking at the rendered PDF in a browser, not by any
test — a snapshot/content test asserting exact page text would have caught
it, but none existed, and a test written after the fact would have encoded
the bug as the expected value. Fixed by replacing the blanket UPDATE for
these two columns with per-invoice values consistent with each invoice's
own story (a PO reference, a one-line description of what was billed),
the same fix shape as L87 — the completeness sweep's own `WHERE ... IS
NULL` becomes a no-op once a real value already sits there.

The general rule L87 already states — check whether a long-dormant
column's seeded value came from the sweep before trusting it — holds
regardless of which table it recurs on; this entry exists mainly to record
that it already has, so the next occurrence is recognized faster.

### L90 — `invoices.payment_url`/`payment_gateway`/`payment_gateway_id` carried the same sweep filler, a third recurrence, caught before shipping this time

L87/L89's shape again, on the same `invoices` table L89 already touched.
The sweep had filled every invoice with a fake `https://pay.northwind.
example/invoices/...` URL and a `'GoCardless'`/`'Stripe'` gateway label —
plausible-looking, and no repository function had ever selected any of the
three columns, so nothing noticed. Building Stripe payment links
(US-ACC-002) made `invoices/[id]/+page.svelte` render `payment_url`
verbatim as a real, clickable "Payment link" — which would have shown a
fabricated Stripe-branded link on an invoice that never actually had one,
the same "correct-looking value, wrong place" shape the whole disclosure
section warns about, just for availability rather than a leak.

Caught this time by recognizing the L87/L89 pattern by name while building
the feature that would have exposed it, rather than by a live screenshot
after the fact. Fixed the same way both prior entries were, with one
difference this table's own spec check (`verify-stories.sql`'s US-ACC-002)
forced: it asserts at least one invoice HAS a populated payment link, so
"all NULL" isn't an option here the way it was for L89. The blanket sweep
is gone; in its place, one deliberately-chosen invoice (INV-2026-004)
carries a payment link shaped exactly like what `createInvoicePaymentLink`
actually produces (`payment_gateway = 'stripe'`, a `buy.stripe.com/test_`
URL) — a single, honest example rather than every invoice getting a
gateway ("GoCardless") this feature doesn't even implement.

The rule this keeps confirming: a column that has carried the sweep's
filler since the fixture was written is not evidence anyone verified it —
it is evidence nothing has read it yet. Check every "no empty column"
value against what actually reads it before trusting it as real data, not
just the first two times this happened.

---

### L91 — a helper pulled out of a loop to satisfy `verify-no-loop-queries.mjs` hid a real N+1, and a transaction held across a reminder batch's send loop wasn't backported from the fix already applied three commits later to a near-identical function

Two commits from the same two-day window, found by a background code-review
pass rather than by `./check` (both were green throughout):

`payBillsInBatch` (`payables.repo.ts`) called a `settleBillFully(tx, billId,
actorId)` helper once per bill after the payment allocations were inserted.
The helper itself has no `tx` call inside a loop, and `payOneVendorGroup` —
one function above it, doing the equivalent per-vendor work — has a comment
explicitly reasoning about keeping `verify-no-loop-queries.mjs` looking at "a
bounded call, not a query literally inside the loop." That reasoning is true
about the *checker*, not about the *database*: `settleBillFully` still ran two
real round trips per bill, sequentially, against two `SCALE_SENSITIVE` tables
(`bills`, `payment_allocations`), for every bill in the batch. Pulling a query
out of a loop's own source text defeats the lexical scanner; it does not
defeat the N+1. Fixed by replacing the per-bill call with one set-based
`UPDATE ... FROM ... WHERE b.id = ANY(billIds)`, the same shape
`recomputeBillTotals` already uses per-row, generalised with a `target AS
(SELECT unnest(...))` CTE so a bill with no lines or no allocations yet still
produces exactly one output row (an `INNER JOIN` on a `GROUP BY` would have
silently skipped it).

Separately, `sendReminders` (`accounting/invoices/+page.server.ts`) opened one
`withTenant` transaction and held it open across a loop that sends one real
templated email per selected invoice — a Postgres connection pinned for N
sequential HTTP round trips. `emailInvoice`, in the same file's sibling
route, had this exact problem and was already restructured into
read-then-send-then-write, three commits later in the same window — but nobody
went back and applied the same restructuring here, because nothing failed:
no checker looks for a transaction spanning a network call, only for one
spanning a query loop. Fixed the same way `emailInvoice` was: read
`invoicesForReminder` + `locations` in one short transaction, send with no
transaction open, then a second short transaction for
`recordRemindersSent` + `audit.record`.

The rule this adds to L1's family: a fix applied to one function is not a fix
to the pattern. When a review finds one instance, grep siblings that do the
same kind of thing for the same shape before considering it closed — a
codebase this size will have written it more than once in the same sitting.

---

### L92 — a policy helper that re-queries its own table breaks `RETURNING`, not `SELECT`

A table's RLS policy called a function that read that same table
(`document_folders`' policy, checking folder visibility via a helper that
queried `document_folders`). Plain `SELECT`s worked fine — the failure only
appears on `INSERT/UPDATE ... RETURNING`, which checks the new row against
`SELECT` policies using values already in hand, mid-statement, before a
nested query can see that row. `SECURITY DEFINER` doesn't fix it — it
changes whose privileges the read runs under, not whether the row exists
yet.

Rule: a policy's own helper may read *other* tables freely, but must check
same-table conditions (ownership, a status column) inline against the row's
own values rather than re-querying — and test the actual `RETURNING` write
path, not just an isolated `SELECT`, since `verify-rls.sql` only ever
`SELECT`s and would pass either way.

---

### L93 — a trigger that recomputes a derived array from a policy-scoped table must be `SECURITY DEFINER`, or it silently maintains nothing; and `RETURNING` still can't see it either way

Team chat's `member_ids` design (docs/20-team-chat.md §3) hangs every
`team_chat_members`/`team_chat_messages` policy off a denormalized
`team_chat_conversations.member_ids`, kept current by an `AFTER INSERT`
trigger on `team_chat_members` — specifically *to avoid* L92's self-reference
trap. Verified empirically against the local stack (as the spec itself
demands) before writing the migration, two distinct failures showed up, not
one:

1. **Without `SECURITY DEFINER`, the trigger doesn't just risk a stale read
   — it computes the wrong answer, silently, every time.** The trigger body
   is `SELECT array_agg(employee_id) FROM team_chat_members WHERE
   conversation_id = ...`, run as the invoking `app_user`. `team_chat_members`
   has `FORCE ROW LEVEL SECURITY`, and its own `SELECT` policy requires the
   actor's `current_employee_id()` already be in `team_chat_conversations
   .member_ids` — the exact value the trigger exists to populate. On a
   brand-new conversation (`member_ids = '{}'`), that policy hides the row
   *from the trigger's own query*, which happily aggregates zero rows and
   writes `member_ids = '{}'` right back — no error, no empty result set to
   notice, just a wrong value that looks like "nobody's joined yet." Fixed by
   `SECURITY DEFINER SET search_path = ''` on the trigger function (with
   schema-qualified table names inside it, since the empty search path
   applies there too) — this is the correct use of `SECURITY DEFINER` L92
   warns isn't a fix for a *different* problem; here the read genuinely
   needs to bypass RLS, because computing "everyone currently in this
   conversation" is definitionally a query no single member's row-visibility
   should gate.
2. **Even after that fix, `INSERT ... RETURNING` on `team_chat_members`
   still fails for a self-service join.** A public-channel join inserts
   `employee_id = current_employee_id()` for someone not yet in
   `member_ids`; the trigger now correctly updates `member_ids` — visible to
   every later statement in the same transaction — but the `RETURNING`
   clause of that *same* `INSERT` still raises `new row violates row-level
   security policy`, reproducing L92's finding one layer up: the trigger
   fires before the command completes, but not before `RETURNING`'s own
   `SELECT`-policy check runs against the row it's returning.
3. **`INSERT ... ON CONFLICT DO UPDATE`, with no `RETURNING` at all, hit the
   same wall — found only once real browser testing (not psql) exercised a
   genuinely first-time self-service join.** `joinPublicChannel` used
   `INSERT ... ON CONFLICT (...) DO UPDATE SET left_at = NULL` so a rejoin
   after leaving would reactivate the same row. For someone joining for the
   first time — no existing row, so no actual conflict — this still raised
   `new row violates row-level security policy`, on the plain INSERT branch,
   with no `RETURNING` in sight. Merely having an `ON CONFLICT DO UPDATE`
   clause makes Postgres run `ExecWithCheckOptions` against whatever row the
   statement produces, INSERT branch included — the same check-option
   machinery `RETURNING` triggers, armed by the mere possibility of the
   UPDATE branch. `ON CONFLICT DO NOTHING` does not have this problem
   (verified: a bulk `INSERT ... SELECT ... FROM unnest(...) ON CONFLICT DO
   NOTHING` with no `RETURNING` succeeds), because a `DO NOTHING` conflict
   produces no row for any policy to check.

Rule: a trigger recomputing a value that a table's own policy reads back
needs `SECURITY DEFINER` to compute it correctly at all — test this by
creating the *first* row that could ever satisfy the policy (an empty
`member_ids`, an unset counter), not a subsequent one, since every later
call re-reads a value the first call already got right by accident of
already having rows to aggregate. Separately, never `RETURNING` from an
`INSERT` whose own visibility depends on that `INSERT`'s trigger side
effect — omit `RETURNING`, generate any needed id application-side, and
treat "no exception" as success; a later statement in the same transaction
(or the next request) sees the row fine. And never reach for `INSERT ...
ON CONFLICT DO UPDATE` as a shortcut on such a table either, even without
`RETURNING` — split it into a plain `INSERT` tried first and a plain
`UPDATE` on the unique-violation catch (both individually confirmed safe);
`ON CONFLICT DO NOTHING` remains fine on its own. Test the actual first-time
path in a real request, not just in `psql` as the row's own eventual
member — a fixture actor who already belongs to the conversation never
exercises the branch that breaks.

---

### L94 — a "browsable before joining" arm on a public row admits a portal contact just as readily as an employee, unless the policy says otherwise

`team_chat_conversation_visibility`'s public-channel arm — `kind = 'channel'
AND visibility = 'public'` — checks a property of the ROW, not of the actor,
so it was satisfied by ANY authenticated caller, including a customer-portal
contact who has no business seeing that an internal channel exists at all
(docs/20-team-chat.md §1: employee-only messaging, a different trust
boundary from the portal's own, unbuilt chat). A row-visibility test
asserting a portal-contact claim sees zero team-chat conversations caught
this — `conversationIds({ role: "customer" })` came back with two public
channels instead of `[]`. The messages/members tables were already correctly
closed (their EXISTS checks against `member_ids`, which never contains a
contact id, are actor-shaped rather than row-shaped), which is exactly why
this slipped past a first pass: two of the three tables being obviously
correct made the third's "browsable" arm look like the same kind of check.

Rule: any policy arm written as "if the row has property X, anyone may see
it" needs an explicit actor-side guard too, unless every possible actor
really should qualify. Here that's `NOT (SELECT app.is_portal_contact())`
wrapping the whole policy, the same defensive position
`ticketing_visibility.sql`'s `(SELECT app.is_portal_contact()) OR (...)`
takes from the other direction — each staff/portal policy pair should open
by explicitly deferring to (or excluding) the other side, never by assuming
a row-shaped condition already implies an actor-shaped one.

---

### L95 — `UPDATE`/`DELETE` cannot find a row the table's `SELECT` policy hides, even when the `UPDATE` policy's own `USING` clause would allow it

Rejoining a channel after leaving it is `UPDATE team_chat_members SET
left_at = NULL ... WHERE employee_id = :me`, and `team_chat_member_update`'s
`USING` clause is exactly `employee_id = current_employee_id() OR
<member_ids check>` — a same-row, self-reference-safe condition that should
plainly admit updating your own row regardless of `member_ids`. It didn't:
the `UPDATE` matched zero rows, silently (no error — `UPDATE 0`), and a
minimal two-policy repro nailed the actual mechanism down (PostgreSQL's own
semantics, not this schema specifically): **a table's own SELECT
policy governs which rows a command can even locate to update or delete,
independent of and in addition to that command's own policy.** A restrictive
`FOR SELECT USING (false)` blocked a `FOR UPDATE USING (true)` from matching
anything, in isolation, with no third policy involved. `team_chat_members`'
`SELECT` policy (`team_chat_member_visibility`) only admitted a row via
`reads_all_team_chat()` or current `member_ids` membership — and leaving a
conversation is exactly what drops someone out of `member_ids`, so the very
act the rejoin needs to reverse also revoked the visibility needed to find
the row to reverse it.

Rule: an `UPDATE`/`DELETE` policy's `USING` clause is necessary but not
sufficient — the table's `SELECT` policy must ALSO admit the row, for every
row shape the write policy intends to reach. When a write policy has a
same-row exemption (`employee_id = current_employee_id()`, an owner-of-record
check), the `SELECT` policy needs the identical exemption, or the write
silently finds nothing. Test the actual multi-step sequence a real session
produces (join → leave → rejoin), not each operation's policy read in
isolation — a `SELECT`-only harness, or a single write tested with a fixture
row that's already a "current" member, never exercises the state where the
row has fallen out of the membership check that both policies were quietly
depending on.

### L96 — an `$effect` that calls `invalidateAll()` reruns itself, silently, forever

Team chat's mark-read effect read `data.conversation.id` and, after a
`fetch`, called `invalidateAll()`, which reruns every `load()` on the route.
Confirmed live in a real browser: exactly 251 POSTs to that one action, in
lockstep with 251 `EventSource` reconnects and 251 backfill fetches from two
*other* `$effect`s on the same page that merely read
`data.conversation.id` — no error at any point, every response a normal
200, so nothing short of watching real network traffic for a few seconds
would have shown it. The likely mechanism is that `invalidateAll()` hands
the route a new `data` object by reference and an `$effect` reruns on the
reference it read changing, independent of whether the value inside is
the same — but that specific cause was never isolated from the
alternative (the composer's own `use:enhance` doing the same thing on
every send). What's proven, not inferred: the effect's own body was
re-triggering itself, by *some* path through `invalidateAll()`.

Rule: an `$effect` must never call `invalidateAll()`/`invalidate()` without
a guard that makes every rerun after the first a no-op unless the thing the
effect actually keys on (here, which conversation is open) has genuinely
changed — that guard is correct regardless of which of the above is the real
trigger. A `$state` flag set *before* the async work starts, compared
against the value the effect keyed on, is enough — the fix here was `if
(markedFor === id) return; markedFor = id` ahead of the fetch, which took
the observed count to zero in a clean 5-second window. Load-test any
`$effect` that mixes a prop read with an invalidating call by watching real
network traffic for at least a few
seconds, not just checking that the intended request fired once.

### L97 — a GIN index on an array column doesn't help a `scalar = ANY(column)` predicate

`team_chat_conversations.member_ids` (`UUID[]`) had a `USING GIN (member_ids)`
index, added on the plausible-sounding theory that "an array column doing
membership checks wants a GIN index." Every policy that actually reads the
column writes the check as `app.current_employee_id() = ANY (member_ids)` —
a `ScalarArrayOpExpr`, not one of the four operators GIN's `array_ops` class
serves (`&&`, `@>`, `<@`, whole-array `=`). Confirmed empirically, not
inferred: with 5,000 rows and `SET enable_seqscan = off` (so the planner
has no fallback), `= ANY(member_ids)` still plans as a `Seq Scan` — the
index is structurally unreachable for that predicate shape — while the
same table filtered on `member_ids @> ARRAY[x]` correctly plans a `Bitmap
Index Scan` against it. `./check`'s own invariants suite never caught this,
because it verifies an index's naming and tenant-leading shape, not whether
any real query can actually use it.

Rule: before indexing an array column for a membership check, write the
`EXPLAIN` for the predicate the application will *actually* execute — the
scalar-in-array form (`x = ANY(col)`) and the containment form (`col @>
ARRAY[x]`) are different expression trees to the planner and only the
second is GIN-indexable. Either write the query as `@>` from the start, or
— as here, on a table classified `NOT_SCALE_SENSITIVE` — skip the index
and let it seq scan; a table that never grows past organization size has no
query the index would have sped up anyway, so it was pure write-side
overhead with a zero-benefit read side.

### L98 — closing an immutability gap on one RLS command doesn't close it on the sibling command

`20260912060000_journal_entry_immutability.sql` rewrote `accounting_update`
on `journal_entries`/`journal_entry_lines` to add `AND status <> 'posted'`,
closing the gap its own comment names ("nothing stopped a future route from
reaching it"). `accounting_delete` — a separate RESTRICTIVE policy object,
generated by the same DO-loop in `20260903045821_accounting_row_visibility.sql`
— was left with no status predicate at all, so the RLS text itself still
permitted deleting a posted entry via `DELETE`, the other command that
achieves the same violation "editing a posted entry is disallowed" is
supposed to prevent. `FOR SELECT`/`FOR INSERT`/`FOR UPDATE`/`FOR DELETE` are
independent policy objects in Postgres — fixing the invariant for one is a
separate edit from fixing it for another, and it's easy to think of
"immutable" as one property when enforcing it is actually N separate
predicates, one per command that could break it.

Caught by an ultrareview pass, not by any test or `./check` step — the gap
was real in the policy text, but confirmed NOT independently reachable: no
role a real request ever authenticates as (`app_user`, `service_role`,
`authenticated`) holds a `DELETE` grant on `journal_entries` at all (checked
`information_schema.role_table_grants`), so the base GRANT layer blocked it
regardless of what the RLS policy said. `./check`'s RLS harnesses test
`SELECT`-shaped isolation almost exclusively; a `DELETE`-only gap on a table
nothing currently deletes from is exactly its blind spot. Verified the fix
by temporarily granting `DELETE` to `app_user` inside a rolled-back
transaction and confirming both halves directly: a draft row's `DELETE`
returns `DELETE 1`, a posted row's returns `DELETE 0` — the same discriminating-predicate
positive control the existing UPDATE test already used.

Rule: when a migration closes a "this is disallowed" gap for one command,
grep the same table's OTHER policies (especially the RESTRICTIVE ones from
whatever migration first created them) for the same missing predicate
before considering the invariant closed.

### L99 — advancing a recurring date FROM its own last value compounds a month-end clamp forever

`recurring_schedules`/`amortization_schedules` advanced with `next_run_date
+ interval '1 month'` (or `3 months`/`1 year`). Postgres clamps this to the
target month's last day when the current day doesn't exist there — `'2026
-01-31'::date + interval '1 month'` is `2026-02-28`, not an overflow into
March — confirmed empirically before writing the fix, not assumed from a
mental model of "interval arithmetic." The actual bug is what happens
NEXT: every subsequent advance reads the CLAMPED value as its new starting
point, so `2026-02-28 + interval '1 month'` is `2026-03-28` — the schedule
never returns to the 31st even in a month that has one, because nothing
in the stored state remembers that 31 was ever the target.

The fix needed new state, not a smarter formula: an `anchor_day` column,
written once at creation from the schedule's own first `next_run_date` and
never rewritten by the advance. Each advance computes the TARGET month's
first day (arithmetic on day 1 never overflows), then
`LEAST(anchor_day, days in that target month)` — recomputed from the real
anchor every time, so a clamp in one short month can't propagate into the
next. A schedule already drifted under the old formula has no recoverable
record of its original day; the migration backfills `anchor_day` from
whatever `next_run_date` currently holds, accepting that a currently-wrong
day becomes that row's new anchor rather than fabricating a guess.

Rule: a value that gets ADVANCED by re-deriving it from its own previous
value silently accumulates whatever rounding/clamping the advance step
does. If the intended target is a specific point per cycle (an anchor day,
a fixed rate, a nominal date) — not "whatever it was last time plus one
step" — store the anchor separately from the cursor, and always advance
from the anchor, never from the cursor's last value.

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

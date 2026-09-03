# `app/` Provenance and Planned Modifications

**Version:** 1.0
**Last Updated:** August 27, 2026
**Status:** Active

---

## Where `app/` came from

`app/` started as a copy of
**[CMSaasStarter](https://github.com/scosman/CMSaasStarter)** at commit
`2e61406` (2026-03-21) — an MIT-licensed SvelteKit + Supabase SaaS template.

```
Copyright (c) 2023 Steve Cosman
MIT License — retained at apps/web/LICENSE
```

**Keep `apps/web/LICENSE` in place.** The MIT licence requires the copyright notice
to travel with the code, including in derivative work. Everything else is ours
to change freely.

**We do not track upstream.** The starter was a seed, not a dependency: `app/`
is our code now, modified as we see fit. If a specific upstream fix is ever
wanted, port it by hand. Dependency updates come from `npm update`, not from
upstream.

---

## The second source: Nexus (UI template)

The product shell — sidebar, topbar, theming, and the table and form component
patterns — comes from **Nexus SvelteKit 3.0.0**, a commercial daisyUI admin
template by Denish Navadiya (`nexus-sveltekit-ref`, a machine-local symlink; it
is not committed).

**Attribution lives here rather than in the running application.** Nexus's
footer shipped with its author's byline and a "Buy Now" link to the daisyUI
store. Both were removed from `Footer.svelte`: a byline attributes the product
to someone who did not build it, and a template purchase link does not belong
inside a customer's payroll system. The credit is recorded in this document
instead.

**Canonical reference: <https://nexus.daisyui.com/dashboards/ecommerce>.** The
live template. Always compare a finished screen against it before calling the
work done; the divergence table below is the record of where we knowingly
depart from it.

Copied under `apps/web/src/lib/`: `components/admin-layout/`, `styles/`,
`contexts/ConfigProvider.svelte`, `Logo`, `ThemeToggle`, `PageTitle`.

**What was changed on the way in, and why** — each of these was a defect, not a
preference:

| Change | Reason |
|---|---|
| `warningFilter` NOT copied from `svelte.config.js` | It suppressed every accessibility warning, against docs 02 (WCAG 2.1 AA) and 04. It also tested for `"ally_"` when the real Svelte prefix is `a11y_`, so it never worked. Removing it surfaced **73 real lint errors**, all since fixed |
| Rightbar options given `role`/`tabindex`/keydown | Every appearance control was `onclick` on a plain `<div>`: mouse-only, no tab stop, invisible to screen readers. WCAG 2.1.1 and 4.1.2 failures. The surviving theme swatches are real `<button>`s and keep that fix; the controls listed in the row below were removed rather than kept |
| ~35 self-closing non-void tags corrected | `<span />` is an open tag in HTML; everything after it nested inside |
| `Sidebar` active-item tracking moved to `$derived` | Seeded `$state` captured only the initial `menuItems`, so a menu that changes would highlight against a stale array |
| Search / language / notification widgets deleted | Convincing shells over hardcoded data. See the note in `Topbar.svelte` |
| Demo identity replaced with the session user | "Denish N", "John Doe", avatar images, a fake team roster, and an "Upgrade — save 30%" panel |
| `Logo` redrawn as markup | Pointed at two PNGs that do not exist in this repo |
| Touch-target floor moved from `min-h-11` utilities to one `pointer: coarse` rule | A per-element utility has to be remembered at every call site forever; the rule covers controls not yet written |
| Six themes reduced to two — light and dark | Nexus ships `light`, `contrast`, `material`, `dark`, `dim`, `material-dark`. Kaaj carries light and dark, plus `system` (the absence of a choice, and the default). Every theme is a surface every new colour pair has to be measured against — L22's floor is per-theme work — and four of them differed from their siblings mainly in card shadow and topbar radius. The `material` themes also floated the sidebar and topbar as rounded cards, which was the only structural difference and is now gone |
| Appearance panel reduced to theme selection | Nexus's Rightbar also set `direction` (LTR/RTL), an independent `sidebarTheme`, a `fontFamily` switcher, fullscreen and reset. RTL is not a commitment Kaaj is making; the font switcher was already vestigial (`typography.css` says so); the sidebar now follows the active theme, which is one fewer combination to measure contrast against (L22); and "reset to defaults" with a single setting is one click that changes the one value the panel already shows. The panel itself is being repurposed for the AI assistant |
| Right-hand panel repurposed as the AI assistant, shipped empty | Nexus's appearance drawer is now `AssistantPanel.svelte`. It is a **deliberate exception** to the rule that removed Nexus's search, language and notification widgets (L15): those were convincing shells over hardcoded data, and this is an explicit "not built yet" with no message list and no input box — a field that accepted a question and did nothing would be the very thing that rule forbids. Theme selection moved to the profile drawer so `system`, the default, stays reachable |
| Hand-built mobile cards replaced with daisyUI `list`, hand-built footer with `footer` | Both components already existed; rebuilding them is how spacing drifts page by page |
| Four Google Fonts families reduced to one, moved to `<link>` | Chained `@import url()` is render-blocking three requests deep — docs 03 and 04 both forbid it |
| Six plugin stylesheets dropped | apexcharts, quill, filepond, flatpickr, swiper, sortablejs are not installed; they are most of the template's weight |
| Menu replaced wholesale | Nexus ships Ecommerce / Gen-AI / Agentic. The IA is doc 02's five module groups |

The shell is borrowed. The navigation, the data, and the accessibility floor
are the product's own.

**What was changed by preference, not because it was broken** — divergence from
the [canonical reference](https://nexus.daisyui.com/dashboards/ecommerce) is
fine; undocumented divergence is drift:

| Divergence | Why |
|---|---|
| The firm's name sits in the topbar, beside the menu toggle, at `text-xl` | Nexus puts its search palette there and shows no tenant identity anywhere — it is a single-tenant demo. This is multi-tenant software where an admin may hold accounts in several firms, and "which company am I editing?" must be answerable without opening a menu. The sidebar's `text-xs` line under the user's name is not an answer |
| Status badges are SOLID; Nexus uses `badge-soft` (28 times, and solid never) | Measured in this app's light theme, soft is worse on every tone and turns the only passing one into the worst failure — warning goes 9.57:1 to 1.94:1, success 2.44 to 2.28, error 4.14 to 3.75, info 2.33 to 2.19. The accessibility floor is this document's own stated divergence, and L22 says the light theme is the half that fails. See the note below: the underlying problem is the theme tokens, not the badge style |

**The badge palette does not meet WCAG AA in the light theme, and this predates
the divergence above.** `--color-info-content`, `--color-success-content` and
`--color-error-content` are all `#ffffff`, paired with mid-bright colours that
white cannot sit on: white on `#14b4ff` is 2.33:1, on `#0bbf58` is 2.44:1, and
on `#f31260` is 4.14:1, against the 4.5:1 AA needs. `--color-warning-content` is
`#150a00` — near-black — which is why warning is the one tone that passes at
9.57:1. The same pairs back every solid `btn-*` and `alert-*`, so this is a
theme-token decision rather than a badge one, and it is not fixed here: darkening
three content colours changes the product's palette and is the owner's call.
Measured with the browser converting each computed colour to sRGB — parsing
daisyUI's `oklab()` strings by hand produces confident nonsense.

---

## Why this starter

It already matches the architecture we settled on, which is most of the value:

| Starter provides | Matches |
|---|---|
| SvelteKit 2 + Svelte 5 (runes) | [ADR-004](./05-architecture-decisions.md#adr-004-sveltekit-as-the-full-stack); `03-perf_guide.md` and `04-mobile_guide.md` are already written for runes |
| `@supabase/ssr`, Supabase Auth wiring | [ADR-008](./05-architecture-decisions.md#adr-008-supabase-as-the-backend-platform) |
| Tailwind 4 + daisyUI 5 | No ADR — a starter choice, ours to keep or replace |
| Working auth flows, billing scaffolding, CI | Saves the boring parts |

---

## Planned modifications

What has to change for the starter to become this product. This doubles as the
first work list.

| Area | Change | Driver |
|---|---|---|
| `apps/web/svelte.config.js` | `adapter-auto` → `@sveltejs/adapter-node` | [ADR-005](./05-architecture-decisions.md#adr-005-node-lts-as-the-runtime): a long-running container, not a serverless target |
| `apps/web/src/hooks.server.ts` | Resolve tenant from subdomain into `event.locals.tenantId`; reject when the subdomain and the token disagree | [ADR-003](./05-architecture-decisions.md#adr-003-shared-schema-multi-tenancy-with-row-level-security) — the starter is single-tenant |
| `apps/web/src/lib/server/db/` | New: `postgres.js` pool, and `withTenant()` owning the per-request transaction and `SET LOCAL request.jwt.claims` | ADR-003, ADR-008 |
| `apps/web/src/lib/server/db/router.ts` | New: control-plane lookup + bounded LRU pool registry, so one deployment can serve shared, dedicated and customer-hosted databases | [ADR-009](./05-architecture-decisions.md#adr-009-subdomain-routed-database-targets) |
| `apps/web/src/lib/server/modules/` | New: one directory per module, repositories taking `tenantId` as a required first parameter | [ADR-001](./05-architecture-decisions.md#adr-001-modular-monolith-not-microservices) |
| Database | Replace the starter's demo profile table with [`schema.sql`](../packages/database/reference/schema.sql) (98 tables) | The starter ships a minimal example schema |
| Auth | Add `tenant_users` membership and the `custom_access_token_hook` that stamps `app_metadata.tenant_id` | ADR-008 |
| Jobs | New: `worker.ts` entrypoint claiming from the `jobs` table with `SKIP LOCKED` | [ADR-002](./05-architecture-decisions.md#adr-002-postgresql-as-the-only-datastore) |
| Shared code | Import `validation-utils.js` (33 validators) and `enumerations.json` so client and server validate identically | ADR-004 |
| Billing | Evaluate what the starter ships against our pricing model | — |
| Demo content | Delete the marketing/demo pages we do not want | — |

---

## Related documents

- [Architecture Decisions](./05-architecture-decisions.md)
- [Technical Architecture](./architecture-technical.md) — the target structure
  for `apps/web/src/`
- [`data-models/schema.sql`](../packages/database/reference/schema.sql)

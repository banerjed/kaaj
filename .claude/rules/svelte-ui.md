---
paths:
  - "apps/web/src/**/*.svelte"
  - "apps/web/src/**/*.svelte.ts"
  - "apps/web/src/app.css"
---

# Svelte and UI rules

Claude Code loads this file when it reads a `.svelte` file, a `.svelte.ts` file
or the stylesheet.

## The UI reference

**<https://nexus.daisyui.com/dashboards/ecommerce> is the canonical example.**
Before you call UI work complete, compare every page with it. Compare these
items:
- spacing
- the treatment of cards and tables
- the type scale and the density
- the empty states and the loading states
- the behavior of the shell at each breakpoint.

It is the live version of the template in `nexus-sveltekit-ref`. Thus it also
gives the fastest answer to this question: "Does Nexus do it this way, or did
we make it ourselves?" Most of the UI entries in
[docs/10-lessons-learned.md](docs/10-lessons-learned.md) come from that
question.

[docs/07-app-provenance.md](docs/07-app-provenance.md) records each intentional
difference from Nexus, and the reason for it. These differences include the
information architecture, the URLs, the accessibility minimum, and each demo
feature that has no function behind it. A difference is acceptable. A difference
that nobody recorded is drift.

**A status badge goes through `StatusBadge` (`$lib/components/`).** Before, each
of eleven pages had its own ternary that returned `badge-success`/`badge-error`/….
The words for the statuses are different on each page, and that is correct.
"paid" is for invoices and "present" is for attendance. But eleven pages had a
copy of the daisyUI class names. Now a page names a *tone* (`positive` ·
`caution` · `critical` · `progress` · `neutral`). The component holds the ten
complete class strings. Thus one edit changes the style of every status badge
([L72](docs/10-lessons-learned.md)).

**The badges are SOLID, not `badge-soft`, although Nexus and daisyUI both
prefer `badge-soft`.**
- `badge-soft` failed AA in the light theme when that theme was `nord`. Its
  contrast was 1.32:1 to 3.27:1. The contrast of solid badges was 4.97 to
  12.24.
- `badge-soft` passes in the dark theme. But the style of a badge must be the
  same in each theme.
- The light theme is now `corporate`, and nobody has **measured the contrast
  again**. `corporate` puts pure-white content colours on several mid-bright
  backgrounds. That is the same condition that failed before
  ([L73](docs/10-lessons-learned.md)). Until somebody measures it, do not
  think that solid or soft is correct in `corporate`.

The accessibility minimum is more important than fidelity to the template.
[docs/07-app-provenance.md](docs/07-app-provenance.md) records this difference.

**Never assemble a class name.** Tailwind cannot see `badge-${size}`. Tailwind
reads the source text and cannot calculate an expression. Thus Tailwind does
not generate the class, the element shows with no style, and no error occurs.
Map each state to a COMPLETE class string, as the `BADGE` table of
`StatusBadge` does. The audit of daisyUI also flags an assembled class name, for
the same reason.

**The palettes are the built-in `corporate` (light) and `night` (dark) themes
of daisyUI. The application never keeps a copy of them.**
- `data-theme` holds those names. The labels that a user reads are still Light
  and Dark. `TopbarProfileMenu` keeps the value and the label separate on
  purpose.
- `system` removes `data-theme` fully. `--prefersdark` on `night` is for this
  case.
- daisyUI tells you not to use `--prefersdark` together with a controller. That
  warning is about controllers WITHOUT a system option.
- Before, the two themes were approximately 98 lines that people wrote by hand.
  Because we kept that copy, 3 of 4 solid badges came to fail AA
  ([L73](docs/10-lessons-learned.md)).

**To measure a colour pair, let the BROWSER convert it.** Paint the colour on a
canvas and read the pixel. In one session, we parsed a computed colour string by
hand, and the result was wrong three times:
- We read the components of `oklab()` as RGB.
- We put an alpha colour on white, not on its real background.
- A `/\d+/g` channel regex on `oklch(0.20768 …)` gave a near-black surface a
  brightness of 20788.

**Use one typeface in BOTH themes. `--font-sans` and `--font-display` both
resolve to Roboto Variable.** Nexus also uses a single family.
- The two tokens stay separate. Thus display text can have a size or weight
  that is different from body text, with no second font file.
- daisyUI themes have no font slot, and Tailwind `@theme` tokens are global.
  Thus, a typeface for each theme would need new token definitions under
  `[data-theme]`. Then every heading would move when the user changes the
  theme.
- A change of theme changes colour, not type.
- Roboto Variable covers weight 100–900. Thus `font-bold`/`font-medium` on
  `font-display` text shows a real weight, not a synthesised weight. The
  Instrument Serif that Roboto replaced did not do this.

**Secondary text stops at `base-content/70`.** Below `/70`, the text fails WCAG
AA on a light background. (`/60` is 4.26:1, and AA requires 4.5.) In dark mode,
the text passes at both values. Thus, if you examine only one theme, you do not
see the failure. Measure each new colour pair in BOTH themes. The light theme is
the one that fails. See [L22](docs/10-lessons-learned.md). The light theme is
now `corporate`, and nobody has measured `/70` against it again. Measure it again
before you use this minimum.

## Svelte

Use Svelte 5, and use only runes. The rules below come from
[svelte.dev/docs/svelte/best-practices](https://svelte.dev/docs/svelte/best-practices).
This file gives them as rules because an alternative that looks correct
compiles, runs, and is wrong.

**Use `$state` only for a value that a template, an `$effect` or a `$derived`
reads reactively. Do not use it for every local variable.**
`$state({...})`/`$state([...])` puts a deep proxy on all of the object graph.
Your code only REPLACES some objects or class instances, and never changes
them through Svelte. Examples are a fetch response, or an instance of a
third-party library that you keep for its methods. For these, use
`$state.raw`.

`$state.raw` adds no proxy and no cost for each field. Also, it does not put
the internal state of a library in a Proxy that the library does not expect.

**If a value comes from other state, use `$derived`, not `$effect`.**
`$derived` takes an expression (use `$derived.by` for a body with more than
one statement). It calculates the value again when its inputs change. It
cannot write to state, so it cannot start the state→effect→state loop that an
`$effect` can start.

Use `$effect` only to send changes OUT to something that is not in the
reactivity of Svelte. Examples are the DOM directly (`{@attach ...}` or an
`$effect` for a `contenteditable`), a chart library, or `localStorage`. Do
not use `$effect` to calculate one part of the state from another part when
`$derived` can do it.

**If a value comes from a prop, use `$derived`. Do not use a `let` that gets
its value from the prop one time only.** Props are reactive.
`let color = $state(type === "danger" ? "red" : "green")` keeps the value
that it had at mount, and it does not follow changes to `type` after that.
Sometimes a component must have its OWN copy that becomes different from the
prop. Examples are a draft that the user edits, or a DOM mirror. For such a
copy, set its first value from the prop explicitly.

Add `// svelte-ignore state_referenced_locally` and a comment that gives the
reason. `RichTextEditor.svelte` and `Combobox.svelte` do this for that
reason.

Sometimes the copy must continue to follow the prop. Examples are a filter
that comes from the URL, or a `load()` result. For such a copy, use an
`$effect` that sets it again, not the `$state` initializer.
`ticketing/+page.svelte` and `ticketing/new/+page.svelte` do this on
purpose, and a comment in each file describes the trap.

**For a `window`/`document` listener, use `<svelte:window on... />` /
`<svelte:document on... />`. Do not use `onMount` + `addEventListener`.** The
element removes its own listener. A listener that you add by hand needs a
`removeEventListener` that you also write by hand, and the same `onMount`
callback must return it. If you forget it, the listener stays after the
component is gone. Use `onMount` only for work that occurs one time at mount,
for example an initial focus or an initial fetch. A listener that must stay
for the full life of the component must be on the element.

**If a list can change its order, or get or lose items, use a keyed
`{#each}`. Never use the loop index as the key.** Write
`{#each rows as row (row.id)}`. If the key is the index and a row leaves the
middle of the list, Svelte changes the WRONG element in place. You cannot see
this until a `bind:` or a transition attaches to the wrong row.

One case is cosmetic and not a bug. That case is a `{#each}` over a small,
static literal that never changes its order (marketing text, a fixed list of
features).
Give this case a real key too. But do not change current code only for this
case.

**In new code that syncs a DOM node to an external library, use
`{@attach}`, not `use:`.** `{@attach}` works together with `{#if}`/`{#each}`
in a way that an action cannot. We do not change current `use:` actions only
for this reason.

**All requests that the server answers share one `$state` at module scope.**
SvelteKit runs one Node process for many tenants. A `let cache = $state(...)`
at the top level of a `.svelte.ts` file is one value for all of the server,
not one value for each request. This is the shape of a cross-tenant
disclosure. A full section of this file is about how to prevent cross-tenant
disclosure at the database layer.

Put reactive state that belongs to one request or one user in the Svelte
context (`setContext`/`getContext`). If possible, put a runes class in the
context, as `ConfigProvider.svelte` does. Never put this state in a shared
module.

**Do not use `svelte/store` in new code. Use a class with `$state` fields.** A
store needs `get()`/`.subscribe()`/`$store` auto-subscription for a reactive
read, and `.update()` for a write. With a runes class, code reads and writes
a field as a usual field. For this reason, you can also safely destructure a
bound method from it, and `this` stays correct
(`const { toggleTheme } = useConfig()` in `ThemeToggle.svelte`).
`svelte/store` is a legacy API from Svelte 4, and Svelte keeps it only for
interop. Do not use it in new code.

**Do not use legacy patterns in new code**, although `svelte-check` and
`./check` do not fail on them. These patterns are:

- `export let` / `$$props` / `$$restProps` instead of `$props()`
- `on:click` instead of `onclick`
- `<slot>` instead of `{#snippet}`/`{@render}`
- a bare `$:` instead of `$derived`/`$effect`

None of these patterns are in `apps/web/src` today. Keep it so. If one of
them gets in, a developer can copy it as the start of the next component.

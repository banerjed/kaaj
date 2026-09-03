<script lang="ts">
  import type { Snippet } from "svelte"
  import type { Tone } from "./status-tone"

  /**
   * A status, as daisyUI spells it.
   *
   * The colour is reinforcement, never the message: the label always carries
   * the meaning in words, which is both the accessibility floor and daisyUI's
   * own guidance for badges. That is why there is no icon-only or empty-badge
   * form here.
   *
   * **Ten COMPLETE class strings, not four fragments concatenated.** Assembling
   * `badge` + a size + a tone leaves no whole class name anywhere in the
   * source: Tailwind reads source text and cannot evaluate an expression, and
   * daisyUI's audit cannot verify that the pieces make a legal combination.
   * Written out, both can. It is more verbose and it is the honest statement of
   * how many badges this product actually has.
   *
   * **Solid, NOT `badge-soft`, and this is a deliberate divergence from the
   * template.** Nexus writes `badge badge-soft badge-success badge-sm` and
   * never a solid status badge, and daisyUI's own guidance prefers soft — but
   * measured in this app's LIGHT theme, soft is worse on every tone and turns
   * the one passing colour into the worst failure:
   *
   *     tone      solid     soft
   *     success   2.44:1    2.28:1
   *     warning   9.57:1    1.94:1   <- passes AA, then does not
   *     error     4.14:1    3.75:1
   *     info      2.33:1    2.19:1
   *
   * L22's rule decides it: the accessibility floor is already a recorded
   * divergence from Nexus (docs/07-app-provenance.md), and the light theme is
   * the half that fails. See that file for the underlying theme-token problem,
   * which this component cannot fix.
   *
   * `neutral` is `badge-ghost`, which measures 13.86:1 and is the only badge
   * here that comfortably passes.
   */
  const BADGE: Record<"sm" | "md", Record<Tone, string>> = {
    sm: {
      positive: "badge badge-sm badge-success",
      caution: "badge badge-sm badge-warning",
      critical: "badge badge-sm badge-error",
      progress: "badge badge-sm badge-info",
      neutral: "badge badge-sm badge-ghost",
    },
    md: {
      positive: "badge badge-md badge-success",
      caution: "badge badge-md badge-warning",
      critical: "badge badge-md badge-error",
      progress: "badge badge-md badge-info",
      neutral: "badge badge-md badge-ghost",
    },
  }

  /**
   * `capitalize` is a prop rather than always-on because three call sites
   * render something that must not be title-cased — a count beside a word, and
   * a status with its underscores already replaced. It is applied through
   * Svelte's `class:` directive so the utility stays a literal too.
   */
  let {
    tone,
    capitalize = true,
    size = "sm",
    children,
  }: {
    tone: Tone
    capitalize?: boolean
    /** `sm` in tables and lists; `md` reads as a header label. */
    size?: "sm" | "md"
    children: Snippet
  } = $props()
</script>

<span class={BADGE[size][tone]} class:capitalize>
  {@render children()}
</span>

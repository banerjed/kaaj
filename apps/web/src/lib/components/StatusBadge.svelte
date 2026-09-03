<script lang="ts">
  import type { Snippet } from "svelte"
  import type { Tone } from "./status-tone"

  /**
   * Ten complete class strings — never assembled — so Tailwind can see them.
   * Solid, not badge-soft — soft fails AA in the light theme (L22,
   * docs/07-app-provenance.md).
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

  /** A prop, not always-on: some call sites render text that must not be title-cased. */
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

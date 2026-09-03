<script lang="ts">
  import type { Snippet } from "svelte"
  import { TONE_CLASS, type Tone } from "./status-tone"

  /**
   * Full class names, never `badge-${size}`. Tailwind reads source text and
   * cannot evaluate an expression, so an assembled name is simply never
   * generated — the badge renders unsized and nothing errors.
   */
  const SIZE_CLASS = { sm: "badge-sm", md: "badge-md" } as const

  /**
   * A status, as daisyUI spells it.
   *
   * The colour is reinforcement, never the message: the label always carries
   * the meaning in words, which is both the accessibility floor and daisyUI's
   * own guidance for badges. That is why there is no icon-only or empty-badge
   * form here.
   *
   * `capitalize` is a prop rather than always-on because three call sites
   * render something that must not be title-cased — a count beside a word, and
   * a status with its underscores already replaced.
   */
  let {
    tone,
    capitalize = true,
    size = "sm",
    children,
  }: {
    tone: Tone
    capitalize?: boolean
    /** `sm` in tables and lists; the default size reads as a header label. */
    size?: "sm" | "md"
    children: Snippet
  } = $props()
</script>

<span
  class={`badge ${SIZE_CLASS[size]} ${TONE_CLASS[tone]}${capitalize ? " capitalize" : ""}`}
>
  {@render children()}
</span>

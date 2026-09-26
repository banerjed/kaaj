<script lang="ts">
  import type { Snippet } from "svelte"
  import type { LabelColor } from "$lib/server/custom-fields/custom-fields.repo"

  /**
   * Decoration for a custom field's select/multiselect options — NOT status.
   * Deliberately a sibling of StatusBadge, not an extension of it: `Tone`
   * (status-tone.ts) is documented "meaning only," and a custom option like
   * a region or service line has no inherent meaning to encode.
   *
   * Eight complete class strings — never assembled, same reason as
   * StatusBadge. The first four reuse StatusBadge's already-AA-measured
   * classes; the last four (primary/secondary/accent/neutral) are daisyUI
   * defaults not yet measured against this app's corporate/night themes —
   * see docs/26-project-management-custom-fields.md. Do not assume they pass
   * AA before that measurement happens (L73).
   */
  const BADGE: Record<LabelColor, string> = {
    success: "badge badge-sm badge-success",
    warning: "badge badge-sm badge-warning",
    error: "badge badge-sm badge-error",
    info: "badge badge-sm badge-info",
    primary: "badge badge-sm badge-primary",
    secondary: "badge badge-sm badge-secondary",
    accent: "badge badge-sm badge-accent",
    neutral: "badge badge-sm badge-neutral",
  }

  let { color, children }: { color: LabelColor; children: Snippet } = $props()
</script>

<span class={BADGE[color]}>
  {@render children()}
</span>

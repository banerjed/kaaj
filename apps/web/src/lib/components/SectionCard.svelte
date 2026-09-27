<script lang="ts">
  import type { Snippet } from "svelte"

  /** The `card bg-base-100 shadow` / `card-body` shell every settings section repeats. */
  let {
    title,
    heading,
    description,
    children,
    class: className = "",
  }: {
    title?: string
    /** For a header row that's more than a title — badges, an inline "Add" button. Overrides `title`. */
    heading?: Snippet
    description?: string
    children: Snippet
    class?: string
  } = $props()
</script>

<div class="card bg-base-100 shadow {className}">
  <div class="card-body gap-4">
    {#if heading}
      {@render heading()}
    {:else if title}
      <h2 class="text-base font-medium">{title}</h2>
    {/if}
    {#if description}
      <p class="text-base-content/70 text-sm">{description}</p>
    {/if}
    {@render children()}
  </div>
</div>

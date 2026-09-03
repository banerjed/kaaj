<script lang="ts">
  export type IBreadcrumbItem = {
    label: string
    path?: string
    active?: boolean
  }

  import type { Snippet } from "svelte"

  type IPageTitle = {
    items?: IBreadcrumbItem[]
    title: string
    // Rendered content, so Snippet, not `any` (which rendered "[object Object]").
    centerItem?: Snippet
  }

  let { items, centerItem, title }: IPageTitle = $props()
</script>

<div class="flex items-center justify-between">
  <!-- An <h1>, not a <p> — no page had one until the e2e suite caught it by role (L64). -->
  <!-- No font-medium: Instrument Serif ships only weight 400, so bold would be synthesised. -->
  <h1 class="font-display text-xl">{title}</h1>
  {#if centerItem}
    {@render centerItem()}
  {/if}
  {#if items}
    <div class="breadcrumbs hidden p-0 text-sm sm:inline">
      <ul>
        <!-- Doc 02: the trail starts at Home (Nexus hardcoded its own name). -->
        <li>
          <a href="/">Home</a>
        </li>
        {#each items as item, index (index)}
          <li class={`${item.active ? "opacity-80" : ""}`}>
            {#if item.path}
              <a href={item.path}>
                {item.label}
              </a>
            {:else}
              {item.label}
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

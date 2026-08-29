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
    // Nexus typed this `any`, which accepted a string and rendered
    // "[object Object]". It is rendered content, so it is a Snippet.
    centerItem?: Snippet
  }

  let { items, centerItem, title }: IPageTitle = $props()
</script>

<div class="flex items-center justify-between">
  <p class="text-lg font-medium">{title}</p>
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

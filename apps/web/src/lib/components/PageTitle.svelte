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
  <!--
    An <h1>, not a <p>.
    
    This rendered `<p class="text-lg font-medium">` and looked exactly right,
    so nothing caught it: `<p>` is valid markup, eslint's a11y rules have
    nothing to object to, and `svelte-check` is a type checker. The effect is
    that NO page in the application had a level-one heading — a screen reader
    user pressing "1" to jump to the page's subject landed nowhere, and the
    section <h2>s beneath were headings under no heading (WCAG 1.3.1, 2.4.6).
    
    The classes are unchanged, so it looks identical. Found by the first e2e
    run, which asks for the heading by ROLE rather than by text (L64).
  -->
  <h1 class="text-lg font-medium">{title}</h1>
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

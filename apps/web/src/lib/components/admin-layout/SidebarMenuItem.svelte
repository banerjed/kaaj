<script lang="ts" module>
  import type { HTMLAnchorAttributes } from "svelte/elements"
  import SidebarMenuItem from "./SidebarMenuItem.svelte"
  import SidebarMenuItemBadges, {
    type ISidebarMenuItemBadges,
  } from "./SidebarMenuItemBadges.svelte"

  export type ISidebarMenuItem = {
    id: string
    icon?: string
    label: string
    isTitle?: boolean
    url?: string
    linkProp?: HTMLAnchorAttributes
    children?: ISidebarMenuItem[]
    /** Kaaj addition: in the IA but not built yet. Renders as a dimmed
     * non-link — an <a href=""> would reload the current page. */
    disabled?: boolean
    /** Kaaj addition: hide this entry from anyone without the permission.
     * NAVIGATION ONLY. Hiding a link is not authorization — every load and
     * action still checks for itself, and must keep doing so. */
    permission?: string
  } & ISidebarMenuItemBadges
</script>

<script lang="ts">
  let {
    id,
    url,
    children,
    icon,
    isTitle,
    badges,
    linkProp,
    label,
    disabled,
    activated,
  }: ISidebarMenuItem & { activated: Set<string> } = $props()
  let selected = $derived(activated.has(id))
  let expanded = $state(false)

  $effect(() => {
    if (selected) {
      expanded = true
    }
  })
</script>

{#if isTitle}
  <p class="menu-label px-2.5 pt-3 pb-1.5 first:pt-0">{label}</p>
{:else if !children && disabled}
  <div
    class="menu-item cursor-not-allowed opacity-45"
    aria-disabled="true"
    title="Not built yet"
  >
    {#if icon}
      <span class={`iconify ${icon} size-4`}></span>
    {/if}
    <span class="grow">{label}</span>
    <SidebarMenuItemBadges {badges} />
  </div>
{:else if !children}
  <a
    href={url ?? ""}
    class={`menu-item  ${selected && "active"}`}
    {...linkProp}
  >
    {#if icon}
      <span class={`iconify ${icon} size-4`}></span>
    {/if}
    <span class="grow">{label}</span>
    <SidebarMenuItemBadges {badges} />
  </a>
{:else}
  <div class="collapse group">
    <input
      aria-label="Sidemenu item trigger"
      type="checkbox"
      name="sidebar-menu-parent-item"
      bind:checked={expanded}
      class="peer"
    />
    <div class="collapse-title px-2.5 py-1.5">
      {#if icon}
        <span class={`iconify ${icon} size-4`}></span>
      {/if}
      <span class="grow">{label}</span>
      <SidebarMenuItemBadges {badges} />
      <span class="iconify lucide--chevron-right arrow-icon size-3.5"></span>
    </div>
    <div class="collapse-content ms-6.5 !p-0">
      <div class="mt-0.5 space-y-0.5">
        {#each children as item (item.id)}
          <SidebarMenuItem {...item} {activated} />
        {/each}
      </div>
    </div>
  </div>
{/if}

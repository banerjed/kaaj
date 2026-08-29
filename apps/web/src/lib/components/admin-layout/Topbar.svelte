<script lang="ts">
  import ThemeToggle from "$lib/components/ThemeToggle.svelte"
  import TopbarProfileMenu from "./TopbarProfileMenu.svelte"
  import type { ISidebarUser } from "./user"

  // Nexus's search palette, language switcher and notification tray were
  // removed, not rewired (L15). The firm's name occupies the slot Nexus gives
  // the palette — a deliberate divergence, recorded in 07-app-provenance.md.

  let {
    user,
    companyName,
  }: { user?: ISidebarUser; companyName?: string | null } = $props()
</script>

<div
  role="navigation"
  aria-label="Navbar"
  class="flex items-center justify-between gap-2 px-3"
  id="layout-topbar"
>
  <!-- min-w-0 on both the group and the name: without it a long firm name
       refuses to shrink and pushes the buttons off-screen (L11). -->
  <div class="inline-flex min-w-0 items-center gap-3">
    <label
      class="btn btn-square btn-ghost btn-sm"
      aria-label="Leftmenu toggle"
      for="layout-sidebar-toggle-trigger"
    >
      <span class="iconify lucide--menu size-5"></span>
    </label>
    {#if companyName}
      <span
        class="text-base-content min-w-0 truncate text-xl font-semibold tracking-tight"
        title={companyName}
      >
        {companyName}
      </span>
    {/if}
  </div>
  <div class="inline-flex shrink-0 items-center gap-0.5">
    <ThemeToggle class="btn btn-sm btn-circle btn-ghost" />
    <label
      for="layout-rightbar-drawer"
      class="btn btn-circle btn-ghost btn-sm drawer-button"
      aria-label="Appearance settings"
    >
      <span class="iconify lucide--settings-2 size-4.5"></span>
    </label>
    <TopbarProfileMenu {user} />
  </div>
</div>

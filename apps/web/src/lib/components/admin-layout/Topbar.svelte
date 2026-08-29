<script lang="ts">
  import ThemeToggle from "$lib/components/ThemeToggle.svelte"
  import TopbarProfileMenu from "./TopbarProfileMenu.svelte"
  import type { ISidebarUser } from "./user"

  // Nexus's search palette, language switcher and notification tray were
  // removed, not rewired (L15). Originals in nexus-sveltekit-ref/.

  let { user }: { user?: ISidebarUser } = $props()
</script>

<div
  role="navigation"
  aria-label="Navbar"
  class="flex items-center justify-between px-3"
  id="layout-topbar"
>
  <div class="inline-flex items-center gap-3">
    <label
      class="btn btn-square btn-ghost btn-sm"
      aria-label="Leftmenu toggle"
      for="layout-sidebar-toggle-trigger"
    >
      <span class="iconify lucide--menu size-5"></span>
    </label>
  </div>
  <div class="inline-flex items-center gap-0.5">
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

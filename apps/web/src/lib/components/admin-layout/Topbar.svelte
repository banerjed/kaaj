<script lang="ts">
  import ThemeToggle from "$lib/components/ThemeToggle.svelte"
  import TopbarProfileMenu from "./TopbarProfileMenu.svelte"
  import type { ISidebarUser } from "./user"
  import { brandColorHex } from "$lib/firm-profile/regional"

  // Nexus's search palette, language switcher and notification tray removed, not rewired (L15, 07-app-provenance.md).

  let {
    user,
    companyName,
    brandColor,
  }: {
    user?: ISidebarUser
    companyName?: string | null
    brandColor?: string | null
  } = $props()

  const hex = $derived(brandColorHex(brandColor))
</script>

<!-- Base is bg-primary/text-primary-content (matches btn-primary, per
     explicit design feedback). A tenant's brand_color, if set, overrides only
     --topbar-bg/--topbar-fg here — scoped to this element via CSS custom
     properties, per docs/06-customization-model.md, so it never touches
     btn-primary or text-primary anywhere else. The class list stays static
     and complete either way; only the `style` attribute varies. -->
<div
  role="navigation"
  aria-label="Navbar"
  class="flex items-center justify-between gap-2 bg-[var(--topbar-bg,var(--color-primary))] px-3 text-[var(--topbar-fg,var(--color-primary-content))]"
  style={hex ? `--topbar-bg:${hex};--topbar-fg:#fff` : undefined}
  id="layout-topbar"
>
  <!-- min-w-0 on both the group and the name: without it a long firm name
       refuses to shrink and pushes the buttons off-screen (L11). -->
  <div class="inline-flex min-w-0 items-center gap-3">
    <label
      class="btn btn-square btn-ghost btn-sm text-[var(--topbar-fg,var(--color-primary-content))]"
      aria-label="Leftmenu toggle"
      for="layout-sidebar-toggle-trigger"
    >
      <span class="iconify lucide--menu size-5"></span>
    </label>
    {#if companyName}
      <span
        class="min-w-0 truncate text-xl font-semibold tracking-tight"
        title={companyName}
      >
        {companyName}
      </span>
    {/if}
  </div>
  <div class="inline-flex shrink-0 items-center gap-0.5">
    <ThemeToggle
      class="btn btn-sm btn-circle btn-ghost text-[var(--topbar-fg,var(--color-primary-content))]"
    />
    <label
      for="layout-rightbar-drawer"
      class="btn btn-circle btn-ghost btn-sm text-[var(--topbar-fg,var(--color-primary-content))]"
      aria-label="Assistant"
    >
      <span class="iconify lucide--sparkles size-4.5"></span>
    </label>
    <TopbarProfileMenu {user} />
  </div>
</div>

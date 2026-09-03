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

<!--
  `bg-neutral text-neutral-content` — daisyUI's semantic pair for "interface
  areas that always use a dark style", which is exactly what this bar is. Not
  an arbitrary colour and not a `dark:` variant: `neutral` is dark in BOTH
  themes (45% lightness in nord, 28% in night) and daisyUI pairs each with a
  light `neutral-content`, so the contrast holds without being hand-tuned.

  It is also the customisation seam. A tenant's brand colour belongs in
  `--color-neutral` for that tenant, which recolours this bar and nothing that
  carries meaning — status badges stay success/warning/error, so a firm with a
  red logo does not end up with a UI that reads as permanently alarmed. See
  docs/06-customization-model.md; the per-tenant delivery is not built yet.
-->
<div
  role="navigation"
  aria-label="Navbar"
  class="bg-neutral text-neutral-content flex items-center justify-between gap-2 px-3"
  id="layout-topbar"
>
  <!-- min-w-0 on both the group and the name: without it a long firm name
       refuses to shrink and pushes the buttons off-screen (L11). -->
  <div class="inline-flex min-w-0 items-center gap-3">
    <label
      class="btn btn-square btn-ghost btn-sm text-neutral-content"
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
    <ThemeToggle class="btn btn-sm btn-circle btn-ghost text-neutral-content" />
    <label
      for="layout-rightbar-drawer"
      class="btn btn-circle btn-ghost btn-sm text-neutral-content"
      aria-label="Assistant"
    >
      <span class="iconify lucide--sparkles size-4.5"></span>
    </label>
    <TopbarProfileMenu {user} />
  </div>
</div>

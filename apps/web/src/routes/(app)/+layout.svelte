<script lang="ts">
  import Footer from "$lib/components/admin-layout/Footer.svelte"
  import AssistantPanel from "$lib/components/admin-layout/AssistantPanel.svelte"
  import Sidebar from "$lib/components/admin-layout/Sidebar.svelte"
  import Topbar from "$lib/components/admin-layout/Topbar.svelte"
  import ConfigProvider from "$lib/contexts/ConfigProvider.svelte"
  import { visibleMenuItems } from "$lib/components/admin-layout/helpers"
  import { appMenuItems } from "./menu"

  let { data, children } = $props()

  // Links this person cannot open are removed rather than shown and then
  // refused. The pages still check for themselves (L44).
  const menuItems = $derived(
    visibleMenuItems(appMenuItems, new Set(data.permissions ?? [])),
  )
</script>

<!-- The Nexus admin shell, with Kaaj's menu and the session user.
     ConfigProvider is mounted here, not at the root: it writes `data-theme`
     onto <html>, and the marketing pages have their own theme (L17). -->
<ConfigProvider>
  <div class="size-full">
    <div class="flex">
      <Sidebar
        {menuItems}
        user={data.user}
        companyName={data.tenant?.company_name}
      />
      <div class="flex h-screen min-w-0 grow flex-col overflow-auto">
        <Topbar user={data.user} companyName={data.tenant?.company_name} />
        <div id="layout-content">{@render children?.()}</div>
        <Footer />
      </div>
    </div>
    <AssistantPanel />
  </div>
</ConfigProvider>

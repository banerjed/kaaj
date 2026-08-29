<script lang="ts">
  import Footer from "$lib/components/admin-layout/Footer.svelte"
  import Rightbar from "$lib/components/admin-layout/Rightbar.svelte"
  import Sidebar from "$lib/components/admin-layout/Sidebar.svelte"
  import Topbar from "$lib/components/admin-layout/Topbar.svelte"
  import ConfigProvider from "$lib/contexts/ConfigProvider.svelte"
  import { appMenuItems } from "./menu"

  let { data, children } = $props()
</script>

<!-- The Nexus admin shell, with Kaaj's menu and the session user.
     ConfigProvider is mounted here, not at the root: it writes `data-theme`
     onto <html>, and the marketing pages have their own theme (L17). -->
<ConfigProvider>
  <div class="size-full">
    <div class="flex">
      <Sidebar
        menuItems={appMenuItems}
        user={data.user}
        companyName={data.tenant?.company_name}
      />
      <div class="flex h-screen min-w-0 grow flex-col overflow-auto">
        <Topbar user={data.user} companyName={data.tenant?.company_name} />
        <div id="layout-content">{@render children?.()}</div>
        <Footer />
      </div>
    </div>
    <Rightbar />
  </div>
</ConfigProvider>

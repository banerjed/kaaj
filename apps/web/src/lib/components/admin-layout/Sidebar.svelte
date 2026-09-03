<script lang="ts">
  import { afterNavigate } from "$app/navigation"
  import { page } from "$app/state"
  import Logo from "$lib/components/Logo.svelte"
  import { useConfig } from "$lib/contexts/ConfigProvider.svelte"
  import type SimpleBar from "simplebar"
  import "simplebar/dist/simplebar.min.css"
  import SidebarMenuItem, {
    type ISidebarMenuItem,
  } from "./SidebarMenuItem.svelte"
  import { getActivatedItemParentKeys } from "./helpers"
  import { userDisplayName, userInitials, type ISidebarUser } from "./user"

  let {
    menuItems,
    user,
    companyName,
  }: {
    menuItems: ISidebarMenuItem[]
    user?: ISidebarUser
    companyName?: string | null
  } = $props()

  const { config } = useConfig()

  // $derived, not seeded $state: the latter captured only the initial
  // menuItems, so a menu that changes would highlight against a stale array.
  const activatedParents = $derived(
    new Set(getActivatedItemParentKeys(menuItems, page.url.pathname)),
  )
  let scrollRef: HTMLDivElement | undefined
  let simplebar: SimpleBar | undefined

  afterNavigate(() => {
    setTimeout(() => {
      const contentElement = simplebar?.getContentElement()
      const scrollElement = simplebar?.getScrollElement()
      if (contentElement) {
        const activatedItem =
          contentElement.querySelector<HTMLElement>(".active")
        const top = activatedItem?.getBoundingClientRect().top
        if (activatedItem && scrollElement && top && top !== 0) {
          scrollElement.scrollTo({
            top: scrollElement.scrollTop + top - 300,
            behavior: "smooth",
          })
        }
      }
    }, 100)

    if (window.innerWidth <= 64 * 16) {
      const sidebarTrigger = document.querySelector<HTMLInputElement>(
        "#layout-sidebar-toggle-trigger",
      )
      if (sidebarTrigger) {
        sidebarTrigger.checked = false
      }
    }
  })

  $effect(() => {
    if (!scrollRef) return

    let disposed = false
    void import("simplebar").then(({ default: SimpleBar }) => {
      if (disposed || !scrollRef) return
      simplebar = new SimpleBar(scrollRef)
    })

    return () => {
      disposed = true
      simplebar?.unMount()
      simplebar = undefined
    }
  })
</script>

<input
  class="hidden"
  id="layout-sidebar-toggle-trigger"
  type="checkbox"
  aria-label="Toggle layout sidebar"
/>
<input
  type="checkbox"
  id="layout-sidebar-hover-trigger"
  class="hidden"
  aria-label="Dense layout sidebar"
/>
<div id="layout-sidebar-hover" class="bg-base-300 h-screen w-1"></div>
<div
  id="layout-sidebar"
  class="sidebar-menu flex flex-col"
  data-theme={$config.sidebarTheme === "dark" && $config.theme === "light"
    ? "dark"
    : undefined}
>
  <div class="flex h-16 min-h-16 items-center justify-between gap-3 ps-5 pe-4">
    <a href="/" aria-label="Home">
      <Logo />
    </a>
    <label
      for="layout-sidebar-hover-trigger"
      title="Toggle sidebar hover"
      class="btn btn-circle btn-ghost btn-sm text-base-content/70 relative max-lg:hidden"
    >
      <span
        class="iconify lucide--panel-left-close absolute size-4.5 opacity-100 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0"
      ></span>
      <span
        class="iconify lucide--panel-left-dashed absolute size-4.5 opacity-0 transition-all duration-300 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100"
      ></span>
    </label>
  </div>

  <div class="relative min-h-0 grow">
    <div bind:this={scrollRef} class="size-full">
      <div class="mb-3 space-y-0.5 px-2.5">
        {#each menuItems as item (item.id)}
          <SidebarMenuItem {...item} activated={activatedParents} />
        {/each}
      </div>
    </div>
    <div
      class="from-base-100/60 absolute start-0 end-0 bottom-0 h-7 bg-linear-to-t to-transparent pointer-events-none"
    ></div>
  </div>

  <div class="mb-2">
    <hr class="border-base-300 my-2 border-dashed" />
    <div class="dropdown dropdown-top dropdown-end w-full">
      <button
        type="button"
        tabindex="0"
        class="bg-base-200 hover:bg-base-300 rounded-box mx-2 mt-0 flex w-[calc(100%-1rem)] cursor-pointer items-center gap-2.5 px-3 py-2 transition-all"
      >
        <div class="avatar avatar-placeholder">
          <div class="bg-primary text-primary-content mask mask-squircle w-8">
            <span class="text-xs font-medium"
              >{userInitials(user?.fullName, user?.email)}</span
            >
          </div>
        </div>
        <div class="grow -space-y-0.5 overflow-hidden">
          <p class="truncate text-sm font-medium">
            {userDisplayName(user)}
          </p>
          <p class="text-base-content/70 truncate text-xs">
            {companyName ?? ""}
          </p>
        </div>
        <span
          class="iconify lucide--chevrons-up-down text-base-content/70 size-4"
        ></span>
      </button>
      <ul
        role="menu"
        tabindex="0"
        class="dropdown-content menu bg-base-100 rounded-box shadow-base-content/4 mb-1 w-48 p-1 shadow-[0px_-10px_40px_0px]"
      >
        <li>
          <a href="/account/settings">
            <span class="iconify lucide--user size-4"></span><span
              >My Profile</span
            >
          </a>
        </li>
        <li>
          <a href="/settings/locations">
            <span class="iconify lucide--settings size-4"></span><span
              >Firm Settings</span
            >
          </a>
        </li>
        <li>
          <a class="text-error hover:bg-error/10" href="/account/sign_out">
            <span class="iconify lucide--log-out size-4"></span><span
              >Sign Out</span
            >
          </a>
        </li>
      </ul>
    </div>
  </div>
</div>

<label for="layout-sidebar-toggle-trigger" id="layout-sidebar-backdrop"></label>

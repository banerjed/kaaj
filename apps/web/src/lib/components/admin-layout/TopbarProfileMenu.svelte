<script lang="ts">
  import { userDisplayName, userInitials, type ISidebarUser } from "./user"
  import { type IConfig, useConfig } from "$lib/contexts/ConfigProvider.svelte"

  // Real session user. Nexus's fake team roster and upgrade banner removed
  // rather than wired to placeholders (L15).
  let { user }: { user?: ISidebarUser } = $props()

  const displayName = $derived(userDisplayName(user))

  const { changeTheme } = useConfig()

  /**
   * Theme selection lives here, not in the right-hand panel.
   *
   * That panel is now the assistant. The Topbar's ThemeToggle cycles light and
   * dark only, so without this `system` — the DEFAULT, and the only value that
   * follows the OS — would be unreachable once a person had chosen either
   * explicitly. A setting you can leave but never return to is worse than one
   * that was never offered.
   */
  const themeOptions: {
    value: IConfig["theme"]
    label: string
    icon: string
    selectedClass: string
  }[] = [
    {
      value: "light",
      label: "Light",
      icon: "lucide--sun",
      selectedClass: "group-data-[theme=light]/html:bg-base-200",
    },
    {
      value: "dark",
      label: "Dark",
      icon: "lucide--moon",
      selectedClass: "group-data-[theme=dark]/html:bg-base-200",
    },
    {
      value: "system",
      label: "System",
      icon: "lucide--monitor",
      selectedClass: "group-[:not([data-theme])]/html:bg-base-200",
    },
  ]
</script>

<div>
  <div class="drawer drawer-end">
    <input id="topbar-profile-drawer" type="checkbox" class="drawer-toggle" />
    <div class="drawer-content">
      <label
        for="topbar-profile-drawer"
        class="btn btn-ghost max-sm:btn-square gap-2 px-1.5"
      >
        <div class="avatar avatar-placeholder">
          <div class="bg-primary text-primary-content mask mask-squircle w-8">
            <span class="text-xs font-medium"
              >{userInitials(user?.fullName, user?.email)}</span
            >
          </div>
        </div>
        <div class="text-start max-sm:hidden">
          <p class="text-sm/none">{displayName}</p>
          <p class="text-base-content/70 mt-0.5 text-xs/none capitalize">
            {user?.role ?? ""}
          </p>
        </div>
      </label>
    </div>
    <div class="drawer-side">
      <label
        for="topbar-profile-drawer"
        aria-label="close sidebar"
        class="drawer-overlay"
      ></label>
      <div class="h-full w-72 p-2 sm:w-84">
        <div
          class="bg-base-100 rounded-box relative flex h-full flex-col pt-4 sm:pt-8"
        >
          <label
            for="topbar-profile-drawer"
            class="btn btn-xs btn-circle btn-ghost absolute start-2 top-2"
            aria-label="Close"
          >
            <span class="iconify lucide--x size-4"></span>
          </label>

          <div class="flex flex-col items-center">
            <div class="avatar avatar-placeholder">
              <div
                class="bg-primary text-primary-content size-20 rounded-full md:size-24"
              >
                <span class="text-2xl font-medium"
                  >{userInitials(user?.fullName, user?.email)}</span
                >
              </div>
            </div>

            <p class="mt-4 text-lg/none font-medium sm:mt-8">{displayName}</p>
            <p class="text-base-content/70 mt-1 text-sm">{user?.email ?? ""}</p>
            {#if user?.role}
              <div class="badge badge-sm mt-2 capitalize">{user.role}</div>
            {/if}
          </div>

          <div class="mt-4 grow overflow-auto px-2 sm:mt-6">
            <ul class="menu w-full p-2">
              <li class="menu-title">Account</li>
              <li>
                <a href="/account/settings">
                  <span class="iconify lucide--user size-4.5"></span>
                  <span>My Profile</span>
                </a>
              </li>
              <li>
                <a href="/account/billing">
                  <span class="iconify lucide--credit-card size-4.5"></span>
                  <span>Billing</span>
                </a>
              </li>

              <li class="menu-title">Appearance</li>
              <li class="p-2">
                <div class="grid grid-cols-3 gap-2 p-0 hover:bg-transparent">
                  {#each themeOptions as option (option.value)}
                    <button
                      type="button"
                      class="border-base-300 rounded-box flex cursor-pointer flex-col items-center gap-1 border p-2 {option.selectedClass}"
                      onclick={() => changeTheme(option.value)}
                    >
                      <span class="iconify {option.icon} size-4.5"></span>
                      <span class="text-xs">{option.label}</span>
                    </button>
                  {/each}
                </div>
              </li>

              <li class="menu-title">Firm</li>
              <li>
                <a href="/settings/locations">
                  <span class="iconify lucide--settings size-4.5"></span>
                  <span>Firm Settings</span>
                </a>
              </li>

              <li>
                <a
                  class="text-error hover:bg-error/10"
                  href="/account/sign_out"
                >
                  <span class="iconify lucide--log-out size-4.5"></span>
                  <span>Sign Out</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

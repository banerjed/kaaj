<script lang="ts">
  import { type IConfig, useConfig } from "$lib/contexts/ConfigProvider.svelte"

  const {
    toggleFullscreen,
    changeSidebarTheme,
    changeDirection,
    changeTheme,
    reset,
    changeFontFamily,
  } = useConfig()

  const swatchClasses = [
    "bg-primary",
    "bg-secondary",
    "bg-accent",
    "bg-success",
  ]

  const themeOptions: {
    value: IConfig["theme"]
    label: string
    dataTheme?: Exclude<IConfig["theme"], "system">
    labelClass?: string
    selectedClass: string
  }[] = [
    {
      value: "light",
      label: "Light",
      dataTheme: "light",
      selectedClass:
        "group-data-[theme=light]/html:p-1 group-data-[theme=light]/html:opacity-100",
    },
    {
      value: "dark",
      label: "Dark",
      dataTheme: "dark",
      selectedClass:
        "group-data-[theme=dark]/html:p-1 group-data-[theme=dark]/html:opacity-100",
    },
    {
      value: "system",
      label: "System",
      selectedClass:
        "group-[:not([data-theme])]/html:p-1 group-[:not([data-theme])]/html:opacity-100",
    },
  ]

  const optionButtonClass =
    "border-base-300 hover:bg-base-200 rounded-box inline-flex cursor-pointer items-center justify-center gap-2 border p-2"

  const sidebarThemeOptions: {
    value: IConfig["sidebarTheme"]
    label: string
    icon: string
    selectedClass: string
  }[] = [
    {
      value: "light",
      label: "Light",
      icon: "lucide--sun",
      selectedClass: "group-data-[sidebar-theme=light]/html:bg-base-200",
    },
    {
      value: "dark",
      label: "Dark",
      icon: "lucide--moon",
      selectedClass: "group-data-[sidebar-theme=dark]/html:bg-base-200",
    },
  ]

  const fontFamilies: {
    value: IConfig["fontFamily"]
    label: string
    className: string
  }[] = [
    {
      value: "dm-sans",
      label: "DM Sans",
      className: "group-[[data-font-family=dm-sans]]/html:bg-base-200",
    },
    {
      value: "wix",
      label: "Wix",
      className: "group-[[data-font-family=wix]]/html:bg-base-200",
    },
    {
      value: "inclusive",
      label: "Inclusive",
      className:
        "group-[[data-font-family=inclusive]]/html:bg-base-200 group-[:not([data-font-family])]/html:bg-base-200",
    },
    {
      value: "ar-one",
      label: "AR One",
      className: "group-[[data-font-family=ar-one]]/html:bg-base-200",
    },
  ]

  const directionOptions: {
    value: IConfig["direction"]
    label: string
    mobileLabel: string
    icon: string
    selectedClass: string
  }[] = [
    {
      value: "ltr",
      label: "Left to Right",
      mobileLabel: "LTR",
      icon: "lucide--pilcrow-left",
      selectedClass:
        "group-[[dir=ltr]]/html:bg-base-200 group-[:not([dir])]/html:bg-base-200",
    },
    {
      value: "rtl",
      label: "Right to Left",
      mobileLabel: "RTL",
      icon: "lucide--pilcrow-right",
      selectedClass: "group-[[dir=rtl]]/html:bg-base-200",
    },
  ]

  const selectedDotClass =
    "bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all"
</script>

<div class="drawer drawer-end">
  <input id="layout-rightbar-drawer" type="checkbox" class="drawer-toggle" />
  <div class="drawer-side z-[50]">
    <label
      for="layout-rightbar-drawer"
      aria-label="close sidebar"
      class="drawer-overlay"
    ></label>
    <div class="bg-base-100 text-base-content h-full w-72 sm:w-96">
      <div class="bg-base-200 flex justify-between px-5 py-4">
        <p class="text-lg font-medium">Settings</p>
        <div class="inline-flex gap-1">
          <button
            class="btn-ghost btn btn-sm btn-circle relative"
            type="button"
            onclick={reset}
            aria-label="Reset"
          >
            <span class="iconify lucide--rotate-cw size-5"></span>
            <span
              class="bg-error absolute end-0.5 top-0.5 rounded-full p-0 opacity-0 transition-all group-data-[changed]/html:p-[2px] group-data-[changed]/html:opacity-100"
            ></span>
          </button>
          <button
            class="btn btn-ghost btn-sm btn-circle"
            type="button"
            onclick={toggleFullscreen}
            aria-label="Full Screen"
          >
            <span
              class="iconify lucide--minimize hidden size-5 group-data-[fullscreen]/html:inline"
            ></span>
            <span
              class="iconify lucide--fullscreen inline size-5 group-data-[fullscreen]/html:hidden"
            ></span>
          </button>
          <label
            for="layout-rightbar-drawer"
            aria-label="close sidebar"
            class="btn btn-ghost btn-sm btn-circle"
          >
            <span class="iconify lucide--x size-5"></span>
          </label>
        </div>
      </div>
      <div class="p-5">
        <p class="font-medium">Theme</p>
        <div class="mt-3 grid grid-cols-3 gap-3">
          {#each themeOptions as option (option.value)}
            <button
              type="button"
              data-theme={option.dataTheme}
              class="rounded-box group relative cursor-pointer text-base-content"
              onclick={() => changeTheme(option.value)}
            >
              <span class="bg-base-200 rounded-box block pt-5 pb-3 text-center">
                <span class="flex items-center justify-center gap-1">
                  {#each swatchClasses as swatchClass (swatchClass)}
                    <span class="rounded-box h-6 w-2 sm:w-3 {swatchClass}"
                    ></span>
                  {/each}
                </span>
                <span
                  class="mt-1.5 block {option.labelClass ??
                    'text-sm sm:text-base'} capitalize"
                >
                  {option.label}
                </span>
              </span>
              <span
                class="{selectedDotClass} {option.selectedClass}"
                aria-hidden="true"
              ></span>
            </button>
          {/each}
        </div>

        <div
          class="pointer-events-none opacity-50 group-data-[theme=contrast]/html:pointer-events-auto group-data-[theme=contrast]/html:opacity-100 group-data-[theme=light]/html:pointer-events-auto group-data-[theme=light]/html:opacity-100"
        >
          <p class="mt-6 font-medium">
            Sidebar
            <span
              class="ms-1 inline text-xs group-data-[theme=contrast]/html:hidden group-data-[theme=light]/html:hidden md:text-sm"
            >
              (*Only available in light, contrast themes)
            </span>
          </p>
          <div class="mt-3 grid grid-cols-2 gap-3">
            {#each sidebarThemeOptions as option (option.value)}
              <button
                type="button"
                class="{optionButtonClass} {option.selectedClass}"
                onclick={() => changeSidebarTheme(option.value)}
              >
                <span class="iconify {option.icon} size-4.5"></span>
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        <p class="mt-6 font-medium">Font Family</p>
        <div class="mt-3 grid grid-cols-2 gap-3">
          {#each fontFamilies as item (item.value)}
            <button
              type="button"
              class="{optionButtonClass} {item.className}"
              onclick={() => changeFontFamily(item.value)}
            >
              <span data-font-family={item.value} class="font-sans">
                {item.label}
              </span>
            </button>
          {/each}
        </div>

        <p class="mt-6 font-medium">Direction</p>
        <div class="mt-3 grid grid-cols-2 gap-3">
          {#each directionOptions as option (option.value)}
            <button
              type="button"
              class="{optionButtonClass} {option.selectedClass}"
              onclick={() => changeDirection(option.value)}
            >
              <span class="iconify {option.icon} size-4.5"></span>
              <span class="hidden sm:inline">{option.label}</span>
              <span class="inline sm:hidden">{option.mobileLabel}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<script lang="ts">
  import { type IConfig, useConfig } from "$lib/contexts/ConfigProvider.svelte"

  const { changeTheme } = useConfig()

  const selectedDotClass =
    "bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all"

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
                <span class="mt-1.5 block text-sm capitalize sm:text-base">
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
      </div>
    </div>
  </div>
</div>

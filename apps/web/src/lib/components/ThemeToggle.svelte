<script lang="ts" module>
  type IThemeToggleDropdown = {
    iconClass?: string
    class?: string
  }
</script>

<script lang="ts">
  import { useConfig } from "$lib/contexts/ConfigProvider.svelte"

  // Explicit, not a rest element: a rest element leaves Svelte unable to
  // infer the component's public props.
  const { iconClass, class: className }: IThemeToggleDropdown = $props()

  const { toggleTheme } = useConfig()
</script>

<button
  class={`relative overflow-hidden ${className ?? ""}`}
  onclick={toggleTheme}
  aria-label="Toggle Theme"
>
  <span
    class={`iconify lucide--sun absolute size-4.5 -translate-y-4 opacity-0 transition-[opacity,translate] duration-300 group-data-[theme=nord]/html:translate-y-0 group-data-[theme=nord]/html:opacity-100 ${iconClass ?? ""}`}
  ></span>
  <span
    class={`iconify lucide--moon absolute size-4.5 translate-y-4 opacity-0 transition-[opacity,translate] duration-300 group-data-[theme=night]/html:translate-y-0 group-data-[theme=night]/html:opacity-100 ${iconClass ?? ""}`}
  ></span>
  <span
    class={`iconify lucide--palette absolute size-4.5 opacity-100 group-data-[theme=night]/html:opacity-0 group-data-[theme=nord]/html:opacity-0 ${iconClass ?? ""}`}
  ></span>
</button>

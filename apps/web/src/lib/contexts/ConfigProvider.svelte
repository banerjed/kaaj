<script lang="ts" module>
  import { browser } from "$app/environment"
  import { getContext, setContext } from "svelte"
  import { get, writable } from "svelte/store"
  import type { Writable } from "svelte/store"

  export const themes = [
    "light",
    "contrast",
    "material",
    "dark",
    "dim",
    "material-dark",
    "system",
  ] as const

  export type ITheme = (typeof themes)[number]

  export type IConfig = {
    theme: ITheme
    direction: "ltr" | "rtl"
    sidebarTheme: "light" | "dark"
    fontFamily: "default" | "dm-sans" | "inclusive" | "ar-one" | "wix"
    fullscreen: boolean
  }

  const defaultConfig: IConfig = {
    theme: "system",
    direction: "ltr",
    fontFamily: "default",
    sidebarTheme: "light",
    fullscreen: false,
  }

  const localStorageKey = "__NEXUS_CONFIG_v3.0__"

  type ConfigContext = {
    config: Writable<IConfig>
    toggleTheme: () => void
    changeFontFamily: (fontFamily: IConfig["fontFamily"]) => void
    changeTheme: (theme: IConfig["theme"]) => void
    changeSidebarTheme: (sidebarTheme: IConfig["sidebarTheme"]) => void
    changeDirection: (direction: IConfig["direction"]) => void
    toggleFullscreen: () => Promise<void>
    reset: () => void
  }

  const configContextKey = Symbol("kaaj-config")

  const readStoredConfig = (): IConfig => {
    if (!browser) return defaultConfig

    try {
      const storedValue = window.localStorage.getItem(localStorageKey)
      return storedValue ? (JSON.parse(storedValue) as IConfig) : defaultConfig
    } catch {
      return defaultConfig
    }
  }

  const applyConfig = (config: IConfig) => {
    if (!browser) return

    const htmlRef = document.documentElement
    window.localStorage.setItem(localStorageKey, JSON.stringify(config))

    if (config.theme == "system") {
      htmlRef.removeAttribute("data-theme")
    } else {
      htmlRef.setAttribute("data-theme", config.theme)
    }

    if (config.fullscreen) {
      htmlRef.setAttribute("data-fullscreen", "")
    } else {
      htmlRef.removeAttribute("data-fullscreen")
    }

    htmlRef.setAttribute("data-sidebar-theme", config.sidebarTheme)

    if (config.fontFamily !== "default") {
      htmlRef.setAttribute("data-font-family", config.fontFamily)
    } else {
      htmlRef.removeAttribute("data-font-family")
    }

    if (JSON.stringify(config) !== JSON.stringify(defaultConfig)) {
      htmlRef.setAttribute("data-changed", "")
    } else {
      htmlRef.removeAttribute("data-changed")
    }

    htmlRef.dir = config.direction
  }

  export const useConfig = () => {
    return getContext<ConfigContext>(configContextKey)
  }
</script>

<script lang="ts">
  let { children } = $props()

  const config = writable<IConfig>(readStoredConfig())

  const changeTheme = (theme: IConfig["theme"]) => {
    config.update((c) => {
      return { ...c, theme }
    })
  }

  const changeSidebarTheme = (sidebarTheme: IConfig["sidebarTheme"]) => {
    config.update((c) => {
      return { ...c, sidebarTheme }
    })
  }

  const changeFontFamily = (fontFamily: IConfig["fontFamily"]) => {
    config.update((c) => {
      return { ...c, fontFamily }
    })
  }

  const changeDirection = (direction: IConfig["direction"]) => {
    config.update((c) => {
      return { ...c, direction }
    })
  }

  const toggleTheme = () => {
    let theme: IConfig["theme"] = "light"
    if (
      ["system", "light", "contrast", "material"].includes(get(config).theme)
    ) {
      theme = "dark"
    }
    config.update((c) => {
      return { ...c, theme }
    })
  }

  const toggleFullscreen = async () => {
    if (!browser) return

    const htmlRef = document.documentElement
    if (document.fullscreenElement != null) {
      await document.exitFullscreen()
    } else {
      await htmlRef.requestFullscreen()
    }
    config.update((c) => {
      return { ...c, fullscreen: !c.fullscreen }
    })
  }

  const reset = () => {
    config.set(defaultConfig)
    if (browser && document.fullscreenElement != null) {
      document.exitFullscreen()
    }
  }

  setContext(configContextKey, {
    config,
    toggleTheme,
    changeFontFamily,
    changeTheme,
    changeSidebarTheme,
    changeDirection,
    toggleFullscreen,
    reset,
  })

  $effect(() => {
    const unsubscribe = config.subscribe(applyConfig)
    return unsubscribe
  })

  $effect(() => {
    if (!browser) return

    const fullscreenMedia = window.matchMedia("(display-mode: fullscreen)")
    const fullscreenListener = () => {
      config.update((c) => {
        return { ...c, fullscreen: fullscreenMedia.matches }
      })
    }
    fullscreenMedia.addEventListener("change", fullscreenListener)
    fullscreenListener()

    return () => {
      fullscreenMedia.removeEventListener("change", fullscreenListener)
    }
  })
</script>

{@render children?.()}

<script lang="ts" module>
  import { browser } from "$app/environment"
  import { getContext, setContext } from "svelte"
  import { get, writable } from "svelte/store"
  import type { Writable } from "svelte/store"

  /**
   * Two themes and `system`.
   *
   * Nexus ships six; Kaaj carries two. `system` is NOT a third palette — it
   * is the absence of a choice, and the only value that follows
   * `prefers-color-scheme`. It is also the default, so removing it would pin
   * every new visitor to one theme regardless of their OS.
   *
   * These are daisyUI built-in theme NAMES, written to `data-theme` verbatim:
   * `nord` is the light palette, `night` the dark one. The labels a person
   * reads are still Light and Dark (see TopbarProfileMenu). A browser that
   * stored `light` or `dark` before this change is not in the list, so the
   * guard below falls it back to `system` — the same path the theme cull
   * already relies on.
   */
  export const themes = ["nord", "night", "system"] as const

  export type ITheme = (typeof themes)[number]

  /**
   * Theme, and nothing else.
   *
   * Nexus's appearance panel also carried `direction` (LTR/RTL), a
   * `sidebarTheme` override, a `fontFamily` switcher and a fullscreen toggle.
   * RTL is not a commitment Kaaj is making, the font switcher was already
   * vestigial (see typography.css), and the sidebar now follows the active
   * theme rather than being independently settable — one fewer combination to
   * measure contrast against (L22).
   */
  export type IConfig = {
    theme: ITheme
  }

  const defaultConfig: IConfig = {
    theme: "system",
  }

  const localStorageKey = "__NEXUS_CONFIG_v3.0__"

  type ConfigContext = {
    config: Writable<IConfig>
    toggleTheme: () => void
    changeTheme: (theme: IConfig["theme"]) => void
  }

  const configContextKey = Symbol("kaaj-config")

  const readStoredConfig = (): IConfig => {
    if (!browser) return defaultConfig

    try {
      const storedValue = window.localStorage.getItem(localStorageKey)
      if (!storedValue) return defaultConfig
      const parsed = JSON.parse(storedValue) as Partial<IConfig>
      // A browser that visited before the theme cull still holds "material",
      // "dim" or "contrast" here, and one from before the nord/night rename
      // holds "light" or "dark". Written back to `data-theme` those select a
      // theme that no longer exists — daisyUI emits no variables for it, so
      // the page renders unstyled with no error anywhere. Anything not in the
      // current list falls back to the default rather than being trusted.
      return themes.includes(parsed?.theme as ITheme)
        ? { theme: parsed.theme as ITheme }
        : defaultConfig
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

  /**
   * Anything that is not already an explicit dark choice becomes dark.
   *
   * `system` goes to dark rather than to the opposite of the OS setting. That
   * is deliberate and unchanged from before the theme cull: the first press
   * has to move somewhere predictable, and a toggle that depends on an OS
   * setting the page cannot see would land differently for two people
   * pressing the same button.
   */
  const toggleTheme = () => {
    const theme: IConfig["theme"] =
      get(config).theme === "night" ? "nord" : "night"
    config.update((c) => {
      return { ...c, theme }
    })
  }

  setContext(configContextKey, {
    config,
    toggleTheme,
    changeTheme,
  })

  $effect(() => {
    const unsubscribe = config.subscribe(applyConfig)
    return unsubscribe
  })
</script>

{@render children?.()}

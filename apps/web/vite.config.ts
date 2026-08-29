import { sveltekit } from "@sveltejs/kit/vite"
// Tailwind runs as a Vite plugin, not through PostCSS. The Nexus stylesheets
// use `@plugin` and `@variant` directives, which the PostCSS integration does
// not process — with it, daisyUI silently contributes no themes at all.
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"
import { buildAndCacheSearchIndex } from "./src/lib/build_index"
import fs from "node:fs"
import path from "node:path"

let searchIndexBuild: Promise<void> | undefined

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    {
      name: "vite-build-search-index",
      writeBundle: {
        order: "post",
        sequential: false,
        handler: async () => {
          searchIndexBuild ??= (async () => {
            const indexPath = path.resolve(
              "./.svelte-kit/output/client/search/api.json",
            )
            if (fs.existsSync(indexPath)) return
            console.log("Building search index...")
            await buildAndCacheSearchIndex()
          })()
          await searchIndexBuild
        },
      },
    },
  ],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    globals: true, /// allows to skip import of test functions like `describe`, `it`, `expect`, etc.
  },
})

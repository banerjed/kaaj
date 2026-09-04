import { sveltekit } from "@sveltejs/kit/vite"
// Tailwind runs as a Vite plugin, not through PostCSS. The Nexus stylesheets
// use `@plugin` and `@variant` directives, which the PostCSS integration does
// not process — with it, daisyUI silently contributes no themes at all.
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"
import { loadEnv } from "vite"
import { buildAndCacheSearchIndex } from "./src/lib/build_index"
import fs from "node:fs"
import path from "node:path"

let searchIndexBuild: Promise<void> | undefined

const LOCAL_SUPABASE_URL = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/

/**
 * A dev server (or the vitest runner, which starts one the same way) must
 * never resolve to a real database. `apps/web/.env.local` always resolves
 * `PUBLIC_SUPABASE_URL` to the local stack — but a real environment variable
 * beats a `.env` file, so a `PUBLIC_SUPABASE_URL` exported in a shell profile
 * silently overrides it. That has already happened once: `pnpm dev` pointed
 * at production with nothing in the UI to show it (docs/08-development-setup.md
 * documents the *intentional* way to do this — `env $(...) npm run dev` — the
 * failure was the same value sitting in the shell unscoped to that one line).
 * `command === "build"` is exempt: a production build with `.env.prod` is the
 * deploy path, not an accident.
 */
const failOnNonLocalSupabase = (mode: string) => {
  const env = loadEnv(mode, process.cwd(), "PUBLIC_")
  const url = env.PUBLIC_SUPABASE_URL ?? ""
  if (url && !LOCAL_SUPABASE_URL.test(url)) {
    throw new Error(
      `PUBLIC_SUPABASE_URL resolves to "${url}", not the local Supabase stack ` +
        `(127.0.0.1/localhost). Refusing to start "vite dev" or the test runner ` +
        `against it. Check for a PUBLIC_SUPABASE_URL exported in your shell ` +
        `profile that is shadowing apps/web/.env.local — see ` +
        `"Which environment am I talking to?" in docs/08-development-setup.md.`,
    )
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === "serve") failOnNonLocalSupabase(mode)

  return {
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
  }
})

import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests: the only part of `./check` that loads a URL.
 *
 * The other seventeen steps prove the schema, the policies, the classifications
 * and the units. None of them renders a page — which is the shape of most of
 * `docs/10-lessons-learned.md`: a blank shell (L21), a long firm name pushing
 * the buttons off-screen (L11), contrast that only fails in one theme (L22),
 * `group/html` missing so eleven styles silently never match (L23), a
 * timestamp rendered with no date that passed `svelte-check` (L53). Every one
 * of those built, typechecked and looked like working software.
 *
 * Kept OUT of `./check` by default and run as `pnpm e2e`. `./check` is ~22
 * seconds and that loop is worth protecting; this needs a dev server and a
 * browser, and belongs on its own command and in CI.
 *
 * **Port 5175 on purpose.** 5173 and 5174 are where a developer's own
 * `pnpm dev` lands, and `reuseExistingServer` would silently test whatever is
 * already running there — possibly a different branch.
 */
const PORT = 5175

/**
 * The secret the dev server under test verifies Bird webhooks with, and the
 * one `*.writes.spec.ts` signs with. A test value, never a real endpoint's:
 * the real one lives only in the deployed environment.
 */
export const E2E_WEBHOOK_SECRET =
  "whsec_ZTJlLXRlc3Qtc2VjcmV0LWZvci10aGUtd2ViaG9vay1yb3V0ZQ=="

export default defineConfig({
  testDir: "./e2e",
  // The read-only suite writes nothing, so parallelism is safe there. A spec
  // that WRITES lives in the `writes` project below: one worker, run after
  // the read-only project, and responsible for removing its own rows — the
  // fixture is shared, and two workers mutating it is how a suite starts
  // failing by position.
  fullyParallel: true,
  // A committed `test.only` passes locally and silently skips its neighbours
  // in CI.
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Signs in once and saves the session; everything else reuses it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /\.writes\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
    // Specs that write: one worker, never beside the read-only specs, each
    // removing what it created (see webhook-bird.writes.spec.ts).
    {
      name: "writes",
      testMatch: /\.writes\.spec\.ts$/,
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup", "chromium"],
    },
  ],

  webServer: {
    command: `pnpm exec vite dev --port ${PORT} --strictPort`,
    env: { PRIVATE_BIRD_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET },
    url: `http://localhost:${PORT}`,
    // Never adopt a server someone else started: it may be another branch.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})

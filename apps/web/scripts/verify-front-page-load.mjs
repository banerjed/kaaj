#!/usr/bin/env node
/**
 * Fails if the first page after login takes longer than 50ms to fully load —
 * Navigation Timing's `load` event (network transfer, CSS, JS, hydration),
 * not just server response time. The two are deliberately different budgets
 * (CLAUDE.md's Performance section): a server-only check would not have
 * caught the render-blocking Google Fonts request this check exists to
 * guard against (~100ms of an ~120-200ms total, before fonts were
 * self-hosted).
 *
 * Starts its own `vite preview` against the build `./check`'s own build step
 * already produced — this step only runs when that step does (RUN_BUILD=1),
 * i.e. not under `./check --quick`.
 *
 *   node apps/web/scripts/verify-front-page-load.mjs
 *   FRONT_PAGE_THRESHOLD_MS=50 node apps/web/scripts/verify-front-page-load.mjs
 */
import { spawn } from "node:child_process"
import { chromium } from "@playwright/test"

const APP_DIR = new URL("..", import.meta.url).pathname
const PORT = 5177 // distinct from e2e's 5175 and a developer's own `pnpm dev`
const BASE_URL = `http://localhost:${PORT}`
const THRESHOLD_MS = Number(process.env.FRONT_PAGE_THRESHOLD_MS ?? 50)
/**
 * A single latency sample is not a measurement. Isolated, this page loads in
 * 21.8-25.4ms; with the machine busy — which is exactly where this step runs,
 * straight after `build` and the unit suites — the same page measures
 * 25.9-46.0ms, and an occasional sample lands over the budget. The MEDIAN of
 * several is robust to one scheduler hiccup and still fails on a real
 * regression, because anything that actually slows the page moves every
 * sample.
 */
const SAMPLES = Number(process.env.FRONT_PAGE_SAMPLES ?? 5)
const EMAIL = process.env.E2E_EMAIL ?? "sarah.johnson@northwind.example"
const PASSWORD = process.env.E2E_PASSWORD ?? "devpassword"

function waitForServer(url, timeoutMs = 20_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(url)
        if (res.status < 500) return resolve()
      } catch {
        // not up yet
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`${url} did not respond within ${timeoutMs}ms`))
        return
      }
      setTimeout(attempt, 200)
    }
    attempt()
  })
}

// `detached: true` + killing the negative PID (the process GROUP, POSIX)
// terminates `vite preview` itself, not just the `pnpm exec` wrapper around
// it — a plain `child.kill()` here has left orphaned servers holding the
// port on a later run.
const server = spawn(
  "pnpm",
  ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"],
  {
    cwd: APP_DIR,
    stdio: "ignore",
    detached: true,
  },
)

function stopServer() {
  try {
    process.kill(-server.pid, "SIGTERM")
  } catch {
    // already gone
  }
}

let exitCode = 0
try {
  await waitForServer(`${BASE_URL}/login/sign_in`)

  const browser = await chromium.launch()

  /**
   * One sign-in and page load, in a fresh context so nothing is cached
   * between samples. Returns Navigation Timing's `loadEventEnd`.
   */
  async function sampleOnce() {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${BASE_URL}/login/sign_in`)
      await page.locator('input[name="email"]').waitFor({ timeout: 15_000 })
      await page.locator('input[name="email"]').fill(EMAIL)
      await page.locator('input[name="password"]').fill(PASSWORD)
      await page.getByRole("button", { name: "Sign in", exact: true }).click()
      await page.waitForURL("**/employees", { timeout: 30_000 })
      await page
        .getByRole("heading", { name: "Employees" })
        .first()
        .waitFor({ state: "visible" })
      await page.waitForLoadState("load")
      return await page.evaluate(
        () => performance.getEntriesByType("navigation")[0].loadEventEnd,
      )
    } finally {
      await context.close()
    }
  }

  // The first load of a just-started `vite preview` pays one-time server
  // warm-up (module graph, the postgres.js pool, the Supabase client) that no
  // user ever pays on a running server. Measured at ~2-3ms; discarded.
  await sampleOnce()

  const samples = []
  for (let i = 0; i < SAMPLES; i++) samples.push(await sampleOnce())
  const sorted = [...samples].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const fmt = (n) => n.toFixed(1)

  await browser.close()

  console.log(
    `  /employees full load: median ${fmt(median)}ms ` +
      `(min ${fmt(sorted[0])}, max ${fmt(sorted[sorted.length - 1])}, ` +
      `n=${SAMPLES}, threshold ${THRESHOLD_MS}ms)`,
  )
  if (median > THRESHOLD_MS) {
    console.error(
      `\n  Front-page load exceeded ${THRESHOLD_MS}ms: median ${fmt(median)}ms` +
        `\n  across ${SAMPLES} samples — ${samples.map(fmt).join(", ")}.` +
        `\n  A real regression moves every sample, so this is not scheduler` +
        `\n  noise. See CLAUDE.md's Performance section — check for a new` +
        `\n  render-blocking request (an external font/script/stylesheet) or a` +
        `\n  bundle size regression.\n`,
    )
    exitCode = 1
  }
} catch (e) {
  console.error(e)
  exitCode = 1
} finally {
  stopServer()
}
process.exit(exitCode)

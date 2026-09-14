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
  const page = await (await browser.newContext()).newPage()

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

  const loadMs = await page.evaluate(
    () => performance.getEntriesByType("navigation")[0].loadEventEnd,
  )

  await browser.close()

  console.log(
    `  /employees full load: ${loadMs.toFixed(1)}ms (threshold ${THRESHOLD_MS}ms)`,
  )
  if (loadMs > THRESHOLD_MS) {
    console.error(
      `\n  Front-page load exceeded ${THRESHOLD_MS}ms: ${loadMs.toFixed(1)}ms.` +
        `\n  See CLAUDE.md's Performance section — check for a new` +
        `\n  render-blocking request (an external font/script/stylesheet) or a` +
        `\n  bundle size regression before assuming this is noise.\n`,
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

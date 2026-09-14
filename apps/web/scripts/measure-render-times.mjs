#!/usr/bin/env node
/**
 * Server-render time for every `(app)` GET page, measured via the
 * `server-timing` response header `hooks.server.ts` sets on every request
 * (the whole `handle` chain: auth, `load()`, DB queries, SSR — not browser
 * paint, and not `vite dev`, which adds its own per-request transform cost
 * a production build doesn't have).
 *
 * GET only. A form action is a write, and hitting one on a schedule mutates
 * whatever database this points at — `apps/web/e2e/smoke.spec.ts` is
 * deliberately read-only for the same reason, after doing exactly that once
 * left stray rows in the shared fixture.
 *
 * Routes are discovered from `src/routes/(app)` at run time, not hand-copied,
 * so a new page is covered automatically. A `[param]` segment needs a real
 * id to render meaningfully; ROUTE_PARAM (below) is the only part of this
 * file that goes stale as routes change, and an unmapped dynamic route is
 * reported rather than silently skipped.
 *
 * Requires the app already built and served — this does not build or start
 * anything. Point BASE_URL at a `vite preview` / `node build` instance for
 * production timing, or at `vite dev` to see the (much larger) dev-mode cost
 * by comparison.
 *
 *   BASE_URL=http://localhost:5176 node scripts/measure-render-times.mjs
 *   BASE_URL=... E2E_EMAIL=... E2E_PASSWORD=... THRESHOLD_MS=20 REPEATS=5 node scripts/measure-render-times.mjs
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { chromium } from "@playwright/test"

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5176"
const EMAIL = process.env.E2E_EMAIL ?? "sarah.johnson@northwind.example"
const PASSWORD = process.env.E2E_PASSWORD ?? "devpassword"
const THRESHOLD_MS = Number(process.env.THRESHOLD_MS ?? 20)
const REPEATS = Number(process.env.REPEATS ?? 5)

const ROUTES_DIR = new URL("../src/routes/(app)", import.meta.url).pathname

/**
 * Seeded Northwind dev-fixture ids (packages/database/fixtures) — only
 * meaningful against that fixture. A route whose `[param]` isn't listed
 * here is reported as unfillable rather than guessed.
 */
const IDS = {
  employeeId: "bf17b1af-963b-53ef-9083-21506fb34e9c",
  ticketId: "16a68eb5-4d61-5548-8e17-8f1ac4c2f5c9",
  projectId: "8257009f-6a91-5fd1-9efb-518198c08e2a",
  payrollRunId: "953095ac-deb3-54dc-baf2-09a7e3829e82",
  billId: "b07bca71-9562-5a5f-91b1-b749912c242d",
  invoiceId: "bee0d3ca-72f7-5ba2-9a31-3bbf17daf320",
  businessAreaId: "c9800088-b86b-5ddd-acdc-5b9fbe32f268",
}

/** Route-pattern prefix -> filler, since `[id]` alone is ambiguous (employees, tickets, projects... each use that same param name for a different entity). */
const ROUTE_PARAM = [
  ["/employees/[id]", IDS.employeeId],
  ["/ticketing/[id]", IDS.ticketId],
  ["/projects/[id]", IDS.projectId],
  ["/payroll/runs/[id]", IDS.payrollRunId],
  ["/accounting/bills/[id]", IDS.billId],
  ["/accounting/invoices/[id]", IDS.invoiceId],
  ["/compensation/[employeeId]", IDS.employeeId],
  ["/settings/ticketing/[businessAreaId]", IDS.businessAreaId],
]

/** A handful of report pages render meaningfully differently with a date range set — cover both, the same pair `smoke.spec.ts` already curated. */
const EXTRA_QUERY_VARIANTS = [
  "/accounting/year-end-close?as_of=2026-12-31",
  "/accounting/tax-summary?from=2026-01-01&to=2026-12-31",
  "/accounting/trial-balance?as_of=2026-01-21&compare_as_of=2025-01-01",
  "/accounting/balance-sheet?as_of=2026-12-31&compare_as_of=2026-01-21",
]

function discoverRoutes(dir, prefix = "") {
  const routes = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      routes.push(...discoverRoutes(full, `${prefix}/${name}`))
    } else if (name === "+page.svelte") {
      routes.push(prefix || "/")
    }
  }
  return routes
}

/** Fill every `[param]` in a discovered route pattern, or return null if some segment has no known filler. */
function resolveRoute(pattern) {
  if (!pattern.includes("[")) return pattern
  const match = ROUTE_PARAM.find(([prefix]) => pattern.startsWith(prefix))
  if (!match) return null
  const [prefix, id] = match
  return pattern.replace(prefix, prefix.replace(/\[[^\]]+\]/, id))
}

function serverTimingMs(response) {
  const header = response?.headers()["server-timing"]
  const m = header?.match(/dur=([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

const patterns = discoverRoutes(ROUTES_DIR)
const unresolved = []
const resolved = []
for (const p of patterns) {
  const r = resolveRoute(p)
  if (r === null) unresolved.push(p)
  else resolved.push(r)
}
const paths = [...new Set([...resolved, ...EXTRA_QUERY_VARIANTS])].sort()

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
// Otherwise a repeated navigation to the same URL can be served from the
// browser's HTTP cache, which returns the FIRST request's timing header on
// every later "measurement" — indistinguishable from a real, fast repeat.
const cdp = await context.newCDPSession(page)
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })

await page.goto(`${BASE_URL}/login/sign_in`)
await page.locator('input[name="email"]').waitFor({ timeout: 15_000 })
await page.locator('input[name="email"]').fill(EMAIL)
await page.locator('input[name="password"]').fill(PASSWORD)
await page.getByRole("button", { name: "Sign in", exact: true }).click()
await page.waitForURL("**/employees", { timeout: 30_000 })

const results = []
for (const path of paths) {
  const timings = []
  let status = null
  for (let i = 0; i < REPEATS; i++) {
    const response = await page.goto(`${BASE_URL}${path}`)
    status = response?.status() ?? status
    const ms = serverTimingMs(response)
    if (ms !== null) timings.push(ms)
  }
  timings.sort((a, b) => a - b)
  results.push({
    path,
    status,
    min: timings[0] ?? null,
    median: timings.length ? timings[Math.floor(timings.length / 2)] : null,
    max: timings.at(-1) ?? null,
  })
}

await browser.close()

results.sort((a, b) => (b.median ?? -1) - (a.median ?? -1))
console.log(`\n${"path".padEnd(65)}min      median   max      status`)
console.log("-".repeat(100))
for (const r of results) {
  const fmt = (n) => (n === null ? "  —  " : n.toFixed(1).padStart(5))
  console.log(
    `${r.path.padEnd(65)}${fmt(r.min)}    ${fmt(r.median)}    ${fmt(r.max)}    ${r.status ?? "—"}`,
  )
}

const over = results.filter((r) => r.median !== null && r.median > THRESHOLD_MS)
console.log(
  `\n${over.length} / ${results.length} pages have a median server-render time over ${THRESHOLD_MS}ms`,
)

if (unresolved.length) {
  console.log(
    `\n${unresolved.length} route(s) skipped — no sample id mapped in ROUTE_PARAM:`,
  )
  for (const p of unresolved) console.log(`    ${p}`)
}

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
 * Routes are discovered from `src/routes/(app)` at run time, not hand-copied
 * (page-timing.mjs), so a new page is covered automatically; one whose
 * `[param]` has no id below is reported rather than silently skipped.
 *
 * Against the Northwind fixture. For the large perf tenant, as several kinds
 * of user, use `pnpm db:perf measure` (docs/32-perf-tenant.md).
 *
 * Requires the app already built and served — this does not build or start
 * anything. Point BASE_URL at a `vite preview` / `node build` instance for
 * production timing, or at `vite dev` to see the (much larger) dev-mode cost
 * by comparison.
 *
 *   BASE_URL=http://localhost:5176 node scripts/measure-render-times.mjs
 *   BASE_URL=... E2E_EMAIL=... E2E_PASSWORD=... THRESHOLD_MS=20 REPEATS=5 node scripts/measure-render-times.mjs
 */
import { chromium } from "@playwright/test"
import { pagePaths, rank, signIn, timePages } from "./page-timing.mjs"

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5176"
const EMAIL = process.env.E2E_EMAIL ?? "sarah.johnson@northwind.example"
const PASSWORD = process.env.E2E_PASSWORD ?? "devpassword"
const THRESHOLD_MS = Number(process.env.THRESHOLD_MS ?? 20)
const REPEATS = Number(process.env.REPEATS ?? 5)

/** Seeded Northwind dev-fixture ids (packages/database/fixtures) — only meaningful against that fixture. */
const IDS = {
  employeeId: "bf17b1af-963b-53ef-9083-21506fb34e9c",
  ticketId: "16a68eb5-4d61-5548-8e17-8f1ac4c2f5c9",
  projectId: "8257009f-6a91-5fd1-9efb-518198c08e2a",
  billId: "b07bca71-9562-5a5f-91b1-b749912c242d",
  invoiceId: "bee0d3ca-72f7-5ba2-9a31-3bbf17daf320",
  businessAreaId: "c9800088-b86b-5ddd-acdc-5b9fbe32f268",
  conversationId: "d0000000-0000-4000-8000-000000000001",
  folderId: "a0000000-0000-4000-8000-000000000001",
  objectiveId: "66574016-b971-406d-aac5-3574ae392437",
  groupId: "0158d8de-be1c-565f-a3c4-78624d177e7f",
  companyId: "e40d0f18-1333-5cd1-a969-f5113df51e70",
  contactId: "da1d1f9e-9d10-4d13-a3d9-b90f49903a13",
  dealId: "22222222-dea1-4000-8000-000000000002",
}

/** A handful of report pages render meaningfully differently with a date range set — cover both, the same pair `smoke.spec.ts` already curated. */
const EXTRA_QUERY_VARIANTS = [
  "/accounting/year-end-close?as_of=2026-12-31",
  "/accounting/tax-summary?from=2026-01-01&to=2026-12-31",
  "/accounting/trial-balance?as_of=2026-01-21&compare_as_of=2025-01-01",
  "/accounting/balance-sheet?as_of=2026-12-31&compare_as_of=2026-01-21",
]

const { paths, unresolved } = pagePaths(IDS, EXTRA_QUERY_VARIANTS)

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })

await signIn(page, BASE_URL, EMAIL, PASSWORD)
const results = rank(await timePages(page, BASE_URL, paths, REPEATS))
await browser.close()

console.log(`\n${"path".padEnd(65)}min      median   max      status`)
console.log("-".repeat(100))
for (const r of results) {
  const fmt = (n) => (n === null ? "  —  " : n.toFixed(1).padStart(5))
  const line = r.failure
    ? `${r.path.padEnd(65)}FAILED: ${r.failure}`
    : `${r.path.padEnd(65)}${fmt(r.min)}    ${fmt(r.median)}    ${fmt(r.max)}    ${r.status ?? "—"}`
  console.log(line)
}

const failed = results.filter((r) => r.failure)
const over = results.filter((r) => r.median !== null && r.median > THRESHOLD_MS)
console.log(
  `\n${failed.length} page(s) failed to render at all; ${over.length} / ${results.length - failed.length} of the rest have a median server-render time over ${THRESHOLD_MS}ms`,
)

if (unresolved.length) {
  console.log(`\n${unresolved.length} route(s) skipped — no sample id for:`)
  for (const p of unresolved) console.log(`    ${p}`)
}

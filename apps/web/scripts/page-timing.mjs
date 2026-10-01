/**
 * Shared by measure-render-times.mjs (Northwind) and the perf tenant's
 * measurement (packages/database/perf/measure.mjs): find every `(app)` page,
 * sign in, and time each page from the `server-timing` header hooks.server.ts
 * sets — the whole handle chain, not browser paint.
 */
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROUTES_DIR = new URL("../src/routes/(app)", import.meta.url).pathname

/**
 * Route-pattern prefix -> the id it needs, by name. `[id]` alone is ambiguous
 * (employees, tickets, projects each use it for a different entity), so the
 * prefix decides. A caller supplies the ids; a route whose id it lacks is
 * reported as unresolved, never guessed.
 */
const ROUTE_PARAM = [
  ["/employees/[id]", "employeeId"],
  ["/ticketing/[id]", "ticketId"],
  ["/projects/[id]", "projectId"],
  ["/payroll/runs/[id]", "payrollRunId"],
  ["/chat/[conversationId]", "conversationId"],
  ["/documents/[folderId]", "folderId"],
  ["/objectives/[id]", "objectiveId"],
  ["/settings/groups/[groupId]", "groupId"],
  ["/accounting/bills/[id]", "billId"],
  ["/accounting/invoices/[id]", "invoiceId"],
  ["/compensation/[employeeId]", "employeeId"],
  ["/settings/ticketing/[businessAreaId]", "businessAreaId"],
  ["/crm/companies/[id]", "companyId"],
  ["/crm/contacts/[id]", "contactId"],
  ["/crm/deals/[id]", "dealId"],
]

function discover(dir, prefix = "") {
  const routes = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) routes.push(...discover(full, `${prefix}/${name}`))
    else if (name === "+page.svelte") routes.push(prefix || "/")
  }
  return routes
}

/** Every `(app)` page as a concrete path, given the ids to fill its params. */
export function pagePaths(ids, extra = []) {
  const resolved = []
  const unresolved = []
  for (const pattern of discover(ROUTES_DIR)) {
    if (!pattern.includes("[")) {
      resolved.push(pattern)
      continue
    }
    const match = ROUTE_PARAM.find(([prefix]) => pattern.startsWith(prefix))
    const id = match && ids[match[1]]
    if (!id) unresolved.push(pattern)
    else resolved.push(pattern.replace(match[0], match[0].replace(/\[[^\]]+\]/, id)))
  }
  return { paths: [...new Set([...resolved, ...extra])].sort(), unresolved }
}

export async function signIn(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/login/sign_in`)
  await page.locator('input[name="email"]').waitFor({ timeout: 15_000 })
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })
}

function serverTimingMs(response) {
  const m = response?.headers()["server-timing"]?.match(/dur=([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

/**
 * Each path `repeats` times; median server time, HTML size and status.
 * The browser cache must be off (see the caller), or a repeat returns the
 * first request's header and looks impossibly fast. One page that never
 * resolves is recorded as a failure, not allowed to stop the sweep.
 */
export async function timePages(page, baseUrl, paths, repeats) {
  const results = []
  for (const path of paths) {
    const timings = []
    let status = null
    let bytes = null
    let failure = null
    for (let i = 0; i < repeats; i++) {
      try {
        const response = await page.goto(`${baseUrl}${path}`, { timeout: 60_000 })
        status = response?.status() ?? status
        bytes = (await response?.body())?.length ?? bytes
        const ms = serverTimingMs(response)
        if (ms !== null) timings.push(ms)
      } catch (e) {
        failure = e instanceof Error ? e.message.split("\n")[0] : String(e)
        break
      }
    }
    timings.sort((a, b) => a - b)
    results.push({
      path,
      status,
      bytes,
      failure,
      min: timings[0] ?? null,
      median: timings.length ? timings[Math.floor(timings.length / 2)] : null,
      max: timings.at(-1) ?? null,
    })
  }
  return results
}

/** Failures first (worse than any number), then slowest median first. */
export function rank(results) {
  return [...results].sort((a, b) => {
    if (a.failure && !b.failure) return -1
    if (b.failure && !a.failure) return 1
    return (b.median ?? -1) - (a.median ?? -1)
  })
}

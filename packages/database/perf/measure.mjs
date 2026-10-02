/**
 * `pnpm db:perf measure` — every `(app)` page, as every kind of user, against
 * the perf tenant, and the queries behind them (docs/32-perf-tenant.md,
 * "Measurement").
 *
 * The tenant is registered with the shared database's control plane only for
 * the length of a run, as ADR-009's dedicated tier (the same rows
 * provision-dedicated-db.sh writes for Fenwick), and removed afterwards. A
 * permanent row would make every other session's `./check` "dedicated
 * targets" step depend on this cluster being up.
 *
 * The `vite preview` this starts runs with the perf KEK (kek.mjs) — a
 * production build refuses the development key — and with the connection
 * ref, an environment variable, set on it alone. Another session's `./check`
 * that meets the registry row mid-run cannot resolve it and says so by that
 * variable's name. The app needs a build (`pnpm --filter @kaaj/web build`)
 * and nothing else.
 *
 * GET only, but as app_user against the perf cluster: a page that wrote on
 * read would change the data. Check with fingerprint.sql before and after.
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, loadavg } from "node:os"
import { join } from "node:path"
import postgres from "postgres"
import { chromium } from "@playwright/test"
import { unflatten } from "devalue"
import { pagePaths, rank, signIn, timePages } from "../../../apps/web/scripts/page-timing.mjs"
import { perfKek } from "./kek.mjs"
import { holdPerfLock } from "./lock.mjs"

const SHARED_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
const APP_DIR = new URL("../../../apps/web/", import.meta.url).pathname
const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url).pathname
const PORT = 5178 // distinct from e2e (5175), measure-render-times (5176), front-page check (5177)
const BASE_URL = `http://localhost:${PORT}`
const PASSWORD = "devpassword"
const SECRET_REF = "PERF_TENANT_MEASURE_RUN_IN_PROGRESS_DATABASE_URL"
const OUT_DIR = join(homedir(), ".kaaj", "perf-measurements")
const CLUSTER = new URL("./cluster.sh", import.meta.url).pathname
const BUDGETS = new URL("./budgets.tsv", import.meta.url).pathname
const LOCAL_TIMINGS = join(homedir(), ".kaaj", "perf-timings.tsv")
const FINGERPRINT_SQL = new URL("./fingerprint.sql", import.meta.url).pathname

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(SHARED_URL)) {
  console.error("  DATABASE_URL is not local — refusing to register a tenant there.")
  process.exit(1)
}

/**
 * The record each `[param]` route opens: the largest of its kind, because the
 * largest is what a page has to cope with. `null` (none generated) leaves the
 * route reported as unresolved.
 */
async function pickIds(perf, tenantId) {
  const one = async (q) => (await q)[0]?.id ?? null
  return {
    employeeId: await one(perf`SELECT employee_id AS id FROM _perf.actors WHERE actor = 'manager'`),
    ticketId: await one(perf`
      SELECT ticket_id AS id FROM ticketing_updates WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    projectId: await one(perf`
      SELECT project_id AS id FROM tasks WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    billId: await one(perf`
      SELECT bill_id AS id FROM bill_lines WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    invoiceId: await one(perf`
      SELECT invoice_id AS id FROM invoice_lines WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    businessAreaId: await one(perf`
      SELECT business_area_id AS id FROM ticketing_tickets WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    conversationId: await one(perf`
      SELECT conversation_id AS id FROM team_chat_messages WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    folderId: await one(perf`
      SELECT folder_id AS id FROM documents WHERE tenant_id = ${tenantId} AND folder_id IS NOT NULL
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    objectiveId: await one(perf`
      SELECT id FROM pm_objectives WHERE tenant_id = ${tenantId} ORDER BY id LIMIT 1`),
    groupId: await one(perf`
      SELECT group_id AS id FROM employee_group_members WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    companyId: await one(perf`
      SELECT customer_id AS id FROM crm_activities WHERE tenant_id = ${tenantId}
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    contactId: await one(perf`
      SELECT customer_contact_id AS id FROM crm_activities
       WHERE tenant_id = ${tenantId} AND customer_contact_id IS NOT NULL
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    dealId: await one(perf`
      SELECT deal_id AS id FROM crm_activities WHERE tenant_id = ${tenantId} AND deal_id IS NOT NULL
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
    // Not a route param: the receive-payment view with a customer chosen.
    openInvoiceCustomerId: await one(perf`
      SELECT customer_id AS id FROM invoices
       WHERE tenant_id = ${tenantId} AND status IN ('sent', 'partially_paid', 'overdue')
       GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`),
  }
}

async function unregister(shared, tenantId, userIds) {
  await shared.begin(async (tx) => {
    await tx`DELETE FROM auth.identities WHERE user_id = ANY(${userIds}::uuid[])`
    await tx`DELETE FROM auth.users WHERE id = ANY(${userIds}::uuid[])`
    await tx`DELETE FROM tenants WHERE id = ${tenantId}` // cascades tenant_users, tenant_registry
  })
}

/** What sign-in and routing need from the control plane, and nothing else. */
async function register(shared, perf, tenantId, actors) {
  // As JSON both ways: jsonb, arrays and enums then survive the trip untouched.
  const [{ tenant, members }] = await perf`
    SELECT (SELECT to_jsonb(t) FROM tenants t WHERE t.id = ${tenantId}) AS tenant,
           (SELECT jsonb_agg(to_jsonb(tu)) FROM tenant_users tu
             WHERE tu.tenant_id = ${tenantId}
               AND tu.user_id = ANY(${actors.map((a) => a.user_id)}::uuid[])) AS members`
  const schemaVersion = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort().at(-1).split("_")[0]

  await shared.begin(async (tx) => {
    await tx`INSERT INTO tenants SELECT * FROM jsonb_populate_record(NULL::tenants, ${tx.json(tenant)})`
    await tx`
      INSERT INTO tenant_registry (tenant_id, subdomain, tier, connection_secret_ref, schema_version, status)
      VALUES (${tenantId}, ${tenant.subdomain}, 'dedicated', ${SECRET_REF}, ${schemaVersion}, 'active')`
    await tx`INSERT INTO tenant_users SELECT * FROM jsonb_populate_recordset(NULL::tenant_users, ${tx.json(members)})`
    for (const a of actors) {
      await tx`
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change)
        VALUES (
            '00000000-0000-0000-0000-000000000000', ${a.user_id}, 'authenticated', 'authenticated',
            ${a.email}, extensions.crypt(${PASSWORD}, extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object('full_name', ${a.full_name}::text, 'kaaj_role', ${a.role}::text),
            now(), now(), '', '', '', '')`
      await tx`
        INSERT INTO auth.identities (provider_id, user_id, identity_data, provider,
                                     last_sign_in_at, created_at, updated_at)
        VALUES (${a.user_id}::text, ${a.user_id},
                jsonb_build_object('sub', ${a.user_id}::text, 'email', ${a.email}::text,
                                   'email_verified', true, 'phone_verified', false),
                'email', now(), now(), now())`
    }
  })
}

function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        if ((await fetch(url)).status < 500) return resolve()
      } catch {
        // not up yet
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`${url} did not respond in ${timeoutMs}ms`))
      setTimeout(attempt, 250)
    }
    attempt()
  })
}

/** Every statement app_user ran since the last reset — what the pages cost the database. */
async function statements(perf) {
  const rows = await perf`
    SELECT s.calls::int, s.total_exec_time::float8 AS total_ms, s.max_exec_time::float8 AS max_ms,
           regexp_replace(s.query, '\\s+', ' ', 'g') AS query
      FROM pg_stat_statements s
      JOIN pg_roles r ON r.oid = s.userid
     WHERE r.rolname = 'app_user' AND s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`
  return rows.map((r) => ({ ...r, total_ms: Number(r.total_ms), max_ms: Number(r.max_ms) }))
}

/** Per-actor statements merged by text: one ranking for the run, by total and by mean. */
function rankQueries(byActor, limit) {
  const merged = new Map()
  for (const rows of Object.values(byActor)) {
    for (const r of rows) {
      const m = merged.get(r.query) ?? { query: r.query, calls: 0, total_ms: 0, max_ms: 0 }
      m.calls += r.calls
      m.total_ms += r.total_ms
      m.max_ms = Math.max(m.max_ms, r.max_ms)
      merged.set(r.query, m)
    }
  }
  const all = [...merged.values()].map((m) => ({ ...m, mean_ms: m.total_ms / m.calls }))
  return {
    statements: all.length,
    byTotal: [...all].sort((a, b) => b.total_ms - a.total_ms).slice(0, limit),
    byMean: [...all].sort((a, b) => b.mean_ms - a.mean_ms).slice(0, limit),
  }
}

function report({ actors, results, queries, byActor, unresolved, extraPaths, load }) {
  const fmt = (n) => (n == null ? "—" : n.toFixed(0))
  const names = actors.map((a) => a.actor)
  const paths = [...new Set(Object.values(results).flatMap((rs) => rs.map((r) => r.path)))]
  const cell = (actor, path) => results[actor]?.find((r) => r.path === path)
  const worst = (path) => Math.max(...names.map((n) => cell(n, path)?.median ?? -1))
  paths.sort((a, b) => worst(b) - worst(a))

  const lines = []
  lines.push(`Machine load average (1 min) at start ${load.start.toFixed(1)}, at end ${load.end.toFixed(1)}.\n`)
  lines.push(`Server time, median ms (status when not 200). Slowest first.\n`)
  lines.push(`${"path".padEnd(58)}${names.map((n) => n.padStart(9)).join("")}    KB (max)`)
  lines.push("-".repeat(58 + names.length * 9 + 12))
  for (const path of paths) {
    const cols = names.map((n) => {
      const r = cell(n, path)
      if (!r) return "".padStart(9)
      if (r.failure) return "FAIL".padStart(9)
      const s = r.status === 200 ? fmt(r.median) : `${fmt(r.median)}/${r.status}`
      return s.padStart(9)
    })
    const kb = Math.max(...names.map((n) => cell(n, path)?.bytes ?? 0)) / 1024
    lines.push(`${path.slice(0, 57).padEnd(58)}${cols.join("")}    ${kb.toFixed(0).padStart(6)}`)
  }

  const failures = names.flatMap((n) => (results[n] ?? []).filter((r) => r.failure).map((r) => `${n} ${r.path}: ${r.failure}`))
  if (failures.length) lines.push(`\nFailed to render:\n  ${failures.join("\n  ")}`)
  if (unresolved.length) lines.push(`\nNo sample id, not measured:\n  ${unresolved.join("\n  ")}`)
  if (extraPaths.length) lines.push(`\nQuery variants included: ${extraPaths.join(", ")}`)

  const n = (x, w, d = 1) => x.toFixed(d).padStart(w)
  const q = (r) => `${n(r.total_ms, 10)} ${String(r.calls).padStart(7)} ${n(r.mean_ms, 9, 2)} ${n(r.max_ms, 9)}  ${r.query.slice(0, 160)}`
  const head = `  total_ms   calls   mean_ms    max_ms  query`
  lines.push(`\nQueries by total time (${queries.statements} distinct statements as app_user)\n`)
  lines.push(head)
  for (const r of queries.byTotal) lines.push(q(r))
  lines.push(`\nQueries by mean time\n`)
  lines.push(head)
  for (const r of queries.byMean) lines.push(q(r))
  for (const name of names) {
    const rows = (byActor[name] ?? [])
      .map((r) => ({ ...r, mean_ms: r.total_ms / r.calls }))
      .sort((a, b) => b.total_ms - a.total_ms)
    const total = rows.reduce((t, r) => t + r.total_ms, 0)
    lines.push(`\n${name}: ${n(total, 0, 0)}ms in the database; top 5\n`)
    for (const r of rows.slice(0, 5)) lines.push(q(r))
  }
  return lines.join("\n")
}

/**
 * Registers the tenant, serves the build, and hands `fn` everything a sweep
 * needs; always unregisters and stops the server afterwards.
 */
async function session({ perfUrl, tenantId, only }, fn) {
  const perf = postgres(perfUrl, { types: {}, onnotice: () => {}, max: 1 })
  const shared = postgres(SHARED_URL, { types: {}, onnotice: () => {}, max: 1 })
  const appUserPerfUrl = perfUrl.replace(/\/\/[^@]+@/, "//app_user:app_user@")

  let server = null
  let actors = []
  let release = null
  try {
    execFileSync(CLUSTER, ["start"], { stdio: ["ignore", "ignore", "inherit"] })
    release = await holdPerfLock(
      perfUrl,
      "the perf cluster has no database — run `pnpm db:perf:cluster up` and " +
        "`pnpm db:perf seed`; docs/32-perf-tenant.md",
    )
    // Under the lock, so two runs never apply the same migration: a cluster
    // left behind the repo's schema would measure a schema nobody ships.
    execFileSync(CLUSTER, ["up"], { stdio: ["ignore", "ignore", "inherit"] })
    // Ahead of it is as wrong: another checkout's unmerged migration — an
    // index, say — would be in every run from this one.
    const files = new Set(readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, -4)))
    const extra = (await perf`SELECT name FROM _cluster.applied ORDER BY name`).map((r) => r.name).filter((n) => !files.has(n))
    if (extra.length)
      throw new Error(
        `the perf cluster has migrations this checkout does not (${extra.join(", ")}) — ` +
          "another branch's; rebuild it: `pnpm db:perf:cluster rebuild && pnpm db:perf seed`",
      )
    // Held only by a seed, which holds this lock too: off here means a seed died.
    const [{ autovacuum }] = await perf`SELECT current_setting('autovacuum') AS autovacuum`
    if (autovacuum !== "on") {
      await perf`ALTER SYSTEM RESET autovacuum`
      await perf`SELECT pg_reload_conf()`
    }
    const [ready] = await perf`SELECT to_regclass('_perf.actors') IS NOT NULL AS seeded`
    if (!ready.seeded)
      throw new Error("the perf cluster has no perf tenant — run `pnpm db:perf seed`")
    actors = await perf`
      SELECT a.actor, a.user_id::text, a.email, tu.role::text,
             e.first_name || ' ' || e.last_name AS full_name
        FROM _perf.actors a
        JOIN tenant_users tu ON tu.user_id = a.user_id AND tu.tenant_id = ${tenantId}
        JOIN employees e ON e.id = a.employee_id
       ORDER BY array_position(ARRAY['owner','finance','hr','it','auditor','sales','manager','employee'], a.actor)`
    if (only) actors = actors.filter((a) => only.includes(a.actor))
    if (!actors.length) throw new Error("no actors — has `pnpm db:perf seed` been run?")
    const userIds = actors.map((a) => a.user_id)

    const ids = await pickIds(perf, tenantId)
    const [{ as_of }] = await perf`SELECT as_of::text FROM _perf.params`
    const year = as_of.slice(0, 4)
    const extraPaths = [
      `/accounting/year-end-close?as_of=${year}-12-31`,
      `/accounting/tax-summary?from=${year}-01-01&to=${year}-12-31`,
      `/accounting/trial-balance?as_of=${as_of}&compare_as_of=${Number(year) - 1}-${as_of.slice(5)}`,
      `/accounting/balance-sheet?as_of=${as_of}&compare_as_of=${year}-01-01`,
      ...(ids.openInvoiceCustomerId
        ? [`/accounting/receive-payment?customer_id=${ids.openInvoiceCustomerId}`]
        : []),
    ]
    const { paths, unresolved } = pagePaths(ids, extraPaths)

    await unregister(shared, tenantId, userIds) // a previous run that died before its cleanup
    await register(shared, perf, tenantId, actors)

    mkdirSync(OUT_DIR, { recursive: true })
    const log = openSync(join(OUT_DIR, "preview.log"), "w")
    server = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"], {
      cwd: APP_DIR,
      stdio: ["ignore", log, log],
      detached: true,
      // A PUBLIC_SUPABASE_* exported in a shell profile outranks .env.local (L75).
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith("PUBLIC_SUPABASE_")),
        ),
        PRIVATE_PII_KEK: perfKek(),
        [SECRET_REF]: appUserPerfUrl,
      },
    })
    await waitForServer(`${BASE_URL}/login/sign_in`)

    const browser = await chromium.launch()
    try {
      return await fn({ perf, actors, ids, as_of, paths, unresolved, extraPaths, browser })
    } finally {
      await browser.close()
    }
  } finally {
    if (server) {
      try {
        process.kill(-server.pid, "SIGTERM")
      } catch {
        // already gone
      }
    }
    if (actors.length) await unregister(shared, tenantId, actors.map((a) => a.user_id))
    await perf.end()
    await shared.end()
    await release?.()
  }
}

/** Signed in as `actor`, with the browser cache off; closes the context after. */
async function asActor(browser, actor, fn) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
    await signIn(page, BASE_URL, actor.email, PASSWORD)
    return await fn(page)
  } finally {
    await context.close()
  }
}

export async function measure({ perfUrl, tenantId, repeats, only, top }) {
  return session({ perfUrl, tenantId, only }, async ({ perf, actors, ids, as_of, paths, unresolved, extraPaths, browser }) => {
    const load = { start: loadavg()[0], end: null }
    const started = Date.now()
    const results = {}
    const byActor = {}
    for (const a of actors) {
      try {
        await perf`SELECT pg_stat_statements_reset()`
        await asActor(browser, a, async (page) => {
          const t = Date.now()
          results[a.actor] = rank(await timePages(page, BASE_URL, paths, repeats))
          byActor[a.actor] = await statements(perf)
          // Routing that silently fell back to the shared database, where this
          // tenant has no rows, would time fast empty pages and look like a win.
          if (!byActor[a.actor].length)
            throw new Error(
              `no app_user statements reached the perf cluster as ${a.actor} (signed in at ${page.url()}) — ` +
                `the app is not routed to it; see ${join(OUT_DIR, "preview.log")}`,
            )
          console.log(`  ${a.actor.padEnd(9)} ${paths.length} pages × ${repeats} in ${((Date.now() - t) / 1000).toFixed(0)}s`)
        })
      } catch (e) {
        if (e.message.startsWith("no app_user statements")) throw e
        console.error(`  ${a.actor}: ${e.message.split("\n")[0]} — skipped`)
      }
    }
    load.end = loadavg()[0]
    const queries = rankQueries(byActor, top)

    const text = report({ actors, results, queries, byActor, unresolved, extraPaths, load })
    console.log(`\n${text}`)

    const file = join(OUT_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
    writeFileSync(file, JSON.stringify({ as_of, repeats, load, ids, actors, results, byActor, unresolved }, null, 2))
    console.log(`\n  ${((Date.now() - started) / 1000).toFixed(0)}s; raw results in ${file}`)
  })
}

/** Every array in a page's load data longer than `max`, by its key path. */
function longArrays(value, max, path = "", out = []) {
  if (Array.isArray(value)) {
    if (value.length > max) out.push({ path: path || "(root)", length: value.length })
    value.forEach((v) => longArrays(v, max, `${path}[]`, out))
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) longArrays(v, max, path ? `${path}.${k}` : k, out)
  }
  return out
}

/**
 * `pnpm db:perf rows` — no page sends the browser more than `max` rows of
 * anything, for any actor: CLAUDE.md's paging rule, checked at the size of a
 * real tenant. Reads each page's load data (`__data.json`), not the DOM, so a
 * picker inside a closed modal counts as much as a table on screen.
 */
export async function rows({ perfUrl, tenantId, only, max }) {
  return session({ perfUrl, tenantId, only }, async ({ actors, paths, browser }) => {
    const found = new Map() // "path  key" -> { actors, length }
    // A page that errors sends no data, so it would read as clean: say so.
    const failed = []
    for (const a of actors) {
      let read = 0
      let refused = 0
      await asActor(browser, a, async (page) => {
        for (const path of paths) {
          const [pathname, query] = path.split("?")
          const url = `${BASE_URL}${pathname === "/" ? "" : pathname}/__data.json${query ? `?${query}` : ""}`
          const res = await page.request.get(url)
          const body = res.ok() ? await res.json() : null
          const error = body?.nodes?.find((n) => n?.type === "error")
          const status = res.ok() ? (error?.status ?? 200) : res.status()
          if (status === 403 || status === 404) {
            refused++
            continue
          }
          if (status !== 200 || !body) {
            failed.push(`${a.actor} ${path}: ${status}`)
            continue
          }
          read++
          for (const node of body.nodes ?? []) {
            if (node?.type !== "data") continue
            for (const hit of longArrays(unflatten(node.data), max)) {
              const key = `${path}  ${hit.path}`
              const f = found.get(key) ?? { actors: new Set(), length: 0 }
              f.actors.add(a.actor)
              f.length = Math.max(f.length, hit.length)
              found.set(key, f)
            }
          }
        }
      })
      console.log(`  ${a.actor.padEnd(9)} ${read} pages read, ${refused} refused`)
    }
    if (failed.length) {
      console.log(`\n  ${failed.length} page(s) failed, so were not checked:\n    ${failed.join("\n    ")}`)
      process.exitCode = 1
    }
    if (!found.size) {
      console.log(`\n  no page read sends more than ${max} rows of anything, for any actor`)
      return
    }
    console.log(`\n  ${found.size} list(s) over ${max} rows:\n`)
    for (const [key, f] of [...found].sort((x, y) => y[1].length - x[1].length))
      console.log(`  ${String(f.length).padStart(6)}  ${key}  (${[...f.actors].join(", ")})`)
    process.exitCode = 1
  })
}

/**
 * A page's budget is what it costs the DATABASE — statements run and data
 * pages read — because those are the same on every machine and under any
 * load, so they can be committed and compared exactly. Wall-clock time is
 * neither, so it is compared only against this machine's own last run, and
 * only after re-measuring, since one slow sample is usually the machine.
 *
 * Generous on purpose: what this exists to catch is a missing index, a lost
 * LIMIT or a query in a loop, which move these figures by multiples, not
 * percent. Anything smaller is noise or a deliberate change.
 */
const TOLERANCE = {
  queries: (was) => Math.ceil(was * 1.25) + 2,
  pages: (was) => Math.ceil(was * 1.5) + 200,
  ms: (was) => Math.max(was * 2, was + 25),
}
const TIMING_RETRIES = 5
const REQUEST_TIMEOUT_MS = 20_000

const keyOf = (path, actor) => `${path}\t${actor}`
const normalise = (path) =>
  path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]")

function readTsv(file) {
  if (!existsSync(file)) return null
  const header = {}
  const rows = new Map()
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue
    if (line.startsWith("#")) {
      for (const [, k, v] of line.matchAll(/(\w+)=(\S+)/g)) header[k] = v
      continue
    }
    const [path, actor, ...fields] = line.split("\t")
    if (path === "path") continue
    rows.set(keyOf(path, actor), fields)
  }
  return { header, rows }
}

function writeTsv(file, header, columns, rows, preamble = []) {
  const head = Object.entries(header).map(([k, v]) => `${k}=${v}`).join(" ")
  const body = [...rows].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, f]) => `${k}\t${f.join("\t")}`)
  writeFileSync(file, [...preamble, `# ${head}`, ["path", "actor", ...columns].join("\t"), ...body, ""].join("\n"))
}

/** One server render of `path`: status, server ms, and what it cost the database. */
async function costOf(page, perf, path) {
  await perf`SELECT pg_stat_statements_reset()`
  // A page that never answers is the worst regression of all, so it is a
  // result, not an exception — and the error text, which carries the
  // session cookie, is not printed.
  const res = await page.request
    .get(`${BASE_URL}${path}`, { maxRedirects: 0, timeout: REQUEST_TIMEOUT_MS })
    .catch(() => null)
  const m = res?.headers()["server-timing"]?.match(/dur=([\d.]+)/)
  const [db] = await perf`
    SELECT coalesce(sum(s.calls), 0)::int AS queries,
           coalesce(sum(s.shared_blks_hit + s.shared_blks_read), 0)::int AS pages
      FROM pg_stat_statements s
      JOIN pg_roles r ON r.oid = s.userid
     WHERE r.rolname = 'app_user' AND s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`
  return { status: res ? res.status() : `no answer in ${REQUEST_TIMEOUT_MS / 1000}s`, ms: m ? parseFloat(m[1]) : null, ...db }
}

/**
 * `pnpm db:perf regress [--update]` — every page, as every actor, against
 * the committed budget in budgets.tsv; fails on any page that got
 * materially more expensive. `--update` rewrites the budget, which is how a
 * deliberate change is acknowledged — in review, as a diff.
 */
export async function regress({ perfUrl, tenantId, update }) {
  return session({ perfUrl, tenantId }, async ({ perf, actors, as_of, paths, unresolved, browser }) => {
    const started = Date.now()
    // A migration applied since the seed leaves rows the visibility map does
    // not cover yet, and that changes which scans the planner picks.
    await perf`VACUUM`
    const [{ scale, postgres: pg }] = await perf`
      SELECT scale::text, current_setting('server_version_num')::int / 10000 AS postgres FROM _perf.params`
    const [{ fingerprint }] = await perf.unsafe(readFileSync(FINGERPRINT_SQL, "utf8"))
    const header = { scale, as_of, fingerprint, postgres: String(pg) }

    const budget = readTsv(BUDGETS)
    if (!update) {
      if (!budget) throw new Error(`no ${BUDGETS} — create it with \`pnpm db:perf regress --update\``)
      const want = budget.header
      if (want.postgres !== header.postgres)
        throw new Error(
          `the budget was measured on Postgres ${want.postgres} and the perf cluster runs ` +
            `${header.postgres}; plans differ between major versions, so the pages read do too`,
        )
      if (want.scale !== scale || want.as_of !== as_of || want.fingerprint !== fingerprint)
        throw new Error(
          `the perf tenant is not the data the budget was measured on ` +
            `(budget: scale ${want.scale}, as of ${want.as_of}, fingerprint ${want.fingerprint}; ` +
            `here: scale ${scale}, as of ${as_of}, fingerprint ${fingerprint}). ` +
            `Reseed it: \`pnpm db:perf seed --scale=${want.scale} --as-of=${want.as_of}\``,
        )
    }

    const measured = new Map() // key -> { status, queries, pages, ms }
    const pages = new Map() // key -> [actor, path] to re-measure
    for (const a of actors) {
      const t = Date.now()
      await asActor(browser, a, async (page) => {
        for (const path of paths) {
          const key = keyOf(normalise(path), a.actor)
          measured.set(key, await costOf(page, perf, path))
          pages.set(key, [a, path])
        }
      })
      if (![...measured].some(([k, r]) => k.endsWith(`\t${a.actor}`) && r.queries > 0))
        throw new Error(
          `no app_user statements reached the perf cluster as ${a.actor} — the app is not ` +
            `routed to it; see ${join(OUT_DIR, "preview.log")}`,
        )
      console.log(`  ${a.actor.padEnd(9)} ${paths.length} pages in ${((Date.now() - t) / 1000).toFixed(0)}s`)
    }

    // Kept against one version of the budget: a budget someone else updated
    // and committed is a deliberate change, and timings from before it would
    // keep flagging the page it was about.
    const budgetHash = () => createHash("md5").update(readFileSync(BUDGETS)).digest("hex")
    const timings = readTsv(LOCAL_TIMINGS)
    const timingsUsable = timings && existsSync(BUDGETS) && timings.header.budget === budgetHash()
    const writeTimings = () => {
      mkdirSync(join(homedir(), ".kaaj"), { recursive: true })
      writeTsv(LOCAL_TIMINGS, { ...header, budget: budgetHash() }, ["ms"],
        [...measured].filter(([, r]) => r.ms != null).map(([k, r]) => [k, [r.ms.toFixed(1)]]),
        ["# this machine's server times, kept while budgets.tsv is unchanged; not committed (measure.mjs)"])
    }

    if (update) {
      writeTsv(BUDGETS, header, ["status", "queries", "pages"],
        [...measured].map(([k, r]) => [k, [r.status, r.queries, r.pages].map(String)]),
        [
          "# What each page costs the database, as each perf actor: the budget `pnpm db:perf regress`",
          "# holds every push to (docs/32-perf-tenant.md). Regenerate only with `pnpm db:perf regress --update`.",
        ])
      writeTimings()
      console.log(`\n  wrote ${measured.size} budgets to ${BUDGETS}`)
      if (unresolved.length) console.log(`  not measured, no sample id: ${unresolved.join(", ")}`)
      return
    }

    const failures = []
    for (const [key, r] of measured) {
      const was = budget.rows.get(key)
      const where = key.replace("\t", " as ")
      if (!was) {
        failures.push(`${where}: no budget — a new page? \`pnpm db:perf regress --update\``)
        continue
      }
      const [status, queries, pagesRead] = was.map(Number)
      if (r.status !== status) {
        failures.push(`${where}: status ${status} → ${r.status}`)
        continue
      }
      if (r.queries > TOLERANCE.queries(queries))
        failures.push(`${where}: queries ${queries} → ${r.queries}`)
      if (r.pages > TOLERANCE.pages(pagesRead))
        failures.push(`${where}: data pages read ${pagesRead} → ${r.pages}`)
    }
    for (const key of budget.rows.keys())
      if (!measured.has(key))
        failures.push(`${key.replace("\t", " as ")}: in the budget but not measured — removed? \`pnpm db:perf regress --update\``)

    // Time only where the counts passed: a counted regression already fails,
    // and one slow sample is re-measured before it is believed.
    const slow = []
    const failed = new Set(failures.map((f) => f.slice(0, f.indexOf(":"))))
    if (timingsUsable) {
      for (const [key, r] of measured) {
        if (failed.has(key.replace("\t", " as "))) continue
        const was = Number(timings.rows.get(key)?.[0])
        if (!was || r.ms == null || r.ms <= TOLERANCE.ms(was)) continue
        const [a, path] = pages.get(key)
        const samples = await asActor(browser, a, async (page) => {
          const out = []
          for (let i = 0; i < TIMING_RETRIES; i++) out.push((await costOf(page, perf, path)).ms)
          return out.sort((x, y) => x - y)
        })
        const median = samples[Math.floor(samples.length / 2)]
        if (median > TOLERANCE.ms(was))
          slow.push(`${key.replace("\t", " as ")}: ${was.toFixed(0)}ms → ${median.toFixed(0)}ms (median of ${TIMING_RETRIES})`)
        else r.ms = median
      }
    }

    console.log(`\n  ${measured.size} page renders in ${((Date.now() - started) / 1000).toFixed(0)}s`)
    if (failures.length || slow.length) {
      if (failures.length) console.log(`\n  ${failures.length} over budget:\n    ${failures.join("\n    ")}`)
      if (slow.length)
        console.log(`\n  ${slow.length} slower than on this machine last time:\n    ${slow.join("\n    ")}`)
      console.log(
        `\n  A deliberate change: \`pnpm db:perf regress --update\`, and commit budgets.tsv with it.` +
          `\n  Where the time goes: \`pnpm db:perf measure --actors=<actor>\`.`,
      )
      process.exitCode = 1
      return
    }
    if (!timingsUsable) writeTimings()
    console.log(`  every page within budget, as every actor`)
  })
}

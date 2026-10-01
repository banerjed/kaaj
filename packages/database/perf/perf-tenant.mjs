#!/usr/bin/env node
/**
 * The performance tenant (docs/32-perf-tenant.md): Brightline Consulting, a
 * 1,000-person firm two years into using the product, generated into its own
 * Postgres cluster (cluster.sh).
 *
 *   pnpm db:perf seed [--scale=1] [--as-of=YYYY-MM-DD]   (re)build it
 *   pnpm db:perf status                                   rows per table, against the model
 *   pnpm db:perf verify                                   check it: sealed values open, books balance
 *   pnpm db:perf drop                                     remove the tenant
 *
 * `seed` removes any previous perf tenant first, so it is always a clean,
 * deterministic build: the same scale and as-of date give the same rows.
 *
 * Local only: PERF_DATABASE_URL must point at 127.0.0.1/localhost, and the
 * default is the perf cluster, never the shared Supabase database.
 */
import { readdirSync, readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import postgres from "postgres"
import { sealEncryptedColumns } from "./seal.mjs"
import { verifySealed } from "./verify-sealed.mjs"

export const PERF_TENANT_ID = "7e7f5000-0000-4000-8000-0000000b0001"
const DB_URL =
  process.env.PERF_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54349/kaaj_perf"
const SQL_DIR = new URL("./sql/", import.meta.url).pathname

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)) {
  console.error("  PERF_DATABASE_URL is not local — refusing to run.")
  process.exit(1)
}

/** Rows the model expects at scale 1 (docs/32-perf-tenant.md), for `status`. */
const MODEL = {
  employees: 1060,
  customers: 3000,
  customer_contacts: 9000,
  crm_deals: 12000,
  crm_activities: 60000,
  projects: 1500,
  tasks: 60000,
  time_tracking_entries: 480000,
  ticketing_tickets: 40000,
  ticketing_updates: 200000,
  custom_field_values: 250000,
  invoices: 30000,
  invoice_lines: 120000,
  journal_entries: 70000,
  journal_entry_lines: 210000,
}

const sql = postgres(DB_URL, { types: {}, onnotice: () => {}, max: 1 })

async function tenantTables() {
  return sql`
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
       AND t.table_type = 'BASE TABLE'
     ORDER BY 1`
}

async function drop() {
  const started = Date.now()
  // Child tables first would be the polite order; a cascade from tenants
  // reaches everything with an ON DELETE CASCADE tenant_id, and the rest
  // (append-only tables among them) are cleared explicitly, as the owner.
  const tables = await tenantTables()
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`
    for (const { table_name } of tables) {
      await tx.unsafe(`DELETE FROM public."${table_name}" WHERE tenant_id = $1`, [
        PERF_TENANT_ID,
      ])
    }
    await tx`DELETE FROM tenants WHERE id = ${PERF_TENANT_ID}`
  })
  console.log(`  perf tenant removed (${((Date.now() - started) / 1000).toFixed(1)}s)`)
}

async function seed({ scale, asOf }) {
  const started = Date.now()
  await drop()
  await sql.unsafe(readFileSync(`${SQL_DIR}00_helpers.sql`, "utf8"))
  await sql`
    INSERT INTO _perf.params (tenant_id, scale, as_of)
    VALUES (${PERF_TENANT_ID}, ${scale}, ${asOf})
    ON CONFLICT (singleton) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id, scale = EXCLUDED.scale,
          as_of = EXCLUDED.as_of, seeded_at = NULL, seconds = NULL`

  const steps = readdirSync(SQL_DIR)
    .filter((f) => /^\d\d_.+\.sql$/.test(f) && f !== "00_helpers.sql")
    .sort()
  for (const step of steps) {
    const t = Date.now()
    await sql.begin((tx) => tx.unsafe(readFileSync(`${SQL_DIR}${step}`, "utf8")))
    console.log(`  ${step.padEnd(28)} ${((Date.now() - t) / 1000).toFixed(1)}s`)
  }

  const t = Date.now()
  const sealed = await sealEncryptedColumns(sql, PERF_TENANT_ID)
  console.log(`  ${"sealed columns".padEnd(28)} ${((Date.now() - t) / 1000).toFixed(1)}s  (${sealed} values)`)

  await sql`ANALYZE`
  const seconds = (Date.now() - started) / 1000
  await sql`UPDATE _perf.params SET seeded_at = now(), seconds = ${seconds}`
  console.log(`  perf tenant built at scale ${scale}, as of ${asOf}, in ${seconds.toFixed(0)}s`)
  await status()
}

/** Facts a correct build must satisfy; fails loudly on the first that does not. */
async function verify() {
  const opened = await verifySealed(sql, PERF_TENANT_ID)
  console.log(`  sealed values open with the app's own key handling: ${opened} checked`)
}

async function status() {
  const [params] = await sql`
    SELECT to_regclass('_perf.params') IS NOT NULL AS ok`
  if (!params.ok) return console.log("  no perf tenant has been built here")
  const [p] = await sql`SELECT scale::text, as_of::text, seeded_at, seconds::text FROM _perf.params`
  console.log(
    p
      ? `  scale ${p.scale}, as of ${p.as_of}, built ${p.seeded_at ? p.seeded_at.toISOString() : "— (incomplete)"}`
      : "  no perf tenant has been built here",
  )
  let total = 0
  const rows = []
  for (const { table_name } of await tenantTables()) {
    const [{ n }] = await sql.unsafe(
      `SELECT count(*)::int AS n FROM public."${table_name}" WHERE tenant_id = $1`,
      [PERF_TENANT_ID],
    )
    total += n
    if (n > 0 || MODEL[table_name]) rows.push([table_name, n])
  }
  const scale = Number(p?.scale ?? 1)
  for (const [table, n] of rows.sort((a, b) => b[1] - a[1])) {
    const want = MODEL[table] ? Math.round(MODEL[table] * scale) : null
    const note = want === null ? "" : `  (model ${want.toLocaleString("en-US")})`
    console.log(`  ${table.padEnd(34)} ${n.toLocaleString("en-US").padStart(10)}${note}`)
  }
  console.log(`  ${"total".padEnd(34)} ${total.toLocaleString("en-US").padStart(10)}`)
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    scale: { type: "string", default: "1" },
    "as-of": { type: "string" },
  },
})

try {
  switch (positionals[0]) {
    case "seed": {
      const scale = Number(values.scale)
      if (!(scale > 0 && scale <= 5)) throw new Error("--scale must be in (0, 5]")
      const asOf = values["as-of"] ?? new Date().toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("--as-of must be YYYY-MM-DD")
      await seed({ scale, asOf })
      break
    }
    case "status":
      await status()
      break
    case "verify":
      await verify()
      break
    case "drop":
      await drop()
      break
    default:
      console.error("usage: perf-tenant.mjs seed [--scale=1] [--as-of=YYYY-MM-DD] | status | verify | drop")
      process.exitCode = 2
  }
} catch (e) {
  console.error(`  ${e.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}

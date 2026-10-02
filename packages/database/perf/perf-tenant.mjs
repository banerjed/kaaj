#!/usr/bin/env node
/**
 * The performance tenant (docs/32-perf-tenant.md): Brightline Consulting, a
 * 1,000-person firm two years into using the product, generated into its own
 * Postgres cluster (cluster.sh).
 *
 *   pnpm db:perf seed [--scale=1] [--as-of=YYYY-MM-DD]   (re)build it; as of budgets.tsv's date by default
 *   pnpm db:perf status                                   rows per table, against the model
 *   pnpm db:perf verify                                   check it: sealed values open, books balance
 *   pnpm db:perf drop                                     remove the tenant
 *   pnpm db:perf measure [--repeats=3] [--actors=a,b]     pages × actors, slowest queries (measure.mjs)
 *   pnpm db:perf rows [--max=100] [--actors=a,b]          fails on any page sending more than max rows
 *   pnpm db:perf regress [--update]                       fails on any page over its budget (budgets.tsv)
 *
 * `seed` removes any previous perf tenant first, so it is always a clean,
 * deterministic build: the same scale and as-of date give the same rows.
 *
 * Local only: PERF_DATABASE_URL must point at 127.0.0.1/localhost, and the
 * default is the perf cluster, never the shared Supabase database.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import postgres from "postgres"
import { holdPerfLock } from "./lock.mjs"
import { sealEncryptedColumns } from "./seal.mjs"
import { verifySealed } from "./verify-sealed.mjs"

export const PERF_TENANT_ID = "7e7f5000-0000-4000-8000-0000000b0001"
const DB_URL =
  process.env.PERF_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54349/kaaj_perf"
const SQL_DIR = new URL("./sql/", import.meta.url).pathname
const BUDGETS = new URL("./budgets.tsv", import.meta.url).pathname

// Port as well as host — a tunnel answers on localhost too, and `seed` turns
// autovacuum off and writes a tenant into whatever it reaches.
const PERF_PORT = process.env.KAAJ_PERF_PORT ?? "54349"
if (!new RegExp(`@(127\\.0\\.0\\.1|localhost):${PERF_PORT}/`).test(DB_URL)) {
  console.error(
    `  PERF_DATABASE_URL is not the perf cluster (127.0.0.1:${PERF_PORT}) — refusing to run.`,
  )
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

/**
 * The SCALE_SENSITIVE register, read from verify-query-scale.mjs's source —
 * importing it would run that check as a side effect. Entries may span
 * several lines, so the table name is matched as the first string after `[`.
 */
function scaleSensitiveTables() {
  const src = readFileSync(
    new URL("../../../scripts/verify-query-scale.mjs", import.meta.url),
    "utf8",
  )
  const start = src.indexOf("const SCALE_SENSITIVE = new Map([")
  const end = src.indexOf("\n])", start)
  return [...src.slice(start, end).matchAll(/\[\s*"([a-z_]+)",/g)].map(
    (m) => m[1],
  )
}

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
      await tx.unsafe(
        `DELETE FROM public."${table_name}" WHERE tenant_id = $1`,
        [PERF_TENANT_ID],
      )
    }
    await tx`DELETE FROM tenants WHERE id = ${PERF_TENANT_ID}`
  })
  console.log(
    `  perf tenant removed (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  )
}

async function seed({ scale, asOf }) {
  const started = Date.now()
  // The same rows must also land in the same pages, or the same data plans
  // differently and `regress` reads a different number: so the generator
  // writes into fresh, empty files, with no autovacuum freeing space under
  // it at moments that vary run to run.
  await sql`ALTER SYSTEM SET autovacuum = off`
  await sql`SELECT pg_reload_conf()`
  try {
    await build({ scale, asOf, started })
  } finally {
    await sql`ALTER SYSTEM RESET autovacuum`
    await sql`SELECT pg_reload_conf()`
  }
}

async function build({ scale, asOf, started }) {
  await drop()
  const [{ others }] = await sql`SELECT count(*)::int AS others FROM tenants`
  if (others === 0) await sql`VACUUM FULL`
  else
    console.log(
      `  ${others} other tenant(s) in this database — not compacting, so budgets may not reproduce`,
    )
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
    await sql.begin((tx) =>
      tx.unsafe(readFileSync(`${SQL_DIR}${step}`, "utf8")),
    )
    console.log(`  ${step.padEnd(28)} ${((Date.now() - t) / 1000).toFixed(1)}s`)
  }

  const t = Date.now()
  const sealed = await sealEncryptedColumns(sql, PERF_TENANT_ID)
  console.log(
    `  ${"sealed columns".padEnd(28)} ${((Date.now() - t) / 1000).toFixed(1)}s  (${sealed} values)`,
  )

  await sql`ANALYZE`
  await sql`VACUUM` // the visibility map, which decides index-only scans
  const seconds = (Date.now() - started) / 1000
  await sql`UPDATE _perf.params SET seeded_at = now(), seconds = ${seconds}`
  console.log(
    `  perf tenant built at scale ${scale}, as of ${asOf}, in ${seconds.toFixed(0)}s`,
  )
  await status()
}

/**
 * Facts a correct build must satisfy that no constraint enforces — each a
 * query counting violations, which must be zero. The per-row arithmetic
 * (invoice total = subtotal + tax, …) is already a CHECK on insert.
 */
const INVARIANTS = [
  [
    "each employee's latest pay record equals the base_amount_pvt cache",
    `
    SELECT count(*) FROM employees e
     WHERE e.tenant_id = $1
       AND NOT EXISTS (
             SELECT 1 FROM compensation_base c
              WHERE c.employee_id = e.id AND c.amount = e.base_amount_pvt
                AND NOT EXISTS (SELECT 1 FROM compensation_base n
                                 WHERE n.employee_id = e.id AND n.effective_from > c.effective_from))`,
  ],
  [
    "an objective's rollup matches its linked projects",
    `
    SELECT count(*) FROM pm_objectives o
      LEFT JOIN (SELECT objective_id, coalesce(sum(total_billed), 0) AS revenue FROM projects
                  WHERE archived_at IS NULL GROUP BY 1) p ON p.objective_id = o.id
     WHERE o.tenant_id = $1 AND o.actual_revenue <> coalesce(p.revenue, 0)`,
  ],
  [
    "every journal entry balances, natively and in base",
    `
    SELECT count(*) FROM (
      SELECT entry_id FROM journal_entry_lines WHERE tenant_id = $1 GROUP BY entry_id
      HAVING sum(debit_amount) <> sum(credit_amount)
          OR sum(base_debit_amount) <> sum(base_credit_amount)) x`,
  ],
  [
    "gl_daily_balances equals the posted lines, per account, day and tax rate",
    `
    WITH truth AS (
      SELECT l.account_id, je.entry_date AS d, l.tax_rate_id,
             coalesce(sum(l.base_debit_amount), 0) dr, coalesce(sum(l.base_credit_amount), 0) cr,
             coalesce(sum(l.debit_amount), 0) ndr, coalesce(sum(l.credit_amount), 0) ncr,
             count(*) n
        FROM journal_entry_lines l
        JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
       WHERE je.tenant_id = $1
       GROUP BY 1, 2, 3)
    SELECT count(*) FROM truth t
      FULL JOIN (SELECT * FROM gl_daily_balances WHERE tenant_id = $1) b
        ON b.account_id = t.account_id AND b.balance_date = t.d
       AND b.tax_rate_id IS NOT DISTINCT FROM t.tax_rate_id
     WHERE t.n IS NULL OR b.line_count IS NULL
        OR t.dr <> b.base_debit OR t.cr <> b.base_credit
        OR t.ndr <> b.debit OR t.ncr <> b.credit OR t.n <> b.line_count`,
  ],
  [
    "every invoice's subtotal and tax equal its lines",
    `
    SELECT count(*) FROM invoices i
      JOIN (SELECT invoice_id, sum(amount) a, sum(tax_amount) t FROM invoice_lines GROUP BY 1) l
        ON l.invoice_id = i.id
     WHERE i.tenant_id = $1 AND (i.subtotal <> l.a OR i.tax_total <> l.t)`,
  ],
  [
    "every invoice has at least one line",
    `
    SELECT count(*) FROM invoices i WHERE i.tenant_id = $1
       AND NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id = i.id)`,
  ],
  [
    "every bill's subtotal equals its lines",
    `
    SELECT count(*) FROM bills b
      JOIN (SELECT bill_id, sum(amount) a FROM bill_lines GROUP BY 1) l ON l.bill_id = b.id
     WHERE b.tenant_id = $1 AND b.subtotal <> l.a`,
  ],
  [
    "what an invoice says was paid equals its allocations",
    `
    SELECT count(*) FROM invoices i
      LEFT JOIN (SELECT invoice_id, sum(amount) a FROM payment_allocations GROUP BY 1) p
        ON p.invoice_id = i.id
     WHERE i.tenant_id = $1 AND i.amount_paid <> coalesce(p.a, 0)`,
  ],
  [
    "every issued invoice, approved bill and payment has its journal entry",
    `
    SELECT (SELECT count(*) FROM invoices WHERE tenant_id = $1
               AND status NOT IN ('draft','void') AND journal_entry_id IS NULL)
         + (SELECT count(*) FROM bills WHERE tenant_id = $1
               AND status <> 'draft' AND journal_entry_id IS NULL)
         + (SELECT count(*) FROM payments WHERE tenant_id = $1 AND journal_entry_id IS NULL)`,
  ],
  [
    "task and timesheet counters agree with their rows (L58)",
    `
    SELECT (SELECT count(*) FROM projects p WHERE p.tenant_id = $1 AND p.task_count <>
              (SELECT count(*) FROM tasks t WHERE t.project_id = p.id))
         + (SELECT count(*) FROM time_tracking_timesheets s WHERE s.tenant_id = $1 AND s.entry_count <>
              (SELECT count(*) FROM time_tracking_entries e WHERE e.timesheet_id = s.id))`,
  ],
  [
    "time entries point at a task of their own project",
    `
    SELECT count(*) FROM time_tracking_entries e LEFT JOIN tasks t ON t.id = e.task_id
     WHERE e.tenant_id = $1 AND (t.id IS NULL OR t.project_id <> e.project_id)`,
  ],
  [
    "each business area's counter matches its tickets",
    `
    SELECT count(*) FROM ticketing_business_areas b WHERE b.tenant_id = $1
       AND b.current_sequence <> (SELECT count(*) FROM ticketing_tickets t
                                   WHERE t.business_area_id = b.id)`,
  ],
  [
    "leave balances: used and pending equal the requests, and the formula holds",
    `
    SELECT count(*) FROM hr_time_off_balances b
      JOIN hr_time_off_policies p ON p.id = b.policy_id
     WHERE b.tenant_id = $1 AND (
       b.used <> coalesce((SELECT sum(r.total_hours) / 8 FROM hr_time_off_requests r
                            WHERE r.employee_id = b.employee_id AND r.policy_code = p.policy_code
                              AND r.status = 'approved' AND extract(year FROM r.start_date) = b.accrual_year), 0)
       OR b.pending <> coalesce((SELECT sum(r.total_hours) / 8 FROM hr_time_off_requests r
                            WHERE r.employee_id = b.employee_id AND r.policy_code = p.policy_code
                              AND r.status = 'pending' AND extract(year FROM r.start_date) = b.accrual_year), 0)
       OR b.current_balance <> b.opening_balance + b.accrued + b.adjusted - b.used - b.pending - b.forfeited)`,
  ],
  [
    "nobody is clocked in on a day of approved leave",
    `
    SELECT count(*) FROM hr_attendance a
      JOIN hr_time_off_requests r ON r.employee_id = a.employee_id AND r.status = 'approved'
       AND a.attendance_date BETWEEN r.start_date AND r.end_date
     WHERE a.tenant_id = $1`,
  ],
  [
    "payroll run totals equal their lines",
    `
    SELECT count(*) FROM payroll_runs p
      JOIN (SELECT payroll_run_id, count(*) n, sum(gross_pay) g, sum(net_pay) net
              FROM payroll_run_employees GROUP BY 1) l ON l.payroll_run_id = p.id
     WHERE p.tenant_id = $1 AND (p.employee_count <> l.n OR p.total_gross_pay <> l.g OR p.total_net_pay <> l.net)`,
  ],
  [
    "money in payroll JSONB is a string, never a JSON number (L41)",
    `
    SELECT count(*) FROM payroll_run_employees r
     CROSS JOIN LATERAL (SELECT value FROM jsonb_each(r.earnings) UNION ALL
                         SELECT value FROM jsonb_each(r.taxes)) v
     WHERE r.tenant_id = $1 AND jsonb_typeof(v.value) <> 'string'`,
  ],
  [
    "each statement import's counts equal the lines it owns",
    `
    SELECT count(*) FROM bank_statement_imports i
     WHERE i.tenant_id = $1
       AND i.transactions_imported <> (SELECT count(*) FROM bank_transactions t WHERE t.import_id = i.id)`,
  ],
  [
    "a chat's member_ids equal its current members",
    `
    SELECT count(*) FROM team_chat_conversations c
     WHERE c.tenant_id = $1
       AND (SELECT coalesce(array_agg(employee_id ORDER BY employee_id), '{}') FROM team_chat_members m
             WHERE m.conversation_id = c.id AND m.left_at IS NULL)
           <> (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(c.member_ids) x)`,
  ],
  [
    "audit changes hold strings only",
    `
    SELECT count(*) FROM audit_log a
     CROSS JOIN LATERAL jsonb_each(a.changes) c
     CROSS JOIN LATERAL jsonb_each(c.value) v
     WHERE a.tenant_id = $1 AND jsonb_typeof(v.value) <> 'string'`,
  ],
  [
    "nothing is dated after as_of",
    `
    SELECT (SELECT count(*) FROM invoices WHERE tenant_id = $1 AND invoice_date > (SELECT as_of FROM _perf.params))
         + (SELECT count(*) FROM time_tracking_entries WHERE tenant_id = $1 AND entry_date > (SELECT as_of FROM _perf.params))
         + (SELECT count(*) FROM crm_activities WHERE tenant_id = $1 AND occurred_at::date > (SELECT as_of FROM _perf.params))`,
  ],
]

/** Every check, then the sealed sample; exits non-zero on the first failure. */
async function verify() {
  let failed = 0
  for (const [name, query] of INVARIANTS) {
    const [row] = await sql.unsafe(query, [PERF_TENANT_ID])
    const n = Number(Object.values(row)[0])
    console.log(
      `  ${n === 0 ? "✓" : "✗"} ${name}${n === 0 ? "" : ` — ${n} violation(s)`}`,
    )
    if (n !== 0) failed++
  }
  const opened = await verifySealed(sql, PERF_TENANT_ID)
  console.log(
    `  ✓ sealed values open with the app's own key handling (${opened} checked)`,
  )
  if (failed) throw new Error(`${failed} invariant(s) failed`)
}

async function status() {
  const [params] = await sql`
    SELECT to_regclass('_perf.params') IS NOT NULL AS ok`
  if (!params.ok) return console.log("  no perf tenant has been built here")
  const [p] =
    await sql`SELECT scale::text, as_of::text, seeded_at, seconds::text FROM _perf.params`
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
    const note =
      want === null ? "" : `  (model ${want.toLocaleString("en-US")})`
    console.log(
      `  ${table.padEnd(34)} ${n.toLocaleString("en-US").padStart(10)}${note}`,
    )
  }
  console.log(
    `  ${"total".padEnd(34)} ${total.toLocaleString("en-US").padStart(10)}`,
  )

  // An empty table renders an empty page, and an empty page is unmeasured.
  const counted = new Map(rows)
  const empty = scaleSensitiveTables().filter((t) => !counted.get(t))
  console.log(
    empty.length === 0
      ? "  every SCALE_SENSITIVE table has rows"
      : `  SCALE_SENSITIVE tables with no rows (${empty.length}): ${empty.join(", ")}`,
  )
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    scale: { type: "string", default: "1" },
    "as-of": { type: "string" },
    repeats: { type: "string", default: "3" },
    actors: { type: "string" },
    top: { type: "string", default: "25" },
    max: { type: "string", default: "100" },
    update: { type: "boolean", default: false },
  },
})

// The commands that rewrite the tenant wait for any perf run, and make one wait.
const release = ["seed", "drop"].includes(positionals[0])
  ? await holdPerfLock(
      DB_URL,
      "the perf cluster is not running — `pnpm db:perf:cluster up`",
    )
  : null

try {
  switch (positionals[0]) {
    case "seed": {
      const scale = Number(values.scale)
      if (!(scale > 0 && scale <= 5))
        throw new Error("--scale must be in (0, 5]")
      // By default the data budgets.tsv was measured on, so `regress` can compare.
      const budget = existsSync(BUDGETS) ? readFileSync(BUDGETS, "utf8") : ""
      const asOf =
        values["as-of"] ??
        budget.match(/as_of=(\S+)/)?.[1] ??
        new Date().toISOString().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf))
        throw new Error("--as-of must be YYYY-MM-DD")
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
    case "measure": {
      const { measure } = await import("./measure.mjs") // Playwright, only when measuring
      await measure({
        perfUrl: DB_URL,
        tenantId: PERF_TENANT_ID,
        repeats: Number(values.repeats),
        only: values.actors?.split(","),
        top: Number(values.top),
      })
      break
    }
    case "rows": {
      const { rows } = await import("./measure.mjs")
      await rows({
        perfUrl: DB_URL,
        tenantId: PERF_TENANT_ID,
        only: values.actors?.split(","),
        max: Number(values.max),
      })
      break
    }
    case "regress": {
      const { regress } = await import("./measure.mjs")
      await regress({
        perfUrl: DB_URL,
        tenantId: PERF_TENANT_ID,
        update: values.update,
      })
      break
    }
    default:
      console.error(
        "usage: perf-tenant.mjs seed [--scale=1] [--as-of=YYYY-MM-DD] | status | verify | drop | measure [--repeats=3] [--actors=a,b] [--top=25] | rows [--max=100] [--actors=a,b] | regress [--update]",
      )
      process.exitCode = 2
  }
} catch (e) {
  console.error(`  ${e.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
  await release?.()
}

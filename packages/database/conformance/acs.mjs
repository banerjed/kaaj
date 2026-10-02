#!/usr/bin/env node
/**
 * The accounting conformance suite (docs/34-accounting-conformance-spec-V1.md).
 *
 *   pnpm db:acs seed            load ACS_GOLDEN_SEED_V1 into the conformance database
 *   pnpm db:acs run [ids...]    run every scenario, or the named ones (GL-001 AR-*); --nightly adds gate-B ones
 *   pnpm db:acs verify          run every invariant against the current state
 *   pnpm db:acs report          print the certification output from the last run
 *   pnpm db:acs audit           regenerate the per-scenario audit table in the spec (section 31)
 *   pnpm db:acs migrate <ref>   section 23: E2E on the migrations at <ref>, migrate to HEAD, compare
 *   pnpm db:acs drop            remove the tenant and the ACS exchange rates
 *
 * `seed` drops any previous conformance tenant first, so it is always the
 * same clean state. The runner itself is a vitest file in apps/web
 * (src/lib/server/accounting/conformance/), because the engine imports
 * `$env` and `$lib`, which only the app's own vite config resolves; `run`
 * starts it with APP_DATABASE_URL pointed at this cluster.
 *
 * Local only: the database URL must point at 127.0.0.1 on the conformance
 * port, never the shared Supabase database and never anything remote.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import postgres from "postgres"
import { parse as parseYaml } from "yaml"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

const PORT = process.env.KAAJ_ACS_PORT ?? "54350"
const DB = process.env.KAAJ_ACS_DB ?? "kaaj_acs"
const OWNER_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}`
const ROOT = new URL("../../../", import.meta.url).pathname
const HERE = new URL("./", import.meta.url).pathname
const SEED_DIR = `${HERE}seed/`
const RESULTS = `${HERE}results/last-run.json`

if (!/@127\.0\.0\.1:\d+\//.test(OWNER_URL)) {
  console.error("  the conformance database URL is not local — refusing to run.")
  process.exit(1)
}

const sql = postgres(OWNER_URL, { types: {}, onnotice: () => {}, max: 1 })

async function tenantId() {
  const [row] = await sql`SELECT _acs.tenant() AS id`.catch(() => [])
  return row?.id ?? null
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
  const id = await tenantId()
  if (!id) return
  const tables = await tenantTables()
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = replica`
    for (const { table_name } of tables) {
      await tx.unsafe(`DELETE FROM public."${table_name}" WHERE tenant_id = $1`, [id])
    }
    await tx`DELETE FROM tenants WHERE id = ${id}`
    await tx`DELETE FROM chart_of_accounts WHERE tenant_id = _acs.u('tenant', 2)`
    await tx`DELETE FROM tenants WHERE id = _acs.u('tenant', 2)`
    await tx`DELETE FROM exchange_rates WHERE source IN ('ACS', 'ACS-FIXTURE')`
  })
  console.log("  conformance tenant removed")
}

async function seed() {
  const started = Date.now()
  await sql.unsafe(readFileSync(`${SEED_DIR}00_helpers.sql`, "utf8"))
  await drop()
  const steps = readdirSync(SEED_DIR)
    .filter((f) => /^\d\d_.+\.sql$/.test(f) && f !== "00_helpers.sql")
    .sort()
  for (const step of steps) {
    await sql.begin((tx) => tx.unsafe(readFileSync(`${SEED_DIR}${step}`, "utf8")))
    console.log(`  ${step}`)
  }
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM chart_of_accounts WHERE tenant_id = _acs.tenant()`
  console.log(`  ACS_GOLDEN_SEED_V1 loaded: ${n} accounts (${((Date.now() - started) / 1000).toFixed(1)}s)`)
}

function run(args) {
  const nightly = args.includes("--nightly")
  const ids = args.filter((a) => a !== "--nightly")
  const env = {
    ...process.env,
    ACS_GATE: nightly ? "nightly" : "pr",
    APP_DATABASE_URL: OWNER_URL,
    DATABASE_URL: OWNER_URL,
    ACS_SCENARIOS: ids.join(","),
    ACS_RESULTS: RESULTS,
  }
  const r = spawnSync(
    "pnpm",
    ["--filter", "@kaaj/web", "exec", "vitest", "run", "--config", "vitest.acs.config.ts"],
    { cwd: ROOT, env, stdio: "inherit" },
  )
  return r.status ?? 1
}

async function verify() {
  const id = await tenantId()
  if (!id) {
    console.error("  no conformance tenant; run `pnpm db:acs seed` first")
    return 1
  }
  const caps = JSON.parse(readFileSync(`${HERE}capabilities.json`, "utf8"))
  const files = readdirSync(`${HERE}invariants/`).filter((f) => f.endsWith(".sql")).sort()
  let failed = 0
  for (const f of files) {
    const inv = f.replace(/\.sql$/, "")
    if (caps.invariants?.[inv]) {
      console.log(`  ${inv.padEnd(14)} NOT_IMPLEMENTED  ${caps.invariants[inv].reason}`)
      continue
    }
    const rows = await sql.unsafe(readFileSync(`${HERE}invariants/${f}`, "utf8"), [id])
    if (rows.length === 0) console.log(`  ${inv.padEnd(14)} holds`)
    else {
      failed += 1
      console.log(`  ${inv.padEnd(14)} FAILS  ${JSON.stringify(rows.slice(0, 3))}`)
    }
  }
  return failed === 0 ? 0 : 1
}

function report() {
  if (!existsSync(RESULTS)) {
    console.error("  no results; run `pnpm db:acs run` first")
    return 1
  }
  const r = JSON.parse(readFileSync(RESULTS, "utf8"))
  const by = (s) => r.scenarios.filter((x) => x.result === s).length
  const pass = by("PASS"), fail = by("FAIL"), ni = by("NOT_IMPLEMENTED"), err = by("ERROR")
  const verdict = fail + err === 0 ? "PASS" : "FAIL"
  const notImpl = r.scenarios.filter((x) => x.result === "NOT_IMPLEMENTED").map((x) => x.id)
  const line = (s) => `| ${s.padEnd(52)} |`
  console.log("+" + "-".repeat(54) + "+")
  console.log(line(`ACCOUNTING CONFORMANCE: ${verdict}`))
  console.log(line(""))
  console.log(line(`Profile:    ${r.profile}`))
  console.log(line(`Seed:       ACS_GOLDEN_SEED_V1`))
  console.log(line(`Build:      ${r.build}`))
  console.log(line(`Run:        ${r.startedAt}`))
  console.log(line(""))
  console.log(line(`Deterministic scenarios: ${String(pass).padStart(4)} PASS ${String(fail).padStart(3)} FAIL ${String(err).padStart(3)} ERROR`))
  console.log(line(`                         ${String(ni).padStart(4)} NOT_IMPLEMENTED`))
  console.log(line(`Invariants:              ${r.invariants.checked} checked, ${r.invariants.notImplemented} NOT_IMPL`))
  console.log(line(""))
  const chunks = []
  let cur = "Not implemented:"
  for (const id of notImpl) {
    if ((cur + " " + id).length > 50) { chunks.push(cur); cur = "  " + id }
    else cur += " " + id
  }
  chunks.push(cur)
  for (const c of chunks) console.log(line(c))
  console.log("+" + "-".repeat(54) + "+")
  for (const s of r.scenarios.filter((x) => x.result === "FAIL" || x.result === "ERROR")) {
    console.log(`\n${s.id}  ${s.result}`)
    for (const p of s.problems ?? []) console.log(`  - ${p}`)
  }
  return verdict === "PASS" ? 0 : 1
}


// ---------------------------------------------------------------------------
// audit: every scenario ID the spec's catalog names, with its state. The table
// is written into the spec between two markers, so the catalog and its
// implementation are read in one document. The engine functions come from
// the ops a fixture uses; the mapping mirrors ops.ts.
// ---------------------------------------------------------------------------
const SPEC = `${ROOT}docs/34-accounting-conformance-spec-V1.md`
const AUDIT_BEGIN = "<!-- audit:begin -->"
const AUDIT_END = "<!-- audit:end -->"

const OP_FUNCTIONS = {
  "journal.post": "recordManualJournalEntry",
  "journal.attempt_update": "UPDATE journal_entry_lines / journal_entries as app_user",
  "journal.attempt_delete": "DELETE journal_entries as app_user",
  "bank.transfer": "recordManualJournalEntry",
  "bank.fee": "recordManualJournalEntry",
  "bank.interest": "recordManualJournalEntry",
  "bank.opening_balance": "recordManualJournalEntry",
  "invoice.create": "createInvoice",
  "invoice.post": "issueInvoice",
  "invoice.void": "voidInvoice",
  "invoice.credit": "recordCreditMemo",
  "invoice.write_off": "recordWriteOff",
  "invoice.issue_new": "createInvoice, issueInvoice",
  "bill.create_and_approve": "createBill, approveBill",
  "payment.receive": "recordPayment",
  "payment.receive_batch": "recordLockboxPayment",
  "bill.create": "createBill",
  "bill.approve": "approveBill",
  "bill.pay": "recordVendorPayment",
  "period.close": "closePeriod",
  "period.reopen": "reopenPeriod",
  "year.close": "yearEndClose",
  "accrual.create": "recordAccrual",
  "amortization.create": "createAmortizationSchedule",
  "amortization.post_due": "postDueAmortizations",
  "ledger.sequence": "SELECT entry_number FROM journal_entries",
  "ledger.balance_type": "SELECT sum(...) FROM journal_entry_lines (type check)",
  "bank.import": "importStatement",
  "bank.match": "matchBankTransaction",
  "bill.pay_batch": "payBillsInBatch",
  "tax.create_rate": "createTaxRate",
  "fx.set_rate": "INSERT exchange_rates as owner",
  "report.trial_balance": "trialBalance, trialBalanceTotals",
  "report.trial_balance_comparison": "trialBalanceComparison",
  "report.balance_sheet": "balanceSheet, balanceSheetTotals",
  "report.income_statement": "profitAndLoss, profitAndLossTotals",
  "report.income_statement_comparison": "profitAndLossComparison",
  "report.ar_aging": "arAging",
  "report.tax_liability": "taxLiabilitySummary",
  "report.customer_statement": "customerBalances",
  "report.cash_flow": "cashFlowTotals",
  "report.control_tie_out": "controlAccountTieOut",
  "report.drill_down": "ledger, ledgerLines",
}

/** Ops a fixture may carry outside `actions` (metamorphic sequences, concurrent lanes). */
function fixtureOps(f) {
  const ops = new Set()
  for (const a of f.actions ?? []) ops.add(a.op)
  for (const seq of Object.values(f.sequences ?? {})) for (const a of seq) ops.add(a.op)
  for (const lane of f.concurrent ?? []) for (const a of lane.actions ?? []) ops.add(a.op)
  if (f.sql) ops.add(`sql:${f.sql}`)
  if (f.procedure) ops.add(`procedure:${f.procedure}`)
  return [...ops]
}

function catalogIds(spec) {
  const start = spec.indexOf("\n## 10. ")
  const end = spec.indexOf("\n## 24. ")
  const body = spec.slice(start, end)
  const order = ["GL", "AR", "AP", "BANK", "TAX", "FX", "INV", "ACC", "DEF", "FA", "CLOSE", "META", "RPT", "CON", "FAIL", "AUD", "NUM", "DB", "E2E", "MIG"]
  const ids = new Set()
  for (const m of body.matchAll(/(?<![A-Z0-9-])([A-Z0-9]{2,5})-((?:GLD-)?\d{3})(?![\d-])/g)) {
    if (order.includes(m[1])) ids.add(`${m[1]}-${m[2]}`)
  }
  return [...ids].sort((a, b) => {
    const [pa, pb] = [a.split("-")[0], b.split("-")[0]]
    const d = order.indexOf(pa) - order.indexOf(pb)
    return d !== 0 ? d : a.localeCompare(b)
  })
}

function fixtureIndex() {
  const out = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = `${dir}/${name}`
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.ya?ml$/.test(name)) {
        const doc = parseYaml(readFileSync(p, "utf8"))
        out.set(doc.id, { ...doc, file: p.slice(HERE.length) })
      }
    }
  }
  walk(`${HERE}scenarios`)
  return out
}

function audit() {
  const spec = readFileSync(SPEC, "utf8")
  const begin = spec.indexOf(AUDIT_BEGIN)
  const end = spec.indexOf(AUDIT_END)
  if (begin < 0 || end < 0) {
    console.error(`  ${SPEC} has no ${AUDIT_BEGIN} / ${AUDIT_END} markers`)
    return 1
  }
  const caps = JSON.parse(readFileSync(`${HERE}capabilities.json`, "utf8"))
  const fixtures = fixtureIndex()
  const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : null
  const byId = new Map((results?.scenarios ?? []).map((r) => [r.id, r]))
  const ids = catalogIds(spec)
  for (const id of fixtures.keys()) if (!ids.includes(id)) ids.push(id)

  const counts = {}
  const rows = []
  for (const id of ids) {
    const module = id.split("-")[0]
    const f = fixtures.get(id)
    const r = byId.get(id)
    let status, note = "", functions = "—"
    const modCap = caps.modules[module]
    if (modCap?.status === "not_implemented") {
      status = "NOT_IMPLEMENTED"
      note = modCap.reason
    } else if (caps.scenarios[id]) {
      status = "NOT_IMPLEMENTED"
      note = caps.scenarios[id].reason
    } else if (!f) {
      status = "NO_FIXTURE"
      note = "Fixture not written yet."
    } else if (!r) {
      status = "NOT_RUN"
      note = f.gate === "nightly" ? "Nightly gate; not in a pull-request run." : "Not in the last run."
    } else {
      if (r.result === "NOT_RUN") note = r.problems[0] ?? ""
      status = r.result
      if (r.result === "FAIL") note = (r.problems[0] ?? "").replace(/\|/g, "\\|")
      if (r.result === "ERROR") note = (r.problems[0] ?? "").slice(0, 160).replace(/\|/g, "\\|")
    }
    if (f) {
      const ops = fixtureOps(f)
      functions = [...new Set(ops.map((o) => OP_FUNCTIONS[o] ?? (o.startsWith("sql:") ? `\`${o.slice(4)}\` as owner` : o.startsWith("procedure:") ? `acs.mjs migrate` : `?${o}`)))].join(", ")
    }
    const c = (counts[module] ??= { total: 0, PASS: 0, FAIL: 0, NOT_IMPLEMENTED: 0, NO_FIXTURE: 0, NOT_RUN: 0, ERROR: 0 })
    c.total += 1
    c[status] += 1
    rows.push({ id, module, status, functions, note, title: f?.title ?? "", file: f?.file ?? "" })
  }

  const lines = []
  lines.push(AUDIT_BEGIN)
  lines.push("")
  lines.push(`Generated by \`pnpm db:acs audit\` on ${new Date().toISOString().slice(0, 10)} from the catalog above, \`capabilities.json\`, the fixtures in \`packages/database/conformance/scenarios/\` and the last run (\`results/last-run.json\`${results ? `, build ${results.build}, ${results.startedAt}` : ", none"}). Do not edit by hand; rerun the command.`)
  lines.push("")
  lines.push("Status values: `PASS` and `FAIL` are the last run's result. `NOT_IMPLEMENTED` is a register entry with its reason. `NO_FIXTURE` is a catalog scenario whose fixture does not exist yet. `NOT_RUN` has a fixture the last run did not include.")
  lines.push("")
  lines.push("### 31.1 Totals per module")
  lines.push("")
  lines.push("| Module | Scenarios | PASS | FAIL | NOT_IMPLEMENTED | NO_FIXTURE | NOT_RUN |")
  lines.push("|---|---:|---:|---:|---:|---:|---:|")
  const sum = { total: 0, PASS: 0, FAIL: 0, NOT_IMPLEMENTED: 0, NO_FIXTURE: 0, NOT_RUN: 0 }
  for (const [m, c] of Object.entries(counts)) {
    lines.push(`| ${m} | ${c.total} | ${c.PASS} | ${c.FAIL} | ${c.NOT_IMPLEMENTED} | ${c.NO_FIXTURE} | ${c.NOT_RUN} |`)
    for (const k of Object.keys(sum)) sum[k] += c[k]
  }
  lines.push(`| **Total** | **${sum.total}** | **${sum.PASS}** | **${sum.FAIL}** | **${sum.NOT_IMPLEMENTED}** | **${sum.NO_FIXTURE}** | **${sum.NOT_RUN}** |`)
  lines.push("")
  lines.push("### 31.2 Every scenario")
  lines.push("")
  lines.push("| ID | Status | Fixture | Engine functions the fixture calls | Note |")
  lines.push("|---|---|---|---|---|")
  for (const r of rows) {
    const fix = r.file ? `\`${r.file}\`` : "—"
    lines.push(`| \`${r.id}\` | ${r.status} | ${fix} | ${r.functions} | ${r.note} |`)
  }
  lines.push("")
  lines.push(AUDIT_END)
  const out = spec.slice(0, begin) + lines.join("\n") + spec.slice(end + AUDIT_END.length)
  writeFileSync(SPEC, out)
  console.log(`  audit written: ${sum.total} scenarios — ${sum.PASS} PASS, ${sum.FAIL} FAIL, ${sum.NOT_IMPLEMENTED} NOT_IMPLEMENTED, ${sum.NO_FIXTURE} NO_FIXTURE, ${sum.NOT_RUN} NOT_RUN`)
  return 0
}


// ---------------------------------------------------------------------------
// migrate <ref>: spec section 23. A second database, kaaj_acs_mig, built from
// the migrations present at <ref>, seeded, run through E2E-GLD-001 with
// commits; its financial state recorded; the migrations HEAD adds applied; the
// state recorded again and compared. Each MIG-* step's result lands in
// results/migration.json, which the runner reports.
// ---------------------------------------------------------------------------
const MIG_DB = `${DB}_mig`
const MIG_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/${MIG_DB}`
const MIG_RESULTS = `${HERE}results/migration.json`

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
}

async function migrationState(m) {
  const [t] = await m`SELECT _acs.tenant() AS id`
  const tid = t.id
  const tb = await m`
    SELECT c.account_code, (coalesce(sum(l.base_debit_amount),0) - coalesce(sum(l.base_credit_amount),0))::text AS balance
      FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.entry_id
      JOIN chart_of_accounts c ON c.id = l.account_id
     WHERE je.tenant_id = ${tid} AND je.status = 'posted' GROUP BY c.account_code ORDER BY 1`
  const docs = await m`
    SELECT 'invoice' AS kind, invoice_number AS number, status, amount_due::text AS due FROM invoices WHERE tenant_id = ${tid}
    UNION ALL SELECT 'bill', bill_number, status, amount_due::text FROM bills WHERE tenant_id = ${tid}
    ORDER BY 1, 2`
  const [arap] = await m`
    SELECT (SELECT coalesce(sum(base_amount_due),0)::text FROM invoices WHERE tenant_id = ${tid} AND status NOT IN ('draft','void')) AS ar,
           (SELECT coalesce(sum(base_amount_due),0)::text FROM bills WHERE tenant_id = ${tid} AND status NOT IN ('draft','void')) AS ap`
  const lines = await m`
    SELECT je.entry_number, l.line_number, c.account_code, l.base_debit_amount::text AS d, l.base_credit_amount::text AS c
      FROM journal_entries je JOIN journal_entry_lines l ON l.entry_id = je.id JOIN chart_of_accounts c ON c.id = l.account_id
     WHERE je.tenant_id = ${tid} ORDER BY 1, 2`
  const [audit] = await m`SELECT count(*)::int AS n, coalesce(md5(string_agg(id::text, ',' ORDER BY id)), '') AS h FROM audit_log WHERE tenant_id = ${tid}`
  const hash = (rows) => createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)
  return {
    trialBalance: tb, documents: docs, ar: arap.ar, ap: arap.ap,
    ledgerHash: hash(lines), ledgerLines: lines.length, audit: { count: audit.n, hash: audit.h },
  }
}

async function migrate(ref) {
  if (!ref) {
    console.error("  usage: pnpm db:acs migrate <git ref of the previous release>")
    return 2
  }
  const steps = {}
  const note = (id, result, text) => { steps[id] = { result, note: text } }
  const atRef = git("ls-tree", "--name-only", `${ref}:supabase/migrations`).split("\n").filter(Boolean).sort()
  const atHead = readdirSync(`${ROOT}supabase/migrations`).filter((f) => f.endsWith(".sql")).sort()
  const added = atHead.filter((f) => !atRef.includes(f))
  const removed = atRef.filter((f) => !atHead.includes(f))
  if (removed.length > 0) {
    note("MIG-001", "FAIL", `migrations present at ${ref} are absent from HEAD: ${removed.join(", ")} (migrations are forward-only)`)
  }
  // MIG-001: a database at the previous migration set
  await sql.unsafe(`DROP DATABASE IF EXISTS "${MIG_DB}" WITH (FORCE)`)
  await sql.unsafe(`CREATE DATABASE "${MIG_DB}"`)
  const m = postgres(MIG_URL, { types: {}, onnotice: () => {}, max: 1 })
  try {
    await m.unsafe(readFileSync(`${ROOT}scripts/vanilla-postgres-stubs.sql`, "utf8"))
    for (const f of atRef) await m.unsafe(git("show", `${ref}:supabase/migrations/${f}`))
    await m.unsafe("ALTER ROLE app_user WITH PASSWORD 'app_user'")
    steps["MIG-001"] ??= { result: "PASS", note: `${atRef.length} migrations at ${ref}` }
    // MIG-002: seed and run E2E with commits
    const seedFiles = readdirSync(SEED_DIR).filter((f) => /^\d\d_.+\.sql$/.test(f)).sort()
    for (const f of seedFiles) await m.unsafe(readFileSync(`${SEED_DIR}${f}`, "utf8"))
    const r = spawnSync("pnpm", ["--filter", "@kaaj/web", "exec", "vitest", "run", "--config", "vitest.acs.config.ts"], {
      cwd: ROOT, stdio: "inherit",
      env: { ...process.env, APP_DATABASE_URL: MIG_URL, DATABASE_URL: MIG_URL, ACS_SCENARIOS: "E2E-GLD-001", ACS_KEEP: "1", ACS_RESULTS: `${HERE}results/migration-e2e.json` },
    })
    note("MIG-002", r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "E2E-GLD-001 ran at the previous migration set" : "E2E-GLD-001 failed at the previous migration set; see results/migration-e2e.json")
    // MIG-003: record
    const before = await migrationState(m)
    note("MIG-003", "PASS", `${before.trialBalance.length} balances, ${before.ledgerLines} ledger lines recorded`)
    // MIG-004: apply what HEAD adds
    for (const f of added) await m.unsafe(readFileSync(`${ROOT}supabase/migrations/${f}`, "utf8"))
    note("MIG-004", "PASS", added.length === 0 ? `no migration added since ${ref}` : `applied ${added.join(", ")}`)
    // MIG-005..010: rerun and compare
    const after = await migrationState(m)
    note("MIG-005", "PASS", "reports re-read after migration")
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    note("MIG-006", same(before.trialBalance, after.trialBalance) ? "PASS" : "FAIL", same(before.trialBalance, after.trialBalance) ? "every balance equal, cent for cent" : "a balance changed across the migration")
    note("MIG-007", same(before.documents, after.documents) ? "PASS" : "FAIL", "document statuses and amounts due")
    note("MIG-008", before.ar === after.ar && before.ap === after.ap ? "PASS" : "FAIL", `AR ${before.ar} → ${after.ar}, AP ${before.ap} → ${after.ap}`)
    note("MIG-010", same(before.audit, after.audit) ? "PASS" : "FAIL", `audit rows ${before.audit.count} → ${after.audit.count}`)
    const ledgerSame = before.ledgerHash === after.ledgerHash
    if (!ledgerSame) note("MIG-006", "FAIL", "a stored journal line changed byte for byte across the migration")
  } finally {
    await m.end()
  }
  writeFileSync(MIG_RESULTS, JSON.stringify({ ref, head: git("rev-parse", "--short", "HEAD").trim(), ranAt: new Date().toISOString(), added, steps }, null, 2))
  for (const [id, s] of Object.entries(steps)) console.log(`  ${id}  ${s.result.padEnd(5)} ${s.note}`)
  return Object.values(steps).some((s) => s.result === "FAIL") ? 1 : 0
}

const [cmd = "run", ...rest] = process.argv.slice(2)
let code = 0
try {
  switch (cmd) {
    case "seed": await seed(); break
    case "drop": await drop(); break
    case "run": code = run(rest); break
    case "verify": code = await verify(); break
    case "report": code = report(); break
    case "audit": code = audit(); break
    case "migrate": code = await migrate(rest[0]); break
    default:
      console.error("usage: acs.mjs seed|run [ids...]|verify|report|audit|migrate <ref>|drop")
      code = 2
  }
} finally {
  await sql.end()
}
process.exit(code)

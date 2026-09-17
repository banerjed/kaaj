#!/usr/bin/env node
/**
 * Bulk-seeds a large number of synthetic rows into every SCALE_SENSITIVE
 * table (the register in `verify-query-scale.mjs`, restated here as a
 * committed literal rather than imported, since that file runs its own
 * verification as a side effect of being loaded), so a list page's real
 * behavior at scale can be observed — does it paginate, or does it try to
 * render every row that exists — without waiting for a real tenant to
 * accumulate a million rows over years of use.
 *
 * Every table is cloned from ONE existing valid row, picked deterministically
 * (`ORDER BY id LIMIT 1`), so every FK and CHECK constraint the original
 * already satisfies is satisfied by every clone too — this generates
 * realistic-shaped data instead of hand-typed rows that would need to
 * reproduce this schema's own constraints from scratch. A table with a real
 * UNIQUE constraint beyond its primary key gets that column's clone suffixed
 * `__LOADTEST__<n>`; every other column is copied verbatim.
 *
 * Cleanup does not depend on that suffix, though: every id this script
 * inserts is also recorded in `_loadtest_rows`, a bookkeeping table this
 * script owns (created on first use, never part of a migration) — `revert`
 * deletes by that id list, not by pattern-matching a column, so it is exact
 * regardless of whether a table had anything to tag.
 *
 * `audit_log` is deliberately never seeded here. This codebase's own rule is
 * that the audit trail is INSERT/SELECT only, never deleted from — seeding
 * it with synthetic rows and then deleting them, even for a load test, would
 * be the one case that breaks that guarantee.
 *
 *   node scripts/loadtest.mjs seed                       # 50,000 rows, every table
 *   node scripts/loadtest.mjs seed --count=1000000 --table=invoices
 *   node scripts/loadtest.mjs status                     # how many LOADTEST rows exist, per table
 *   node scripts/loadtest.mjs revert                      # delete every LOADTEST row, every table
 *   node scripts/loadtest.mjs revert --table=invoices
 *
 * Local dev stack only. Connects as the `postgres` superuser (like every
 * verify-*.mjs SQL harness and fx_rates.test.ts's own cleanup connection)
 * since app_user/service_role don't have blanket INSERT/DELETE on every
 * table — DATABASE_URL defaults to the local stack, and there is no
 * override here for a hosted project's URL. Never run this against
 * anything but `supabase start`'s own local database.
 */
import postgres from "postgres"

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

if (!/127\.0\.0\.1|localhost/.test(DATABASE_URL)) {
  console.error(
    "  DATABASE_URL does not look like the local stack — refusing to run.",
  )
  process.exit(1)
}

// `CREATE TABLE IF NOT EXISTS` on a table that already exists is silent at
// the SQL level but still emits a NOTICE — suppressed here, not spammed on
// every run.
const sql = postgres(DATABASE_URL, { types: {}, onnotice: () => {} })

/**
 * table -> the column a real UNIQUE constraint (beyond the primary key)
 * cares about, or null if none exists. Restates `SCALE_SENSITIVE` from
 * `verify-query-scale.mjs` minus `audit_log` (see above) — check both when
 * a table's classification changes.
 */
const TABLES = {
  // Partial unique index (tenant_id, bank_account_id, bank_transaction_id)
  // WHERE bank_transaction_id IS NOT NULL — the template row happens to
  // carry a real external id, so it needs tagging like any other unique
  // column, even though the constraint itself is conditional.
  bank_transactions: "bank_transaction_id",
  bill_lines: null,
  bills: "bill_number",
  expenses: null,
  hr_attendance: "attendance_id",
  hr_change_requests: "request_id",
  hr_employee_documents: "document_id",
  hr_feedback: "feedback_id",
  hr_goals: null,
  hr_onboarding_tasks: "task_id",
  hr_reviews: "review_id",
  hr_survey_responses: "response_id",
  hr_time_off_requests: "request_id",
  invoice_credits: "credit_number",
  invoice_lines: null,
  invoices: "invoice_number",
  jobs: null,
  journal_entries: "entry_number",
  journal_entry_lines: null,
  payment_allocations: null,
  // Partial unique index WHERE payment_number IS NOT NULL — same shape as
  // bank_transactions' external id.
  payments: "payment_number",
  pm_automation_executions: "execution_id",
  pm_task_attachments: "attachment_id",
  pm_task_comments: "comment_id",
  tasks: "task_id",
  ticketing_attachments: "attachment_id",
  ticketing_ticket_reference_links: null,
  ticketing_ticket_tasks: null,
  ticketing_tickets: "ticket_number",
  ticketing_updates: null,
  time_tracking_billable_expenses: "expense_id",
  time_tracking_entries: "entry_id",
}

async function ensureBookkeepingTable() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS _loadtest_rows (
      table_name text NOT NULL,
      row_id uuid NOT NULL,
      inserted_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (table_name, row_id)
    )
  `)
}

async function columnsFor(table) {
  const rows = await sql`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ${table}
       AND column_name NOT IN ('id', 'created_at', 'updated_at')
     ORDER BY ordinal_position
  `
  return rows.map((r) => r.column_name)
}

async function templateId(table) {
  const [row] = await sql.unsafe(
    `SELECT id FROM "${table}" ORDER BY id LIMIT 1`,
  )
  return row?.id ?? null
}

async function seedTable(table, count) {
  const tagColumn = TABLES[table]
  const cols = await columnsFor(table)
  const id = await templateId(table)
  if (!id) {
    console.log(`  ${table}: no existing row to clone from — skipped`)
    return
  }

  const selectList = cols
    .map((c) =>
      c === tagColumn ? `("${c}" || '__LOADTEST__' || g)` : `"${c}"`,
    )
    .join(", ")
  const colList = cols.map((c) => `"${c}"`).join(", ")

  const inserted = await sql.unsafe(
    `
    WITH ins AS (
      INSERT INTO "${table}" (${colList})
      SELECT ${selectList}
        FROM "${table}", generate_series(1, $1) AS g
       WHERE id = $2
      RETURNING id
    )
    INSERT INTO _loadtest_rows (table_name, row_id)
    SELECT '${table}', id FROM ins
    RETURNING row_id
    `,
    [count, id],
  )
  console.log(`  ${table}: +${inserted.length}`)
}

async function statusTable(table) {
  const [{ n }] = await sql`
    SELECT count(*)::int AS n FROM _loadtest_rows WHERE table_name = ${table}
  `
  if (n > 0) console.log(`  ${table}: ${n} LOADTEST row(s)`)
  return n
}

async function revertTable(table) {
  const [{ n }] = await sql.unsafe(
    `
    WITH gone AS (
      DELETE FROM "${table}"
       WHERE id IN (SELECT row_id FROM _loadtest_rows WHERE table_name = $1)
      RETURNING id
    )
    SELECT count(*)::int AS n FROM gone
    `,
    [table],
  )
  await sql`DELETE FROM _loadtest_rows WHERE table_name = ${table}`
  if (n > 0) console.log(`  ${table}: -${n}`)
}

const args = process.argv.slice(2)
const command = args[0]
const flags = Object.fromEntries(
  args
    .slice(1)
    .map((a) => a.match(/^--([\w-]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
)
const count = Number(flags.count ?? 50000)
const only = flags.table ? [flags.table] : Object.keys(TABLES)

for (const t of only) {
  if (!(t in TABLES)) {
    console.error(`  unknown table: ${t} (audit_log is deliberately excluded)`)
    process.exit(1)
  }
}

if (command === "seed") {
  await ensureBookkeepingTable()
  console.log(`Seeding ${count} row(s) into ${only.length} table(s)...`)
  for (const t of only) await seedTable(t, count)
} else if (command === "revert") {
  await ensureBookkeepingTable()
  console.log(`Reverting LOADTEST rows from ${only.length} table(s)...`)
  for (const t of only) await revertTable(t)
} else if (command === "status") {
  await ensureBookkeepingTable()
  let total = 0
  for (const t of only) total += await statusTable(t)
  console.log(
    total === 0 ? "  no LOADTEST rows outstanding" : `  ${total} total`,
  )
} else {
  console.error(
    "Usage: node scripts/loadtest.mjs <seed|revert|status> [--count=N] [--table=name]",
  )
  process.exit(1)
}

await sql.end()

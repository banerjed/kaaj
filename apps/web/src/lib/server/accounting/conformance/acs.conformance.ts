/**
 * The accounting conformance runner (docs/34-accounting-conformance-spec-V1.md).
 * One vitest case per fixture. Not matched by vite.config.ts's include —
 * run through `pnpm db:acs run`, which points APP_DATABASE_URL at the
 * conformance cluster and names the scenarios in ACS_SCENARIOS.
 *
 * Five shapes of fixture (spec 4.3, 11, 13, 14, 18, 19, 23):
 * - `transaction`: every action inside one transaction, rolled back at the
 *   end; each action in its own savepoint, so a refused action leaves the
 *   transaction usable, exactly as a throw inside withTenant leaves
 *   production untouched.
 * - `sequences`: each named sequence runs as a transaction scenario from the
 *   seed; their end states are compared.
 * - `database`: the seed is restored, every action commits in its own
 *   withTenant transaction, concurrent lanes run at once, an injected trigger
 *   can fail one write, and the seed is restored afterwards.
 * - `sql`: a file under db/ run as the owner; zero rows means pass.
 * - `procedure: migration`: the result acs.mjs migrate recorded.
 */
import { afterAll, describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { closeConnections, getSharedPool } from "../../db/client"
import { withTenant, type Tx } from "../../db/tenant"
import {
  CONFORMANCE_DIR,
  loadFixtures,
  validateFixture,
  type Action,
  type ExpectedLine,
  type Fixture,
  type Lane,
} from "./fixtures"
import {
  loadHandles,
  SEMANTIC_BY_CODE,
  type ActorHandle,
  type Handles,
} from "./handles"
import { OPS, refusalCode, type Ctx, type Ref } from "./ops"
import { checkInvariants, loadInvariants, type Invariant } from "./invariants"
import { cents, fromCents, looksDecimal } from "./decimal"
import { restoreSeed, tableCounts } from "./seed"

type Result = "PASS" | "FAIL" | "NOT_IMPLEMENTED" | "NOT_RUN" | "ERROR"
type ScenarioResult = {
  id: string
  module: string
  result: Result
  problems: string[]
  ms: number
}

type Capabilities = {
  modules: Record<
    string,
    { status: "implemented" | "not_implemented"; reason?: string }
  >
  scenarios: Record<string, { reason: string }>
  invariants: Record<string, { reason: string }>
}

const caps = JSON.parse(
  readFileSync(join(CONFORMANCE_DIR, "capabilities.json"), "utf8"),
) as Capabilities
const filters = (process.env.ACS_SCENARIOS ?? "")
  .split(",")
  .filter((s) => s.trim() !== "")
const fixtures = loadFixtures(filters)
const allInvariants = loadInvariants()
const invariants: Invariant[] = allInvariants.filter(
  (i) => !caps.invariants[i.id],
)
const results: ScenarioResult[] = []
const startedAt = new Date().toISOString()
const WRITE_GOLDEN = process.env.ACS_WRITE_GOLDEN === "1"
const KEEP = process.env.ACS_KEEP === "1"
const GATE = process.env.ACS_GATE === "nightly" ? "nightly" : "pr"

function notImplementedReason(f: Fixture): string | null {
  const m = caps.modules[f.module]
  if (!m) return `module ${f.module} is not in capabilities.json`
  if (m.status === "not_implemented")
    return m.reason ?? "module not implemented"
  if (caps.scenarios[f.id]) return caps.scenarios[f.id].reason
  return null
}

async function tenantId(): Promise<string> {
  const [row] = await getSharedPool()<
    { id: string }[]
  >`SELECT _acs.tenant() AS id`
  return row.id
}

type Actor = Parameters<typeof withTenant>[0]

async function inRollback<T>(
  actor: Actor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(actor, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

function actorOf(
  h: Handles,
  tid: string,
  name: string,
): { actor: Actor; handle: ActorHandle } {
  const a = h.actors.get(name)
  if (!a)
    throw new Error(
      `unknown actor ${name}; seeded: ${[...h.actors.keys()].join(", ")}`,
    )
  return {
    actor: {
      tenantId: tid,
      role: a.role,
      functionalRoles: a.functionalRoles,
      employeeId: a.employeeId,
    },
    handle: a,
  }
}

async function setActor(ctx: Ctx, name: string): Promise<void> {
  const a = ctx.h.actors.get(name)
  if (!a)
    throw new Error(
      `unknown actor ${name}; seeded: ${[...ctx.h.actors.keys()].join(", ")}`,
    )
  const claims = JSON.stringify({
    app_metadata: {
      tenant_id: ctx.tenantId,
      employee_id: a.employeeId,
      customer_contact_id: null,
      customer_id: null,
      role: a.role,
      functional_roles: a.functionalRoles,
    },
  })
  await ctx.tx`SELECT set_config('request.jwt.claims', ${claims}, true)`
  ctx.actorId = a.userId
}

async function journalIds(tx: Tx, tenantId: string): Promise<Set<string>> {
  const rows = await tx<
    { id: string }[]
  >`SELECT id FROM journal_entries WHERE tenant_id = ${tenantId}::uuid`
  return new Set(rows.map((r) => r.id))
}

type ActualLine = { account: string; debit: string; credit: string }
type ActualEntry = { id: string; entry_number: string; lines: ActualLine[] }

async function entriesById(tx: Tx, ids: string[]): Promise<ActualEntry[]> {
  if (ids.length === 0) return []
  const rows = await tx<
    {
      id: string
      entry_number: string
      account_code: string
      base_debit: string
      base_credit: string
    }[]
  >`
    SELECT je.id, je.entry_number, c.account_code,
           l.base_debit_amount::text AS base_debit, l.base_credit_amount::text AS base_credit
      FROM journal_entries je
      JOIN journal_entry_lines l ON l.entry_id = je.id
      JOIN chart_of_accounts c ON c.id = l.account_id
     WHERE je.id = ANY(${ids}::uuid[])
     ORDER BY je.entry_number, l.line_number`
  const out = new Map<string, ActualEntry>()
  for (const r of rows) {
    let e = out.get(r.id)
    if (!e) {
      e = { id: r.id, entry_number: r.entry_number, lines: [] }
      out.set(r.id, e)
    }
    e.lines.push({
      account: SEMANTIC_BY_CODE[r.account_code] ?? `code:${r.account_code}`,
      debit: r.base_debit,
      credit: r.base_credit,
    })
  }
  return [...out.values()]
}

/** Spec 8.4: a multiset of (account, debit, credit) in functional currency; order-free; no extras. */
function diffLines(expected: ExpectedLine[], actual: ActualLine[]): string[] {
  const key = (acc: string, d: string, c: string) =>
    `${acc} Dr ${fromCents(cents(d))} Cr ${fromCents(cents(c))}`
  const want = new Map<string, number>()
  for (const l of expected) {
    const k = key(l.account, l.debit, l.credit)
    want.set(k, (want.get(k) ?? 0) + 1)
  }
  const got = new Map<string, number>()
  for (const l of actual) {
    const k = key(l.account, l.debit, l.credit)
    got.set(k, (got.get(k) ?? 0) + 1)
  }
  const problems: string[] = []
  for (const [k, n] of want)
    if ((got.get(k) ?? 0) < n) problems.push(`missing line: ${k}`)
  for (const [k, n] of got)
    if (n > (want.get(k) ?? 0)) problems.push(`extra line: ${k}`)
  for (const l of actual) {
    const d = cents(l.debit)
    const c = cents(l.credit)
    if (d > 0n === c > 0n)
      problems.push(
        `line ${l.account} has debit ${l.debit} and credit ${l.credit}`,
      )
  }
  return problems
}

function sameValue(
  expected: string,
  actual: string | null | undefined,
  h?: Handles,
): boolean {
  if (actual === null || actual === undefined) return false
  if (expected.startsWith("@") && h) {
    const a = h.actors.get(expected.slice(1))
    return a !== undefined && a.userId === String(actual)
  }
  if (looksDecimal(expected) && looksDecimal(String(actual)))
    return cents(expected, 6) === cents(actual, 6)
  return String(expected) === String(actual)
}

type DocRow = Record<string, string | null>
const DOCUMENT_QUERY: Record<
  Ref["kind"],
  (tx: Tx, id: string) => Promise<DocRow | undefined>
> = {
  invoice: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT status, currency, invoice_number, exchange_rate::text AS exchange_rate,
             subtotal::text AS subtotal, tax_total::text AS tax_total, total::text AS total,
             amount_paid::text AS amount_paid, amount_due::text AS amount_due,
             base_total::text AS base_total, base_amount_due::text AS base_amount_due,
             created_by::text AS created_by, journal_entry_id::text AS journal_entry_id,
             (SELECT coalesce(sum(amount), 0)::text FROM invoice_credits c WHERE c.invoice_id = i.id) AS amount_credited,
             EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = i.journal_entry_id AND je.status = 'posted')::text AS journal_posted
        FROM invoices i WHERE id = ${id}::uuid`
    )[0],
  bill: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT status, currency, bill_number, exchange_rate::text AS exchange_rate,
             subtotal::text AS subtotal, tax_total::text AS tax_total, total::text AS total,
             amount_paid::text AS amount_paid, amount_due::text AS amount_due,
             base_total::text AS base_total, base_amount_due::text AS base_amount_due,
             created_by::text AS created_by, approved_by::text AS approved_by
        FROM bills WHERE id = ${id}::uuid`
    )[0],
  journal: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT status, entry_number, source_type, is_adjusting::text AS is_adjusting,
             to_char(entry_date, 'YYYY-MM-DD') AS date, accounting_period,
             created_by::text AS created_by, posted_by::text AS posted_by,
             (posted_at = now())::text AS posted_at_is_now,
             source_id::text AS source_id,
             (source_id IS NULL OR EXISTS (SELECT 1 FROM invoices i WHERE i.id = je.source_id)
                               OR EXISTS (SELECT 1 FROM bills b WHERE b.id = je.source_id)
                               OR EXISTS (SELECT 1 FROM amortization_schedules s WHERE s.id = je.source_id)
                               OR EXISTS (SELECT 1 FROM accounting_periods p WHERE p.id = je.source_id)
                               OR EXISTS (SELECT 1 FROM journal_entries o WHERE o.id = je.source_id))::text AS source_resolves,
             (SELECT count(*)::text FROM journal_entry_lines l WHERE l.entry_id = je.id) AS line_count
        FROM journal_entries je WHERE id = ${id}::uuid`
    )[0],
  payment: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT status, currency, amount::text AS amount, base_amount::text AS base_amount,
             payment_number, to_char(payment_date, 'YYYY-MM-DD') AS date, created_by::text AS created_by,
             journal_entry_id::text AS journal_entry_id,
             (SELECT count(*)::text FROM payment_allocations a WHERE a.payment_id = p.id) AS allocations,
             (SELECT coalesce(sum(amount), 0)::text FROM payment_allocations a WHERE a.payment_id = p.id) AS allocated_total,
             EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = p.journal_entry_id AND je.status = 'posted')::text AS journal_posted
        FROM payments p WHERE id = ${id}::uuid`
    )[0],
  period: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT status, period_name, closed_by::text AS closed_by FROM accounting_periods WHERE id = ${id}::uuid`
    )[0],
  schedule: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT kind, total_amount::text AS total_amount, periods_total::text AS periods_total,
             to_char(next_run_date, 'YYYY-MM-DD') AS next_run_date
        FROM amortization_schedules WHERE id = ${id}::uuid`
    )[0],
  credit: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT c.credit_type, c.amount::text AS amount, c.credit_number, c.created_by::text AS created_by,
             i.invoice_number, c.invoice_id::text AS invoice_id,
             EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = c.journal_entry_id AND je.status = 'posted')::text AS journal_posted
        FROM invoice_credits c JOIN invoices i ON i.id = c.invoice_id WHERE c.id = ${id}::uuid`
    )[0],
  bank_transaction: async (tx, id) =>
    (
      await tx<DocRow[]>`
      SELECT t.status, t.amount::text AS amount, to_char(t.transaction_date, 'YYYY-MM-DD') AS date,
             t.matched_to_type, t.matched_to_id::text AS matched_to_id,
             (SELECT p.payment_number FROM payments p WHERE p.id = t.matched_to_id) AS matched_payment_number
        FROM bank_transactions t WHERE t.id = ${id}::uuid`
    )[0],
  tax_rate: async (tx, id) =>
    (
      await tx<
        DocRow[]
      >`SELECT code, rate::text AS rate, is_active::text AS is_active FROM tax_rates WHERE id = ${id}::uuid`
    )[0],
}

async function balances(
  tx: Tx,
  tenantId: string,
  asOf?: string,
): Promise<Map<string, string>> {
  const rows = await tx<{ account_code: string; balance: string }[]>`
    SELECT c.account_code,
           (coalesce(sum(l.base_debit_amount), 0) - coalesce(sum(l.base_credit_amount), 0))::text AS balance
      FROM journal_entry_lines l
      JOIN journal_entries je ON je.id = l.entry_id
      JOIN chart_of_accounts c ON c.id = l.account_id
     WHERE je.tenant_id = ${tenantId}::uuid AND je.status = 'posted'
       AND (${asOf ?? null}::date IS NULL OR je.entry_date <= ${asOf ?? null}::date)
     GROUP BY c.account_code`
  return new Map(
    rows.map((r) => [
      SEMANTIC_BY_CODE[r.account_code] ?? `code:${r.account_code}`,
      r.balance,
    ]),
  )
}

async function subledger(
  tx: Tx,
  kind: "customers" | "vendors",
): Promise<Map<string, string>> {
  const rows =
    kind === "customers"
      ? await tx<{ k: string; due: string }[]>`
          SELECT c.customer_number AS k, coalesce(sum(i.amount_due), 0)::text AS due
            FROM invoices i JOIN customers c ON c.id = i.customer_id
           WHERE i.status NOT IN ('draft', 'void') GROUP BY c.customer_number`
      : await tx<{ k: string; due: string }[]>`
          SELECT v.vendor_number AS k, coalesce(sum(b.amount_due), 0)::text AS due
            FROM bills b JOIN vendors v ON v.id = b.vendor_id
           WHERE b.status NOT IN ('draft', 'void') GROUP BY v.vendor_number`
  return new Map(rows.map((r) => [r.k, r.due]))
}

function compareBalances(
  expected: Record<string, string>,
  actual: Map<string, string>,
  label: string,
): string[] {
  const problems: string[] = []
  for (const [account, v] of Object.entries(expected)) {
    const got = actual.get(account) ?? "0"
    if (!sameValue(v, got))
      problems.push(`${label} ${account} is ${got}, expected ${v}`)
  }
  for (const [account, got] of actual) {
    if (!(account in expected) && cents(got) !== 0n)
      problems.push(`${label} ${account} is ${got}, expected 0.00 (not listed)`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// Running actions
// ---------------------------------------------------------------------------

type ActionReport = {
  label: string
  outcome?: { ref?: Ref; value?: Record<string, string> }
  error?: unknown
  entries: ActualEntry[]
}

/** One action's checks against what it produced: refusal, journal lines, values. */
function judge(action: Action, r: ActionReport, problems: string[]): boolean {
  const wantRefused = action.expect?.result === "refused"
  if (r.error) {
    const code = refusalCode(r.error)
    if (!wantRefused)
      problems.push(
        `${r.label}: refused with ${code}: ${(r.error as Error).message}`,
      )
    else if (code !== action.expect?.refusal)
      problems.push(
        `${r.label}: refused with ${code}, expected ${action.expect?.refusal}`,
      )
    return false
  }
  if (wantRefused) {
    problems.push(
      `${r.label}: succeeded, expected refusal ${action.expect?.refusal}`,
    )
    return false
  }
  if (action.expect?.journal) {
    if (r.entries.length !== 1)
      problems.push(
        `${r.label}: expected one journal entry, got ${r.entries.length}`,
      )
    else
      problems.push(
        ...diffLines(action.expect.journal, r.entries[0].lines).map(
          (p) => `${r.label}: ${p}`,
        ),
      )
  }
  if (action.expect?.journals) {
    const want = action.expect.journals
    if (r.entries.length !== want.length) {
      problems.push(
        `${r.label}: expected ${want.length} journal entries, got ${r.entries.length}`,
      )
    } else {
      const unmatched = [...r.entries]
      for (const [j, exp] of want.entries()) {
        const k = unmatched.findIndex(
          (e) => diffLines(exp, e.lines).length === 0,
        )
        if (k < 0)
          problems.push(
            `${r.label}: expected entry ${j + 1} matches no posted entry`,
          )
        else unmatched.splice(k, 1)
      }
    }
  }
  if (action.expect?.value) {
    for (const [k, v] of Object.entries(action.expect.value)) {
      const got = r.outcome?.value?.[k]
      if (!sameValue(v, got ?? null))
        problems.push(`${r.label}: value ${k} is ${got}, expected ${v}`)
    }
  }
  return true
}

/** Run one op inside `ctx.tx` with a savepoint; returns what happened without judging it. */
async function performInTx(
  ctx: Ctx,
  action: Action,
  label: string,
  iteration: number,
  trackEntries = true,
): Promise<ActionReport> {
  const op = OPS[action.op]
  if (!op) throw new Error(`${label}: unknown op ${action.op}`)
  const before = trackEntries ? await journalIds(ctx.tx, ctx.tenantId) : null
  const report: ActionReport = { label, entries: [] }
  try {
    report.outcome = await ctx.tx.savepoint(async (sp) => {
      const out = await op(
        { ...ctx, tx: sp as unknown as Tx },
        action.args ?? {},
      )
      if (action.abort) throw new Error("acs:aborted")
      return out
    })
  } catch (e) {
    report.error = e
    return report
  }
  if (action.as && report.outcome?.ref)
    ctx.refs.set(action.as, report.outcome.ref)
  else if (action.as && iteration === 0 && !report.outcome?.ref)
    problems_noRef(label, action.as)
  if (before) {
    const after = await journalIds(ctx.tx, ctx.tenantId)
    report.entries = await entriesById(
      ctx.tx,
      [...after].filter((id) => !before.has(id)),
    )
  }

  // `repeat` with identical report values: the fixture asks for `identical` in expect.value.
  return report
}

function problems_noRef(label: string, as: string): void {
  throw new Error(`${label}: op returned nothing to bind to ${as}`)
}

/** A `transaction` scenario's action list, with invariants after every successful action. */
async function runActionsInTx(
  ctx: Ctx,
  f: Fixture,
  actions: Action[],
  problems: string[],
): Promise<void> {
  for (const [i, action] of actions.entries()) {
    const label = `action ${i + 1} ${action.op}${action.as ? ` (${action.as})` : ""}`
    await setActor(ctx, action.actor ?? f.actor ?? "owner")
    const times = action.repeat ?? 1
    let last: ActionReport | undefined
    let firstValue: string | undefined
    let identical = true
    for (let k = 0; k < times; k++) {
      last = await performInTx(
        ctx,
        action,
        times > 1 ? `${label} #${k + 1}` : label,
        k,
        times === 1 ||
          Boolean(action.expect?.journal || action.expect?.journals),
      )
      if (last.error) break
      const v = JSON.stringify(last.outcome?.value ?? {})
      firstValue ??= v
      if (v !== firstValue) identical = false
    }
    if (!last) continue
    if (times > 1 && last.outcome?.value)
      last.outcome.value.identical = String(identical)
    const ok = judge(action, last, problems)
    if (!ok) continue
    const violations = await checkInvariants(ctx.tx, ctx.tenantId, invariants)
    for (const v of violations)
      problems.push(
        `${label}: invariant ${v.id} fails: ${JSON.stringify(v.rows)}`,
      )
  }
}

async function postOpeningBalances(
  ctx: Ctx,
  given: Record<string, string>,
): Promise<void> {
  const lines: { account: string; debit?: string; credit?: string }[] = []
  let net = 0n
  for (const [account, amount] of Object.entries(given)) {
    const c = cents(amount)
    net += c
    if (c > 0n) lines.push({ account, debit: fromCents(c) })
    else if (c < 0n) lines.push({ account, credit: fromCents(-c) })
  }
  if (net !== 0n)
    throw new Error(`given.balances does not net to zero (${fromCents(net)})`)
  await OPS["journal.post"](ctx, {
    date: "2026-01-01",
    description: "Opening balances",
    lines,
  })
}

// ---------------------------------------------------------------------------
// Final expectations (read in whatever transaction the caller opened)
// ---------------------------------------------------------------------------

async function checkFinal(
  ctx: Ctx,
  f: Fixture,
  problems: string[],
): Promise<void> {
  const tx = ctx.tx
  const tid = ctx.tenantId
  for (const [handle, fields] of Object.entries(f.expect.documents ?? {})) {
    const r = ctx.refs.get(handle)
    if (!r) {
      problems.push(`expect.documents.${handle}: no such handle`)
      continue
    }
    const row = await DOCUMENT_QUERY[r.kind](tx, r.id)
    if (!row) {
      problems.push(`expect.documents.${handle}: row is gone`)
      continue
    }
    for (const [k, raw] of Object.entries(fields)) {
      const v = raw.startsWith("@ref:")
        ? (ctx.refs.get(raw.slice(5))?.id ?? raw)
        : raw
      if (!(k in row))
        problems.push(
          `expect.documents.${handle}.${k}: not a column the runner reads`,
        )
      else if (!sameValue(v, row[k], ctx.h))
        problems.push(
          `expect.documents.${handle}.${k} is ${row[k]}, expected ${v}`,
        )
    }
  }
  if (f.expect.balances)
    problems.push(
      ...compareBalances(f.expect.balances, await balances(tx, tid), "balance"),
    )
  for (const [date, expected] of Object.entries(
    f.expect.balances_as_of ?? {},
  )) {
    problems.push(
      ...compareBalances(
        expected,
        await balances(tx, tid, date),
        `balance as of ${date}`,
      ),
    )
  }
  if (f.expect.journals_total !== undefined) {
    const n = (await journalIds(tx, tid)).size
    if (String(n) !== f.expect.journals_total)
      problems.push(
        `journal entries: ${n}, expected ${f.expect.journals_total}`,
      )
  }
  for (const kind of ["customers", "vendors"] as const) {
    const expected = f.expect.subledger?.[kind] ?? {}
    if (Object.keys(expected).length === 0) continue
    const actual = await subledger(tx, kind)
    for (const [k, v] of Object.entries(expected)) {
      const got = actual.get(k) ?? "0"
      if (!sameValue(v, got))
        problems.push(`subledger ${kind} ${k} is ${got}, expected ${v}`)
    }
  }
  for (const [handle, v] of Object.entries(
    f.expect.subledger?.schedules ?? {},
  )) {
    const r = ctx.refs.get(handle)
    if (!r || r.kind !== "schedule") {
      problems.push(
        `expect.subledger.schedules.${handle}: not a schedule handle`,
      )
      continue
    }
    const [row] = await tx<{ left: string }[]>`
      SELECT (s.total_amount - coalesce((
                SELECT sum(l.base_debit_amount)
                  FROM journal_entries je JOIN journal_entry_lines l ON l.entry_id = je.id
                 WHERE je.source_type = 'amortization' AND je.source_id = s.id AND je.status = 'posted'
                   AND l.account_id = s.income_statement_account_id), 0))::text AS left
        FROM amortization_schedules s WHERE s.id = ${r.id}::uuid`
    if (!sameValue(v, row?.left ?? null))
      problems.push(
        `subledger schedule ${handle} unamortized is ${row?.left}, expected ${v}`,
      )
  }
}

// ---------------------------------------------------------------------------
// The five shapes
// ---------------------------------------------------------------------------

async function runTransactionScenario(
  f: Fixture,
  tid: string,
  owner: ActorHandle,
): Promise<string[]> {
  const problems: string[] = []
  const { actor } = actorOf(
    { actors: new Map([["owner", owner]]) } as Handles,
    tid,
    "owner",
  )
  await inRollback(actor, async (tx) => {
    const h = await loadHandles(tx, tid)
    const ctx: Ctx = {
      tx,
      tenantId: tid,
      actorId: owner.userId,
      h,
      refs: new Map(),
    }
    if (f.given?.balances) await postOpeningBalances(ctx, f.given.balances)
    await runActionsInTx(ctx, f, f.actions ?? [], problems)
    await setActor(ctx, "owner")
    await checkFinal(ctx, f, problems)
  })
  return problems
}

type EndState = {
  balances: Map<string, string>
  customers: Map<string, string>
  vendors: Map<string, string>
}

async function runMetamorphic(
  f: Fixture,
  tid: string,
  owner: ActorHandle,
): Promise<string[]> {
  const problems: string[] = []
  const { actor } = actorOf(
    { actors: new Map([["owner", owner]]) } as Handles,
    tid,
    "owner",
  )
  const states = new Map<string, EndState>()
  for (const [name, actions] of Object.entries(f.sequences ?? {})) {
    await inRollback(actor, async (tx) => {
      const h = await loadHandles(tx, tid)
      const ctx: Ctx = {
        tx,
        tenantId: tid,
        actorId: owner.userId,
        h,
        refs: new Map(),
      }
      if (f.given?.balances) await postOpeningBalances(ctx, f.given.balances)
      const seqProblems: string[] = []
      await runActionsInTx(ctx, f, actions, seqProblems)
      problems.push(...seqProblems.map((p) => `sequence ${name}: ${p}`))
      states.set(name, {
        balances: await balances(tx, tid),
        customers: await subledger(tx, "customers"),
        vendors: await subledger(tx, "vendors"),
      })
    })
  }
  const names = [...states.keys()]
  if (names.length < 2) {
    problems.push("a metamorphic fixture needs two or more sequences")
    return problems
  }
  const [a, b] = names
  const A = states.get(a)!
  const B = states.get(b)!
  const differ = f.expect.differ ?? {}
  for (const kind of f.expect.equal ?? ["balances"]) {
    const keys = new Set([...A[kind].keys(), ...B[kind].keys()])
    for (const k of keys) {
      const va = A[kind].get(k) ?? "0"
      const vb = B[kind].get(k) ?? "0"
      if (kind === "balances" && k in differ) {
        const d = cents(vb) - cents(va)
        if (d !== cents(differ[k]))
          problems.push(
            `${kind} ${k}: ${b} − ${a} is ${fromCents(d)}, expected ${differ[k]}`,
          )
      } else if (!sameValue(va, vb))
        problems.push(`${kind} ${k}: ${a} has ${va}, ${b} has ${vb}`)
    }
  }
  return problems
}

const FAIL_TRIGGER = `
CREATE SCHEMA IF NOT EXISTS _acs;
CREATE OR REPLACE FUNCTION _acs.fail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  IF coalesce(current_setting('acs.fail_enabled', true), '') <> '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  n := coalesce(nullif(current_setting('acs.fail_count', true), ''), '0')::int + 1;
  PERFORM set_config('acs.fail_count', n::text, false);
  IF n = coalesce(nullif(current_setting('acs.fail_nth', true), ''), '1')::int THEN
    RAISE EXCEPTION 'ACS injected failure on % (%)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;`

async function runDatabaseScenario(
  f: Fixture,
  tid: string,
  owner: ActorHandle,
): Promise<string[]> {
  const problems: string[] = []
  const pool = getSharedPool()
  await restoreSeed(pool)
  // Handles are read as the owner: a bare tenant id carries no role, and row
  // visibility then hides every tax rate and account (L42).
  const asOwner = actorOf(
    { actors: new Map([["owner", owner]]) } as Handles,
    tid,
    "owner",
  ).actor
  let h = await inRollback(asOwner, (tx) => loadHandles(tx, tid))
  const refs = new Map<string, Ref>()
  const inject = f.inject
  if (inject) {
    await pool.unsafe(FAIL_TRIGGER)
    await pool.unsafe(
      `DROP TRIGGER IF EXISTS _acs_fail ON public."${inject.table}"`,
    )
    await pool.unsafe(
      `CREATE TRIGGER _acs_fail BEFORE ${inject.op} ON public."${inject.table}" FOR EACH ROW EXECUTE FUNCTION _acs.fail()`,
    )
  }
  try {
    for (const [i, action] of (f.actions ?? []).entries()) {
      const label = `action ${i + 1} ${action.op}${action.as ? ` (${action.as})` : ""}`
      const who = actorOf(h, tid, action.actor ?? f.actor ?? "owner")
      const times = action.repeat ?? 1
      const before =
        action.inject || f.expect.unchanged
          ? await tableCounts(pool, tid)
          : null
      let last: ActionReport | undefined
      for (let k = 0; k < times; k++) {
        const lbl = times > 1 ? `${label} #${k + 1}` : label
        const report: ActionReport = { label: lbl, entries: [] }
        try {
          await withTenant(who.actor, async (tx) => {
            const ctx: Ctx = {
              tx,
              tenantId: tid,
              actorId: who.handle.userId,
              h,
              refs,
            }
            if (action.inject && inject) {
              await tx`SELECT set_config('acs.fail_count', '0', false)`
              await tx`SELECT set_config('acs.fail_nth', ${String(inject.nth ?? 1)}, false)`
              await tx`SELECT set_config('acs.fail_enabled', '1', false)`
            }
            const op = OPS[action.op]
            if (!op) throw new Error(`${lbl}: unknown op ${action.op}`)
            const beforeIds = await journalIds(tx, tid)
            report.outcome = await op(ctx, action.args ?? {})
            if (action.as && report.outcome.ref)
              refs.set(action.as, report.outcome.ref)
            const afterIds = await journalIds(tx, tid)
            report.entries = await entriesById(
              tx,
              [...afterIds].filter((id) => !beforeIds.has(id)),
            )
            if (action.inject)
              await tx`SELECT set_config('acs.fail_enabled', '0', false)`
            if (action.abort) throw new Error("acs:aborted")
          })
        } catch (e) {
          report.error = e
          report.entries = []
          // the session GUC survives a rollback; disarm it on a fresh statement
          await pool`SELECT set_config('acs.fail_enabled', '0', false)`.catch(
            () => {},
          )
        }
        last = report
        if (report.error) break
      }
      if (!last) continue
      const ok = judge(action, last, problems)
      if (before && (action.inject || last.error)) {
        const after = await tableCounts(pool, tid)
        for (const [table, n] of before) {
          const m = after.get(table) ?? 0
          if (m !== n)
            problems.push(
              `${label}: ${table} has ${m} rows after the refused action, had ${n}`,
            )
        }
      }
      if (!ok) continue
      const violations = await inRollback(who.actor, (tx) =>
        checkInvariants(tx, tid, invariants),
      )
      for (const v of violations)
        problems.push(
          `${label}: invariant ${v.id} fails: ${JSON.stringify(v.rows)}`,
        )
    }

    if (f.concurrent) {
      h = await inRollback(asOwner, (tx) => loadHandles(tx, tid))
      const outcomes = await Promise.allSettled(
        f.concurrent.map((lane: Lane, i) =>
          withTenant(
            actorOf(h, tid, lane.actor ?? f.actor ?? "owner").actor,
            async (tx) => {
              const who = actorOf(h, tid, lane.actor ?? f.actor ?? "owner")
              const ctx: Ctx = {
                tx,
                tenantId: tid,
                actorId: who.handle.userId,
                h,
                refs,
              }
              for (const a of lane.actions) {
                const op = OPS[a.op]
                if (!op) throw new Error(`lane ${i + 1}: unknown op ${a.op}`)
                const out = await op(ctx, a.args ?? {})
                if (a.as && out.ref) refs.set(a.as, out.ref)
              }
              if (lane.abort) throw new Error("acs:aborted")
            },
          ),
        ),
      )
      const succeeded = outcomes.filter((o) => o.status === "fulfilled").length
      const refused = outcomes.length - succeeded
      const codes = outcomes.map(
        (o, i) =>
          `lane ${i + 1}: ${o.status === "fulfilled" ? "committed" : refusalCode(o.reason)}`,
      )
      if (
        f.expect.lanes?.succeeded !== undefined &&
        String(succeeded) !== f.expect.lanes.succeeded
      ) {
        problems.push(
          `lanes committed: ${succeeded}, expected ${f.expect.lanes.succeeded} (${codes.join("; ")})`,
        )
      }
      if (
        f.expect.lanes?.refused !== undefined &&
        String(refused) !== f.expect.lanes.refused
      ) {
        problems.push(
          `lanes refused: ${refused}, expected ${f.expect.lanes.refused} (${codes.join("; ")})`,
        )
      }
      const violations = await inRollback(asOwner, (tx) =>
        checkInvariants(tx, tid, invariants),
      )
      for (const v of violations)
        problems.push(
          `after the lanes: invariant ${v.id} fails: ${JSON.stringify(v.rows)}`,
        )
    }

    const { actor } = actorOf(h, tid, "owner")
    await inRollback(actor, async (tx) => {
      const ctx: Ctx = { tx, tenantId: tid, actorId: owner.userId, h, refs }
      await checkFinal(ctx, f, problems)
      if (f.golden) await checkGolden(ctx, f, problems)
    })
  } finally {
    if (inject)
      await pool
        .unsafe(`DROP TRIGGER IF EXISTS _acs_fail ON public."${inject.table}"`)
        .catch(() => {})
    if (!KEEP) await restoreSeed(pool)
  }
  return problems
}

/** Spec section 19: every named report, compared with golden/<name>.json; captured when ACS_WRITE_GOLDEN=1. */
async function checkGolden(
  ctx: Ctx,
  f: Fixture,
  problems: string[],
): Promise<void> {
  const REPORTS: Record<string, () => Promise<Record<string, string>>> = {
    "trial-balance": async () =>
      (await OPS["report.trial_balance"](ctx, {})).value ?? {},
    "balance-sheet": async () =>
      (await OPS["report.balance_sheet"](ctx, {})).value ?? {},
    "income-statement": async () =>
      (
        await OPS["report.income_statement"](ctx, {
          from: "2026-01-01",
          to: "2026-12-31",
        })
      ).value ?? {},
    "cash-flow": async () =>
      (
        await OPS["report.cash_flow"](ctx, {
          from: "2026-01-01",
          to: "2026-12-31",
        })
      ).value ?? {},
    "ar-aging": async () => (await OPS["report.ar_aging"](ctx, {})).value ?? {},
    "tax-liability": async () =>
      (
        await OPS["report.tax_liability"](ctx, {
          from: "2026-01-01",
          to: "2026-12-31",
        })
      ).value ?? {},
    "control-tie-out": async () =>
      (await OPS["report.control_tie_out"](ctx, {})).value ?? {},
    "journal-ledger": async () => {
      const rows = await ctx.tx<{ k: string; v: string }[]>`
        SELECT je.entry_number || '.' || l.line_number || '.' || c.account_code AS k,
               to_char(je.entry_date, 'YYYY-MM-DD') || ' ' || je.source_type || ' Dr ' || l.base_debit_amount::text || ' Cr ' || l.base_credit_amount::text AS v
          FROM journal_entries je JOIN journal_entry_lines l ON l.entry_id = je.id
          JOIN chart_of_accounts c ON c.id = l.account_id
         WHERE je.tenant_id = ${ctx.tenantId}::uuid AND je.status = 'posted'
         ORDER BY je.entry_number, l.line_number`
      return Object.fromEntries(rows.map((r) => [r.k, r.v]))
    },
  }
  for (const name of f.golden ?? []) {
    const produce = REPORTS[name]
    if (!produce) {
      problems.push(`golden ${name}: the runner has no such report`)
      continue
    }
    const actual = await produce()
    const path = join(CONFORMANCE_DIR, "golden", `${name}.json`)
    if (!existsSync(path)) {
      if (WRITE_GOLDEN) {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, JSON.stringify(actual, null, 2) + "\n")
        problems.push(
          `golden ${name}: captured to ${path}; review and commit it, then rerun`,
        )
      } else
        problems.push(
          `golden ${name}: no golden file; run with ACS_WRITE_GOLDEN=1 to capture`,
        )
      continue
    }
    const expected = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      string
    >
    for (const [k, v] of Object.entries(expected)) {
      if (!(k in actual))
        problems.push(`golden ${name}: ${k} is missing from the report`)
      else if (!sameValue(v, actual[k]))
        problems.push(`golden ${name}: ${k} is ${actual[k]}, expected ${v}`)
    }
    for (const k of Object.keys(actual))
      if (!(k in expected))
        problems.push(`golden ${name}: ${k} is not in the golden file`)
  }
}

async function runSqlScenario(f: Fixture, tid: string): Promise<string[]> {
  const path = join(CONFORMANCE_DIR, f.sql!)
  if (!existsSync(path)) return [`sql file ${f.sql} does not exist`]
  const text = readFileSync(path, "utf8")
  const rows = await getSharedPool().unsafe(
    text,
    text.includes("$1") ? [tid] : [],
  )
  const want = f.expect.rows ?? "0"
  if (String(rows.length) !== want) {
    return [
      `${f.sql} returned ${rows.length} rows, expected ${want}: ${JSON.stringify(rows.slice(0, 3))}`,
    ]
  }
  return []
}

function migrationResult(f: Fixture): { result: Result; problems: string[] } {
  const path = join(CONFORMANCE_DIR, "results", "migration.json")
  if (!existsSync(path))
    return {
      result: "NOT_RUN",
      problems: ["run `pnpm db:acs migrate <base-ref>` first"],
    }
  const r = JSON.parse(readFileSync(path, "utf8")) as {
    steps: Record<string, { result: Result; note?: string }>
  }
  const step = r.steps[f.id]
  if (!step)
    return {
      result: "NOT_RUN",
      problems: [`${f.id} is not in results/migration.json`],
    }
  return { result: step.result, problems: step.note ? [step.note] : [] }
}

// ---------------------------------------------------------------------------

describe("accounting conformance", () => {
  let tid: string | undefined
  let owner: ActorHandle | undefined

  async function context(): Promise<{ tid: string; owner: ActorHandle }> {
    if (!tid) {
      tid = await tenantId()
      const t = tid
      owner = await inRollback(t, async (tx) =>
        (await loadHandles(tx, t)).actors.get("owner"),
      )
      if (!owner) throw new Error("the seed has no owner actor")
    }
    return { tid, owner: owner! }
  }

  if (fixtures.length === 0) {
    it.skip("no fixtures matched ACS_SCENARIOS", () => {})
  }

  for (const f of fixtures) {
    it(f.id, async () => {
      const started = Date.now()
      const record = (result: Result, problems: string[] = []) =>
        results.push({
          id: f.id,
          module: f.module,
          result,
          problems,
          ms: Date.now() - started,
        })

      const invalid = validateFixture(f)
      if (invalid.length > 0) {
        record("ERROR", invalid)
        expect.fail(`fixture ${f.id} is invalid:\n  ${invalid.join("\n  ")}`)
      }
      const reason = notImplementedReason(f)
      if (reason) {
        record("NOT_IMPLEMENTED", [reason])
        return
      }
      if ((f.gate ?? "pr") === "nightly" && GATE !== "nightly") {
        record("NOT_RUN", [
          "nightly gate (spec section 22.2); run with `pnpm db:acs run --nightly`",
        ])
        return
      }
      if (f.procedure === "migration") {
        const r = migrationResult(f)
        record(r.result, r.problems)
        if (r.result === "FAIL")
          expect.fail(`${f.id} ${f.title}\n  ${r.problems.join("\n  ")}`)
        return
      }
      let problems: string[]
      try {
        const c = await context()
        if (f.sql) problems = await runSqlScenario(f, c.tid)
        else if (f.sequences) problems = await runMetamorphic(f, c.tid, c.owner)
        else if ((f.isolation ?? "transaction") === "database")
          problems = await runDatabaseScenario(f, c.tid, c.owner)
        else problems = await runTransactionScenario(f, c.tid, c.owner)
      } catch (e) {
        record("ERROR", [`runner: ${(e as Error).stack ?? String(e)}`])
        throw e
      }
      record(problems.length === 0 ? "PASS" : "FAIL", problems)
      if (problems.length > 0)
        expect.fail(`${f.id} ${f.title}\n  ${problems.join("\n  ")}`)
    })
  }
})

afterAll(async () => {
  const out =
    process.env.ACS_RESULTS ?? join(CONFORMANCE_DIR, "results", "last-run.json")
  let build = "unknown"
  try {
    build = execSync("git rev-parse --short HEAD", { cwd: CONFORMANCE_DIR })
      .toString()
      .trim()
  } catch {
    // not a git checkout
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(
    out,
    JSON.stringify(
      {
        profile: "ACS-US-ACCRUAL-1.0",
        build,
        startedAt,
        invariants: {
          checked: invariants.length,
          notImplemented: allInvariants.length - invariants.length,
        },
        scenarios: results,
      },
      null,
      2,
    ),
  )
  await closeConnections()
})

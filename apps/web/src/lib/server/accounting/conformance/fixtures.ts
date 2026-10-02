/**
 * Fixture loading (spec section 20). A fixture is one YAML file whose name
 * equals its id; every amount is a quoted string. The runner refuses a
 * fixture that breaks either rule rather than guessing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

export const CONFORMANCE_DIR = fileURLToPath(
  new URL(
    "../../../../../../../packages/database/conformance/",
    import.meta.url,
  ),
)
export const SCENARIOS_DIR = join(CONFORMANCE_DIR, "scenarios")

export type ExpectedLine = { account: string; debit: string; credit: string }

export type ActionExpect = {
  result?: "ok" | "refused"
  refusal?: string
  journal?: ExpectedLine[]
  journals?: ExpectedLine[][]
  /** For an op that returns a value (a report figure, a count), compared as a decimal or string. */
  value?: Record<string, string>
}

export type Action = {
  op: string
  as?: string
  actor?: string
  args?: Record<string, unknown>
  expect?: ActionExpect
  /** Run the op this many times; invariants are checked once afterwards. */
  repeat?: number
  /** Section 14: the injected trigger is armed for this action only. */
  inject?: boolean
  /** Section 13 and 14: throw after the op, so the transaction never commits. */
  abort?: boolean
}

/** Section 13: one transaction's worth of actions, run at the same time as the other lanes. */
export type Lane = {
  name?: string
  actor?: string
  actions: Action[]
  abort?: boolean
}

export type Fixture = {
  id: string
  title: string
  version: number
  profile: string
  module: string
  isolation?: "transaction" | "database"
  /** Section 22: `nightly` scenarios are skipped by a pull-request run; `pnpm db:acs run --nightly` includes them. */
  gate?: "pr" | "nightly"
  actor?: string
  given?: {
    balances?: Record<string, string>
    [key: string]: unknown
  }
  /** Section 10: the deterministic action list. */
  actions?: Action[]
  /** Section 11: named sequences, each run from the seed, compared afterwards. */
  sequences?: Record<string, Action[]>
  /** Section 13: lanes run concurrently after `actions`. */
  concurrent?: Lane[]
  /** Section 14: a trigger that raises on the nth write to a table, armed per action. */
  inject?: { table: string; op: "INSERT" | "UPDATE" | "DELETE"; nth?: number }
  /** Section 18: a SQL file under db/, run as the owner; zero rows means pass. */
  sql?: string
  /** Section 23: a step of the migration procedure, whose result acs.mjs migrate records. */
  procedure?: "migration"
  /** Section 19: the golden files to compare after the actions. */
  golden?: string[]
  expect: {
    documents?: Record<string, Record<string, string>>
    balances?: Record<string, string>
    balances_as_of?: Record<string, Record<string, string>>
    journals_total?: string
    subledger?: {
      customers?: Record<string, string>
      vendors?: Record<string, string>
      schedules?: Record<string, string>
    }
    /** Section 11: what must be identical across the sequences. */
    equal?: ("balances" | "customers" | "vendors")[]
    /** Section 11: accounts whose balance differs between the two sequences, B minus A. */
    differ?: Record<string, string>
    /** Section 13: how many lanes committed. */
    lanes?: { succeeded?: string; refused?: string }
    /** Section 14 and 18: row counts of every table are unchanged by a refused action; a SQL check returns this many rows. */
    unchanged?: boolean
    rows?: string
    invariants: string[]
  }
  /** Where it was read from, for messages. */
  file: string
}

const INTEGER_KEYS = new Set([
  "version",
  "periods",
  "connections",
  "count",
  "repeat",
  "nth",
])

function refuseNumbers(node: unknown, path: string, problems: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => refuseNumbers(n, `${path}[${i}]`, problems))
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (typeof v === "number") {
        if (!INTEGER_KEYS.has(k) || !Number.isInteger(v)) {
          problems.push(
            `${path}.${k} is a bare number (${v}); amounts are quoted strings`,
          )
        }
        continue
      }
      refuseNumbers(v, `${path}.${k}`, problems)
    }
  }
}

function checkActions(
  actions: Action[],
  where: string,
  problems: string[],
): void {
  for (const a of actions) {
    if (!a.op) problems.push(`${where}: an action has no op`)
    if (a.expect?.result === "refused" && !a.expect.refusal) {
      problems.push(`${where} ${a.op}: result refused needs a refusal code`)
    }
    for (const line of [
      ...(a.expect?.journal ?? []),
      ...(a.expect?.journals ?? []).flat(),
    ]) {
      if (line.debit === undefined || line.credit === undefined) {
        problems.push(
          `${where} ${a.op}: every expected line gives both debit and credit`,
        )
      }
      if (/^\d/.test(line.account) || /^[0-9a-f-]{36}$/i.test(line.account)) {
        problems.push(
          `${where} ${a.op}: account ${line.account} is a code or uuid, not a semantic id`,
        )
      }
    }
  }
}

export function validateFixture(f: Fixture): string[] {
  const problems: string[] = []
  const prefix = f.id.split("-")[0]
  if (f.module !== prefix)
    problems.push(`module ${f.module} does not match id prefix ${prefix}`)
  const hasBody =
    (f.actions?.length ?? 0) > 0 ||
    Object.keys(f.sequences ?? {}).length > 0 ||
    (f.concurrent?.length ?? 0) > 0 ||
    f.sql !== undefined ||
    f.procedure !== undefined
  if (!hasBody)
    problems.push(
      "the fixture has no actions, sequences, concurrent lanes, sql or procedure",
    )
  if (!f.expect) problems.push("expect is missing")
  else if (
    !Array.isArray(f.expect.invariants) ||
    f.expect.invariants.length === 0
  ) {
    problems.push("expect.invariants is empty")
  }
  refuseNumbers(f.given, "given", problems)
  refuseNumbers(f.actions, "actions", problems)
  refuseNumbers(f.sequences, "sequences", problems)
  refuseNumbers(f.concurrent, "concurrent", problems)
  refuseNumbers(f.expect, "expect", problems)
  checkActions(f.actions ?? [], "actions", problems)
  for (const [name, seq] of Object.entries(f.sequences ?? {}))
    checkActions(seq, `sequence ${name}`, problems)
  for (const [i, lane] of (f.concurrent ?? []).entries())
    checkActions(lane.actions ?? [], `lane ${i + 1}`, problems)
  if ((f.concurrent || f.inject || f.golden) && f.isolation !== "database") {
    problems.push(
      "concurrent lanes, failure injection and golden files need isolation: database",
    )
  }
  if (f.sequences && (f.actions?.length ?? 0) > 0)
    problems.push("a metamorphic fixture has sequences, not actions")
  return problems
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.ya?ml$/.test(name)) out.push(p)
  }
}

/** Every fixture, or those whose id matches one of `filters` (exact, or a `GL-*` glob). */
export function loadFixtures(filters: string[] = []): Fixture[] {
  const files: string[] = []
  walk(SCENARIOS_DIR, files)
  const matchers = filters
    .filter((f) => f.trim() !== "")
    .map(
      (f) =>
        new RegExp(
          "^" +
            f
              .trim()
              .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
              .replace(/\*/g, ".*") +
            "$",
        ),
    )
  const out: Fixture[] = []
  for (const file of files) {
    const doc = parse(readFileSync(file, "utf8")) as Fixture
    const expectedId = file.replace(/^.*\//, "").replace(/\.ya?ml$/, "")
    if (doc.id !== expectedId) {
      throw new Error(
        `${file}: id ${doc.id} does not equal the file name ${expectedId}`,
      )
    }
    if (matchers.length > 0 && !matchers.some((m) => m.test(doc.id))) continue
    doc.file = file
    out.push(doc)
  }
  return out
}

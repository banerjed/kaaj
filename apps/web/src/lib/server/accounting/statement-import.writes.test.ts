import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as imports from "./statement-import.repo"
import { analyseStatement, type Analysis } from "./statement-import/analyse"

/**
 * Bank statement import WRITES, against the real database. Every case rolls
 * back. Both halves of the access rule are asserted: finance imports, and a
 * plain employee cannot even see the account to import into.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const USD_ACCOUNT = "d189279d-45d2-5e98-85bf-e03f3dbe04e3" // Payroll Account: no fixture transactions
const ACTOR = "6d466aa9-e51a-5d52-9015-152600855932"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"

const FINANCE = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: ["finance_admin"],
  employeeId: ACTOR,
}
const PLAIN = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: [] as string[],
  employeeId: MARCUS,
}

async function inRollback<T>(
  who: typeof FINANCE,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(who, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

const JANUARY = [
  "Date,Description,Amount,Balance",
  "2026-01-02,Client payment,2500.00,3500.00",
  "2026-01-03,Coffee,-4.50,3495.50",
  "2026-01-03,Coffee,-4.50,3491.00",
].join("\n")

/** Overlaps JANUARY by its last line, and adds one. */
const OVERLAP = [
  "Date,Description,Amount,Balance",
  "2026-01-03,Coffee,-4.50,3491.00",
  "2026-01-09,Refund,20.00,3511.00",
].join("\n")

function parsed(text: string): Analysis {
  const a = analyseStatement(new TextEncoder().encode(text), {
    accountCurrency: "USD",
    confirmed: true,
  })
  if ("fatal" in a || a.problems.length) throw new Error(JSON.stringify(a))
  return a
}

async function run(tx: Tx, text: string) {
  const account = (await imports.accountForImport(tx, USD_ACCOUNT))!
  const a = parsed(text)
  return imports.importStatement(tx, {
    tenantId: NORTHWIND,
    account,
    fileName: "statement.csv",
    format: a.format,
    fileSha256: "0".repeat(64),
    mapping: a.mapping,
    linesInFile: text.split("\n").length,
    transactions: a.transactions,
    period: a.period,
    balanceCheck: a.balanceCheck,
    actorId: ACTOR,
  })
}

afterAll(async () => {
  await closeConnections()
})

describe("importing a statement", () => {
  it("writes every line unmatched, signed, pointing at its import, and saves the mapping", async () => {
    const { result, rows, profile, record } = await inRollback(
      FINANCE,
      async (tx) => {
        const result = await run(tx, JANUARY)
        const rows = await tx<
          {
            amount: string
            transaction_type: string
            status: string
            import_id: string
            bank_transaction_id: string
          }[]
        >`
        SELECT amount::text AS amount, transaction_type, status, import_id, bank_transaction_id
          FROM bank_transactions WHERE bank_account_id = ${USD_ACCOUNT}::uuid ORDER BY transaction_date, amount DESC`
        const [profile] = await tx<{ p: unknown }[]>`
        SELECT statement_import_profile AS p FROM bank_accounts WHERE id = ${USD_ACCOUNT}::uuid`
        const [record] = await tx<
          { imported: number; dups: number; total: number; check: string }[]
        >`
        SELECT transactions_imported AS imported, duplicates_skipped AS dups,
               transactions_in_file AS total, balance_check AS check
          FROM bank_statement_imports WHERE id = ${result.importId}::uuid`
        return { result, rows, profile: profile.p, record }
      },
    )
    expect(result).toMatchObject({ imported: 3, duplicates: 0 })
    expect(rows.map((r) => [r.amount, r.transaction_type, r.status])).toEqual([
      ["2500.00", "credit", "unmatched"],
      ["-4.50", "debit", "unmatched"],
      ["-4.50", "debit", "unmatched"],
    ])
    expect(new Set(rows.map((r) => r.import_id))).toEqual(
      new Set([result.importId]),
    )
    expect(rows.every((r) => r.bank_transaction_id.startsWith("csv:"))).toBe(
      true,
    )
    expect(profile).toMatchObject({
      dateFormat: "YYYY-MM-DD",
      columns: ["date", "description", "amount", "balance"],
    })
    expect(record).toEqual({ imported: 3, dups: 0, total: 3, check: "passed" })
  })

  it("imports nothing the second time, and records that it skipped them", async () => {
    const { second, record } = await inRollback(FINANCE, async (tx) => {
      await run(tx, JANUARY)
      const second = await run(tx, JANUARY)
      const [record] = await tx<{ imported: number; dups: number }[]>`
        SELECT transactions_imported AS imported, duplicates_skipped AS dups
          FROM bank_statement_imports WHERE id = ${second.importId}::uuid`
      return { second, record }
    })
    expect(second).toMatchObject({ imported: 0, duplicates: 3 })
    expect(record).toEqual({ imported: 0, dups: 3 })
  })

  it("adds only the new line from an overlapping statement", async () => {
    const { second, count } = await inRollback(FINANCE, async (tx) => {
      await run(tx, JANUARY)
      const second = await run(tx, OVERLAP)
      const [c] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM bank_transactions WHERE bank_account_id = ${USD_ACCOUNT}::uuid`
      return { second, count: c.n }
    })
    expect(second).toMatchObject({ imported: 1, duplicates: 1 })
    expect(count).toBe(4)
  })

  it("flags a same-date, same-amount line already on the books by another route, without skipping it", async () => {
    const found = await inRollback(FINANCE, async (tx) => {
      await tx`
        INSERT INTO bank_transactions (tenant_id, bank_account_id, transaction_date, description, amount)
        VALUES (${NORTHWIND}::uuid, ${USD_ACCOUNT}::uuid, '2026-01-09', 'Entered by hand', 20.00)`
      return imports.existingMatches(
        tx,
        USD_ACCOUNT,
        parsed(OVERLAP).transactions,
      )
    })
    expect(found.possibleDuplicateLines).toEqual([3])
    expect(found.alreadyImported.size).toBe(0)
  })
})

describe("who may import", () => {
  it("a plain employee cannot see the account to import into, or write an import record", async () => {
    const seen = await inRollback(PLAIN, (tx) =>
      imports.accountForImport(tx, USD_ACCOUNT),
    )
    expect(seen).toBeNull()
    await expect(
      inRollback(
        PLAIN,
        (tx) => tx`
        INSERT INTO bank_statement_imports (tenant_id, bank_account_id, file_name, file_format, file_sha256,
          lines_in_file, transactions_in_file, transactions_imported, duplicates_skipped, balance_check, created_by)
        VALUES (${NORTHWIND}::uuid, ${USD_ACCOUNT}::uuid, 'x.csv', 'csv', ${"0".repeat(64)}, 1, 0, 0, 0, 'unavailable', ${MARCUS}::uuid)`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it("finance_admin can — the permitted half, so the refusal above is the rule and not a broken table", async () => {
    const seen = await inRollback(FINANCE, (tx) =>
      imports.accountForImport(tx, USD_ACCOUNT),
    )
    expect(seen?.currency).toBe("USD")
  })

  it("an auditor reads imports but cannot write one", async () => {
    const AUDITOR = { ...FINANCE, functionalRoles: ["auditor"] }
    const n = await inRollback(
      AUDITOR,
      async (tx) => (await imports.recentImports(tx)).length,
    )
    expect(n).toBeGreaterThan(0)
    await expect(inRollback(AUDITOR, (tx) => run(tx, JANUARY))).rejects.toThrow(
      /row-level security/,
    )
  })
})

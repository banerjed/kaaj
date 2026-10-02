import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import { postJournal } from "./accounting.repo"

/**
 * gl_daily_balances (20261002110000) is kept in step with the ledger by
 * triggers, and the reports read it instead of every line. These assert the
 * table agrees with a GROUP BY over the posted lines after each way a posted
 * figure can move — including two posts to one account and day at once.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "48ccc5de-9ba7-5461-ab49-160a1146ed85"
/** A day with no activity in the fixture. */
const DAY = "2026-09-17"

/** Test-only: commits, and cleans up, what app_user cannot delete (posted entries). */
const superuser = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { types: {}, max: 4, onnotice: () => {} },
)

afterAll(async () => {
  await superuser.end()
  await closeConnections()
})

type Q = Tx | postgres.Sql | postgres.TransactionSql

/** Daily rows that disagree with the posted lines, in either direction. */
async function disagreements(q: Q, tenantId = NORTHWIND): Promise<number> {
  const [row] = await (q as Tx)<{ n: number }[]>`
    WITH truth AS (
      SELECT l.account_id, je.entry_date AS d,
             coalesce(sum(l.base_debit_amount), 0)  AS dr,
             coalesce(sum(l.base_credit_amount), 0) AS cr,
             count(*) AS n
        FROM journal_entry_lines l
        JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
       WHERE je.tenant_id = ${tenantId}
       GROUP BY 1, 2)
    SELECT count(*)::int AS n
      FROM truth t
      FULL JOIN (SELECT * FROM gl_daily_balances WHERE tenant_id = ${tenantId}) b
        ON b.account_id = t.account_id AND b.balance_date = t.d
     WHERE t.n IS NULL OR b.line_count IS NULL
        OR t.dr <> b.base_debit OR t.cr <> b.base_credit OR t.n <> b.line_count
  `
  return row.n
}

async function day(q: Q, code: string, d: string) {
  const [row] = await (q as Tx)<
    { base_debit: string; base_credit: string; line_count: number }[]
  >`
    SELECT b.base_debit::text, b.base_credit::text, b.line_count
      FROM gl_daily_balances b
      JOIN chart_of_accounts a ON a.id = b.account_id
     WHERE b.tenant_id = ${NORTHWIND} AND a.account_code = ${code}
       AND b.balance_date = ${d}::date
  `
  return row ?? null
}

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(AS_OWNER, async (tx) => {
      const result = await fn(tx)
      throw Object.assign(marker, { result })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

/** A draft or posted entry with one 1000/2000 pair, inserted directly. */
async function insertEntry(
  q: Q,
  number: string,
  status: "draft" | "posted",
  amount: string,
): Promise<string> {
  const [entry] = await (q as Tx)<{ id: string }[]>`
    INSERT INTO journal_entries (tenant_id, entry_number, entry_date, status, description)
    VALUES (${NORTHWIND}, ${number}, ${DAY}::date, ${status}, 'gl_daily_balances test')
    RETURNING id
  `
  await (q as Tx)`
    INSERT INTO journal_entry_lines (tenant_id, entry_id, account_id, line_number,
                                     currency, debit_amount, credit_amount,
                                     base_currency, base_debit_amount, base_credit_amount)
    SELECT ${NORTHWIND}, ${entry.id}, a.id, x.n, 'USD', x.dr::numeric, x.cr::numeric,
           'USD', x.dr::numeric, x.cr::numeric
      FROM (VALUES ('1000', 1, ${amount}, '0'), ('2000', 2, '0', ${amount}))
           AS x(code, n, dr, cr)
      JOIN chart_of_accounts a ON a.tenant_id = ${NORTHWIND} AND a.account_code = x.code
  `
  return entry.id
}

describe("gl_daily_balances", () => {
  it("agrees with the fixture's posted lines", async () => {
    expect(await disagreements(superuser)).toBe(0)
  })

  it("a posted journal moves exactly its days", async () => {
    const after = await inRollback(async (tx) => {
      await postJournal(
        tx,
        NORTHWIND,
        {
          date: DAY,
          sourceType: "manual",
          sourceId: null,
          description: "gl_daily_balances test",
          reference: null,
          currency: "USD",
          exchangeRate: "1",
          lines: [
            {
              accountCode: "1000",
              debit: "125.40",
              credit: null,
              description: "",
            },
            {
              accountCode: "2000",
              debit: null,
              credit: "125.40",
              description: "",
            },
          ],
        },
        ACTOR,
      )
      return {
        cash: await day(tx, "1000", DAY),
        payable: await day(tx, "2000", DAY),
        off: await disagreements(tx),
      }
    })
    expect(after.cash).toEqual({
      base_debit: "125.40",
      base_credit: "0.00",
      line_count: 1,
    })
    expect(after.payable).toEqual({
      base_debit: "0.00",
      base_credit: "125.40",
      line_count: 1,
    })
    expect(after.off).toBe(0)
  })

  it("a draft counts only once posted, moves with its date, and leaves when deleted", async () => {
    const marker = new Error("__rollback__")
    const seen: Record<string, unknown> = {}
    await superuser
      .begin(async (sql) => {
        const id = await insertEntry(sql, "JE-GLD-DRAFT", "draft", "80.00")
        seen.draft = await day(sql, "1000", DAY)

        await sql`UPDATE journal_entries SET status = 'posted' WHERE id = ${id}`
        seen.posted = await day(sql, "1000", DAY)

        await sql`UPDATE journal_entries SET entry_date = DATE '2026-09-18' WHERE id = ${id}`
        seen.oldDay = await day(sql, "1000", DAY)
        seen.newDay = await day(sql, "1000", "2026-09-18")

        await sql`DELETE FROM journal_entries WHERE id = ${id}`
        seen.deleted = await day(sql, "1000", "2026-09-18")
        seen.off = await disagreements(sql)
        throw marker
      })
      .catch((e) => {
        if (e !== marker) throw e
      })
    expect(seen.draft).toBeNull()
    expect(seen.posted).toEqual({
      base_debit: "80.00",
      base_credit: "0.00",
      line_count: 1,
    })
    expect(seen.oldDay).toBeNull()
    expect(seen.newDay).toEqual({
      base_debit: "80.00",
      base_credit: "0.00",
      line_count: 1,
    })
    expect(seen.deleted).toBeNull()
    expect(seen.off).toBe(0)
  })

  it("two posts to one account and day at once both count", async () => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const ids: string[] = []
    try {
      let firstInserted!: () => void
      const inserted = new Promise<void>((r) => (firstInserted = r))
      const first = superuser.begin(async (sql) => {
        ids.push(await insertEntry(sql, "JE-GLD-CONC-1", "posted", "10.00"))
        firstInserted()
        await held // keep this transaction open while the second posts
      })
      await inserted
      const second = superuser.begin(async (sql) => {
        ids.push(await insertEntry(sql, "JE-GLD-CONC-2", "posted", "32.50"))
      })
      // The second is now waiting on the first's lock for account 1000.
      setTimeout(release, 300)
      await Promise.all([first, second])

      expect(await day(superuser, "1000", DAY)).toEqual({
        base_debit: "42.50",
        base_credit: "0.00",
        line_count: 2,
      })
      expect(await disagreements(superuser)).toBe(0)
    } finally {
      release()
      if (ids.length) {
        await superuser`DELETE FROM journal_entries WHERE id = ANY(${ids}::uuid[])`
      }
    }
    expect(await day(superuser, "1000", DAY)).toBeNull()
    expect(await disagreements(superuser)).toBe(0)
  })
})

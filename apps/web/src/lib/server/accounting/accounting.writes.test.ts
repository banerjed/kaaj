import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import {
  postJournal,
  AccountingRefused,
  createInvoice,
  issueInvoice,
  recordPayment,
  recordManualJournalEntry,
  closePeriod,
  reopenPeriod,
  yearEndClose,
  previewYearEndClose,
  controlAccountTieOut,
  balanceSheetTotals,
  trialBalanceTotals,
  cashFlowTotals,
  equityStatement,
  equityStatementTotals,
  taxLiabilitySummary,
  recordAccrual,
  createAmortizationSchedule,
  listAmortizationSchedules,
  postDueAmortizations,
  invoiceForPdf,
} from "./accounting.repo"
import * as pay from "./payables.repo"

/**
 * `postJournal` itself, directly — the shared posting engine both
 * receivables.writes.test.ts and payables.writes.test.ts exercise only
 * indirectly, always with entries their own callers already constructed as
 * balanced. Per this codebase's own L48 ("a guard never observed failing is
 * not evidence"), the guards below were real but unexercised until now. Every
 * write-path case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "48ccc5de-9ba7-5461-ab49-160a1146ed85"
/**
 * Reads everything, writes nothing (`@kaaj/authz`'s own description of the
 * role) — the actor who can pass `periodState`'s SELECT (`accounting_read`)
 * and so is the one who'd reach a silently-no-op UPDATE. A plain employee
 * with no finance-visible role would be refused at the SELECT itself and
 * never get that far, which is why this test needs an auditor specifically.
 */
const AS_AUDITOR = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: ["auditor"],
  employeeId: "db1f1f2b-b140-5948-a34e-1c998ed98757",
}
/** A real employee with no finance-visible functional role at all — the actor meant to be REFUSED by RLS itself (L47). */
const AS_PLAIN_EMPLOYEE = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: [] as string[],
  employeeId: "db1f1f2b-b140-5948-a34e-1c998ed98757",
}

/** chart_of_accounts ids for `recordManualJournalEntry`'s picker-shaped input. `CASH_ACCOUNT` (1000) is declared further down, reused here. */
const REVENUE_ACCOUNT = "6d1ef213-cb96-5ad4-beaf-1d4e07242d65" // Consulting Revenue, 4000
const OTHER_REVENUE_ACCOUNT = "8e5bbb5d-e1c7-521a-b4d3-98b8cf3b40e4" // Software Revenue, 4100

/** JE-2026-0001 — a real posted entry, AR 1100 debit / Revenue 4000 credit. */
const POSTED_ENTRY = "c1c96d31-cfa4-57d3-9048-06e3ae1725e6"
/** One of JE-2026-0001's own lines — the AR debit. */
const POSTED_LINE = "34dd6b71-7040-5aa7-98c2-2fb1a0a06e48"

async function inRollbackAs<T>(
  actor: Parameters<typeof withTenant>[0],
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

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inRollbackAs(AS_OWNER, fn)
}

/** Assert not merely that a write was refused, but WHY (L60). */
async function refusedBecause(
  fn: () => Promise<unknown>,
  reason: AccountingRefused["reason"],
): Promise<void> {
  try {
    await fn()
  } catch (e) {
    expect(e).toBeInstanceOf(AccountingRefused)
    expect((e as AccountingRefused).reason).toBe(reason)
    return
  }
  throw new Error(`expected a refusal (${reason}) and the write succeeded`)
}

const baseEntry = {
  date: "2026-03-10",
  sourceType: "test",
  sourceId: "00000000-0000-0000-0000-000000000001",
  description: "postJournal direct test",
  reference: null,
  currency: "USD",
  exchangeRate: "1.000000",
}

describe("posting a journal entry directly", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("refuses zero lines, rather than inserting a header that balances 0 = 0", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          postJournal(tx, NORTHWIND, { ...baseEntry, lines: [] }, ACTOR),
        ),
      "no_lines",
    )
  })

  it("refuses a single line — one side of an entry is not a double entry", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          postJournal(
            tx,
            NORTHWIND,
            {
              ...baseEntry,
              lines: [
                {
                  accountCode: "1000",
                  debit: "100.00",
                  credit: null,
                  description: "",
                },
              ],
            },
            ACTOR,
          ),
        ),
      "no_lines",
    )
  })

  it("treats lines that net to zero after filtering as no lines at all", async () => {
    // A debit of "0" and a credit of "0" both filter out of `live` — two
    // lines in, zero real ones, same refusal as an empty array.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          postJournal(
            tx,
            NORTHWIND,
            {
              ...baseEntry,
              lines: [
                {
                  accountCode: "1000",
                  debit: "0",
                  credit: null,
                  description: "",
                },
                {
                  accountCode: "1100",
                  debit: null,
                  credit: "0",
                  description: "",
                },
              ],
            },
            ACTOR,
          ),
        ),
      "no_lines",
    )
  })

  it("refuses an entry whose debits do not equal its credits", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          postJournal(
            tx,
            NORTHWIND,
            {
              ...baseEntry,
              lines: [
                {
                  accountCode: "1000",
                  debit: "100.00",
                  credit: null,
                  description: "",
                },
                {
                  accountCode: "1100",
                  debit: null,
                  credit: "90.00",
                  description: "",
                },
              ],
            },
            ACTOR,
          ),
        ),
      "does_not_balance",
    )
  })

  it("refuses two lines that are both debits — never a credit to balance against", async () => {
    // Structurally caught by the same balance check, not a separate guard —
    // §1.1's "all-debit/all-credit lines" bullet, closed by the existing
    // does_not_balance path rather than a new one.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          postJournal(
            tx,
            NORTHWIND,
            {
              ...baseEntry,
              lines: [
                {
                  accountCode: "1000",
                  debit: "100.00",
                  credit: null,
                  description: "",
                },
                {
                  accountCode: "1100",
                  debit: "50.00",
                  credit: null,
                  description: "",
                },
              ],
            },
            ACTOR,
          ),
        ),
      "does_not_balance",
    )
  })

  it("posts a genuinely balanced two-line entry", async () => {
    const entryId = await inRollback((tx) =>
      postJournal(
        tx,
        NORTHWIND,
        {
          ...baseEntry,
          lines: [
            {
              accountCode: "1000",
              debit: "100.00",
              credit: null,
              description: "",
            },
            {
              accountCode: "1100",
              debit: null,
              credit: "100.00",
              description: "",
            },
          ],
        },
        ACTOR,
      ),
    )
    expect(entryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

/**
 * `recordManualJournalEntry` (US-ACC-034) — the manual-entry page's own
 * write, layered over `postJournal` above. What it adds is resolving the
 * picker's account IDS to the codes `postJournal` actually takes, in one
 * query rather than one per line; the balancing/period rules it delegates to
 * `postJournal` are already covered above and aren't re-verified here.
 */
describe("recording a manual journal entry", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const baseManual = {
    date: "2026-03-10",
    description: "Manual JE test",
    reference: null,
    currency: "USD",
    exchangeRate: "1.000000",
  }

  it("posts a balanced entry with source_type 'manual' and no source_id", async () => {
    const { posted, entry } = await inRollback(async (tx) => {
      const posted = await recordManualJournalEntry(
        tx,
        NORTHWIND,
        {
          ...baseManual,
          lines: [
            {
              accountId: CASH_ACCOUNT,
              debit: "250.00",
              credit: "0",
              description: "Cash side",
            },
            {
              accountId: REVENUE_ACCOUNT,
              debit: "0",
              credit: "250.00",
              description: "Revenue side",
            },
          ],
        },
        ACTOR,
      )
      const [entry] = await tx<
        { source_type: string; source_id: string | null }[]
      >`
        SELECT source_type, source_id FROM journal_entries WHERE id = ${posted.id}::uuid
      `
      return { posted, entry }
    })
    expect(posted.entryNumber).toMatch(/^JE-2026-\d{4}$/)
    expect(posted.totalDebit).toBe("250.00")
    expect(entry.source_type).toBe("manual")
    expect(entry.source_id).toBeNull()
  })

  it("resolves each line's account id to the SAME account postJournal would post to", async () => {
    const rows = await inRollback(async (tx) => {
      const posted = await recordManualJournalEntry(
        tx,
        NORTHWIND,
        {
          ...baseManual,
          lines: [
            {
              accountId: CASH_ACCOUNT,
              debit: "80.00",
              credit: "0",
              description: "",
            },
            {
              accountId: REVENUE_ACCOUNT,
              debit: "0",
              credit: "80.00",
              description: "",
            },
          ],
        },
        ACTOR,
      )
      return tx<
        { account_code: string; debit_amount: string; credit_amount: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text, l.credit_amount::text
          FROM journal_entry_lines l
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE l.entry_id = ${posted.id}::uuid
         ORDER BY l.line_number
      `
    })
    expect(rows).toEqual([
      expect.objectContaining({ account_code: "1000", debit_amount: "80.00" }),
      expect.objectContaining({
        account_code: "4000",
        credit_amount: "80.00",
      }),
    ])
  })

  it("refuses an account id that isn't in the chart of accounts, distinctly from a bad code", async () => {
    // The picker sends an id, not a code — a stale/tampered id has no code
    // for postJournal's own accountId() to even look up, so this is caught
    // one step earlier than that guard.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          recordManualJournalEntry(
            tx,
            NORTHWIND,
            {
              ...baseManual,
              lines: [
                {
                  accountId: "00000000-0000-0000-0000-000000000099",
                  debit: "50.00",
                  credit: "0",
                  description: "",
                },
                {
                  accountId: REVENUE_ACCOUNT,
                  debit: "0",
                  credit: "50.00",
                  description: "",
                },
              ],
            },
            ACTOR,
          ),
        ),
      "no_such_account",
    )
  })

  it("refuses posting into a closed period, same as any other caller of postJournal", async () => {
    // January 2026 is closed in the fixture (see "closed accounting
    // periods" in receivables.writes.test.ts).
    await refusedBecause(
      () =>
        inRollback((tx) =>
          recordManualJournalEntry(
            tx,
            NORTHWIND,
            {
              ...baseManual,
              date: "2026-01-15",
              lines: [
                {
                  accountId: CASH_ACCOUNT,
                  debit: "10.00",
                  credit: "0",
                  description: "",
                },
                {
                  accountId: REVENUE_ACCOUNT,
                  debit: "0",
                  credit: "10.00",
                  description: "",
                },
              ],
            },
            ACTOR,
          ),
        ),
      "period_closed",
    )
  })

  it("refuses an entry that balances in its native currency but not after per-line rounding to base, and says so distinctly", async () => {
    // round(0.05*1.1,2)=0.06 but round(0.02*1.1,2)+round(0.03*1.1,2)=0.05 —
    // native debits (0.05) equal native credits (0.02+0.03=0.05), yet the
    // base side does not, because postJournal rounds PER LINE (L25) rather
    // than rounding one combined total. Unlike issueInvoice/approveBill,
    // whose lines come from computed invoice/bill totals, this is the first
    // caller where a person types arbitrary native amounts against an
    // arbitrary rate, so this divergence is newly reachable here — and
    // because it's newly reachable, the refusal must say WHICH side failed
    // rather than a bare "does not balance" a person could see is false of
    // the native amounts in front of them.
    try {
      await inRollback((tx) =>
        recordManualJournalEntry(
          tx,
          NORTHWIND,
          {
            ...baseManual,
            exchangeRate: "1.1",
            lines: [
              {
                accountId: CASH_ACCOUNT,
                debit: "0.05",
                credit: "0",
                description: "",
              },
              {
                accountId: REVENUE_ACCOUNT,
                debit: "0",
                credit: "0.02",
                description: "",
              },
              {
                accountId: OTHER_REVENUE_ACCOUNT,
                debit: "0",
                credit: "0.03",
                description: "",
              },
            ],
          },
          ACTOR,
        ),
      )
      throw new Error(
        "expected a does_not_balance refusal and the write succeeded",
      )
    } catch (e) {
      expect(e).toBeInstanceOf(AccountingRefused)
      expect((e as AccountingRefused).reason).toBe("does_not_balance")
      expect((e as AccountingRefused).detail).toMatch(
        /debits 0\.05 equal credits 0\.05/,
      )
      expect((e as AccountingRefused).detail).toMatch(
        /base debits 0\.06 do not equal base credits 0\.05/,
      )
    }
  })
})

/**
 * Period close/reopen (US-ACC-035, INV-ACC-002). Before this, the only way a
 * period became `closed`/`locked` was a hand-written fixture row — nothing
 * in `apps/web/src/lib/server` wrote `accounting_periods.status` at all.
 */
describe("closing and reopening an accounting period", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const OPEN_PERIOD = "5b1446f7-7db5-54f5-bf88-a3c4527d6027" // February 2026
  const CLOSED_PERIOD = "c4fff2b2-1b53-592f-84f6-586e3b2ca0dc" // January 2026
  const LOCKED_PERIOD = "957b6ce4-6f44-50c1-84b1-d9bdb8892585" // December 2025

  it("closes an open period, setting closed_by/closed_at", async () => {
    const row = await inRollback(async (tx) => {
      await closePeriod(tx, OPEN_PERIOD, ACTOR)
      const [row] = await tx<
        { status: string; closed_by: string; closed_at: string | null }[]
      >`
        SELECT status, closed_by::text, closed_at::text
          FROM accounting_periods WHERE id = ${OPEN_PERIOD}::uuid
      `
      return row
    })
    expect(row.status).toBe("closed")
    expect(row.closed_by).toBe(ACTOR)
    expect(row.closed_at).not.toBeNull()
  })

  it("refuses to close a period that is not open", async () => {
    await refusedBecause(
      () => inRollback((tx) => closePeriod(tx, CLOSED_PERIOD, ACTOR)),
      "wrong_status",
    )
  })

  it("reopens a closed period, clearing closed_by/closed_at", async () => {
    const row = await inRollback(async (tx) => {
      await reopenPeriod(tx, CLOSED_PERIOD)
      const [row] = await tx<
        { status: string; closed_by: string | null; closed_at: string | null }[]
      >`
        SELECT status, closed_by::text, closed_at::text
          FROM accounting_periods WHERE id = ${CLOSED_PERIOD}::uuid
      `
      return row
    })
    expect(row.status).toBe("open")
    expect(row.closed_by).toBeNull()
    expect(row.closed_at).toBeNull()
  })

  it("refuses to reopen a period that is not closed (open)", async () => {
    await refusedBecause(
      () => inRollback((tx) => reopenPeriod(tx, OPEN_PERIOD)),
      "wrong_status",
    )
  })

  it("refuses to reopen a LOCKED period — reopening a lock is a separate, unbuilt process", async () => {
    await refusedBecause(
      () => inRollback((tx) => reopenPeriod(tx, LOCKED_PERIOD)),
      "wrong_status",
    )
  })

  it("refuses a nonexistent period, for both close and reopen", async () => {
    const bogus = "00000000-0000-0000-0000-000000000099"
    await refusedBecause(
      () => inRollback((tx) => closePeriod(tx, bogus, ACTOR)),
      "no_such_period",
    )
    await refusedBecause(
      () => inRollback((tx) => reopenPeriod(tx, bogus)),
      "no_such_period",
    )
  })

  it("an auditor can see a period but the write is refused, not silently a no-op (L47, L68)", async () => {
    // An auditor passes accounting_periods' READ policy (finance-visible,
    // and an auditor reads everything) — the only actor who can reach the
    // UPDATE while `accounting_update`'s separate RESTRICTIVE policy still
    // blocks it. Without the RETURNING check this would silently affect
    // zero rows and still report the period as closed/reopened.
    await refusedBecause(
      () =>
        inRollbackAs(AS_AUDITOR, (tx) => closePeriod(tx, OPEN_PERIOD, ACTOR)),
      "no_such_period",
    )
    await refusedBecause(
      () => inRollbackAs(AS_AUDITOR, (tx) => reopenPeriod(tx, CLOSED_PERIOD)),
      "no_such_period",
    )
    // Positive control: the SELECT really did succeed for this actor (an
    // empty result here would make the refusal above vacuous, not proven).
    const seen = await inRollbackAs(
      AS_AUDITOR,
      (tx) =>
        tx<{ status: string }[]>`
          SELECT status FROM accounting_periods WHERE id = ${OPEN_PERIOD}::uuid
        `,
    )
    expect(seen).toHaveLength(1)
  })

  /**
   * The two tests above each verify one half in isolation: `closePeriod`
   * writes `status`, and `postJournal` already refuses a non-open period
   * (via the fixture's pre-closed January). Neither proves the two are
   * actually WIRED to each other — a `closePeriod` that wrote `'cIosed'`
   * would pass every test above. These compose them for real.
   */
  it("closing a period actually stops a posting into it", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          await closePeriod(tx, OPEN_PERIOD, ACTOR) // February 2026
          return recordManualJournalEntry(
            tx,
            NORTHWIND,
            {
              date: "2026-02-15",
              description: "Should be refused — period just closed",
              reference: null,
              currency: "USD",
              exchangeRate: "1.000000",
              lines: [
                {
                  accountId: CASH_ACCOUNT,
                  debit: "10.00",
                  credit: "0",
                  description: "",
                },
                {
                  accountId: REVENUE_ACCOUNT,
                  debit: "0",
                  credit: "10.00",
                  description: "",
                },
              ],
            },
            ACTOR,
          )
        }),
      "period_closed",
    )
  })

  it("reopening a period actually allows posting into it again", async () => {
    // January 2026 is closed in the fixture; postJournal already refuses a
    // posting there (see "closed accounting periods" in
    // receivables.writes.test.ts) — this proves reopen lifts that refusal,
    // not just that the status column changed.
    const entryId = await inRollback(async (tx) => {
      await reopenPeriod(tx, CLOSED_PERIOD)
      const posted = await recordManualJournalEntry(
        tx,
        NORTHWIND,
        {
          date: "2026-01-20",
          description: "Should succeed — period just reopened",
          reference: null,
          currency: "USD",
          exchangeRate: "1.000000",
          lines: [
            {
              accountId: CASH_ACCOUNT,
              debit: "10.00",
              credit: "0",
              description: "",
            },
            {
              accountId: REVENUE_ACCOUNT,
              debit: "0",
              credit: "10.00",
              description: "",
            },
          ],
        },
        ACTOR,
      )
      return posted.id
    })
    expect(entryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

/**
 * Year-end close (US-ACC-051). Figures below were verified independently
 * against the real database via psql before writing this test — revenue
 * 4000 nets 42300.00, expenses 5000/5100/5300 net 96500.00/900.00/1820.00
 * (99220.00 together), and `balanceSheetComparisonTotals`'s own trusted
 * `net_income` for `asOf: "2026-12-31"` is `-56920.00` — 42300 - 99220.
 */
describe("year-end close", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const AS_OF = "2026-12-31"

  it("previews the same figures it would post, matching the independently-verified net income", async () => {
    const preview = await inRollback((tx) => previewYearEndClose(tx, AS_OF))
    expect(preview.netIncome).toBe("-56920.00")
    const byCode = Object.fromEntries(
      preview.lines.map((l) => [l.account_code, l.net]),
    )
    expect(byCode["4000"]).toBe("42300.00")
    expect(byCode["5000"]).toBe("96500.00")
    expect(byCode["5100"]).toBe("900.00")
    expect(byCode["5300"]).toBe("1820.00")
    // Zero-activity revenue/expense accounts (4100, 4200, 5200, 5400, 5500,
    // 5600) are excluded — nothing to zero, and postJournal would drop a
    // zero-amount line anyway.
    expect(preview.lines.length).toBe(4)
  })

  it("posts a balanced closing entry: revenue debited, expenses credited, the net LOSS debited to retained earnings", async () => {
    const rows = await inRollback(async (tx) => {
      const { entryNumber, netIncome } = await yearEndClose(
        tx,
        NORTHWIND,
        { asOf: AS_OF, expectedNetIncome: "-56920.00" },
        ACTOR,
      )
      expect(netIncome).toBe("-56920.00")
      return tx<
        { account_code: string; debit_amount: string; credit_amount: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text, l.credit_amount::text
          FROM journal_entry_lines l
          JOIN journal_entries je ON je.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE je.entry_number = ${entryNumber}
         ORDER BY l.line_number
      `
    })
    const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r]))
    expect(byCode["4000"]).toMatchObject({ debit_amount: "42300.00" })
    expect(byCode["5000"]).toMatchObject({ credit_amount: "96500.00" })
    expect(byCode["5100"]).toMatchObject({ credit_amount: "900.00" })
    expect(byCode["5300"]).toMatchObject({ credit_amount: "1820.00" })
    // Retained Earnings (3000) — a net LOSS is a DEBIT to equity.
    expect(byCode["3000"]).toMatchObject({ debit_amount: "56920.00" })
  })

  it("is idempotent by construction — running it again finds nothing left to close", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          await yearEndClose(
            tx,
            NORTHWIND,
            { asOf: AS_OF, expectedNetIncome: "-56920.00" },
            ACTOR,
          )
          // The first close's own lines are posted activity too — a second
          // close as of the same date finds every account back at zero.
          return yearEndClose(
            tx,
            NORTHWIND,
            { asOf: AS_OF, expectedNetIncome: "0" },
            ACTOR,
          )
        }),
      "no_lines",
    )
  })

  it("really did zero the books — a preview taken after the close finds nothing left", async () => {
    const after = await inRollback(async (tx) => {
      await yearEndClose(
        tx,
        NORTHWIND,
        { asOf: AS_OF, expectedNetIncome: "-56920.00" },
        ACTOR,
      )
      return previewYearEndClose(tx, AS_OF)
    })
    expect(after.lines).toEqual([])
    expect(after.netIncome).toBe("0.00")
  })

  it("refuses closing on a stale preview — something posted after the page loaded", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          yearEndClose(
            tx,
            NORTHWIND,
            { asOf: AS_OF, expectedNetIncome: "-1.00" },
            ACTOR,
          ),
        ),
      "allocation_mismatch",
    )
  })

  it("refuses posting into a closed period, same as any other caller of postJournal", async () => {
    // January 2026 is closed in the fixture.
    await inRollback(async (tx) => {
      const preview = await previewYearEndClose(tx, "2026-01-31")
      await refusedBecause(
        () =>
          yearEndClose(
            tx,
            NORTHWIND,
            { asOf: "2026-01-31", expectedNetIncome: preview.netIncome },
            ACTOR,
          ),
        "period_closed",
      )
    })
  })

  it("is visible to the finance function only", async () => {
    const refused = await inRollbackAs(AS_PLAIN_EMPLOYEE, (tx) =>
      previewYearEndClose(tx, AS_OF),
    )
    expect(refused.lines).toEqual([])
    expect(refused.netIncome).toBe("0")
  })
})

describe("a posted journal entry resists an UPDATE", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("silently touches zero rows on the header, even as an owner", async () => {
    const rows = await inRollback(
      (tx) => tx<{ id: string }[]>`
        UPDATE journal_entries SET description = 'tampered'
         WHERE id = ${POSTED_ENTRY}::uuid
        RETURNING id
      `,
    )
    // RESTRICTIVE accounting_update now requires status <> 'posted' — this
    // row is posted, so RLS makes it invisible to the UPDATE rather than
    // erroring: `rows` comes back empty, not a permission error (L47/L62's
    // own lesson — a refusal here is a wrong number, not a thrown exception).
    expect(rows).toEqual([])
    const [after] = await inRollback(
      (tx) => tx<{ description: string }[]>`
        SELECT description FROM journal_entries WHERE id = ${POSTED_ENTRY}::uuid
      `,
    )
    expect(after.description).not.toBe("tampered")
  })

  it("silently touches zero rows on its lines too, via the parent's status", async () => {
    const rows = await inRollback(
      (tx) => tx<{ id: string }[]>`
        UPDATE journal_entry_lines SET description = 'tampered'
         WHERE id = ${POSTED_LINE}::uuid
        RETURNING id
      `,
    )
    expect(rows).toEqual([])
  })

  // Positive control (L48: "a guard never observed failing is not evidence"
  // cuts both ways — a guard never observed PERMITTING anything is not
  // evidence either. Every real row in this table is 'posted', so the two
  // cases above alone can't tell "immutability enforced" apart from "nobody
  // can UPDATE this table at all." A status column with no CHECK behind it
  // (L57) lets a test write the one case production code never does.
  it("still allows the update on a status that is not posted — the predicate discriminates, not just denies", async () => {
    const { headerRows, headerAfter, lineRows } = await inRollback(
      async (tx) => {
        const [draft] = await tx<{ id: string }[]>`
          INSERT INTO journal_entries (
            tenant_id, entry_number, entry_date, description, status
          ) VALUES (
            ${NORTHWIND}::uuid, 'JE-TEST-DRAFT', DATE '2026-03-10',
            'draft entry for the immutability positive control', 'draft'
          )
          RETURNING id
        `
        const headerRows = await tx<{ id: string }[]>`
          UPDATE journal_entries SET description = 'edited while draft'
           WHERE id = ${draft.id}::uuid
          RETURNING id
        `
        const [headerAfter] = await tx<{ description: string }[]>`
          SELECT description FROM journal_entries WHERE id = ${draft.id}::uuid
        `

        // The lines policy is the one rewritten from NOT EXISTS to EXISTS
        // (fail-closed on an invisible parent) — an empty-result test alone
        // can't tell "the flipped form still permits what it should" apart
        // from "the flipped form now denies everything." This is that check.
        const [line] = await tx<{ id: string }[]>`
          INSERT INTO journal_entry_lines (
            tenant_id, entry_id, account_id, line_number, currency,
            debit_amount, base_currency, base_debit_amount
          ) VALUES (
            ${NORTHWIND}::uuid, ${draft.id}::uuid,
            'a6ecad5d-10af-5286-807b-cd31b3266d99'::uuid,
            1, 'USD', 1.00, 'USD', 1.00
          )
          RETURNING id
        `
        const lineRows = await tx<{ id: string }[]>`
          UPDATE journal_entry_lines SET description = 'edited while draft'
           WHERE id = ${line.id}::uuid
          RETURNING id
        `
        return { headerRows, headerAfter, lineRows }
      },
    )
    expect(headerRows).toHaveLength(1)
    expect(headerAfter.description).toBe("edited while draft")
    expect(lineRows).toHaveLength(1)
  })
})

/** Acme Manufacturing — a real fixture customer, USD. */
const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
/** Helios Energy — tax-exempt through 2026-12-31 in the fixture. */
const HELIOS = "df492f8b-55ce-504f-869d-52f5ffc6292d"
/** Amazon Web Services — a real fixture vendor, USD. */
const AWS_VENDOR = "8a0bb1a6-448e-50f5-bbc0-1a41850d2e92"
const SOFTWARE_ACCOUNT = "030e294b-88ad-544e-841a-cfda187885ac"
const BANK_ACCOUNT = "6d55e7d0-f085-5951-9f28-2fcd1b75c6bc"
/** A different real employee — recordVendorPayment refuses the same actor who approved. */
const PAYER = "11f31511-ad53-59c7-9e90-8ee3b553489b"

describe("the control-account tie-out reflects a clean write", () => {
  afterAll(async () => {
    await closeConnections()
  })

  // The real Northwind fixture does not tie out today (accounting.test.ts's
  // own "do not tie to their subledgers" case) — most of its invoices/bills
  // were hand-authored without a matching posted journal entry. That is not
  // something a single test can construct its way around: the fixture is
  // shared, and this test cannot delete or fix those rows. So rather than
  // asserting the WHOLE tenant ties out, this proves the narrower, honest
  // claim: a fresh invoice taken all the way to fully paid — through the
  // real write path, not a hand-inserted row — changes the AR difference by
  // exactly zero. A write path that quietly introduced drift would move
  // this number; one that doesn't, won't.
  it("a fresh invoice, issued and paid in full, adds zero net drift to AR", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const [beforeRow] = (await controlAccountTieOut(tx)).filter(
        (r) => r.account_code === "1100",
      )

      const { id: invoiceId } = await createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: ACME,
          invoiceDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          footerText: null,
          lines: [
            {
              description: "Consulting",
              quantity: "1",
              unitPrice: "500.00",
              discountPercent: "0",
              taxAmount: "0",
            },
          ],
        },
        ACTOR,
      )
      await issueInvoice(tx, NORTHWIND, invoiceId, ACTOR)
      await recordPayment(
        tx,
        NORTHWIND,
        {
          invoiceId,
          amount: "500.00",
          paymentDate: "2026-03-15",
          method: "wire_transfer",
          reference: "WIRE-TIEOUT-TEST",
          bankAccountId: BANK_ACCOUNT,
        },
        ACTOR,
      )

      const [afterRow] = (await controlAccountTieOut(tx)).filter(
        (r) => r.account_code === "1100",
      )
      return { before: beforeRow, after: afterRow }
    })
    expect(after.difference).toBe(before.difference)
  })

  it("a fresh bill, approved and paid in full, adds zero net drift to AP", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const [beforeRow] = (await controlAccountTieOut(tx)).filter(
        (r) => r.account_code === "2000",
      )

      const { id: billId } = await pay.createBill(
        tx,
        NORTHWIND,
        {
          vendorId: AWS_VENDOR,
          billNumber: "BILL-AWS-TIEOUT-TEST",
          reference: null,
          billDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          lines: [
            {
              description: "Cloud hosting",
              quantity: "1",
              unitPrice: "300.00",
              taxAmount: "0",
              expenseAccountId: SOFTWARE_ACCOUNT,
            },
          ],
        },
        ACTOR,
      )
      await pay.approveBill(tx, NORTHWIND, billId, ACTOR)
      await pay.recordVendorPayment(
        tx,
        NORTHWIND,
        {
          billId,
          amount: "300.00",
          paymentDate: "2026-03-15",
          method: "wire_transfer",
          reference: "WIRE-TIEOUT-TEST-AP",
          bankAccountId: BANK_ACCOUNT,
        },
        PAYER,
      )

      const [afterRow] = (await controlAccountTieOut(tx)).filter(
        (r) => r.account_code === "2000",
      )
      return { before: beforeRow, after: afterRow }
    })
    expect(after.difference).toBe(before.difference)
  })
})

/** Cash at Bank (1000) — a real fixture account, used by its id for the raw INSERT below. */
const CASH_ACCOUNT = "eef02e95-6acb-5039-8acc-56340013e53a"

describe("the balance sheet, trial balance, cash flow and equity statement's checks are real, not vacuous", () => {
  afterAll(async () => {
    await closeConnections()
  })

  // The fixture's only other equity activity is the opening-balance entry
  // dated 2026-01-01 (accounting.test.ts, "the statement of changes in
  // equity"), well before this posting — so every figure here is queried
  // with `from` set to the posting's own date, isolating exactly what this
  // test added rather than depending on the fixture carrying zero equity
  // activity of its own.
  it("a posted credit to Retained Earnings shows up in `equity`, and total_equity still adds net_income to it", async () => {
    const {
      before,
      after,
      equityRow,
      equityTotals,
      equityTotalsUnfiltered,
      equityRowNextDay,
      equityTotalsNextDay,
    } = await inRollback(async (tx) => {
      const before = await balanceSheetTotals(tx)
      await postJournal(
        tx,
        NORTHWIND,
        {
          ...baseEntry,
          description: "equity-term positive control",
          lines: [
            {
              accountCode: "1000",
              debit: "500.00",
              credit: null,
              description: "",
            },
            {
              accountCode: "3000",
              debit: null,
              credit: "500.00",
              description: "",
            },
          ],
        },
        ACTOR,
      )
      const after = await balanceSheetTotals(tx)
      const [equityRow] = (
        await equityStatement(tx, { from: baseEntry.date })
      ).filter((r) => r.account_code === "3000")
      const equityTotals = await equityStatementTotals(tx, {
        from: baseEntry.date,
      })
      // Unfiltered, to cross-check against balanceSheetTotals().total_equity
      // for the same (unbounded) as-of point — the `from`-filtered totals
      // above answer a different question ("what did this test add") and
      // aren't comparable to `after`, which is itself unfiltered.
      const equityTotalsUnfiltered = await equityStatementTotals(tx)
      // Asking for a period starting the NEXT day is the one case that
      // actually exercises the "the posting falls before `from`" arm of the
      // FILTER — every other assertion here leaves the posting itself on or
      // after `from`, which never proves the `<` boundary is right rather
      // than always-true (L50: a comparison never seen both ways is not
      // evidence it's the right one).
      const [equityRowNextDay] = (
        await equityStatement(tx, { from: "2026-03-11" })
      ).filter((r) => r.account_code === "3000")
      // equityStatementTotals() runs its OWN copy of the same FILTER
      // (L82 forbade sharing a parameterized fragment across functions),
      // so proving the row-level copy honors `from` says nothing about
      // this one — it needs its own positive control.
      const equityTotalsNextDay = await equityStatementTotals(tx, {
        from: "2026-03-11",
      })
      return {
        before,
        after,
        equityRow,
        equityTotals,
        equityTotalsUnfiltered,
        equityRowNextDay,
        equityTotalsNextDay,
      }
    })
    expect(before.equity).toBe("20000.00")
    expect(after.equity).toBe("20500.00")
    expect(Number(after.total_equity)).toBeCloseTo(
      Number(after.equity) + Number(after.net_income),
      2,
    )
    expect(after.balances).toBe(true)

    // `from` set to the posting's own date excludes it from
    // beginning_balance (the FILTER is strictly `<`), so direct_changes is
    // exactly the $500 this test posted, regardless of the fixture's other
    // equity activity.
    expect(equityRow.beginning_balance).toBe("20000.00")
    expect(equityRow.direct_changes).toBe("500.00")
    expect(equityRow.ending_balance).toBe("20500.00")
    expect(equityTotals.beginning_equity).toBe("20000.00")
    expect(equityTotals.direct_changes).toBe("500.00")
    expect(equityTotals.ending_equity).toBe("20500.00")
    expect(
      equityTotalsUnfiltered.ending_equity_including_current_earnings,
    ).toBe(after.total_equity)

    // `from` set to the day after the posting: the posting now falls BEFORE
    // the period, so it belongs in beginning_balance, not direct_changes.
    expect(equityRowNextDay.beginning_balance).toBe("20500.00")
    expect(equityRowNextDay.direct_changes).toBe("0.00")
    expect(equityRowNextDay.ending_balance).toBe("20500.00")

    // Same proof, at the totals level — its own copy of the FILTER.
    expect(equityTotalsNextDay.beginning_equity).toBe("20500.00")
    expect(equityTotalsNextDay.direct_changes).toBe("0.00")
  })

  // Every other test observes `balances: true` — including the refused-actor
  // case, which is vacuously 0 = 0 + 0 + 0. `unbalanced()`'s own doc comment
  // says this is "checked at request time, not just by the schema/harness,"
  // implying no DB-level CHECK stops a one-sided posted entry — so the
  // `balances: false` branch, and both pages' error-alert markup, have never
  // actually been observed (CLAUDE.md: "a guard never observed failing is
  // not evidence"). This inserts one directly, bypassing postJournal (which
  // would refuse it), the same way the immutability positive control does.
  //
  // The same insert also proves trialBalanceTotals().balances (accounting.
  // test.ts's "the trial balance") is a live check and not just a boolean
  // that has only ever been asked a question with one answer — it sums the
  // same journal_entry_lines, so the one-sided row moves both at once. And
  // since the debit lands on Cash (is_bank_account), it inflates the real
  // Cash balance with no offsetting change anywhere else — proving
  // cashFlowTotals().reconciles is a live check too, not one that has only
  // ever seen a ledger where the identity happens to hold.
  it("a one-sided posted entry — bypassing postJournal's own balance guard — makes `balances`/`reconciles` false", async () => {
    const { balanceSheetBalances, trialBalanceBalances, cashFlowReconciles } =
      await inRollback(async (tx) => {
        const [entry] = await tx<{ id: string }[]>`
        INSERT INTO journal_entries (
          tenant_id, entry_number, entry_date, description, status
        ) VALUES (
          ${NORTHWIND}::uuid, 'JE-TEST-ONESIDED', DATE '2026-03-10',
          'one-sided entry for the balances-false positive control', 'posted'
        )
        RETURNING id
      `
        await tx`
        INSERT INTO journal_entry_lines (
          tenant_id, entry_id, account_id, line_number, currency,
          debit_amount, base_currency, base_debit_amount
        ) VALUES (
          ${NORTHWIND}::uuid, ${entry.id}::uuid, ${CASH_ACCOUNT}::uuid,
          1, 'USD', 250.00, 'USD', 250.00
        )
      `
        return {
          balanceSheetBalances: (await balanceSheetTotals(tx)).balances,
          trialBalanceBalances: (await trialBalanceTotals(tx)).balances,
          cashFlowReconciles: (await cashFlowTotals(tx)).reconciles,
        }
      })
    expect(balanceSheetBalances).toBe(false)
    expect(trialBalanceBalances).toBe(false)
    expect(cashFlowReconciles).toBe(false)
  })
})

/** US-ACC-050 — a tax-exempt customer, and an exemption that can expire. */
describe("tax-exempt customers", () => {
  afterAll(async () => {
    await closeConnections()
  })

  function oneLine(taxAmount: string) {
    return [
      {
        description: "Consulting",
        quantity: "1",
        unitPrice: "500.00",
        discountPercent: "0",
        taxAmount,
      },
    ]
  }

  it("createInvoice refuses a taxed line for a customer exempt as of the invoice date", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          createInvoice(
            tx,
            NORTHWIND,
            {
              customerId: HELIOS,
              invoiceDate: "2026-06-01", // within HELIOS's exemption window
              dueDate: "2026-07-01",
              exchangeRate: "1.000000",
              paymentTerms: null,
              notes: null,
              footerText: null,
              lines: oneLine("10.00"),
            },
            ACTOR,
          ),
        ),
      "customer_tax_exempt",
    )
  })

  it("createInvoice allows a zero-tax line for a customer exempt as of the invoice date", async () => {
    const { id } = await inRollback((tx) =>
      createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: HELIOS,
          invoiceDate: "2026-06-01",
          dueDate: "2026-07-01",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          footerText: null,
          lines: oneLine("0"),
        },
        ACTOR,
      ),
    )
    expect(id).toBeTruthy()
  })

  it("createInvoice allows a taxed line once the exemption has expired", async () => {
    const { id } = await inRollback((tx) =>
      createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: HELIOS,
          invoiceDate: "2027-01-15", // after HELIOS's 2026-12-31 tax_exempt_until
          dueDate: "2027-02-15",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          footerText: null,
          lines: oneLine("10.00"),
        },
        ACTOR,
      ),
    )
    expect(id).toBeTruthy()
  })

  // The draft was created while the customer was not exempt at all — this is
  // the case createInvoice's own check cannot see, and the reason the same
  // check is repeated in issueInvoice: the money-moving step, not the draft.
  it("issueInvoice refuses to post a taxed invoice once the customer becomes exempt for its date, even though the draft was created before that", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const { id: invoiceId } = await createInvoice(
            tx,
            NORTHWIND,
            {
              customerId: ACME,
              invoiceDate: "2026-06-01",
              dueDate: "2026-07-01",
              exchangeRate: "1.000000",
              paymentTerms: null,
              notes: null,
              footerText: null,
              lines: oneLine("10.00"),
            },
            ACTOR,
          )
          await tx`
            UPDATE customers
               SET is_tax_exempt = TRUE, tax_exempt_until = '2026-12-31'
             WHERE id = ${ACME}::uuid
          `
          await issueInvoice(tx, NORTHWIND, invoiceId, ACTOR)
        }),
      "customer_tax_exempt",
    )
  })
})

/** US-ACC-048/049 — sales tax liability, grouped by jurisdiction, read from the real posted GL. */
describe("tax liability by jurisdiction", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const NY_RATE = "a1952ec4-9252-5bbf-89aa-9f2e89d7ef53" // TAX-US-NY-2026
  const GB_VAT_RATE = "f740baac-f88d-557d-b54d-ea24fe1a0b91" // TAX-GB-VAT-2026

  it("issueInvoice posts one GL tax line per rate, not one lump sum, when an invoice mixes rates", async () => {
    const rows = await inRollback(async (tx) => {
      const { id: invoiceId } = await createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: ACME,
          invoiceDate: "2026-05-05",
          dueDate: "2026-06-05",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          footerText: null,
          lines: [
            {
              description: "Consulting (NY)",
              quantity: "1",
              unitPrice: "100.00",
              discountPercent: "0",
              taxAmount: "10.00",
              taxRateId: NY_RATE,
            },
            {
              description: "Consulting (UK)",
              quantity: "1",
              unitPrice: "50.00",
              discountPercent: "0",
              taxAmount: "5.00",
              taxRateId: GB_VAT_RATE,
            },
          ],
        },
        ACTOR,
      )
      await issueInvoice(tx, NORTHWIND, invoiceId, ACTOR)
      return tx<{ tax_rate_id: string | null; credit_amount: string }[]>`
        SELECT jel.tax_rate_id, jel.credit_amount::text
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.entry_id
          JOIN chart_of_accounts a ON a.id = jel.account_id
         WHERE je.source_type = 'invoice' AND je.source_id = ${invoiceId}::uuid
           AND a.account_code = '2200'
         ORDER BY jel.line_number
      `
    })
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.tax_rate_id === NY_RATE)?.credit_amount).toBe(
      "10.00",
    )
    expect(rows.find((r) => r.tax_rate_id === GB_VAT_RATE)?.credit_amount).toBe(
      "5.00",
    )
  })

  it("approveBill posts one GL tax line per rate, not one lump sum, when a bill mixes rates", async () => {
    const rows = await inRollback(async (tx) => {
      const { id: billId } = await pay.createBill(
        tx,
        NORTHWIND,
        {
          vendorId: AWS_VENDOR,
          billNumber: "BILL-MIXED-RATE-TEST",
          reference: null,
          billDate: "2026-05-05",
          dueDate: "2026-06-05",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          lines: [
            {
              description: "Cloud hosting (NY)",
              quantity: "1",
              unitPrice: "200.00",
              taxAmount: "8.00",
              taxRateId: NY_RATE,
              expenseAccountId: SOFTWARE_ACCOUNT,
            },
            {
              description: "Cloud hosting (UK)",
              quantity: "1",
              unitPrice: "100.00",
              taxAmount: "4.00",
              taxRateId: GB_VAT_RATE,
              expenseAccountId: SOFTWARE_ACCOUNT,
            },
          ],
        },
        ACTOR,
      )
      await pay.approveBill(tx, NORTHWIND, billId, ACTOR)
      return tx<{ tax_rate_id: string | null; debit_amount: string }[]>`
        SELECT jel.tax_rate_id, jel.debit_amount::text
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.entry_id
          JOIN chart_of_accounts a ON a.id = jel.account_id
         WHERE je.source_type = 'bill' AND je.source_id = ${billId}::uuid
           AND a.account_code = '1200'
         ORDER BY jel.line_number
      `
    })
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.tax_rate_id === NY_RATE)?.debit_amount).toBe(
      "8.00",
    )
    expect(rows.find((r) => r.tax_rate_id === GB_VAT_RATE)?.debit_amount).toBe(
      "4.00",
    )
  })

  it("summarizes output tax, input tax and net liability per jurisdiction from real posted activity", async () => {
    const rows = await inRollback(async (tx) => {
      const { id: invoiceId } = await createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: ACME,
          invoiceDate: "2026-05-06",
          dueDate: "2026-06-06",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          footerText: null,
          lines: [
            {
              description: "Consulting",
              quantity: "1",
              unitPrice: "100.00",
              discountPercent: "0",
              taxAmount: "20.00",
              taxRateId: NY_RATE,
            },
          ],
        },
        ACTOR,
      )
      await issueInvoice(tx, NORTHWIND, invoiceId, ACTOR)

      const { id: billId } = await pay.createBill(
        tx,
        NORTHWIND,
        {
          vendorId: AWS_VENDOR,
          billNumber: "BILL-NY-LIABILITY-TEST",
          reference: null,
          billDate: "2026-05-06",
          dueDate: "2026-06-06",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          lines: [
            {
              description: "Cloud hosting",
              quantity: "1",
              unitPrice: "100.00",
              taxAmount: "6.00",
              taxRateId: NY_RATE,
              expenseAccountId: SOFTWARE_ACCOUNT,
            },
          ],
        },
        ACTOR,
      )
      await pay.approveBill(tx, NORTHWIND, billId, ACTOR)

      return taxLiabilitySummary(tx, { from: "2026-05-06", to: "2026-05-06" })
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].tax_rate_id).toBe(NY_RATE)
    expect(rows[0].output_tax).toBe("20.00")
    expect(rows[0].input_tax).toBe("6.00")
    expect(rows[0].net_liability).toBe("14.00")
  })

  it("labels tax posted with no configured rate as its own explicit row, not folded into a real jurisdiction", async () => {
    const rows = await inRollback(async (tx) => {
      const { id: invoiceId } = await createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: ACME,
          invoiceDate: "2026-05-07",
          dueDate: "2026-06-07",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          footerText: null,
          lines: [
            {
              description: "Consulting",
              quantity: "1",
              unitPrice: "100.00",
              discountPercent: "0",
              taxAmount: "12.00", // no taxRateId
            },
          ],
        },
        ACTOR,
      )
      await issueInvoice(tx, NORTHWIND, invoiceId, ACTOR)
      return taxLiabilitySummary(tx, { from: "2026-05-07", to: "2026-05-07" })
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].tax_rate_id).toBeNull()
    expect(rows[0].output_tax).toBe("12.00")
  })

  // Not synthetic — this is the fixture's own only real posted tax line
  // (BILL-AWS-2026-01's recoverable input tax), tagged with its rate by a
  // targeted UPDATE in mock-data.sql. It's asymmetric on purpose: input tax
  // with no matching output tax anywhere in the committed fixture, which is
  // exactly the shape that would silently render as a blank cell if the
  // report's `coalesce` around each FILTER'd sum were ever dropped.
  it("the committed fixture's one real posted tax line shows up as a genuine (not synthetic) row", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => taxLiabilitySummary(tx, {}))
    const ny = rows.find((r) => r.tax_rate_id === NY_RATE)
    expect(ny).toBeDefined()
    expect(ny?.output_tax).toBe("0")
    expect(ny?.input_tax).toBe("161.53")
    expect(ny?.net_liability).toBe("-161.53")
  })
})

describe("accruals and amortization (§11)", () => {
  const FEBRUARY = "5b1446f7-7db5-54f5-bf88-a3c4527d6027" // open, ends 2026-02-28
  const JANUARY_CLOSED = "c4fff2b2-1b53-592f-84f6-586e3b2ca0dc" // closed
  const MARCH = "00c27197-c84b-5af8-b168-1799c7df579d" // open — the LAST fixture period, nothing follows it
  const SOFTWARE_SUBSCRIPTIONS = "030e294b-88ad-544e-841a-cfda187885ac"
  const ACCRUED_LIABILITIES_CODE = "2150"

  describe("recordAccrual", () => {
    it("posts the accrual on the period's end date and its reversal on the next period's start date", async () => {
      const { result, lines } = await inRollback(async (tx) => {
        const result = await recordAccrual(
          tx,
          NORTHWIND,
          {
            periodId: FEBRUARY,
            expenseAccountId: SOFTWARE_SUBSCRIPTIONS,
            amount: "1200.00",
            description: "Accrued February hosting invoice",
            reference: null,
          },
          ACTOR,
        )
        const lines = await tx<
          {
            entry_number: string
            account_code: string
            debit_amount: string
            credit_amount: string
            entry_date: string
            source_type: string
            source_id: string | null
            is_adjusting: boolean
          }[]
        >`
          SELECT je.entry_number, ca.account_code,
                 l.debit_amount::text, l.credit_amount::text,
                 je.entry_date::text, je.source_type, je.source_id::text, je.is_adjusting
            FROM journal_entry_lines l
            JOIN journal_entries je ON je.id = l.entry_id
            JOIN chart_of_accounts ca ON ca.id = l.account_id
           WHERE je.id = ANY(ARRAY[${result.accrualEntryId}, ${result.reversalEntryId}]::uuid[])
           ORDER BY je.entry_date, l.line_number
        `
        return { result, lines }
      })

      expect(result.reversalDate).toBe("2026-03-01")
      expect(lines).toEqual([
        {
          entry_number: result.accrualEntryNumber,
          account_code: "5300",
          debit_amount: "1200.00",
          credit_amount: "0.00",
          entry_date: "2026-02-28",
          source_type: "accrual",
          source_id: null,
          is_adjusting: true,
        },
        {
          entry_number: result.accrualEntryNumber,
          account_code: ACCRUED_LIABILITIES_CODE,
          debit_amount: "0.00",
          credit_amount: "1200.00",
          entry_date: "2026-02-28",
          source_type: "accrual",
          source_id: null,
          is_adjusting: true,
        },
        {
          entry_number: result.reversalEntryNumber,
          account_code: ACCRUED_LIABILITIES_CODE,
          debit_amount: "1200.00",
          credit_amount: "0.00",
          entry_date: "2026-03-01",
          source_type: "accrual_reversal",
          source_id: result.accrualEntryId,
          is_adjusting: true,
        },
        {
          entry_number: result.reversalEntryNumber,
          account_code: "5300",
          debit_amount: "0.00",
          credit_amount: "1200.00",
          entry_date: "2026-03-01",
          source_type: "accrual_reversal",
          source_id: result.accrualEntryId,
          is_adjusting: true,
        },
      ])
    })

    it("refuses a closed period", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            recordAccrual(
              tx,
              NORTHWIND,
              {
                periodId: JANUARY_CLOSED,
                expenseAccountId: SOFTWARE_SUBSCRIPTIONS,
                amount: "100.00",
                description: "x",
                reference: null,
              },
              ACTOR,
            ),
          ),
        "period_closed",
      )
    })

    it("refuses a period with nothing after it to reverse into", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            recordAccrual(
              tx,
              NORTHWIND,
              {
                periodId: MARCH,
                expenseAccountId: SOFTWARE_SUBSCRIPTIONS,
                amount: "100.00",
                description: "x",
                reference: null,
              },
              ACTOR,
            ),
          ),
        "no_next_period",
      )
    })

    it("refuses an account that does not exist", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            recordAccrual(
              tx,
              NORTHWIND,
              {
                periodId: FEBRUARY,
                expenseAccountId: "00000000-0000-0000-0000-000000000000",
                amount: "100.00",
                description: "x",
                reference: null,
              },
              ACTOR,
            ),
          ),
        "no_such_account",
      )
    })

    it("refuses a period id that does not exist, distinctly from one with nothing after it", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            recordAccrual(
              tx,
              NORTHWIND,
              {
                periodId: "00000000-0000-0000-0000-000000000000",
                expenseAccountId: SOFTWARE_SUBSCRIPTIONS,
                amount: "100.00",
                description: "x",
                reference: null,
              },
              ACTOR,
            ),
          ),
        "no_such_period",
      )
    })
  })

  describe("amortization schedules", () => {
    const DEFERRED_REVENUE_SCHEDULE = "5587c31c-0af5-491d-a7b0-90bbd85bcc4a" // Acme, $12,000 / 12mo
    const PREPAID_SCHEDULE = "eb1956cf-071a-4bf4-965a-18f706670bba" // $6,000 / 12mo
    const DEFERRED_REVENUE_ACCOUNT = "83f308bc-9c29-45ad-a54a-e62965935e86"
    const CONSULTING_REVENUE = "6d1ef213-cb96-5ad4-beaf-1d4e07242d65"

    it("lists the fixture schedules with zero periods posted", async () => {
      const rows = await inRollback((tx) => listAmortizationSchedules(tx))
      const deferred = rows.find((r) => r.id === DEFERRED_REVENUE_SCHEDULE)
      expect(deferred).toMatchObject({
        kind: "deferred_revenue",
        total_amount: "12000.00",
        periods_total: 12,
        periods_posted: 0,
      })
    })

    it("refuses a schedule whose account does not exist", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            createAmortizationSchedule(
              tx,
              NORTHWIND,
              {
                kind: "prepaid_expense",
                balanceSheetAccountId: "00000000-0000-0000-0000-000000000000",
                incomeStatementAccountId: SOFTWARE_SUBSCRIPTIONS,
                totalAmount: "1000.00",
                periodsTotal: 10,
                nextRunDate: "2026-09-01",
                description: "x",
                reference: null,
              },
              ACTOR,
            ),
          ),
        "no_such_account",
      )
    })

    it("posts an even monthly recognition for a $12,000/12mo deferred-revenue schedule, and advances one month", async () => {
      const { posted, entry, posted_entry, schedule } = await inRollback(
        async (tx) => {
          const posted = await postDueAmortizations(tx, NORTHWIND, ACTOR)
          const found = posted.find(
            (p) => p.scheduleId === DEFERRED_REVENUE_SCHEDULE,
          )!
          const [entry] = await tx<
            {
              account_code: string
              debit_amount: string
              credit_amount: string
            }[]
          >`
          SELECT ca.account_code, l.debit_amount::text, l.credit_amount::text
            FROM journal_entry_lines l
            JOIN chart_of_accounts ca ON ca.id = l.account_id
           WHERE l.entry_id = ${found.entryId}::uuid
           ORDER BY l.line_number
        `
          const [posted_entry] = await tx<{ entry_date: string }[]>`
          SELECT entry_date::text FROM journal_entries WHERE id = ${found.entryId}::uuid
        `
          const [schedule] = await tx<{ next_run_date: string }[]>`
          SELECT next_run_date::text FROM amortization_schedules
           WHERE id = ${DEFERRED_REVENUE_SCHEDULE}::uuid
        `
          return { posted, entry, posted_entry, schedule }
        },
      )
      expect(
        posted.find((p) => p.scheduleId === DEFERRED_REVENUE_SCHEDULE),
      ).toMatchObject({ amount: "1000.00" })
      expect(schedule.next_run_date).toBe("2026-10-01")
      // Dated the RECOGNIZED period (the schedule's own next_run_date before
      // it advanced), never the day the button happened to be clicked — a
      // stale schedule caught up over several clicks must not land every
      // entry in whichever period the last click fell in.
      expect(posted_entry.entry_date).toBe("2026-09-01")
      // DR the liability draining down, CR revenue recognized.
      expect(entry).toMatchObject({
        account_code: "2300",
        debit_amount: "1000.00",
        credit_amount: "0.00",
      })
    })

    it("posts the opposite direction for a prepaid expense schedule", async () => {
      const { entry } = await inRollback(async (tx) => {
        const posted = await postDueAmortizations(tx, NORTHWIND, ACTOR)
        const found = posted.find((p) => p.scheduleId === PREPAID_SCHEDULE)!
        const entry = await tx<
          {
            account_code: string
            debit_amount: string
            credit_amount: string
          }[]
        >`
          SELECT ca.account_code, l.debit_amount::text, l.credit_amount::text
            FROM journal_entry_lines l
            JOIN chart_of_accounts ca ON ca.id = l.account_id
           WHERE l.entry_id = ${found.entryId}::uuid
           ORDER BY l.line_number
        `
        return { entry }
      })
      // DR expense recognized, CR the asset draining down.
      expect(entry[0]).toMatchObject({ account_code: "5300" })
      expect(entry[1]).toMatchObject({ account_code: "1150" })
    })

    it("does not post the same schedule twice in the same run", async () => {
      const { first, second } = await inRollback(async (tx) => {
        const first = await postDueAmortizations(tx, NORTHWIND, ACTOR)
        const second = await postDueAmortizations(tx, NORTHWIND, ACTOR)
        return { first, second }
      })
      expect(first.length).toBeGreaterThan(0)
      expect(second).toEqual([])
    })

    it("refuses the whole run when a due schedule falls inside a closed period", async () => {
      // Dated by its own next_run_date (not the click date, see the test
      // above) — a schedule due inside a closed period must refuse rather
      // than post silently into a month the books have already closed.
      await refusedBecause(
        () =>
          inRollback(async (tx) => {
            await createAmortizationSchedule(
              tx,
              NORTHWIND,
              {
                kind: "deferred_revenue",
                balanceSheetAccountId: DEFERRED_REVENUE_ACCOUNT,
                incomeStatementAccountId: CONSULTING_REVENUE,
                totalAmount: "1200.00",
                periodsTotal: 12,
                nextRunDate: "2026-01-15",
                description: "Due inside closed January",
                reference: null,
              },
              ACTOR,
            )
            return postDueAmortizations(tx, NORTHWIND, ACTOR)
          }),
        "period_closed",
      )
    })

    it("the last period absorbs the rounding remainder so the schedule ends at exactly zero", async () => {
      const amounts = await inRollback(async (tx) => {
        const { id } = await createAmortizationSchedule(
          tx,
          NORTHWIND,
          {
            kind: "deferred_revenue",
            balanceSheetAccountId: DEFERRED_REVENUE_ACCOUNT,
            incomeStatementAccountId: CONSULTING_REVENUE,
            totalAmount: "100.00",
            periodsTotal: 3,
            nextRunDate: "2026-09-01",
            description: "Uneven three-period test schedule",
            reference: null,
          },
          ACTOR,
        )
        const seen: string[] = []
        for (let i = 0; i < 3; i++) {
          await tx`UPDATE amortization_schedules SET next_run_date = '2026-09-01' WHERE id = ${id}::uuid`
          const posted = await postDueAmortizations(tx, NORTHWIND, ACTOR)
          const mine = posted.find((p) => p.scheduleId === id)
          seen.push(mine!.amount)
        }
        // A 4th call, still due, posts nothing more — periods_posted (3) has
        // reached periods_total (3), independent of next_run_date.
        await tx`UPDATE amortization_schedules SET next_run_date = '2026-09-01' WHERE id = ${id}::uuid`
        const fourth = await postDueAmortizations(tx, NORTHWIND, ACTOR)
        expect(fourth.find((p) => p.scheduleId === id)).toBeUndefined()
        return seen
      })
      expect(amounts).toEqual(["33.33", "33.33", "33.34"])
    })
  })
})

describe("invoiceForPdf (US-ACC-001)", () => {
  const INV_2026_001 = "c72699f8-700c-5760-a8e8-19ae6dfd53c5"

  it("assembles the invoice, customer and company data a PDF template needs", async () => {
    const data = await inRollback((tx) => invoiceForPdf(tx, INV_2026_001))
    expect(data).toMatchObject({
      invoice_number: "INV-2026-001",
      customer_name: "Acme Manufacturing",
      customer_email: "ap@acme.example",
      customer_billing_address: {
        city: "New York",
        state: "NY",
        country: "US",
      },
      company_name: "Northwind Consulting",
      company_address_line1: "120 Madison Avenue",
      company_city: "New York",
    })
    expect(data.lines.length).toBeGreaterThan(0)
  })

  it("refuses an invoice that does not exist", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          invoiceForPdf(tx, "00000000-0000-0000-0000-000000000000"),
        ),
      "no_such_invoice",
    )
  })

  it("refuses a PDF for an invoice with more lines than a document can hold", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          // Pushes this invoice's line count past DOCUMENT_CHILD_CAP (500)
          // without paying for 501 individual createInvoice() INSERTs.
          await tx`
            INSERT INTO invoice_lines (
              tenant_id, invoice_id, line_number, description,
              quantity, unit_price, amount, discount_percent, discount_amount, tax_amount,
              revenue_account_id
            )
            SELECT ${NORTHWIND}::uuid, ${INV_2026_001}::uuid, n + 100,
                   'Filler line ' || n, 1, 1.00, 1.00, 0, 0, 0,
                   (SELECT revenue_account_id FROM invoice_lines
                     WHERE invoice_id = ${INV_2026_001}::uuid LIMIT 1)
              FROM generate_series(1, 501) AS n
          `
          return invoiceForPdf(tx, INV_2026_001)
        }),
      "too_many_lines",
    )
  })
})

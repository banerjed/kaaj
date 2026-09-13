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
  controlAccountTieOut,
  balanceSheetTotals,
  trialBalanceTotals,
  cashFlowTotals,
  equityStatement,
  equityStatementTotals,
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

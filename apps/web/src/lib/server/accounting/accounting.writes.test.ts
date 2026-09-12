import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import {
  postJournal,
  AccountingRefused,
  createInvoice,
  issueInvoice,
  recordPayment,
  controlAccountTieOut,
  balanceSheetTotals,
  trialBalanceTotals,
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

/** JE-2026-0001 — a real posted entry, AR 1100 debit / Revenue 4000 credit. */
const POSTED_ENTRY = "c1c96d31-cfa4-57d3-9048-06e3ae1725e6"
/** One of JE-2026-0001's own lines — the AR debit. */
const POSTED_LINE = "34dd6b71-7040-5aa7-98c2-2fb1a0a06e48"

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

describe("the balance sheet and trial balance's equity/balance checks are real, not vacuous", () => {
  afterAll(async () => {
    await closeConnections()
  })

  // The Northwind fixture never posts to Retained Earnings (accounting.test.ts
  // asserts byCode["3000"] is undefined), so every existing balanceSheetTotals
  // assertion has `equity` fixed at 0 — total_equity = equity + net_income
  // would pass identically if the SQL dropped the `equity` term entirely
  // (L50/L51: a green assertion over a zero subject is not evidence). This
  // posts a real equity-side entry through postJournal and proves `equity`
  // actually moves.
  it("a posted credit to Retained Earnings shows up in `equity`, and total_equity still adds net_income to it", async () => {
    const { before, after } = await inRollback(async (tx) => {
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
      return { before, after }
    })
    expect(before.equity).toBe("0")
    expect(after.equity).toBe("500.00")
    expect(Number(after.total_equity)).toBeCloseTo(
      Number(after.equity) + Number(after.net_income),
      2,
    )
    expect(after.balances).toBe(true)
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
  // same journal_entry_lines, so the one-sided row moves both at once.
  it("a one-sided posted entry — bypassing postJournal's own balance guard — makes `balances` false", async () => {
    const { balanceSheetBalances, trialBalanceBalances } = await inRollback(
      async (tx) => {
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
        }
      },
    )
    expect(balanceSheetBalances).toBe(false)
    expect(trialBalanceBalances).toBe(false)
  })
})

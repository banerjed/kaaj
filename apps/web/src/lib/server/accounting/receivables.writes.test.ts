import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as acc from "./accounting.repo"
import { AccountingRefused } from "./accounting.repo"

/**
 * The receivables write path, against the real database.
 *
 * The thing that must not go wrong is that the LEDGER stops agreeing with the
 * documents. `verify-stories.sql` asserts every journal entry balances, in
 * both currencies, and that an invoice's journal ties to its base total — but
 * a harness that runs at `./check` time finds a broken posting after it has
 * been made, over tables nobody prunes. These assert it at the point of the
 * write.
 *
 * Every case rolls back, so the fixture is unchanged afterwards.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const ACTOR = "48ccc5de-9ba7-5461-ab49-160a1146ed85"

/** INV-2026-003 — the only draft, USD, no tax, 19,760.00. */
const DRAFT = "bee0d3ca-72f7-5ba2-9a31-3bbf17daf320"
/** INV-2026-004 — partial, USD, carries tax, 32,439.97 outstanding. */
const PARTIAL = "37bd63c2-86a1-513c-8404-b731dd666b28"
/** INV-2026-002 — overdue, GBP at 1.27, so the base-currency half is live. */
const GBP = "a31732ea-dadb-575f-bd99-cbcfeaba29da"
/** INV-2026-001 — paid in full. */
const PAID = "c72699f8-700c-5760-a8e8-19ae6dfd53c5"

const OPERATING = "6d55e7d0-f085-5951-9f28-2fcd1b75c6bc"

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

/**
 * Move an invoice into an OPEN accounting period.
 *
 * Every invoice in the fixture but one is dated 2026-01-21, and January 2026
 * is `closed` (December 2025 is `locked`). A closed period does not accept new
 * postings, so issuing any of them is refused — which is the correct behaviour
 * and was, before the guard existed, three tests quietly posting revenue into
 * a closed month.
 */
async function intoOpenPeriod(tx: Tx, invoiceId: string): Promise<void> {
  await tx`
    UPDATE invoices
       SET invoice_date = DATE '2026-03-10', due_date = DATE '2026-04-10'
     WHERE id = ${invoiceId}::uuid
  `
}

/** Every journal entry in the tenant that does not balance. */
async function unbalancedEntries(tx: Tx) {
  return tx<{ entry_number: string; d: string; c: string }[]>`
    SELECT e.entry_number,
           sum(l.debit_amount)::text  AS d,
           sum(l.credit_amount)::text AS c
      FROM journal_entries e
      JOIN journal_entry_lines l ON l.entry_id = e.id
     GROUP BY e.id, e.entry_number
    HAVING sum(l.debit_amount) <> sum(l.credit_amount)
        OR sum(l.base_debit_amount) <> sum(l.base_credit_amount)
  `
}

describe("issuing an invoice", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("posts a balanced entry and leaves the ledger balanced", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      await intoOpenPeriod(tx, DRAFT)
      const { entryNumber } = await acc.issueInvoice(
        tx,
        NORTHWIND,
        DRAFT,
        ACTOR,
      )
      const posted = await tx<
        { account_code: string; debit: string; credit: string }[]
      >`
        SELECT a.account_code,
               l.debit_amount::text  AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.entry_number = ${entryNumber}
         ORDER BY l.line_number
      `
      return { posted, unbalanced: await unbalancedEntries(tx) }
    })
    // DR Accounts Receivable, CR Revenue. No tax on this invoice, so no third
    // line — a zero credit is refused by ck_journal_entry_lines_one_sided_positive.
    expect(posted).toHaveLength(2)
    expect(posted[0]).toEqual({
      account_code: "1100",
      debit: "19760.00",
      credit: "0.00",
    })
    expect(posted[1]).toEqual({
      account_code: "4000",
      debit: "0.00",
      credit: "19760.00",
    })
    expect(unbalanced).toEqual([])
  })

  it("splits revenue from tax when the invoice carries tax", async () => {
    // The three-line posting. INV-2026-004 has 3,214.97 of tax on 36,225.00,
    // so a posting that credited the gross to revenue would overstate income
    // by the tax and understate the liability — and still balance.
    const posted = await inRollback(async (tx) => {
      // Put it back to draft so it can be issued inside the rollback.
      await tx`
        UPDATE invoices SET status = 'draft', journal_entry_id = NULL
         WHERE id = ${PARTIAL}::uuid
      `
      await intoOpenPeriod(tx, PARTIAL)
      const { entryNumber } = await acc.issueInvoice(
        tx,
        NORTHWIND,
        PARTIAL,
        ACTOR,
      )
      return tx<{ account_code: string; credit: string }[]>`
        SELECT a.account_code, l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.entry_number = ${entryNumber} AND l.credit_amount > 0
         ORDER BY a.account_code
      `
    })
    expect(posted).toEqual([
      { account_code: "2200", credit: "3214.97" },
      { account_code: "4000", credit: "36225.00" },
    ])
  })

  it("ties the posting to the invoice's base total in a foreign currency", async () => {
    // GBP at 1.27. This is the half that a round-then-sum mistake breaks, and
    // it breaks by a cent — invisible until a period close.
    const { invoice, entry } = await inRollback(async (tx) => {
      await tx`
        UPDATE invoices SET status = 'draft', journal_entry_id = NULL
         WHERE id = ${GBP}::uuid
      `
      await intoOpenPeriod(tx, GBP)
      const { entryNumber } = await acc.issueInvoice(tx, NORTHWIND, GBP, ACTOR)
      const [invoice] = await tx<
        { base_total: string; base_subtotal: string; base_tax: string }[]
      >`
        SELECT base_total::text     AS base_total,
               base_subtotal::text  AS base_subtotal,
               base_tax_total::text AS base_tax
          FROM invoices WHERE id = ${GBP}::uuid
      `
      const [entry] = await tx<{ base_debit: string }[]>`
        SELECT sum(l.base_debit_amount)::text AS base_debit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
         WHERE e.entry_number = ${entryNumber}
      `
      return { invoice, entry }
    })
    // ACC-invoice-journal-tieout allows 0.02; exact is what round-then-sum gives.
    expect(entry.base_debit).toBe(invoice.base_total)
    // And the identity the CHECK requires still holds after the recompute.
    expect(Number(invoice.base_total)).toBe(
      Number(invoice.base_subtotal) + Number(invoice.base_tax),
    )
  })

  it("rounds each part before summing, on a rate where it matters", async () => {
    // The test above cannot see this. The only foreign-currency invoice in the
    // fixture carries ZERO tax, so round(sub*r) + round(0*r) and
    // round((sub+0)*r) are the same number — a green assertion over an empty
    // column, which is L50 happening inside a test rather than a fixture.
    //
    // At 1.27, a subtotal and a tax of 100.01 each round to 127.01, summing to
    // 254.02 — while the gross 200.02 rounds to 254.03. One cent, in the
    // direction that makes base_total disagree with its own parts, which is
    // what ck_invoices_amounts_reconcile forbids.
    // Built on the unpaid DRAFT rather than the GBP invoice: that one carries
    // 10,000 of payments, and payment_allocations cannot be deleted (nothing
    // in the app holds DELETE), so shrinking its total drives amount_due
    // negative and ck_invoices_amounts_reconcile refuses the setup.
    const row = await inRollback(async (tx) => {
      await tx`
        UPDATE invoices
           SET currency = 'GBP', exchange_rate = 1.27
         WHERE id = ${DRAFT}::uuid
      `
      await tx`
        UPDATE invoice_lines
           SET amount = 100.01, tax_amount = 100.01, unit_price = 100.01,
               quantity = 1
         WHERE invoice_id = ${DRAFT}::uuid
      `
      // One line, so the sums are exactly the two figures above.
      await tx`
        UPDATE invoice_lines SET amount = 0, tax_amount = 0
         WHERE invoice_id = ${DRAFT}::uuid
           AND id <> (SELECT id FROM invoice_lines
                       WHERE invoice_id = ${DRAFT}::uuid
                       ORDER BY line_number LIMIT 1)
      `
      await acc.recomputeInvoiceTotals(tx, DRAFT)
      const [r] = await tx<
        { base_total: string; base_subtotal: string; base_tax: string }[]
      >`
        SELECT base_total::text     AS base_total,
               base_subtotal::text  AS base_subtotal,
               base_tax_total::text AS base_tax
          FROM invoices WHERE id = ${DRAFT}::uuid
      `
      return r
    })
    expect(row.base_subtotal).toBe("127.01")
    expect(row.base_tax).toBe("127.01")
    // 254.02, not the 254.03 that rounding the gross would give.
    expect(row.base_total).toBe("254.02")
  })

  it("refuses an invoice that is not a draft", async () => {
    await refusedBecause(
      () => inRollback((tx) => acc.issueInvoice(tx, NORTHWIND, PAID, ACTOR)),
      "wrong_status",
    )
  })

  it("refuses an invoice with no lines", async () => {
    // An invoice for nothing says a customer owes zero, and looks exactly like
    // one whose lines failed to load.
    //
    // The empty invoice is INSERTED rather than made by deleting the lines off
    // an existing one: `app_user` holds no DELETE anywhere but two named
    // tables (20260830120000), so the delete version of this test failed with
    // `permission denied` — the append-only rule doing its job on the test.
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const [empty] = await tx<{ id: string }[]>`
            INSERT INTO invoices (
              tenant_id, customer_id, invoice_number, invoice_date, due_date,
              currency, base_currency, subtotal, tax_total, total,
              amount_paid, amount_due, base_subtotal, base_tax_total,
              base_total, base_amount_paid, base_amount_due, status
            )
            SELECT tenant_id, customer_id, 'INV-EMPTY-TEST',
                   DATE '2026-03-10', DATE '2026-04-10', currency, base_currency,
                   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'draft'
              FROM invoices WHERE id = ${DRAFT}::uuid
            RETURNING id
          `
          return acc.issueInvoice(tx, NORTHWIND, empty.id, ACTOR)
        }),
      "no_lines",
    )
  })
})

describe("closed accounting periods", () => {
  it("refuses to post revenue into a closed period", async () => {
    // January 2026 is `closed` in the fixture, and every invoice but one is
    // dated inside it. `packages/spec-tests` asserts this rule (INV-ACC-002)
    // against its own implementation; nothing connected it to the deployed
    // path, so both suites were green while contradicting each other — the
    // exact shape CLAUDE.md warns about.
    await refusedBecause(
      () => inRollback((tx) => acc.issueInvoice(tx, NORTHWIND, DRAFT, ACTOR)),
      "period_closed",
    )
  })

  it("refuses a payment dated into a locked period", async () => {
    // December 2025 is `locked` rather than `closed`. Both are non-open, and
    // the rule is stated as "not open" rather than as a list of bad states, so
    // a fifth status added later refuses by default rather than by omission.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordPayment(
            tx,
            NORTHWIND,
            {
              invoiceId: PARTIAL,
              amount: "1000.00",
              paymentDate: "2025-12-15",
              method: "wire_transfer",
              reference: null,
              bankAccountId: OPERATING,
            },
            ACTOR,
          ),
        ),
      "period_closed",
    )
  })

  it("allows a posting in a month no period row covers", async () => {
    // Periods are created as a year is set up. Refusing a posting because
    // nobody has opened next month yet would stop work for a reason nobody
    // could act on, so only an EXPLICIT non-open period refuses.
    const issued = await inRollback(async (tx) => {
      await tx`
        UPDATE invoices
           SET invoice_date = DATE '2026-09-10', due_date = DATE '2026-10-10'
         WHERE id = ${DRAFT}::uuid
      `
      return acc.issueInvoice(tx, NORTHWIND, DRAFT, ACTOR)
    })
    expect(issued.entryNumber).toMatch(/^JE-2026-\d{4}$/)
  })
})

describe("receiving a payment", () => {
  const PAYMENT = {
    invoiceId: PARTIAL,
    amount: "1000.00",
    paymentDate: "2026-03-15",
    method: "wire_transfer",
    reference: "TT-99001",
    bankAccountId: OPERATING,
  }

  it("posts cash against receivables and keeps the ledger balanced", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      await acc.recordPayment(tx, NORTHWIND, PAYMENT, ACTOR)
      const posted = await tx<
        { account_code: string; debit: string; credit: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.reference LIKE 'PAY-%' AND e.entry_date = '2026-03-15'
         ORDER BY l.line_number
      `
      return { posted, unbalanced: await unbalancedEntries(tx) }
    })
    expect(posted).toEqual([
      { account_code: "1000", debit: "1000.00", credit: "0.00" },
      { account_code: "1100", debit: "0.00", credit: "1000.00" },
    ])
    expect(unbalanced).toEqual([])
  })

  it("reduces what is owed by exactly the amount received", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const [before] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      await acc.recordPayment(tx, NORTHWIND, PAYMENT, ACTOR)
      const [after] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      return { before, after }
    })
    expect(Number(before.due) - Number(after.due)).toBe(1000)
  })

  it("marks the invoice paid when the last of it is settled", async () => {
    const result = await inRollback((tx) =>
      acc.recordPayment(
        tx,
        NORTHWIND,
        { ...PAYMENT, amount: "32439.97" },
        ACTOR,
      ),
    )
    expect(result.status).toBe("paid")
  })

  it("leaves it partial when something is still outstanding", async () => {
    // Both halves. A rule that always says "paid" is a broken page, not a rule.
    const result = await inRollback((tx) =>
      acc.recordPayment(tx, NORTHWIND, PAYMENT, ACTOR),
    )
    expect(result.status).toBe("partial")
  })

  it("refuses more than is outstanding", async () => {
    // Nothing in the schema says "not more than is owed" in a way that
    // produces a usable message — ck_invoices_amounts_reconcile would fail on
    // amount_due >= 0 with a constraint name instead.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordPayment(
            tx,
            NORTHWIND,
            { ...PAYMENT, amount: "32439.98" },
            ACTOR,
          ),
        ),
      "overpayment",
    )
  })

  it("refuses a payment against a draft", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordPayment(
            tx,
            NORTHWIND,
            { ...PAYMENT, invoiceId: DRAFT },
            ACTOR,
          ),
        ),
      "wrong_status",
    )
  })

  it("keeps the payment, the allocation and the header in step", async () => {
    // Three rows and a header, all written in one transaction. The header is a
    // cache of the allocations and is recomputed from them, never adjusted.
    const { allocated, paid } = await inRollback(async (tx) => {
      await acc.recordPayment(tx, NORTHWIND, PAYMENT, ACTOR)
      const [allocated] = await tx<{ total: string }[]>`
        SELECT coalesce(sum(amount),0)::text AS total
          FROM payment_allocations WHERE invoice_id = ${PARTIAL}::uuid
      `
      const [paid] = await tx<{ amount_paid: string }[]>`
        SELECT amount_paid::text AS amount_paid
          FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      return { allocated, paid }
    })
    expect(paid.amount_paid).toBe(allocated.total)
  })
})

describe("the header is a cache of the lines", () => {
  it("REPAIRS an invoice whose stored total had drifted", async () => {
    // The reason it is recomputed rather than adjusted: a header that is
    // already wrong is corrected by the next write instead of carried forward.
    const { drifted, repaired } = await inRollback(async (tx) => {
      await tx`
        UPDATE invoices
           SET subtotal = 1, total = 1, amount_due = 1,
               base_subtotal = 1, base_total = 1, base_amount_due = 1
         WHERE id = ${DRAFT}::uuid
      `
      const [drifted] = await tx<{ total: string }[]>`
        SELECT total::text AS total FROM invoices WHERE id = ${DRAFT}::uuid
      `
      await acc.recomputeInvoiceTotals(tx, DRAFT)
      const [repaired] = await tx<{ total: string; line_sum: string }[]>`
        SELECT i.total::text AS total,
               (SELECT sum(l.amount)::text FROM invoice_lines l
                 WHERE l.invoice_id = i.id) AS line_sum
          FROM invoices i WHERE i.id = ${DRAFT}::uuid
      `
      return { drifted, repaired }
    })
    expect(drifted.total).toBe("1.00")
    expect(repaired.total).toBe(repaired.line_sum)
  })

  it("keeps money as strings throughout", async () => {
    const row = await inRollback(async (tx) => {
      await acc.recomputeInvoiceTotals(tx, PARTIAL)
      const [r] = await tx<{ total: string; base_total: string }[]>`
        SELECT total::text AS total, base_total::text AS base_total
          FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      return r
    })
    expect(typeof row.total).toBe("string")
    expect(row.total).toBe("39439.97")
  })
})

describe("voiding", () => {
  it("voids a draft", async () => {
    const status = await inRollback(async (tx) => {
      await acc.voidInvoice(tx, DRAFT, ACTOR, "raised against the wrong client")
      const [r] = await tx<{ status: string }[]>`
        SELECT status FROM invoices WHERE id = ${DRAFT}::uuid
      `
      return r.status
    })
    expect(status).toBe("void")
  })

  it("refuses to void anything already issued", async () => {
    // Its revenue is in the ledger. Removing it is a credit note — a new
    // document that reverses the first — not an edit to the original.
    await refusedBecause(
      () => inRollback((tx) => acc.voidInvoice(tx, PAID, ACTOR, "mistake")),
      "wrong_status",
    )
  })
})

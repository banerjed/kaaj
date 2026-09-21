import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as acc from "./accounting.repo"
import { AccountingRefused } from "./accounting.repo"

/**
 * `exchange_rates` carries no write policy for `app_user` at all (only the
 * service role writes it, via `fx_rates.ts`) — a raw superuser connection,
 * same escape hatch as `fx_rates.test.ts`, is the only way to seed a rate
 * for a settlement-FX test. Test-only; application code never gets this.
 */
const superuser = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { types: {} },
)

/**
 * The receivables write path, against the real database — asserts the ledger
 * stays balanced at the point of write, not just later via the harness. Every
 * case rolls back.
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

/** Move an invoice into an OPEN accounting period (most fixture invoices sit in a closed one). */
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

describe("creating an invoice", () => {
  /** Acme Manufacturing — USD. */
  const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
  /** Britannia Retail Group — GBP, so the currency-from-customer path is live. */
  const BRITCO = "ac7a04b4-a28e-5a15-9993-596db32c8d4e"

  function oneLine(
    overrides: Partial<acc.NewInvoiceLine> = {},
  ): acc.NewInvoiceLine {
    return {
      description: "Consulting",
      quantity: "1",
      unitPrice: "100.00",
      discountPercent: "0",
      taxAmount: "0",
      ...overrides,
    }
  }

  it("refuses an invoice with no lines", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.createInvoice(
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
              lines: [],
            },
            ACTOR,
          ),
        ),
      "no_lines",
    )
  })

  it("refuses a customer that does not exist", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.createInvoice(
            tx,
            NORTHWIND,
            {
              customerId: "00000000-0000-0000-0000-000000000000",
              invoiceDate: "2026-03-10",
              dueDate: "2026-04-10",
              exchangeRate: "1.000000",
              paymentTerms: null,
              notes: null,
              footerText: null,
              lines: [oneLine()],
            },
            ACTOR,
          ),
        ),
      "no_such_customer",
    )
  })

  it("sums line amounts net of each line's discount into the subtotal — the taxonomy's own formula", async () => {
    const row = await inRollback(async (tx) => {
      const created = await acc.createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: ACME,
          invoiceDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.000000",
          paymentTerms: "Net 30",
          notes: null,
          footerText: null,
          lines: [
            // 10 * 100.00 = 1000.00, less 10% discount (100.00) = 900.00.
            oneLine({
              quantity: "10",
              discountPercent: "10",
              taxAmount: "50.00",
            }),
            // 1 * 200.00 = 200.00, no discount.
            oneLine({ description: "Travel", unitPrice: "200.00" }),
          ],
        },
        ACTOR,
      )
      return acc.invoiceById(tx, created.id)
    })
    expect(row?.subtotal).toBe("1100.00")
    expect(row?.tax_total).toBe("50.00")
    expect(row?.total).toBe("1150.00")
    expect(row?.amount_due).toBe("1150.00")
    expect(row?.status).toBe("draft")
    // The line itself still carries the GROSS amount and its own discount —
    // netting happens once, in recomputeInvoiceTotals, not on the line.
  })

  it("takes currency from the customer, base currency from the tenant", async () => {
    const row = await inRollback(async (tx) => {
      const created = await acc.createInvoice(
        tx,
        NORTHWIND,
        {
          customerId: BRITCO,
          invoiceDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.270000",
          paymentTerms: null,
          notes: null,
          footerText: null,
          lines: [oneLine()],
        },
        ACTOR,
      )
      return acc.invoiceById(tx, created.id)
    })
    expect(row?.currency).toBe("GBP")
  })

  it("generates a unique, sequential invoice number", async () => {
    const { first, second } = await inRollback(async (tx) => {
      const a = await acc.createInvoice(
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
          lines: [oneLine()],
        },
        ACTOR,
      )
      const b = await acc.createInvoice(
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
          lines: [oneLine()],
        },
        ACTOR,
      )
      return { first: a.invoiceNumber, second: b.invoiceNumber }
    })
    expect(first).not.toBe(second)
    expect(first).toMatch(/^INV-\d{4}-\d{3}$/)
    expect(second).toMatch(/^INV-\d{4}-\d{3}$/)
  })

  it("keeps money as strings throughout", async () => {
    const row = await inRollback(async (tx) => {
      const created = await acc.createInvoice(
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
          lines: [oneLine({ unitPrice: "1234567.89" })],
        },
        ACTOR,
      )
      return acc.invoiceById(tx, created.id)
    })
    expect(typeof row?.subtotal).toBe("string")
    expect(row?.subtotal).toBe("1234567.89")
  })

  it("issues clean through a discount — balanced JE, revenue credited net, no false drift flag", async () => {
    // The one path where discount-netting (recomputeInvoiceTotals) meets
    // JE posting (issueInvoice, which credits Revenue at `current.subtotal`)
    // and the read-side drift check (line_subtotal vs subtotal) — all three
    // have to agree on what "net" means, not just the create path alone.
    const result = await inRollback(async (tx) => {
      const created = await acc.createInvoice(
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
          // 10 * 100.00 = 1000.00, less 20% = 800.00 net. No tax, so the
          // posting is exactly two lines and the revenue figure is the
          // whole story.
          lines: [oneLine({ quantity: "10", discountPercent: "20" })],
        },
        ACTOR,
      )
      await intoOpenPeriod(tx, created.id)
      const { entryNumber } = await acc.issueInvoice(
        tx,
        NORTHWIND,
        created.id,
        ACTOR,
      )
      const posted = await tx<
        { account_code: string; debit: string; credit: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.entry_number = ${entryNumber}
         ORDER BY l.line_number
      `
      const row = await acc.invoiceById(tx, created.id)
      return { posted, unbalanced: await unbalancedEntries(tx), row }
    })
    expect(result.unbalanced).toEqual([])
    expect(result.posted).toEqual([
      { account_code: "1100", debit: "800.00", credit: "0.00" }, // AR, net
      { account_code: "4000", debit: "0.00", credit: "800.00" }, // Revenue, net
    ])
    expect(result.row?.subtotal).toBe("800.00")
    // The drift badge (invoices/+page.svelte) compares these two — a
    // discounted invoice must not look corrupted just for being discounted.
    expect(result.row?.line_subtotal).toBe(result.row?.subtotal)
  })
})

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
    // DR Accounts Receivable, CR Revenue — no tax, so no third line.
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
    // GBP at 1.27 — a round-then-sum mistake breaks this by a cent.
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
    expect(entry.base_debit).toBe(invoice.base_total)
    expect(Number(invoice.base_total)).toBe(
      Number(invoice.base_subtotal) + Number(invoice.base_tax),
    )
  })

  it("rounds each part before summing, on a rate where it matters", async () => {
    // At 1.27, subtotal and tax of 100.01 each round to 127.01 (sum 254.02),
    // while the gross 200.02 rounds to 254.03 — a real cent of divergence
    // the GBP fixture invoice's zero tax can't exercise (L50). Built on the
    // unpaid DRAFT since GBP already carries payments that block shrinking it.
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
    expect(row.base_total).toBe("254.02")
  })

  it("refuses an invoice that is not a draft", async () => {
    await refusedBecause(
      () => inRollback((tx) => acc.issueInvoice(tx, NORTHWIND, PAID, ACTOR)),
      "wrong_status",
    )
  })

  it("refuses an invoice with no lines", async () => {
    // Empty invoice is INSERTED, not made by deleting lines off an existing
    // one — app_user holds no DELETE here.
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
    // January 2026 is closed in the fixture; also asserted independently by
    // packages/spec-tests (INV-ACC-002).
    await refusedBecause(
      () => inRollback((tx) => acc.issueInvoice(tx, NORTHWIND, DRAFT, ACTOR)),
      "period_closed",
    )
  })

  it("refuses a payment dated into a locked period", async () => {
    // December 2025 is locked, not closed — rule is "not open", so a new
    // status refuses by default rather than by omission.
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
    // Only an explicit non-open period refuses; no period is not a refusal.
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
    const result = await inRollback((tx) =>
      acc.recordPayment(tx, NORTHWIND, PAYMENT, ACTOR),
    )
    expect(result.status).toBe("partial")
  })

  it("refuses more than is outstanding", async () => {
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

describe("settlement FX gain/loss (US-ACC-054)", () => {
  /** INV-2026-002 — GBP by default, booked at 1.27, 16,000.00 outstanding.
   *  One test below temporarily converts it to EUR within its own
   *  rollback — the currency isn't baked into this payment. */
  const FOREIGN_PAYMENT = {
    invoiceId: GBP,
    amount: "5000.00",
    paymentDate: "2026-03-15",
    method: "wire_transfer",
    reference: "TT-GBP-01",
    bankAccountId: "7585ab47-4908-5830-a959-65711784fc61",
  }

  async function journalLines(tx: Tx, reference: string) {
    return tx<{ account_code: string; debit: string; credit: string }[]>`
      SELECT a.account_code, l.debit_amount::text AS debit,
             l.credit_amount::text AS credit
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.entry_id
        JOIN chart_of_accounts a ON a.id = l.account_id
       WHERE e.reference = ${reference}
       ORDER BY l.line_number
    `
  }

  afterAll(async () => {
    await superuser.end({ timeout: 5 })
  })

  it("recognizes a gain when the settlement-date rate is higher than the booking rate", async () => {
    // The fixture already carries a later GBP rate (1.28, 2026-02-07) above
    // the invoice's own booking rate (1.27) — no rate data to fabricate.
    // Recognizing a gain/loss posts the entry in USD (see settlementFxDelta):
    // cash converts at the settlement rate (5000 * 1.28 = 6400), the
    // receivable clears at the booking rate (5000 * 1.27 = 6350), and the
    // 50.00 difference is the gain.
    const { lines, allocation, unbalanced } = await inRollback(async (tx) => {
      const { paymentNumber } = await acc.recordPayment(
        tx,
        NORTHWIND,
        FOREIGN_PAYMENT,
        ACTOR,
      )
      const lines = await journalLines(tx, paymentNumber)
      const [allocation] = await tx<{ fx_gain_loss: string }[]>`
        SELECT fx_gain_loss::text FROM payment_allocations
         WHERE invoice_id = ${GBP}::uuid AND amount = 5000.00
      `
      return { lines, allocation, unbalanced: await unbalancedEntries(tx) }
    })
    expect(lines).toEqual([
      { account_code: "1000", debit: "6400.00", credit: "0.00" },
      { account_code: "1100", debit: "0.00", credit: "6350.00" },
      { account_code: "4200", debit: "0.00", credit: "50.00" },
    ])
    expect(unbalanced).toEqual([])
    expect(allocation.fx_gain_loss).toBe("50.00")
  })

  it("recognizes a loss when the settlement-date rate is lower than the booking rate", async () => {
    // EUR, not GBP: the inserted rate is committed on a separate connection
    // (app_user has no write policy on exchange_rates at all), outside the
    // rolled-back `tx`, so it is visible to any other test's currently-open
    // transaction until the `finally` below removes it — a different
    // currency from every other test in this file keeps that window from
    // corrupting a concurrently-running one that reads GBP's own latest rate
    // (the "gain" test above relies on the fixture's actual GBP history).
    await superuser`
      INSERT INTO exchange_rates (from_currency, to_currency, rate_date, rate, inverse_rate, source)
      VALUES ('EUR', 'USD', '2026-02-20', 1.05, 1 / 1.05, 'manual')
    `
    try {
      const { lines, allocation, unbalanced } = await inRollback(async (tx) => {
        await tx`
          UPDATE invoices SET currency = 'EUR', exchange_rate = 1.10
           WHERE id = ${GBP}::uuid
        `
        const { paymentNumber } = await acc.recordPayment(
          tx,
          NORTHWIND,
          { ...FOREIGN_PAYMENT, reference: "TT-EUR-02" },
          ACTOR,
        )
        const lines = await journalLines(tx, paymentNumber)
        const [allocation] = await tx<{ fx_gain_loss: string }[]>`
            SELECT fx_gain_loss::text FROM payment_allocations
             WHERE invoice_id = ${GBP}::uuid AND amount = 5000.00
          `
        return { lines, allocation, unbalanced: await unbalancedEntries(tx) }
      })
      // Cash converts at 1.05 (5000 * 1.05 = 5250), the receivable still
      // clears at the 1.10 booking rate (5500) — the 250.00 shortfall is
      // the loss.
      expect(lines).toEqual([
        { account_code: "1000", debit: "5250.00", credit: "0.00" },
        { account_code: "1100", debit: "0.00", credit: "5500.00" },
        { account_code: "4200", debit: "250.00", credit: "0.00" },
      ])
      expect(unbalanced).toEqual([])
      expect(allocation.fx_gain_loss).toBe("-250.00")
    } finally {
      await superuser`
        DELETE FROM exchange_rates
         WHERE from_currency = 'EUR' AND rate_date = '2026-02-20'
      `
    }
  })

  it("falls back to the booking rate — no FX line — when the tenant has no FX gain/loss account", async () => {
    const { lines, allocation, unbalanced } = await inRollback(async (tx) => {
      // app_user has no DELETE grant on chart_of_accounts at all; renaming
      // the code out of the way (allowed: UPDATE is granted) has the same
      // effect for `accountIdOrNull`, and rolls back with everything else.
      await tx`
        UPDATE chart_of_accounts SET account_code = '4200-TEST-HIDDEN'
         WHERE tenant_id = ${NORTHWIND}::uuid AND account_code = '4200'
      `
      const { paymentNumber } = await acc.recordPayment(
        tx,
        NORTHWIND,
        { ...FOREIGN_PAYMENT, reference: "TT-GBP-03" },
        ACTOR,
      )
      const lines = await journalLines(tx, paymentNumber)
      const [allocation] = await tx<{ fx_gain_loss: string }[]>`
        SELECT fx_gain_loss::text FROM payment_allocations
         WHERE invoice_id = ${GBP}::uuid AND amount = 5000.00
      `
      return { lines, allocation, unbalanced: await unbalancedEntries(tx) }
    })
    // Both lines fall back to the (same) booking rate, in GBP — trivially
    // balanced, exactly today's pre-US-ACC-054 behavior.
    expect(lines).toEqual([
      { account_code: "1000", debit: "5000.00", credit: "0.00" },
      { account_code: "1100", debit: "0.00", credit: "5000.00" },
    ])
    expect(unbalanced).toEqual([])
    expect(allocation.fx_gain_loss).toBe("0.00")
  })
})

describe("receiving a lockbox payment across multiple invoices", () => {
  /** Acme Manufacturing — owns both PARTIAL and this second open invoice. */
  const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
  /** INV-2026-005 — Acme, partial, USD, 2,443.75 outstanding. */
  const OTHER_OPEN = "a3ff49bc-30c8-57c3-ae07-c0fd6813df3e"

  const LOCKBOX = {
    customerId: ACME,
    allocations: [
      { invoiceId: PARTIAL, amount: "1000.00" },
      { invoiceId: OTHER_OPEN, amount: "500.00" },
    ],
    totalAmount: "1500.00",
    paymentDate: "2026-03-15",
    method: "wire_transfer",
    reference: "LOCKBOX-1",
    bankAccountId: OPERATING,
  }

  it("posts one cash debit and one AR credit per invoice, and keeps the ledger balanced", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      const { paymentNumber } = await acc.recordLockboxPayment(
        tx,
        NORTHWIND,
        LOCKBOX,
        ACTOR,
      )
      const posted = await tx<
        { account_code: string; debit: string; credit: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.reference = ${paymentNumber}
         ORDER BY l.line_number
      `
      return { posted, unbalanced: await unbalancedEntries(tx) }
    })
    expect(posted).toEqual([
      { account_code: "1000", debit: "1500.00", credit: "0.00" },
      { account_code: "1100", debit: "0.00", credit: "1000.00" },
      { account_code: "1100", debit: "0.00", credit: "500.00" },
    ])
    expect(unbalanced).toEqual([])
  })

  it("reduces each invoice's balance by exactly its own allocation", async () => {
    const { partialBefore, partialAfter, otherBefore, otherAfter } =
      await inRollback(async (tx) => {
        const [partialBefore] = await tx<{ due: string }[]>`
          SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
        `
        const [otherBefore] = await tx<{ due: string }[]>`
          SELECT amount_due::text AS due FROM invoices WHERE id = ${OTHER_OPEN}::uuid
        `
        await acc.recordLockboxPayment(tx, NORTHWIND, LOCKBOX, ACTOR)
        const [partialAfter] = await tx<{ due: string }[]>`
          SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
        `
        const [otherAfter] = await tx<{ due: string }[]>`
          SELECT amount_due::text AS due FROM invoices WHERE id = ${OTHER_OPEN}::uuid
        `
        return { partialBefore, partialAfter, otherBefore, otherAfter }
      })
    expect(Number(partialBefore.due) - Number(partialAfter.due)).toBe(1000)
    expect(Number(otherBefore.due) - Number(otherAfter.due)).toBe(500)
  })

  it("marks an invoice paid when its own allocation settles it exactly, leaves the other partial", async () => {
    const result = await inRollback((tx) =>
      acc.recordLockboxPayment(
        tx,
        NORTHWIND,
        {
          ...LOCKBOX,
          allocations: [
            { invoiceId: PARTIAL, amount: "1000.00" },
            { invoiceId: OTHER_OPEN, amount: "2443.75" },
          ],
          totalAmount: "3443.75",
        },
        ACTOR,
      ),
    )
    const partial = result.statuses.find(
      (s) => s.invoiceNumber === "INV-2026-004",
    )
    const settled = result.statuses.find(
      (s) => s.invoiceNumber === "INV-2026-005",
    )
    expect(partial?.status).toBe("partial")
    expect(settled?.status).toBe("paid")
  })

  it("refuses an individual allocation that overpays its own invoice", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordLockboxPayment(
            tx,
            NORTHWIND,
            {
              ...LOCKBOX,
              allocations: [{ invoiceId: OTHER_OPEN, amount: "2443.76" }],
              totalAmount: "2443.76",
            },
            ACTOR,
          ),
        ),
      "overpayment",
    )
  })

  it("refuses when the allocations don't sum to the stated total", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordLockboxPayment(
            tx,
            NORTHWIND,
            { ...LOCKBOX, totalAmount: "1499.99" },
            ACTOR,
          ),
        ),
      "allocation_mismatch",
    )
  })

  it("refuses a draft invoice in the batch", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          // PARTIAL forced to draft, otherwise unchanged: LOCKBOX's own
          // allocation against it (1000.00, well within its 32,439.97
          // balance) stays genuinely payable — the fixture's only real
          // draft invoice belongs to a different customer, so this test
          // would otherwise isolate nothing (an unpayable allocation, like
          // a zeroed-out one, could pass for the wrong reason if the
          // status check were ever removed).
          await tx`UPDATE invoices SET status = 'draft' WHERE id = ${PARTIAL}::uuid`
          return acc.recordLockboxPayment(tx, NORTHWIND, LOCKBOX, ACTOR)
        }),
      "wrong_status",
    )
  })

  it("refuses an invoice that belongs to a different customer", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordLockboxPayment(
            tx,
            NORTHWIND,
            {
              ...LOCKBOX,
              allocations: [
                ...LOCKBOX.allocations,
                { invoiceId: GBP, amount: "100.00" },
              ],
            },
            ACTOR,
          ),
        ),
      "wrong_customer",
    )
  })

  it("refuses the same invoice named twice in one batch", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordLockboxPayment(
            tx,
            NORTHWIND,
            {
              ...LOCKBOX,
              allocations: [
                { invoiceId: PARTIAL, amount: "1000.00" },
                { invoiceId: PARTIAL, amount: "500.00" },
              ],
            },
            ACTOR,
          ),
        ),
      "duplicate_invoice",
    )
  })
})

describe("issuing a credit memo", () => {
  const CREDIT = {
    invoiceId: PARTIAL,
    amount: "1000.00",
    creditDate: "2026-03-15",
    reason: "Service-level credit for a missed delivery window",
  }

  it("posts revenue reversed against receivables, and keeps the ledger balanced", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      const { creditNumber } = await acc.recordCreditMemo(
        tx,
        NORTHWIND,
        CREDIT,
        ACTOR,
      )
      const posted = await tx<
        { account_code: string; debit: string; credit: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.reference = ${creditNumber}
         ORDER BY l.line_number
      `
      return { posted, unbalanced: await unbalancedEntries(tx) }
    })
    expect(posted).toEqual([
      { account_code: "4000", debit: "1000.00", credit: "0.00" },
      { account_code: "1100", debit: "0.00", credit: "1000.00" },
    ])
    expect(unbalanced).toEqual([])
  })

  it("reduces what is owed by exactly the credited amount", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const [before] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      await acc.recordCreditMemo(tx, NORTHWIND, CREDIT, ACTOR)
      const [after] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      return { before, after }
    })
    expect(Number(before.due) - Number(after.due)).toBe(1000)
  })

  it("marks the invoice credited when the last of it is settled this way", async () => {
    const result = await inRollback((tx) =>
      acc.recordCreditMemo(
        tx,
        NORTHWIND,
        { ...CREDIT, amount: "32439.97" },
        ACTOR,
      ),
    )
    expect(result.status).toBe("credited")
  })

  it("leaves its existing status when something is still outstanding", async () => {
    const result = await inRollback((tx) =>
      acc.recordCreditMemo(tx, NORTHWIND, CREDIT, ACTOR),
    )
    expect(result.status).toBe("partial")
  })

  it("refuses more than is outstanding", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordCreditMemo(
            tx,
            NORTHWIND,
            { ...CREDIT, amount: "32439.98" },
            ACTOR,
          ),
        ),
      "over_credit",
    )
  })

  it("refuses a credit against a draft", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordCreditMemo(
            tx,
            NORTHWIND,
            { ...CREDIT, invoiceId: DRAFT },
            ACTOR,
          ),
        ),
      "wrong_status",
    )
  })

  it("refuses a second credit once the invoice is already fully credited", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          await acc.recordCreditMemo(
            tx,
            NORTHWIND,
            { ...CREDIT, amount: "32439.97" },
            ACTOR,
          )
          await acc.recordCreditMemo(tx, NORTHWIND, CREDIT, ACTOR)
        }),
      "over_credit",
    )
  })

  it("keeps the credit, the invoice_credits row, and the header in step", async () => {
    const { credited, headerCredited } = await inRollback(async (tx) => {
      await acc.recordCreditMemo(tx, NORTHWIND, CREDIT, ACTOR)
      const [credited] = await tx<{ total: string }[]>`
        SELECT coalesce(sum(amount),0)::text AS total
          FROM invoice_credits WHERE invoice_id = ${PARTIAL}::uuid
      `
      const [headerCredited] = await tx<{ amount_credited: string }[]>`
        SELECT amount_credited::text AS amount_credited
          FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      return { credited, headerCredited }
    })
    expect(headerCredited.amount_credited).toBe(credited.total)
  })
})

describe("writing off bad debt", () => {
  const WRITEOFF = {
    invoiceId: PARTIAL,
    amount: "1000.00",
    creditDate: "2026-03-15",
    reason: "Customer went out of business; collection attempts exhausted",
  }

  it("posts the loss against Bad Debt Expense, not revenue, and keeps the ledger balanced", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      const { creditNumber } = await acc.recordWriteOff(
        tx,
        NORTHWIND,
        WRITEOFF,
        ACTOR,
      )
      const posted = await tx<
        { account_code: string; debit: string; credit: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.reference = ${creditNumber}
         ORDER BY l.line_number
      `
      return { posted, unbalanced: await unbalancedEntries(tx) }
    })
    expect(posted).toEqual([
      { account_code: "5500", debit: "1000.00", credit: "0.00" },
      { account_code: "1100", debit: "0.00", credit: "1000.00" },
    ])
    expect(unbalanced).toEqual([])
  })

  it("reduces what is owed by exactly the written-off amount", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const [before] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      await acc.recordWriteOff(tx, NORTHWIND, WRITEOFF, ACTOR)
      const [after] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      return { before, after }
    })
    expect(Number(before.due) - Number(after.due)).toBe(1000)
  })

  it("marks the invoice written_off, not credited, when the last of it is settled this way", async () => {
    const result = await inRollback((tx) =>
      acc.recordWriteOff(
        tx,
        NORTHWIND,
        { ...WRITEOFF, amount: "32439.97" },
        ACTOR,
      ),
    )
    expect(result.status).toBe("written_off")
  })

  it("leaves its existing status when something is still outstanding", async () => {
    const result = await inRollback((tx) =>
      acc.recordWriteOff(tx, NORTHWIND, WRITEOFF, ACTOR),
    )
    expect(result.status).toBe("partial")
  })

  it("refuses more than is outstanding", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordWriteOff(
            tx,
            NORTHWIND,
            { ...WRITEOFF, amount: "32439.98" },
            ACTOR,
          ),
        ),
      "over_writeoff",
    )
  })

  it("refuses a write-off against a draft", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          acc.recordWriteOff(
            tx,
            NORTHWIND,
            { ...WRITEOFF, invoiceId: DRAFT },
            ACTOR,
          ),
        ),
      "wrong_status",
    )
  })

  it("shares invoice_credits and amount_credited with a credit memo against the same invoice", async () => {
    const { rowTypes, headerCredited } = await inRollback(async (tx) => {
      await acc.recordCreditMemo(
        tx,
        NORTHWIND,
        {
          invoiceId: PARTIAL,
          amount: "1000.00",
          creditDate: "2026-03-15",
          reason: "Service-level credit",
        },
        ACTOR,
      )
      await acc.recordWriteOff(tx, NORTHWIND, WRITEOFF, ACTOR)
      const rowTypes = await tx<{ credit_type: string; amount: string }[]>`
        SELECT credit_type, amount::text AS amount
          FROM invoice_credits WHERE invoice_id = ${PARTIAL}::uuid
         ORDER BY created_at
      `
      const [headerCredited] = await tx<{ amount_credited: string }[]>`
        SELECT amount_credited::text AS amount_credited
          FROM invoices WHERE id = ${PARTIAL}::uuid
      `
      return { rowTypes, headerCredited }
    })
    expect(rowTypes).toEqual([
      { credit_type: "credit_memo", amount: "1000.00" },
      { credit_type: "write_off", amount: "1000.00" },
    ])
    expect(headerCredited.amount_credited).toBe("2000.00")
  })
})

describe("the header is a cache of the lines", () => {
  it("REPAIRS an invoice whose stored total had drifted", async () => {
    // Recomputed, not adjusted — a wrong header self-heals on next write.
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
    // Its revenue is in the ledger — reverse it with a credit note, not a void.
    await refusedBecause(
      () => inRollback((tx) => acc.voidInvoice(tx, PAID, ACTOR, "mistake")),
      "wrong_status",
    )
  })
})

describe("payment reminders (US-ACC-003)", () => {
  describe("invoicesForReminder", () => {
    it("returns eligible overdue invoices with the customer's email", async () => {
      const rows = await inRollback((tx) =>
        acc.invoicesForReminder(tx, NORTHWIND, [GBP, PARTIAL]),
      )
      const byId = new Map(rows.map((r) => [r.id, r]))
      expect(byId.get(GBP)).toMatchObject({
        invoice_number: "INV-2026-002",
        email: "ap@britco.example",
        reminded_today: false,
      })
      expect(byId.get(PARTIAL)).toMatchObject({
        invoice_number: "INV-2026-004",
        email: "ap@acme.example",
        reminded_today: false,
      })
    })

    it("flags an invoice already reminded earlier today", async () => {
      const row = await inRollback(async (tx) => {
        // `now()` inside the test's own transaction, not a hardcoded
        // timestamp — a fixed date would stop being "today" the day after
        // this test was written.
        await tx`UPDATE invoices SET last_reminded_at = now() WHERE id = ${GBP}::uuid`
        const [r] = await acc.invoicesForReminder(tx, NORTHWIND, [GBP])
        return r
      })
      expect(row.reminded_today).toBe(true)
    })

    it("refuses a fully paid invoice (not eligible for a reminder)", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) => acc.invoicesForReminder(tx, NORTHWIND, [PAID])),
        "no_such_invoice",
      )
    })

    it("refuses a draft invoice", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) => acc.invoicesForReminder(tx, NORTHWIND, [DRAFT])),
        "no_such_invoice",
      )
    })

    it("refuses the same invoice named twice in one batch", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            acc.invoicesForReminder(tx, NORTHWIND, [GBP, GBP]),
          ),
        "duplicate_invoice",
      )
    })

    it("refuses an invoice that does not exist", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            acc.invoicesForReminder(tx, NORTHWIND, [
              "00000000-0000-0000-0000-000000000000",
            ]),
          ),
        "no_such_invoice",
      )
    })
  })

  describe("recordRemindersSent", () => {
    it("sets last_reminded_at for every given invoice", async () => {
      const row = await inRollback(async (tx) => {
        await acc.recordRemindersSent(tx, [PARTIAL])
        const [r] = await tx<{ reminded_today: boolean }[]>`
          SELECT (last_reminded_at IS NOT NULL
                  AND last_reminded_at::date = CURRENT_DATE) AS reminded_today
            FROM invoices WHERE id = ${PARTIAL}::uuid
        `
        return r
      })
      expect(row.reminded_today).toBe(true)
    })

    it("does nothing, without a query, for an empty list", async () => {
      const row = await inRollback(async (tx) => {
        await acc.recordRemindersSent(tx, [])
        const [r] = await tx<{ unchanged: boolean }[]>`
          SELECT last_reminded_at = '2026-08-01T09:00:00Z'::timestamptz
                   AS unchanged
            FROM invoices WHERE id = ${GBP}::uuid
        `
        return r
      })
      // Still the fixture's seeded, well-in-the-past value — untouched.
      expect(row.unchanged).toBe(true)
    })
  })
})

describe("recurring invoice schedules (US-ACC-004)", () => {
  const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
  /** Backs INV-2026-005 ("Recurring support retainer"), monthly, due 2026-09-01 — safely in the past for a long time. */
  const SCHEDULE = "4d83e8af-2f37-52ff-8971-5e10e9e651b9"

  const NEW_SCHEDULE = {
    customerId: ACME,
    frequency: "monthly" as const,
    nextRunDate: "2026-10-01",
    dueInDays: 30,
    exchangeRate: "1.000000",
    paymentTerms: "Net 30",
    notes: null,
    footerText: null,
    lines: [
      {
        description: "Monthly retainer",
        quantity: "1.00",
        unitPrice: "2000.00",
        discountPercent: "0",
        taxAmount: "0",
        taxRateId: null,
      },
    ],
  }

  describe("listRecurringSchedules", () => {
    it("returns the fixture schedule with its customer and line count", async () => {
      const rows = await inRollback((tx) => acc.listRecurringSchedules(tx))
      const row = rows.find((r) => r.id === SCHEDULE)
      expect(row).toMatchObject({
        customer_name: "Acme Manufacturing",
        frequency: "monthly",
        is_active: true,
        line_count: 1,
      })
    })
  })

  describe("createRecurringSchedule", () => {
    it("creates a schedule with its template lines stored as a real JSON array", async () => {
      // Not just "the insert didn't throw" — `tx.json()` vs. a hand-rolled
      // `${JSON.stringify(...)}::jsonb` looked identical until read back:
      // the latter double-encodes, storing a JSON STRING containing the
      // array text rather than the array itself, which only breaks the
      // first time something reads it (jsonb_array_length, generateDueInvoices).
      const row = await inRollback(async (tx) => {
        const { id } = await acc.createRecurringSchedule(
          tx,
          NORTHWIND,
          NEW_SCHEDULE,
          ACTOR,
        )
        const [r] = await tx<{ id: string; kind: string }[]>`
          SELECT id::text AS id, jsonb_typeof(template_lines) AS kind
            FROM recurring_schedules WHERE id = ${id}::uuid
        `
        return r
      })
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(row.kind).toBe("array")
    })

    it("refuses no lines", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            acc.createRecurringSchedule(
              tx,
              NORTHWIND,
              { ...NEW_SCHEDULE, lines: [] },
              ACTOR,
            ),
          ),
        "no_lines",
      )
    })

    it("refuses a customer that does not exist", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            acc.createRecurringSchedule(
              tx,
              NORTHWIND,
              {
                ...NEW_SCHEDULE,
                customerId: "00000000-0000-0000-0000-000000000000",
              },
              ACTOR,
            ),
          ),
        "no_such_customer",
      )
    })
  })

  describe("toggleRecurringSchedule", () => {
    it("flips is_active", async () => {
      const { from, to } = await inRollback((tx) =>
        acc.toggleRecurringSchedule(tx, SCHEDULE, ACTOR),
      )
      expect(from).toBe(true)
      expect(to).toBe(false)
    })

    it("refuses a schedule that does not exist", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            acc.toggleRecurringSchedule(
              tx,
              "00000000-0000-0000-0000-000000000000",
              ACTOR,
            ),
          ),
        "no_such_schedule",
      )
    })
  })

  describe("generateDueInvoices", () => {
    it("generates a draft invoice from a due schedule, linked back to it", async () => {
      const { generated, invoice } = await inRollback(async (tx) => {
        const generated = await acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
        const [invoice] = await tx<
          {
            status: string
            is_recurring: boolean
            recurring_schedule_id: string
          }[]
        >`
          SELECT status, is_recurring, recurring_schedule_id::text AS recurring_schedule_id
            FROM invoices WHERE id = ${generated[0].invoiceId}::uuid
        `
        return { generated, invoice }
      })
      expect(generated).toEqual([
        {
          scheduleId: SCHEDULE,
          invoiceId: expect.any(String),
          invoiceNumber: expect.stringMatching(/^INV-\d{4}-\d{3}$/),
          customerName: "Acme Manufacturing",
        },
      ])
      expect(invoice).toEqual({
        status: "draft",
        is_recurring: true,
        recurring_schedule_id: SCHEDULE,
      })
    })

    it("advances the schedule's next_run_date by one month, past today", async () => {
      const row = await inRollback(async (tx) => {
        await acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
        const [r] = await tx<{ advanced: boolean }[]>`
          SELECT next_run_date = '2026-10-01'::date AS advanced
            FROM recurring_schedules WHERE id = ${SCHEDULE}::uuid
        `
        return r
      })
      expect(row.advanced).toBe(true)
    })

    it("does not generate the same schedule twice in the same run", async () => {
      const { first, second } = await inRollback(async (tx) => {
        const first = await acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
        const second = await acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
        return { first, second }
      })
      expect(first).toHaveLength(1)
      expect(second).toHaveLength(0)
    })

    it("skips an inactive schedule", async () => {
      const generated = await inRollback(async (tx) => {
        await acc.toggleRecurringSchedule(tx, SCHEDULE, ACTOR)
        return acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
      })
      expect(generated).toEqual([])
    })

    it("drifts off month-end permanently once a monthly schedule crosses February", async () => {
      // Postgres CLAMPS date + interval rather than overflowing: Jan 31 + 1
      // month is Feb 28, not Mar 3 — and the schedule then advances from
      // Feb 28, so it never returns to the 31st. A known, documented
      // limitation (module-accounting.md's US-ACC-004 status block), not a
      // bug to fix here — an anchor-day column would be the fix, and is
      // scope this feature doesn't need yet.
      const dates = await inRollback(async (tx) => {
        await tx`
          UPDATE recurring_schedules
             SET next_run_date = '2026-01-31'
           WHERE id = ${SCHEDULE}::uuid
        `
        const first = await acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
        const [{ next_run_date: afterFirst }] = await tx<
          { next_run_date: string }[]
        >`SELECT next_run_date::text FROM recurring_schedules WHERE id = ${SCHEDULE}::uuid`
        // Already 2026-02-28 after the first run (CURRENT_DATE is 2026-09-20
        // in this environment) — the second call needs no setup of its own.
        const second = await acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
        const [{ next_run_date: afterSecond }] = await tx<
          { next_run_date: string }[]
        >`SELECT next_run_date::text FROM recurring_schedules WHERE id = ${SCHEDULE}::uuid`
        return { first, afterFirst, second, afterSecond }
      })
      expect(dates.first).toHaveLength(1)
      expect(dates.afterFirst).toBe("2026-02-28")
      expect(dates.second).toHaveLength(1)
      expect(dates.afterSecond).toBe("2026-03-28")
    })

    it("refuses, naming the customer, when its schedule's tax-bearing lines hit a now-exempt customer", async () => {
      // The schedule's one template line carries $443.75 of tax — set after
      // the schedule was created, exactly the L60 shape createInvoice's own
      // exemption check exists for: a customer can become exempt any time
      // after a schedule (or a manual invoice) was set up.
      await expect(
        inRollback(async (tx) => {
          await tx`UPDATE customers SET is_tax_exempt = true WHERE id = ${ACME}::uuid`
          return acc.generateDueInvoices(tx, NORTHWIND, ACTOR)
        }),
      ).rejects.toMatchObject({
        reason: "customer_tax_exempt",
        detail: "Acme Manufacturing",
      })
    })
  })
})

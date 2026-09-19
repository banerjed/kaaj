import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as pay from "./payables.repo"
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
 * The payables write path, against the real database — asserts the ledger
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

/** BILL-WEWORK-2026-03 — the only draft in an open period, USD, carries tax. */
const DRAFT_OPEN = "bcd1ea91-77f8-435b-8a5e-d8dbdf861819"
/** BILL-WEWORK-2026-01 — a draft dated into the closed January period. */
const DRAFT_CLOSED = "4ad6a70c-4bf5-4d20-be0c-82cc758009fa"
/** BILL-AWS-2026-01 — approved, 1981.53 outstanding, approved by Sarah Johnson. */
const APPROVED = "fdab0a8b-c4d8-5601-bf23-59c3028e9359"

/** ACH-ACME-002 — unmatched USD credit, +10000.00. */
const CREDIT_TXN = "180b42f3-73b0-4e6b-b85c-c6420293cfb2"
/** WIRE-AWS-BATCH-001 — unmatched USD debit, -2500.00. */
const DEBIT_TXN = "c76154a4-758d-44ae-acb6-fdde20b20cb3"
/** ACH-ACME-001 — already reconciled, matched to PAY-2026-001. */
const RECONCILED_TXN = "ba95034d-6bfa-57cb-95ec-74c7779a11a4"
/** FPS-UNKNOWN-002 — unmatched GBP credit. */
const GBP_TXN = "dc9d747d-7760-5046-b1bf-27c2c482305a"

/** PAY-2026-002 — a customer payment, USD 10000.00, unmatched to any transaction. */
const CUSTOMER_PAYMENT = "4c3b0a1e-770f-55b6-820d-d6ba91c6bf73"
/** VPAY-2026-001 — a vendor payment, USD 2500.00, unmatched to any transaction. */
const VENDOR_PAYMENT = "c147933d-3de1-5a49-b045-3645d4bc5eaf"
/** PAY-2026-001 — a customer payment already matched to RECONCILED_TXN. */
const ALREADY_MATCHED_PAYMENT = "26361e4b-8a87-5b2a-a692-10ec68e02875"

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

/** Amazon Web Services — USD. */
const AWS_VENDOR = "8a0bb1a6-448e-50f5-bbc0-1a41850d2e92"
/** JetBrains — EUR, so currency-from-vendor is actually exercised. */
const JETBRAINS_VENDOR = "77464d71-79dd-5490-93a3-a62c9df1d027"
/** Software Subscriptions, 5300 — an expense account real fixture lines use. */
const SOFTWARE_ACCOUNT = "030e294b-88ad-544e-841a-cfda187885ac"
/** Travel & Entertainment, 5200 — a second, distinct expense account. */
const TRAVEL_ACCOUNT = "c1158fe0-38ae-5741-a84f-a76381cebae3"

function oneBillLine(
  overrides: Partial<pay.NewBillLine> = {},
): pay.NewBillLine {
  return {
    description: "Cloud hosting",
    quantity: "1",
    unitPrice: "100.00",
    taxAmount: "0",
    expenseAccountId: SOFTWARE_ACCOUNT,
    ...overrides,
  }
}

describe("creating a bill", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("refuses a bill with no lines", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.createBill(
            tx,
            NORTHWIND,
            {
              vendorId: AWS_VENDOR,
              billNumber: "BILL-AWS-TEST-NOLINES",
              reference: null,
              billDate: "2026-03-10",
              dueDate: "2026-04-10",
              exchangeRate: "1.000000",
              paymentTerms: null,
              notes: null,
              lines: [],
            },
            ACTOR,
          ),
        ),
      "no_lines",
    )
  })

  it("refuses a vendor that does not exist", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.createBill(
            tx,
            NORTHWIND,
            {
              vendorId: "00000000-0000-0000-0000-000000000000",
              billNumber: "BILL-GHOST-TEST",
              reference: null,
              billDate: "2026-03-10",
              dueDate: "2026-04-10",
              exchangeRate: "1.000000",
              paymentTerms: null,
              notes: null,
              lines: [oneBillLine()],
            },
            ACTOR,
          ),
        ),
      "no_such_vendor",
    )
  })

  it("sums line amounts and tax into subtotal, tax_total and total", async () => {
    const bill = await inRollback(async (tx) => {
      const { id } = await pay.createBill(
        tx,
        NORTHWIND,
        {
          vendorId: AWS_VENDOR,
          billNumber: "BILL-AWS-TEST-SUM",
          reference: "AWS-TEST-SUM",
          billDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.000000",
          paymentTerms: "net_30",
          notes: null,
          lines: [
            oneBillLine({
              description: "Compute",
              quantity: "10",
              unitPrice: "100.00",
              taxAmount: "50.00",
              expenseAccountId: SOFTWARE_ACCOUNT,
            }),
            oneBillLine({
              description: "Travel",
              quantity: "1",
              unitPrice: "200.00",
              taxAmount: "0",
              expenseAccountId: TRAVEL_ACCOUNT,
            }),
          ],
        },
        ACTOR,
      )
      const [row] = await tx<
        { subtotal: string; tax_total: string; total: string }[]
      >`
        SELECT subtotal::text AS subtotal, tax_total::text AS tax_total,
               total::text AS total
          FROM bills WHERE id = ${id}::uuid
      `
      return row
    })
    // 10*100.00 + 1*200.00 = 1200.00 subtotal; 50.00 tax; 1250.00 total.
    expect(bill.subtotal).toBe("1200.00")
    expect(bill.tax_total).toBe("50.00")
    expect(bill.total).toBe("1250.00")
  })

  it("takes currency from the vendor, base currency from the tenant, and converts at the given rate", async () => {
    const bill = await inRollback(async (tx) => {
      const { id } = await pay.createBill(
        tx,
        NORTHWIND,
        {
          vendorId: JETBRAINS_VENDOR,
          billNumber: "BILL-JETBRAINS-TEST-CCY",
          reference: null,
          billDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.100000",
          paymentTerms: null,
          notes: null,
          // oneBillLine() defaults to qty 1 × 100.00, no tax.
          lines: [oneBillLine()],
        },
        ACTOR,
      )
      const [row] = await tx<
        {
          currency: string
          base_currency: string
          base_subtotal: string
          base_total: string
        }[]
      >`
        SELECT currency, base_currency,
               base_subtotal::text AS base_subtotal,
               base_total::text    AS base_total
          FROM bills WHERE id = ${id}::uuid
      `
      return row
    })
    expect(bill.currency).toBe("EUR")
    expect(bill.base_currency).toBe("USD")
    // 100.00 * 1.1 — this is the only non-1.0-rate case in this describe
    // block, so it is the only thing that would catch recomputeBillTotals'
    // round-then-sum path (each part rounded before summing, per L25) going
    // wrong; ck_bills_amounts_reconcile does not constrain base_* at all.
    expect(bill.base_subtotal).toBe("110.00")
    expect(bill.base_total).toBe("110.00")
  })

  it("keeps money as strings throughout", async () => {
    const bill = await inRollback(async (tx) => {
      const { id } = await pay.createBill(
        tx,
        NORTHWIND,
        {
          vendorId: AWS_VENDOR,
          billNumber: "BILL-AWS-TEST-STRINGS",
          reference: null,
          billDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          lines: [oneBillLine()],
        },
        ACTOR,
      )
      return pay.billById(tx, id)
    })
    expect(typeof bill?.subtotal).toBe("string")
    expect(typeof bill?.total).toBe("string")
    expect(typeof bill?.amount_due).toBe("string")
  })

  it("creates a draft that approves cleanly — each line posts to its own expense account", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      const { id } = await pay.createBill(
        tx,
        NORTHWIND,
        {
          vendorId: AWS_VENDOR,
          billNumber: "BILL-AWS-TEST-APPROVE",
          reference: null,
          billDate: "2026-03-10",
          dueDate: "2026-04-10",
          exchangeRate: "1.000000",
          paymentTerms: null,
          notes: null,
          lines: [
            oneBillLine({
              description: "Cloud hosting",
              quantity: "1",
              unitPrice: "300.00",
              taxAmount: "0",
              expenseAccountId: SOFTWARE_ACCOUNT,
            }),
            oneBillLine({
              description: "Client site visit",
              quantity: "1",
              unitPrice: "150.00",
              taxAmount: "0",
              expenseAccountId: TRAVEL_ACCOUNT,
            }),
          ],
        },
        ACTOR,
      )
      const { entryNumber } = await pay.approveBill(tx, NORTHWIND, id, ACTOR)
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
    // DR each line's own expense account (5300, 5200), no input tax line
    // since tax_total is zero, CR accounts payable for the total — proving
    // the account each line was CREATED with is the one actually posted to,
    // not a single hardcoded account the way issueInvoice's revenue side is.
    expect(posted).toEqual([
      { account_code: "5300", debit: "300.00", credit: "0.00" },
      { account_code: "5200", debit: "150.00", credit: "0.00" },
      { account_code: "2000", debit: "0.00", credit: "450.00" },
    ])
    expect(unbalanced).toEqual([])
  })
})

describe("approving a bill", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("posts a balanced entry, one line per expense account, and leaves the ledger balanced", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      const { entryNumber } = await pay.approveBill(
        tx,
        NORTHWIND,
        DRAFT_OPEN,
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
    // DR office rent, DR travel, DR recoverable tax, CR accounts payable.
    expect(posted).toEqual([
      { account_code: "5400", debit: "3200.00", credit: "0.00" },
      { account_code: "5200", debit: "150.00", credit: "0.00" },
      { account_code: "1200", debit: "284.00", credit: "0.00" },
      { account_code: "2000", debit: "0.00", credit: "3634.00" },
    ])
    expect(unbalanced).toEqual([])
  })

  it("names the new approver and leaves the old creator alone", async () => {
    const bill = await inRollback(async (tx) => {
      await pay.approveBill(tx, NORTHWIND, DRAFT_OPEN, ACTOR)
      const [r] = await tx<
        { status: string; approved_by: string; created_by: string }[]
      >`
        SELECT status, approved_by::text AS approved_by,
               created_by::text AS created_by
          FROM bills WHERE id = ${DRAFT_OPEN}::uuid
      `
      return r
    })
    expect(bill.status).toBe("approved")
    expect(bill.approved_by).toBe(ACTOR)
    expect(bill.created_by).not.toBe(ACTOR)
  })

  it("refuses a bill that is not a draft", async () => {
    await refusedBecause(
      () => inRollback((tx) => pay.approveBill(tx, NORTHWIND, APPROVED, ACTOR)),
      "wrong_status",
    )
  })

  it("refuses a bill with no lines", async () => {
    // Empty bill is INSERTED, not made by deleting lines off an existing one
    // — app_user holds no DELETE here.
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const [empty] = await tx<{ id: string }[]>`
            INSERT INTO bills (
              tenant_id, vendor_id, bill_number, bill_date, due_date,
              currency, base_currency, subtotal, tax_total, total,
              amount_paid, amount_due, base_subtotal, base_tax_total,
              base_total, base_amount_paid, base_amount_due, status
            )
            SELECT tenant_id, vendor_id, 'BILL-EMPTY-TEST',
                   DATE '2026-03-10', DATE '2026-04-10', currency, base_currency,
                   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'draft'
              FROM bills WHERE id = ${DRAFT_OPEN}::uuid
            RETURNING id
          `
          return pay.approveBill(tx, NORTHWIND, empty.id, ACTOR)
        }),
      "no_lines",
    )
  })
})

describe("closed accounting periods", () => {
  it("refuses to recognise a liability in a closed period", async () => {
    // January 2026 is closed in the fixture.
    await refusedBecause(
      () =>
        inRollback((tx) => pay.approveBill(tx, NORTHWIND, DRAFT_CLOSED, ACTOR)),
      "period_closed",
    )
  })

  it("allows a posting in a month no period row covers", async () => {
    const approved = await inRollback(async (tx) => {
      await tx`
        UPDATE bills
           SET bill_date = DATE '2026-09-10', due_date = DATE '2026-10-10'
         WHERE id = ${DRAFT_OPEN}::uuid
      `
      return pay.approveBill(tx, NORTHWIND, DRAFT_OPEN, ACTOR)
    })
    expect(approved.entryNumber).toMatch(/^JE-2026-\d{4}$/)
  })
})

describe("paying a vendor", () => {
  const PAYMENT = {
    billId: APPROVED,
    amount: "1000.00",
    paymentDate: "2026-03-15",
    method: "wire_transfer",
    reference: "WIRE-99001",
    bankAccountId: "6d55e7d0-f085-5951-9f28-2fcd1b75c6bc",
  }

  it("posts cash against payables and keeps the ledger balanced", async () => {
    const { posted, unbalanced } = await inRollback(async (tx) => {
      await pay.recordVendorPayment(tx, NORTHWIND, PAYMENT, ACTOR)
      const posted = await tx<
        { account_code: string; debit: string; credit: string }[]
      >`
        SELECT a.account_code, l.debit_amount::text AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.reference LIKE 'VPAY-%' AND e.entry_date = '2026-03-15'
         ORDER BY l.line_number
      `
      return { posted, unbalanced: await unbalancedEntries(tx) }
    })
    expect(posted).toEqual([
      { account_code: "2000", debit: "1000.00", credit: "0.00" },
      { account_code: "1000", debit: "0.00", credit: "1000.00" },
    ])
    expect(unbalanced).toEqual([])
  })

  it("reduces what is owed by exactly the amount paid", async () => {
    const { before, after } = await inRollback(async (tx) => {
      const [before] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM bills WHERE id = ${APPROVED}::uuid
      `
      await pay.recordVendorPayment(tx, NORTHWIND, PAYMENT, ACTOR)
      const [after] = await tx<{ due: string }[]>`
        SELECT amount_due::text AS due FROM bills WHERE id = ${APPROVED}::uuid
      `
      return { before, after }
    })
    expect(Number(before.due) - Number(after.due)).toBe(1000)
  })

  it("marks the bill paid when the last of it is settled", async () => {
    const result = await inRollback((tx) =>
      pay.recordVendorPayment(
        tx,
        NORTHWIND,
        { ...PAYMENT, amount: "1981.53" },
        ACTOR,
      ),
    )
    expect(result.status).toBe("paid")
  })

  it("leaves it partial when something is still outstanding", async () => {
    const result = await inRollback((tx) =>
      pay.recordVendorPayment(tx, NORTHWIND, PAYMENT, ACTOR),
    )
    expect(result.status).toBe("partial")
  })

  it("refuses more than is outstanding", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.recordVendorPayment(
            tx,
            NORTHWIND,
            { ...PAYMENT, amount: "1981.54" },
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
          pay.recordVendorPayment(
            tx,
            NORTHWIND,
            { ...PAYMENT, billId: DRAFT_OPEN },
            ACTOR,
          ),
        ),
      "wrong_status",
    )
  })

  it("refuses the approver paying their own bill", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          await tx`
            UPDATE bills SET approved_by = ${ACTOR}::uuid
             WHERE id = ${APPROVED}::uuid
          `
          return pay.recordVendorPayment(tx, NORTHWIND, PAYMENT, ACTOR)
        }),
      "self_approval",
    )
  })

  it("keeps the payment, the allocation and the header in step", async () => {
    const { allocated, paid } = await inRollback(async (tx) => {
      await pay.recordVendorPayment(tx, NORTHWIND, PAYMENT, ACTOR)
      const [allocated] = await tx<{ total: string }[]>`
        SELECT coalesce(sum(amount),0)::text AS total
          FROM payment_allocations WHERE bill_id = ${APPROVED}::uuid
      `
      const [paid] = await tx<{ amount_paid: string }[]>`
        SELECT amount_paid::text AS amount_paid
          FROM bills WHERE id = ${APPROVED}::uuid
      `
      return { allocated, paid }
    })
    expect(paid.amount_paid).toBe(allocated.total)
  })
})

describe("batch vendor payment run (US-ACC-025)", () => {
  /** Sarah Johnson — approves the freshly created bills below, so paying
   *  them with ACTOR afterward is never a self-approval. */
  const APPROVER = "6d466aa9-e51a-5d52-9015-152600855932"
  let billCounter = 0

  /** A fresh, real approved bill — built through createBill/approveBill
   *  rather than reopening a 'paid' fixture row, which would need to
   *  reconcile stale `payment_allocations` history against
   *  `ck_bills_amounts_reconcile`/`ck_payment_allocations_one_document` for
   *  no benefit; a genuinely new bill has neither problem. */
  async function freshApprovedBill(
    tx: Tx,
    vendorId: string,
    exchangeRate: string,
    amount: string,
  ): Promise<{ id: string; billNumber: string }> {
    billCounter += 1
    const billNumber = `BILL-BATCH-TEST-${billCounter}`
    const { id } = await pay.createBill(
      tx,
      NORTHWIND,
      {
        vendorId,
        billNumber,
        reference: null,
        billDate: "2026-03-10",
        dueDate: "2026-04-10",
        exchangeRate,
        paymentTerms: null,
        notes: null,
        lines: [oneBillLine({ unitPrice: amount, taxAmount: "0" })],
      },
      ACTOR,
    )
    await pay.approveBill(tx, NORTHWIND, id, APPROVER)
    return { id, billNumber }
  }

  const BATCH = {
    billIds: [] as string[],
    paymentDate: "2026-03-15",
    method: "wire_transfer",
    reference: "BATCH-99001",
    bankAccountId: "6d55e7d0-f085-5951-9f28-2fcd1b75c6bc",
  }

  it("pays bills across vendors in one run, one payment per vendor", async () => {
    const { result, unbalanced, rows } = await inRollback(async (tx) => {
      // Two AWS bills (APPROVED plus a fresh one) and one JetBrains bill —
      // exercises both "two bills, one vendor, one payment" and "one
      // payment per vendor" in a single batch.
      const aws2 = await freshApprovedBill(
        tx,
        AWS_VENDOR,
        "1.000000",
        "1000.00",
      )
      const jetbrains = await freshApprovedBill(
        tx,
        JETBRAINS_VENDOR,
        "1.090000",
        "500.00",
      )
      const result = await pay.payBillsInBatch(
        tx,
        NORTHWIND,
        { ...BATCH, billIds: [APPROVED, aws2.id, jetbrains.id] },
        ACTOR,
      )
      const rows = await tx<
        {
          payment_number: string
          vendor_name: string
          amount: string
          has_journal_entry: boolean
        }[]
      >`
        SELECT p.payment_number, v.vendor_name, p.amount::text AS amount,
               p.journal_entry_id IS NOT NULL AS has_journal_entry
          FROM payments p
          JOIN vendors v ON v.id = p.vendor_id
         WHERE p.payment_number = ANY(
                 ${result.payments.map((p) => p.paymentNumber)}::text[]
               )
      `
      return { result, unbalanced: await unbalancedEntries(tx), rows }
    })
    expect(unbalanced).toEqual([])
    const byVendor = new Map(result.payments.map((p) => [p.vendorName, p]))
    // APPROVED (1981.53) + the fresh AWS bill (1000.00), one payment.
    const aws = byVendor.get("Amazon Web Services")
    expect(aws?.total).toBe("2981.53")
    expect(aws?.billNumbers.sort()).toEqual([
      "BILL-AWS-2026-01",
      "BILL-BATCH-TEST-1",
    ])
    const jetbrains = byVendor.get("JetBrains")
    expect(jetbrains?.total).toBe("500.00")
    expect(jetbrains?.billNumbers).toEqual(["BILL-BATCH-TEST-2"])
    expect(result.payments).toHaveLength(2)

    // The row a reconciliation actually reads: one payment per vendor, the
    // right amount against the right vendor, with a journal entry attached.
    const rowsByVendor = new Map(rows.map((r) => [r.vendor_name, r]))
    expect(rowsByVendor.get("Amazon Web Services")).toMatchObject({
      amount: "2981.53",
      has_journal_entry: true,
    })
    expect(rowsByVendor.get("JetBrains")).toMatchObject({
      amount: "500.00",
      has_journal_entry: true,
    })
    expect(rows).toHaveLength(2)
  })

  it("posts one payable line per bill and a single cash line, balanced", async () => {
    const lines = await inRollback(async (tx) => {
      const aws2 = await freshApprovedBill(
        tx,
        AWS_VENDOR,
        "1.000000",
        "1000.00",
      )
      const { payments } = await pay.payBillsInBatch(
        tx,
        NORTHWIND,
        { ...BATCH, billIds: [APPROVED, aws2.id] },
        ACTOR,
      )
      return tx<{ account_code: string; debit: string; credit: string }[]>`
        SELECT a.account_code, l.debit_amount::text AS debit,
               l.credit_amount::text AS credit
          FROM journal_entry_lines l
          JOIN journal_entries e ON e.id = l.entry_id
          JOIN chart_of_accounts a ON a.id = l.account_id
         WHERE e.reference = ${payments[0].paymentNumber}
         ORDER BY l.line_number
      `
    })
    expect(lines).toEqual([
      { account_code: "2000", debit: "1981.53", credit: "0.00" },
      { account_code: "2000", debit: "1000.00", credit: "0.00" },
      { account_code: "1000", debit: "0.00", credit: "2981.53" },
    ])
  })

  it("marks every bill in the batch paid", async () => {
    const statuses = await inRollback(async (tx) => {
      const aws2 = await freshApprovedBill(
        tx,
        AWS_VENDOR,
        "1.000000",
        "1000.00",
      )
      await pay.payBillsInBatch(
        tx,
        NORTHWIND,
        { ...BATCH, billIds: [APPROVED, aws2.id] },
        ACTOR,
      )
      return tx<{ id: string; status: string }[]>`
        SELECT id::text AS id, status FROM bills
         WHERE id = ANY(${[APPROVED, aws2.id]}::uuid[])
      `
    })
    expect(statuses.every((s) => s.status === "paid")).toBe(true)
  })

  it("refuses an empty batch", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.payBillsInBatch(tx, NORTHWIND, { ...BATCH, billIds: [] }, ACTOR),
        ),
      "no_lines",
    )
  })

  it("refuses the same bill named twice", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.payBillsInBatch(
            tx,
            NORTHWIND,
            { ...BATCH, billIds: [APPROVED, APPROVED] },
            ACTOR,
          ),
        ),
      "duplicate_bill",
    )
  })

  it("refuses a bill that's already fully paid", async () => {
    // BILL-AWS-2026-02A is 'paid' in the fixture, untouched.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.payBillsInBatch(
            tx,
            NORTHWIND,
            {
              ...BATCH,
              billIds: [APPROVED, "b07bca71-9562-5a5f-91b1-b749912c242d"],
            },
            ACTOR,
          ),
        ),
      "wrong_status",
    )
  })

  it("refuses the approver paying their own bill", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const aws2 = await freshApprovedBill(
            tx,
            AWS_VENDOR,
            "1.000000",
            "1000.00",
          )
          return pay.payBillsInBatch(
            tx,
            NORTHWIND,
            { ...BATCH, billIds: [aws2.id] },
            APPROVER,
          )
        }),
      "self_approval",
    )
  })

  it("refuses a batch spanning currencies within the same vendor", async () => {
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const aws2 = await freshApprovedBill(
            tx,
            AWS_VENDOR,
            "1.270000",
            "1000.00",
          )
          await tx`
            UPDATE bills SET currency = 'GBP' WHERE id = ${aws2.id}::uuid
          `
          return pay.payBillsInBatch(
            tx,
            NORTHWIND,
            { ...BATCH, billIds: [APPROVED, aws2.id] },
            ACTOR,
          )
        }),
      "currency_mismatch",
    )
  })

  it("does not recognize settlement FX gain/loss — matching recordLockboxPayment's own scope", async () => {
    const allocations = await inRollback(async (tx) => {
      await pay.payBillsInBatch(
        tx,
        NORTHWIND,
        { ...BATCH, billIds: [APPROVED] },
        ACTOR,
      )
      return tx<{ fx_gain_loss: string }[]>`
        SELECT fx_gain_loss::text FROM payment_allocations
         WHERE bill_id = ${APPROVED}::uuid
      `
    })
    expect(allocations.every((a) => a.fx_gain_loss === "0.00")).toBe(true)
  })
})

describe("settlement FX gain/loss (US-ACC-054)", () => {
  // No bill in the fixture is foreign-currency — converted from the
  // otherwise-unrelated APPROVED (USD) bill within the rollback (via
  // asForeignBill below), matching the pattern receivables.writes.test.ts
  // uses to exercise a foreign-currency invoice. The currency itself is
  // set per test, not baked into this payment.
  const FOREIGN_PAYMENT = {
    billId: APPROVED,
    amount: "1000.00",
    paymentDate: "2026-03-15",
    method: "wire_transfer",
    reference: "WIRE-GBP-01",
    bankAccountId: "7585ab47-4908-5830-a959-65711784fc61",
  }

  async function asForeignBill(
    tx: Tx,
    currency: string,
    bookingRate: string,
  ): Promise<void> {
    await tx`
      UPDATE bills SET currency = ${currency}, exchange_rate = ${bookingRate}::numeric
       WHERE id = ${APPROVED}::uuid
    `
  }
  const asGbpBill = (tx: Tx) => asForeignBill(tx, "GBP", "1.27")

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

  it("recognizes a loss when the settlement-date rate is higher than the booking rate", async () => {
    // Paying more USD than the payable was booked at (currency strengthened)
    // is a loss — the opposite interpretation from a receivable's gain for
    // the same relationship (settlementFxDelta, payables.repo.ts).
    const { lines, allocation, unbalanced } = await inRollback(async (tx) => {
      await asGbpBill(tx)
      const { paymentNumber } = await pay.recordVendorPayment(
        tx,
        NORTHWIND,
        FOREIGN_PAYMENT,
        ACTOR,
      )
      const lines = await journalLines(tx, paymentNumber)
      const [allocation] = await tx<{ fx_gain_loss: string }[]>`
        SELECT fx_gain_loss::text FROM payment_allocations
         WHERE bill_id = ${APPROVED}::uuid AND amount = 1000.00
      `
      return { lines, allocation, unbalanced: await unbalancedEntries(tx) }
    })
    // 1000 * 1.28 (settlement) = 1280.00 cash; 1000 * 1.27 (booking) =
    // 1270.00 clears the payable; the 10.00 shortfall is the loss.
    expect(lines).toEqual([
      { account_code: "2000", debit: "1270.00", credit: "0.00" },
      { account_code: "1000", debit: "0.00", credit: "1280.00" },
      { account_code: "4200", debit: "10.00", credit: "0.00" },
    ])
    expect(unbalanced).toEqual([])
    expect(allocation.fx_gain_loss).toBe("-10.00")
  })

  it("recognizes a gain when the settlement-date rate is lower than the booking rate", async () => {
    // AUD, not GBP: the inserted rate is committed on a separate connection
    // (app_user has no write policy on exchange_rates at all), outside the
    // rolled-back `tx`, so it is visible to any other test's currently-open
    // transaction until the `finally` below removes it — a currency nothing
    // else in either write-path test file touches keeps that window from
    // corrupting a concurrently-running test that reads GBP's own latest
    // rate (the "loss" test above relies on the fixture's actual history).
    await superuser`
      INSERT INTO exchange_rates (from_currency, to_currency, rate_date, rate, inverse_rate, source)
      VALUES ('AUD', 'USD', '2026-03-13', 0.65, 1 / 0.65, 'manual')
    `
    try {
      const { lines, allocation, unbalanced } = await inRollback(async (tx) => {
        await asForeignBill(tx, "AUD", "0.68")
        const { paymentNumber } = await pay.recordVendorPayment(
          tx,
          NORTHWIND,
          { ...FOREIGN_PAYMENT, reference: "WIRE-AUD-02" },
          ACTOR,
        )
        const lines = await journalLines(tx, paymentNumber)
        const [allocation] = await tx<{ fx_gain_loss: string }[]>`
            SELECT fx_gain_loss::text FROM payment_allocations
             WHERE bill_id = ${APPROVED}::uuid AND amount = 1000.00
          `
        return { lines, allocation, unbalanced: await unbalancedEntries(tx) }
      })
      // 1000 * 0.65 (settlement) = 650.00 cash — 30.00 less than the 680.00
      // the payable was booked at (1000 * 0.68), a gain to the payer.
      expect(lines).toEqual([
        { account_code: "2000", debit: "680.00", credit: "0.00" },
        { account_code: "1000", debit: "0.00", credit: "650.00" },
        { account_code: "4200", debit: "0.00", credit: "30.00" },
      ])
      expect(unbalanced).toEqual([])
      expect(allocation.fx_gain_loss).toBe("30.00")
    } finally {
      await superuser`
        DELETE FROM exchange_rates
         WHERE from_currency = 'AUD' AND rate_date = '2026-03-13'
      `
    }
  })

  it("falls back to the booking rate — no FX line — when the tenant has no FX gain/loss account", async () => {
    const { lines, allocation, unbalanced } = await inRollback(async (tx) => {
      await asGbpBill(tx)
      await tx`
        UPDATE chart_of_accounts SET account_code = '4200-TEST-HIDDEN'
         WHERE tenant_id = ${NORTHWIND}::uuid AND account_code = '4200'
      `
      const { paymentNumber } = await pay.recordVendorPayment(
        tx,
        NORTHWIND,
        { ...FOREIGN_PAYMENT, reference: "WIRE-GBP-03" },
        ACTOR,
      )
      const lines = await journalLines(tx, paymentNumber)
      const [allocation] = await tx<{ fx_gain_loss: string }[]>`
        SELECT fx_gain_loss::text FROM payment_allocations
         WHERE bill_id = ${APPROVED}::uuid AND amount = 1000.00
      `
      return { lines, allocation, unbalanced: await unbalancedEntries(tx) }
    })
    expect(lines).toEqual([
      { account_code: "2000", debit: "1000.00", credit: "0.00" },
      { account_code: "1000", debit: "0.00", credit: "1000.00" },
    ])
    expect(unbalanced).toEqual([])
    expect(allocation.fx_gain_loss).toBe("0.00")
  })
})

describe("the header is a cache of the lines", () => {
  it("REPAIRS a bill whose stored total had drifted", async () => {
    // Recomputed, not adjusted — a wrong header self-heals on next write.
    const { drifted, repaired } = await inRollback(async (tx) => {
      await tx`
        UPDATE bills
           SET subtotal = 1, tax_total = 1, total = 2, amount_due = 2,
               base_subtotal = 1, base_tax_total = 1, base_total = 2,
               base_amount_due = 2
         WHERE id = ${APPROVED}::uuid
      `
      const [drifted] = await tx<{ total: string }[]>`
        SELECT total::text AS total FROM bills WHERE id = ${APPROVED}::uuid
      `
      await pay.recomputeBillTotals(tx, APPROVED)
      const [repaired] = await tx<{ total: string }[]>`
        SELECT total::text AS total FROM bills WHERE id = ${APPROVED}::uuid
      `
      return { drifted, repaired }
    })
    expect(drifted.total).toBe("2.00")
    // The bill's one line: 1820.00 plus 161.53 recoverable tax.
    expect(repaired.total).toBe("1981.53")
  })

  it("keeps money as strings throughout", async () => {
    const row = await inRollback(async (tx) => {
      await pay.recomputeBillTotals(tx, DRAFT_OPEN)
      const [r] = await tx<{ total: string; base_total: string }[]>`
        SELECT total::text AS total, base_total::text AS base_total
          FROM bills WHERE id = ${DRAFT_OPEN}::uuid
      `
      return r
    })
    expect(typeof row.total).toBe("string")
    expect(row.total).toBe("3634.00")
  })
})

describe("matching a bank transaction to a payment", () => {
  it("matches a credit to a customer payment", async () => {
    const row = await inRollback(async (tx) => {
      await pay.matchBankTransaction(tx, CREDIT_TXN, CUSTOMER_PAYMENT)
      const [r] = await tx<
        { status: string; matched_to_type: string; matched_to_id: string }[]
      >`
        SELECT status, matched_to_type, matched_to_id::text AS matched_to_id
          FROM bank_transactions WHERE id = ${CREDIT_TXN}::uuid
      `
      return r
    })
    expect(row.status).toBe("matched")
    expect(row.matched_to_type).toBe("payment")
    expect(row.matched_to_id).toBe(CUSTOMER_PAYMENT)
  })

  it("matches a debit to a vendor payment", async () => {
    const row = await inRollback(async (tx) => {
      await pay.matchBankTransaction(tx, DEBIT_TXN, VENDOR_PAYMENT)
      const [r] = await tx<{ status: string }[]>`
        SELECT status FROM bank_transactions WHERE id = ${DEBIT_TXN}::uuid
      `
      return r
    })
    expect(row.status).toBe("matched")
  })

  it("refuses a transaction that is not unmatched", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.matchBankTransaction(tx, RECONCILED_TXN, CUSTOMER_PAYMENT),
        ),
      "wrong_status",
    )
  })

  it("refuses a payment in a different currency", async () => {
    // GBP credit against a USD customer payment — same direction, wrong currency.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.matchBankTransaction(tx, GBP_TXN, CUSTOMER_PAYMENT),
        ),
      "currency_mismatch",
    )
  })

  it("refuses a credit matched to a vendor payment", async () => {
    // Money IN cannot be a payment the firm made OUT.
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.matchBankTransaction(tx, CREDIT_TXN, VENDOR_PAYMENT),
        ),
      "direction_mismatch",
    )
  })

  it("refuses a payment already claimed by another transaction", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.matchBankTransaction(tx, CREDIT_TXN, ALREADY_MATCHED_PAYMENT),
        ),
      "already_matched",
    )
  })

  it("refuses a transaction that does not exist", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.matchBankTransaction(
            tx,
            "00000000-0000-0000-0000-000000000000",
            CUSTOMER_PAYMENT,
          ),
        ),
      "no_such_bank_transaction",
    )
  })

  it("refuses a payment that does not exist", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          pay.matchBankTransaction(
            tx,
            CREDIT_TXN,
            "00000000-0000-0000-0000-000000000000",
          ),
        ),
      "no_such_payment",
    )
  })
})

describe("candidate payments for the matching picker", () => {
  it("offers only same-currency, same-direction, still-unmatched payments", async () => {
    const candidates = await inRollback((tx) =>
      pay.candidatePaymentsForTransactions(tx, [CREDIT_TXN]),
    )
    const ids = (candidates[CREDIT_TXN] ?? []).map((c) => c.id)
    expect(ids).toContain(CUSTOMER_PAYMENT)
    expect(ids).not.toContain(VENDOR_PAYMENT) // wrong direction
    expect(ids).not.toContain(ALREADY_MATCHED_PAYMENT) // already spoken for
  })

  it("returns nothing for an empty set of transactions, without a query", async () => {
    const candidates = await inRollback((tx) =>
      pay.candidatePaymentsForTransactions(tx, []),
    )
    expect(candidates).toEqual({})
  })
})

describe("bank reconciliation rules (US-ACC-029)", () => {
  /** Operating Account USD — CREDIT_TXN and DEBIT_TXN both live here.
   *  GBP_TXN lives on a different account, for the "scoped to one account"
   *  test — TRAVEL_ACCOUNT (5200) is the module-level category account. */
  const USD_ACCOUNT = "6d55e7d0-f085-5951-9f28-2fcd1b75c6bc"
  /** Office & Facilities (5400) — a second, distinct category for the
   *  priority-order test. */
  const OFFICE_ACCOUNT = "9d558ace-8adc-52ed-811a-de519ad88a29"
  /** The rule the fixture seeds: matches "JetBrains", already fired once
   *  (against a transaction that is no longer 'unmatched'). */
  const JETBRAINS_RULE = "73d3f520-f923-54bd-aab7-9f75d145f087"

  const NEW_RULE = {
    bankAccountId: null,
    descriptionContains: null,
    descriptionRegex: null,
    amountEquals: null,
    amountTolerance: null,
    amountMin: null,
    amountMax: null,
    transactionType: null,
    priority: 0,
  } as const

  describe("createReconciliationRule", () => {
    it("creates a rule with valid inputs", async () => {
      const rules = await inRollback(async (tx) => {
        await pay.createReconciliationRule(
          tx,
          NORTHWIND,
          {
            ...NEW_RULE,
            ruleName: "Categorize AWS charges",
            descriptionContains: "AWS BATCH",
            categoryAccountId: TRAVEL_ACCOUNT,
            priority: 5,
          },
          ACTOR,
        )
        return pay.listReconciliationRules(tx)
      })
      const created = rules.find(
        (r) => r.rule_name === "Categorize AWS charges",
      )
      expect(created).toMatchObject({
        is_active: true,
        description_contains: "AWS BATCH",
        category_account_code: "5200",
        priority: 5,
        times_applied: 0,
      })
    })

    it("refuses a rule with no matching criteria", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            pay.createReconciliationRule(
              tx,
              NORTHWIND,
              {
                ...NEW_RULE,
                ruleName: "Matches everything",
                categoryAccountId: TRAVEL_ACCOUNT,
              },
              ACTOR,
            ),
          ),
        "no_criteria",
      )
    })

    it("refuses an unknown category account", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            pay.createReconciliationRule(
              tx,
              NORTHWIND,
              {
                ...NEW_RULE,
                ruleName: "Bad category",
                descriptionContains: "X",
                categoryAccountId: "00000000-0000-0000-0000-000000000000",
              },
              ACTOR,
            ),
          ),
        "no_such_account",
      )
    })

    it("refuses an unknown bank account", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            pay.createReconciliationRule(
              tx,
              NORTHWIND,
              {
                ...NEW_RULE,
                ruleName: "Bad account",
                descriptionContains: "X",
                bankAccountId: "00000000-0000-0000-0000-000000000000",
                categoryAccountId: TRAVEL_ACCOUNT,
              },
              ACTOR,
            ),
          ),
        "no_such_bank_account",
      )
    })

    it("refuses an invalid regex, without harming the transaction for what follows", async () => {
      const secondId = await inRollback(async (tx) => {
        let firstError: unknown
        try {
          await pay.createReconciliationRule(
            tx,
            NORTHWIND,
            {
              ...NEW_RULE,
              ruleName: "Bad regex",
              descriptionRegex: "[invalid(",
              categoryAccountId: TRAVEL_ACCOUNT,
            },
            ACTOR,
          )
        } catch (e) {
          firstError = e
        }
        expect(firstError).toBeInstanceOf(AccountingRefused)
        expect((firstError as AccountingRefused).reason).toBe("invalid_regex")

        // Same transaction as the refusal above — proves createReconciliationRule
        // never lets a bad regex reach Postgres as a raised error (which would
        // abort the whole transaction), only ever a checked boolean.
        const { id } = await pay.createReconciliationRule(
          tx,
          NORTHWIND,
          {
            ...NEW_RULE,
            ruleName: "Good regex",
            descriptionRegex: "^AWS.*WIRE$",
            categoryAccountId: TRAVEL_ACCOUNT,
          },
          ACTOR,
        )
        return id
      })
      expect(secondId).toBeTruthy()
    })
  })

  describe("toggleReconciliationRule", () => {
    it("flips is_active, recomputed from the current row", async () => {
      const { first, second } = await inRollback(async (tx) => {
        const first = await pay.toggleReconciliationRule(
          tx,
          JETBRAINS_RULE,
          ACTOR,
        )
        const second = await pay.toggleReconciliationRule(
          tx,
          JETBRAINS_RULE,
          ACTOR,
        )
        return { first, second }
      })
      expect(first).toEqual({ from: true, to: false })
      expect(second).toEqual({ from: false, to: true })
    })

    it("refuses a rule that does not exist", async () => {
      await refusedBecause(
        () =>
          inRollback((tx) =>
            pay.toggleReconciliationRule(
              tx,
              "00000000-0000-0000-0000-000000000000",
              ACTOR,
            ),
          ),
        "no_such_rule",
      )
    })
  })

  describe("applyReconciliationRules", () => {
    it("categorizes a matching unmatched transaction and recomputes times_applied", async () => {
      const { result, txn, rule } = await inRollback(async (tx) => {
        const { id: ruleId } = await pay.createReconciliationRule(
          tx,
          NORTHWIND,
          {
            ...NEW_RULE,
            ruleName: "Categorize AWS charges",
            descriptionContains: "AWS BATCH",
            categoryAccountId: TRAVEL_ACCOUNT,
            priority: 5,
          },
          ACTOR,
        )
        const result = await pay.applyReconciliationRules(tx, NORTHWIND, null)
        const [txn] = await tx<
          {
            status: string
            category_account_id: string
            matching_rule_id: string
            match_confidence: string
          }[]
        >`
          SELECT status, category_account_id::text AS category_account_id,
                 matching_rule_id::text AS matching_rule_id,
                 match_confidence::text AS match_confidence
            FROM bank_transactions WHERE id = ${DEBIT_TXN}::uuid
        `
        const [rule] = await tx<
          { times_applied: number; last_applied_at: string | null }[]
        >`
          SELECT times_applied, last_applied_at
            FROM bank_reconciliation_rules WHERE id = ${ruleId}::uuid
        `
        return { result, txn, rule }
      })
      expect(result.categorized).toBe(1)
      expect(result.byRule).toEqual([
        {
          ruleId: expect.any(String),
          ruleName: "Categorize AWS charges",
          count: 1,
        },
      ])
      expect(txn).toMatchObject({
        status: "categorized",
        category_account_id: TRAVEL_ACCOUNT,
        match_confidence: "1.00",
      })
      expect(txn.matching_rule_id).toBe(result.byRule[0].ruleId)
      expect(rule.times_applied).toBe(1)
      expect(rule.last_applied_at).not.toBeNull()
    })

    it("leaves a transaction that is no longer unmatched untouched", async () => {
      // The seeded JetBrains rule already fired once, against a transaction
      // that is now 'categorized' — re-running finds nothing left to do.
      const result = await inRollback((tx) =>
        pay.applyReconciliationRules(tx, NORTHWIND, null),
      )
      expect(result.categorized).toBe(0)
      expect(result.byRule).toEqual([])
    })

    it("picks the higher-priority rule when two rules both match", async () => {
      const txn = await inRollback(async (tx) => {
        // Both match CREDIT_TXN ("ACME REMITTANCE"); OFFICE wins on priority.
        await pay.createReconciliationRule(
          tx,
          NORTHWIND,
          {
            ...NEW_RULE,
            ruleName: "Low priority — ACME",
            descriptionContains: "ACME",
            categoryAccountId: TRAVEL_ACCOUNT,
            priority: 1,
          },
          ACTOR,
        )
        const { id: winnerId } = await pay.createReconciliationRule(
          tx,
          NORTHWIND,
          {
            ...NEW_RULE,
            ruleName: "High priority — REMITTANCE",
            descriptionContains: "REMITTANCE",
            categoryAccountId: OFFICE_ACCOUNT,
            priority: 10,
          },
          ACTOR,
        )
        await pay.applyReconciliationRules(tx, NORTHWIND, null)
        const [txn] = await tx<
          { category_account_id: string; matching_rule_id: string }[]
        >`
          SELECT category_account_id::text AS category_account_id,
                 matching_rule_id::text AS matching_rule_id
            FROM bank_transactions WHERE id = ${CREDIT_TXN}::uuid
        `
        return { ...txn, winnerId }
      })
      expect(txn.category_account_id).toBe(OFFICE_ACCOUNT)
      expect(txn.matching_rule_id).toBe(txn.winnerId)
    })

    it("scoped to one bank account leaves transactions on another untouched", async () => {
      const { usd, gbp } = await inRollback(async (tx) => {
        // Matches both CREDIT_TXN ("ACME REMITTANCE", USD_ACCOUNT) and
        // GBP_TXN ("Unidentified client remittance", GBP_ACCOUNT).
        await pay.createReconciliationRule(
          tx,
          NORTHWIND,
          {
            ...NEW_RULE,
            ruleName: "Any remittance",
            descriptionContains: "remittance",
            categoryAccountId: TRAVEL_ACCOUNT,
          },
          ACTOR,
        )
        const result = await pay.applyReconciliationRules(
          tx,
          NORTHWIND,
          USD_ACCOUNT,
        )
        const rows = await tx<{ id: string; status: string }[]>`
          SELECT id::text AS id, status FROM bank_transactions
           WHERE id = ANY(${[CREDIT_TXN, GBP_TXN]}::uuid[])
        `
        return {
          usd: rows.find((r) => r.id === CREDIT_TXN)!,
          gbp: rows.find((r) => r.id === GBP_TXN)!,
          categorized: result.categorized,
        }
      })
      expect(usd.status).toBe("categorized")
      expect(gbp.status).toBe("unmatched")
    })
  })
})

import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as pay from "./payables.repo"
import { AccountingRefused } from "./accounting.repo"

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

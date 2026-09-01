import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant } from "../db/tenant"
import * as acc from "./accounting.repo"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: "6d466aa9-e51a-5d52-9015-152600855932",
}

describe("the general ledger", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("every entry balances — debits equal credits", async () => {
    // The rule the whole of double-entry rests on. The schema forbids a line
    // that is neither debit nor credit and the harness asserts this too; this
    // is the third place, and the only one that runs against the database the
    // app is actually talking to.
    const bad = await withTenant(AS_OWNER, (tx) => acc.unbalanced(tx))
    expect(bad).toEqual([])
  })

  it("computes the balance on read rather than trusting a flag", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.ledger(tx))
    expect(rows.length).toBeGreaterThan(0)
    for (const e of rows) {
      expect(e.balances, `${e.entry_number} does not balance`).toBe(true)
      expect(Number(e.debits)).toBe(Number(e.credits))
      // An entry with no lines would "balance" at 0 = 0, which is not a
      // balanced entry, it is an empty one.
      expect(e.line_count, `${e.entry_number} has no lines`).toBeGreaterThan(1)
    }
  })

  it("returns amounts as strings", async () => {
    const [e] = await withTenant(AS_OWNER, (tx) => acc.ledger(tx))
    expect(typeof e.debits).toBe("string")
    expect(typeof e.credits).toBe("string")
  })

  it("filters by date without passing '' to a cast", async () => {
    // `'' = '' OR d >= ''::date` still evaluates the cast, and postgres.js
    // raises RangeError in the driver before the query is sent (L37). The
    // empty filter must therefore be NULL, and this proves both paths run.
    const [all, ranged] = await withTenant(AS_OWNER, async (tx) => [
      await acc.ledger(tx, {}),
      await acc.ledger(tx, { from: "2026-01-01", to: "2026-12-31" }),
    ])
    expect(all.length).toBeGreaterThan(0)
    expect(ranged.length).toBeGreaterThan(0)
    expect(ranged.length).toBeLessThanOrEqual(all.length)
  })

  it("lines carry an account, and each is one-sided", async () => {
    // A line is a debit or a credit, never both — the schema constraint
    // ck_journal_entry_lines_one_sided_positive. Asserted here because a
    // two-sided line would still sum correctly and be meaningless.
    const lines = await withTenant(AS_OWNER, async (tx) => {
      const [e] = await acc.ledger(tx)
      return acc.ledgerLines(tx, e.id)
    })
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) {
      const d = Number(l.debit_amount ?? 0)
      const c = Number(l.credit_amount ?? 0)
      expect(
        d === 0 || c === 0,
        "a line is a debit or a credit, not both",
      ).toBe(true)
      expect(d + c).toBeGreaterThan(0)
      expect(l.account_name).not.toBeNull()
    }
  })
})

describe("invoices", () => {
  it("stored subtotal equals the sum of its lines", async () => {
    // Denormalised totals drift. This computes the sum on read and compares,
    // the same treatment as payroll run headers and project task counts.
    const rows = await withTenant(AS_OWNER, (tx) => acc.listInvoices(tx))
    expect(rows.length).toBeGreaterThan(0)
    for (const i of rows) {
      expect(i.line_count, `${i.invoice_number} has no lines`).toBeGreaterThan(
        0,
      )
      expect(
        Number(i.line_subtotal),
        `${i.invoice_number}: stored subtotal ${i.subtotal} but lines sum to ${i.line_subtotal}`,
      ).toBeCloseTo(Number(i.subtotal), 2)
    }
  })

  it("total is subtotal plus tax, and due is total less paid", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.listInvoices(tx))
    for (const i of rows) {
      expect(Number(i.total)).toBeCloseTo(
        Number(i.subtotal) + Number(i.tax_total),
        2,
      )
      expect(Number(i.amount_due)).toBeCloseTo(
        Number(i.total) - Number(i.amount_paid),
        2,
      )
    }
  })

  it("carries more than one currency, so nothing may assume USD", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.listInvoices(tx))
    expect(new Set(rows.map((i) => i.currency)).size).toBeGreaterThan(1)
  })

  it("payments received never exceed the invoice total", async () => {
    // Over-allocation is how a customer ends up credited twice.
    const result = await withTenant(AS_OWNER, async (tx) => {
      const rows = await acc.listInvoices(tx)
      const out = []
      for (const i of rows) {
        const pays = await acc.paymentsFor(tx, i.id)
        const received = pays.reduce((a, p) => a + Number(p.amount ?? 0), 0)
        out.push({
          n: i.invoice_number,
          received,
          paid: Number(i.amount_paid),
          total: Number(i.total),
        })
      }
      return out
    })
    for (const r of result) {
      expect(
        r.received,
        `${r.n}: allocations exceed the total`,
      ).toBeLessThanOrEqual(r.total + 0.01)
      // And the stored amount_paid agrees with the allocations behind it.
      expect(r.received).toBeCloseTo(r.paid, 2)
    }
  })

  it("flags an overdue invoice, and does not flag a settled one", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.listInvoices(tx))
    // Both halves: a fixture where nothing is overdue never renders the badge.
    expect(rows.some((i) => i.is_overdue)).toBe(true)
    for (const i of rows) {
      if (Number(i.amount_due) === 0) {
        expect(i.is_overdue, `${i.invoice_number} is settled but flagged`).toBe(
          false,
        )
      }
    }
  })

  it("never calls a draft or a void invoice overdue", async () => {
    // A draft has not been sent to anyone and a void invoice is not owed, so
    // neither can be late. The list page flagged a draft with a past due date
    // as overdue until the rule said so — visible only by looking at it.
    const rows = await withTenant(AS_OWNER, (tx) => acc.listInvoices(tx))
    const unissued = rows.filter(
      (i) => i.status === "draft" || i.status === "void",
    )
    expect(
      unissued.length,
      "no draft in the fixture to test with",
    ).toBeGreaterThan(0)
    for (const i of unissued) {
      expect(
        i.is_overdue,
        `${i.invoice_number} is ${i.status} but flagged overdue`,
      ).toBe(false)
    }
  })

  it("filters to the overdue ones only", async () => {
    const [all, overdue] = await withTenant(AS_OWNER, async (tx) => [
      await acc.listInvoices(tx),
      await acc.listInvoices(tx, { overdueOnly: true }),
    ])
    expect(overdue.length).toBeGreaterThan(0)
    expect(overdue.length).toBeLessThan(all.length)
    expect(overdue.every((i) => i.is_overdue)).toBe(true)
  })
})

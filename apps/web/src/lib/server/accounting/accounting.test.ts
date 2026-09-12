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
/**
 * A different real employee than AS_OWNER, with no finance_admin (or any
 * other accounting-visible) functional role — the actor meant to be
 * refused. A distinct id, not AS_OWNER's with role overridden, so the
 * refusal is provably keyed on role rather than on which employee_id
 * happens to be in the claim.
 */
const AS_PLAIN_EMPLOYEE = {
  tenantId: NORTHWIND,
  role: "employee",
  functionalRoles: [] as string[],
  employeeId: "db1f1f2b-b140-5948-a34e-1c998ed98757",
}

describe("the general ledger", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("every entry balances — debits equal credits", async () => {
    // Asserted against the live database, not just schema/harness.
    const bad = await withTenant(AS_OWNER, (tx) => acc.unbalanced(tx))
    expect(bad).toEqual([])
  })

  it("computes the balance on read rather than trusting a flag", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.ledger(tx))
    expect(rows.length).toBeGreaterThan(0)
    for (const e of rows) {
      expect(e.balances, `${e.entry_number} does not balance`).toBe(true)
      expect(Number(e.debits)).toBe(Number(e.credits))
      // 0 = 0 is not a balanced entry, it's an empty one.
      expect(e.line_count, `${e.entry_number} has no lines`).toBeGreaterThan(1)
    }
  })

  it("returns amounts as strings", async () => {
    const [e] = await withTenant(AS_OWNER, (tx) => acc.ledger(tx))
    expect(typeof e.debits).toBe("string")
    expect(typeof e.credits).toBe("string")
  })

  it("filters by date without passing '' to a cast", async () => {
    // Empty filter must be NULL, not '' (L37) — proves both paths run.
    const [all, ranged] = await withTenant(AS_OWNER, async (tx) => [
      await acc.ledger(tx, {}),
      await acc.ledger(tx, { from: "2026-01-01", to: "2026-12-31" }),
    ])
    expect(all.length).toBeGreaterThan(0)
    expect(ranged.length).toBeGreaterThan(0)
    expect(ranged.length).toBeLessThanOrEqual(all.length)
  })

  it("lines carry an account, and each is one-sided", async () => {
    // A two-sided line would still sum correctly, so check both are exclusive.
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
      expect(r.received).toBeCloseTo(r.paid, 2)
    }
  })

  it("flags an overdue invoice, and does not flag a settled one", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.listInvoices(tx))
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

describe("the trial balance", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("total debits equal total credits, computed independently of the per-account grouping", async () => {
    const totals = await withTenant(AS_OWNER, (tx) =>
      acc.trialBalanceTotals(tx),
    )
    expect(totals.balances).toBe(true)
    expect(totals.debits).toBe(totals.credits)
  })

  it("run as of a prior date reflects only that date's cumulative activity, not later periods'", async () => {
    // JE-2026-0001/0002/0003 are dated 2026-01-21; everything else in the
    // fixture is dated later (0005 on the 25th, 0004/0006/0007/0008 in
    // February) — an as-of filter that actually works excludes all of it.
    const [asOfJan21, beforeAnyPosting, unfiltered] = await withTenant(
      AS_OWNER,
      async (tx) => [
        await acc.trialBalanceTotals(tx, { asOf: "2026-01-21" }),
        await acc.trialBalanceTotals(tx, { asOf: "2025-01-01" }),
        await acc.trialBalanceTotals(tx),
      ],
    )
    expect(asOfJan21.debits).toBe("181100.00")
    expect(asOfJan21.credits).toBe("181100.00")
    expect(Number(asOfJan21.debits)).toBeLessThan(Number(unfiltered.debits))
    expect(beforeAnyPosting.debits).toBe("0")
    expect(beforeAnyPosting.balances).toBe(true)
  })

  it("lists only accounts with posted activity, summed in base currency", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.trialBalance(tx))
    const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r]))
    // Revenue is credit-only in this fixture: one issued, fully-paid invoice.
    expect(byCode["4000"]).toMatchObject({
      account_name: "Consulting Revenue",
      debits: "0.00",
      credits: "42300.00",
    })
    // Accounts Payable saw one bill approved and one paid, one still owed.
    expect(byCode["2000"]).toMatchObject({
      debits: "3400.00",
      credits: "2881.53",
    })
    // Never posted to in this fixture — the HAVING filter should hide it,
    // not show a spurious 0.00/0.00 row for every one of the ~10 accounts.
    expect(byCode["5400"]).toBeUndefined()
  })

  it("the AR and AP control accounts do not tie to their subledgers today — two distinct, pre-existing fixture gaps, not a code bug", async () => {
    // Subledger side (AR): four of five fixture invoices carry a plausible
    // status (overdue/partial) but no journal_entry_id — they were
    // hand-authored, never actually run through issueInvoice, so they have
    // no GL counterpart. Only INV-2026-001 (paid, amount_due 0.00) was ever
    // issued, so the AR subledger total is 0.00.
    //
    // Ledger side (AR): JE-2026-0004 ("Partial payment allocated across
    // Acme invoices", 2026-02-07) is a $10,000 credit-only line with no
    // matching debit and no invoice pointing back to it — an orphaned
    // journal entry, which is the entire AR gl_balance.
    //
    // These are independent problems on opposite sides of the tie-out, and
    // this check is what tells them apart (per 19-accounting-test-plan.md
    // §1.5/§6, "the single highest-leverage reconciliation check... and it
    // does not exist"). It exists now, and it immediately found both.
    //
    // AP's $2,500 difference is entirely JE-side, the mirror image of AR's:
    // JE-2026-0006 ("AWS batch vendor payment", 2026-02-10) is a $2,500
    // debit with no bill's journal_entry_id pointing to it — the other two
    // JE pairs (0005 approving BILL-AWS-2026-01, 0007/0008 approving and
    // paying BILL-UX-2026-001) net to exactly the $1,981.53 subledger
    // total on their own.
    const rows = await withTenant(AS_OWNER, (tx) =>
      acc.controlAccountTieOut(tx),
    )
    expect(rows).toEqual([
      {
        account_code: "1100",
        label: "Accounts Receivable",
        gl_balance: "-10000.00",
        subledger_total: "0.00",
        difference: "-10000.00",
        ties_out: false,
      },
      {
        account_code: "2000",
        label: "Accounts Payable",
        gl_balance: "-518.47",
        subledger_total: "1981.53",
        difference: "-2500.00",
        ties_out: false,
      },
    ])
  })

  it("is visible to the finance function only — a plain employee sees nothing, not everything", async () => {
    // RLS on journal_entry_lines/chart_of_accounts/invoices/bills is already
    // asserted directly in db/row-visibility.test.ts; this proves these two
    // specific queries actually inherit it rather than reading around it
    // (e.g. through a join or subquery RLS doesn't reach) — a guard never
    // observed refusing is not evidence (CLAUDE.md, L48).
    const [refusedRows, refusedTieOut] = await withTenant(
      AS_PLAIN_EMPLOYEE,
      (tx) => Promise.all([acc.trialBalance(tx), acc.controlAccountTieOut(tx)]),
    )
    const [ownerRows, ownerTieOut] = await withTenant(AS_OWNER, (tx) =>
      Promise.all([acc.trialBalance(tx), acc.controlAccountTieOut(tx)]),
    )
    expect(refusedRows).toEqual([])
    expect(ownerRows.length).toBeGreaterThan(0)

    // journal_entry_lines is invisible to this actor, so both figures read
    // as 0 rather than the real balance — a blanked number, not an error.
    for (const row of refusedTieOut) {
      expect(row.gl_balance).toBe("0")
    }
    expect(ownerTieOut.some((r) => r.gl_balance !== "0")).toBe(true)

    const refusedTotals = await withTenant(AS_PLAIN_EMPLOYEE, (tx) =>
      acc.trialBalanceTotals(tx),
    )
    expect(refusedTotals.debits).toBe("0")
    expect(refusedTotals.credits).toBe("0")
  })
})

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

describe("the profit and loss statement", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("lists revenue and expense accounts only, each signed positive for its normal side", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.profitAndLoss(tx))
    const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r]))
    expect(byCode["4000"]).toMatchObject({
      account_type: "revenue",
      amount: "42300.00",
    })
    expect(byCode["5000"]).toMatchObject({
      account_type: "expense",
      amount: "96500.00",
    })
    expect(byCode["5100"]).toMatchObject({ amount: "900.00" })
    expect(byCode["5300"]).toMatchObject({ amount: "1820.00" })
    // No asset/liability/equity account leaks into a P&L.
    for (const r of rows) {
      expect(["revenue", "expense"]).toContain(r.account_type)
    }
    // Never posted to — the GROUP BY over an inner join should not
    // fabricate a spurious 0.00 row for an untouched expense account.
    expect(byCode["5200"]).toBeUndefined()
  })

  it("net income is revenue minus expenses, summed independently in SQL — not by reducing the per-account rows in JS", async () => {
    const totals = await withTenant(AS_OWNER, (tx) =>
      acc.profitAndLossTotals(tx),
    )
    expect(totals.revenue).toBe("42300.00")
    expect(totals.expenses).toBe("99220.00")
    expect(totals.net_income).toBe("-56920.00")
  })

  it("a period filter changes both sides independently, unlike the trial balance's cumulative asOf", async () => {
    const [asOfJan21, unfiltered] = await withTenant(AS_OWNER, async (tx) => [
      await acc.profitAndLossTotals(tx, { to: "2026-01-21" }),
      await acc.profitAndLossTotals(tx),
    ])
    expect(asOfJan21.revenue).toBe("42300.00")
    expect(asOfJan21.expenses).toBe("96500.00")
    expect(asOfJan21.net_income).toBe("-54200.00")
    expect(Number(asOfJan21.expenses)).toBeLessThan(Number(unfiltered.expenses))
  })

  it("a `from` filter excludes activity before it, proving the lower bound is enforced independently of `to`", async () => {
    // 5000 (Jan 21) and 5300 (Jan 25) both fall before Feb 1; only 5100's
    // Feb 12 contractor bill remains — a from-only filter, no to.
    const fromFeb1 = await withTenant(AS_OWNER, (tx) =>
      acc.profitAndLossTotals(tx, { from: "2026-02-01" }),
    )
    // No revenue row matches the filter at all, so COALESCE's integer
    // literal comes through unrounded — "0", not "0.00" (same shape as
    // trialBalanceTotals' beforeAnyPosting case above).
    expect(fromFeb1.revenue).toBe("0")
    expect(fromFeb1.expenses).toBe("900.00")
    expect(fromFeb1.net_income).toBe("-900.00")
  })

  it("is visible to the finance function only", async () => {
    const [refusedRows, refusedTotals] = await withTenant(
      AS_PLAIN_EMPLOYEE,
      (tx) => Promise.all([acc.profitAndLoss(tx), acc.profitAndLossTotals(tx)]),
    )
    expect(refusedRows).toEqual([])
    expect(refusedTotals).toEqual({
      revenue: "0",
      expenses: "0",
      net_income: "0",
    })

    const ownerRows = await withTenant(AS_OWNER, (tx) => acc.profitAndLoss(tx))
    expect(ownerRows.length).toBeGreaterThan(0)
  })
})

describe("the balance sheet", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("lists real asset/liability/equity accounts only, signed positive for their normal balance", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => acc.balanceSheet(tx))
    const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r]))
    expect(byCode["1000"]).toMatchObject({
      account_type: "asset",
      amount: "48900.00",
    })
    expect(byCode["1100"]).toMatchObject({
      account_type: "asset",
      amount: "-10000.00",
    })
    expect(byCode["2100"]).toMatchObject({
      account_type: "liability",
      amount: "96500.00",
    })
    // No revenue/expense account leaks into a balance sheet.
    for (const r of rows) {
      expect(["asset", "liability", "equity"]).toContain(r.account_type)
    }
    // Retained Earnings (3000) has never been posted to in this fixture —
    // no closing entry has ever run — so it's absent, not a spurious 0.00.
    expect(byCode["3000"]).toBeUndefined()
  })

  it("balances — assets equal liabilities plus equity plus the period's net income", async () => {
    // This codebase has no closing-entry process rolling P&L into retained
    // earnings, so `equity` alone is NOT what a balance sheet needs;
    // balanceSheetTotals() adds net_income back in as its own line, and
    // that's what actually has to tie to assets — proven against the real
    // fixture figures, not just the boolean the query itself asserts.
    const totals = await withTenant(AS_OWNER, (tx) =>
      acc.balanceSheetTotals(tx),
    )
    expect(totals.balances).toBe(true)
    expect(totals.assets).toBe("39061.53")
    expect(totals.liabilities).toBe("95981.53")
    expect(totals.equity).toBe("0")
    expect(totals.net_income).toBe("-56920.00")
    expect(totals.total_equity).toBe("-56920.00")
    expect(totals.total_liabilities_and_equity).toBe("39061.53")
    expect(
      Number(totals.liabilities) +
        Number(totals.equity) +
        Number(totals.net_income),
    ).toBeCloseTo(Number(totals.assets), 2)
  })

  it("as of a prior date reflects only that date's cumulative position, and still balances", async () => {
    const asOfJan21 = await withTenant(AS_OWNER, (tx) =>
      acc.balanceSheetTotals(tx, { asOf: "2026-01-21" }),
    )
    expect(asOfJan21.balances).toBe(true)
    expect(asOfJan21.assets).toBe("42300.00")
    expect(asOfJan21.liabilities).toBe("96500.00")
    expect(asOfJan21.net_income).toBe("-54200.00")
    expect(asOfJan21.total_liabilities_and_equity).toBe("42300.00")
  })

  it("is visible to the finance function only", async () => {
    const [refusedRows, refusedTotals] = await withTenant(
      AS_PLAIN_EMPLOYEE,
      (tx) => Promise.all([acc.balanceSheet(tx), acc.balanceSheetTotals(tx)]),
    )
    expect(refusedRows).toEqual([])
    expect(refusedTotals).toEqual({
      assets: "0",
      liabilities: "0",
      equity: "0",
      net_income: "0",
      total_equity: "0",
      total_liabilities_and_equity: "0",
      balances: true,
    })

    const ownerRows = await withTenant(AS_OWNER, (tx) => acc.balanceSheet(tx))
    expect(ownerRows.length).toBeGreaterThan(0)
  })
})

describe("the cash flow statement", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("reconciles — beginning cash plus net change equals the real Cash-account balance", async () => {
    const totals = await withTenant(AS_OWNER, (tx) => acc.cashFlowTotals(tx))
    expect(totals.reconciles).toBe(true)
    expect(totals.beginning_cash).toBe("0")
    expect(totals.ending_cash).toBe("48900.00")
    expect(totals.net_income).toBe("-56920.00")
    expect(totals.working_capital_change).toBe("105820.00")
    expect(totals.operating_cash_flow).toBe("48900.00")
    expect(totals.investing_cash_flow).toBe("0")
    expect(totals.financing_cash_flow).toBe("0")
    expect(totals.computed_ending_cash).toBe(totals.ending_cash)
  })

  it("a period's beginning cash is the prior balance, not zero — proving `from` is a real lower bound, not just a report label", async () => {
    // Feb 1 onward: beginning cash is what Jan 21's activity already left in
    // the bank (42300.00), not 0 — the same distinction the balance sheet's
    // as-of and the P&L's period filters draw, applied here to a running
    // balance rather than a point-in-time or period-summed figure.
    const feb = await withTenant(AS_OWNER, (tx) =>
      acc.cashFlowTotals(tx, { from: "2026-02-01" }),
    )
    expect(feb.reconciles).toBe(true)
    expect(feb.beginning_cash).toBe("42300.00")
    expect(feb.ending_cash).toBe("48900.00")
    expect(feb.net_income).toBe("-900.00")
    expect(feb.working_capital_change).toBe("7500.00")
    expect(feb.operating_cash_flow).toBe("6600.00")
    expect(feb.computed_ending_cash).toBe("48900.00")
  })

  it("lists the working-capital accounts driving the period's operating adjustment, signed as cash impact", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      acc.cashFlowStatement(tx, { from: "2026-02-01" }),
    )
    const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r]))
    // AR fell (a receipt), which is a SOURCE of cash — positive, even
    // though the account itself is an asset whose balance went down.
    expect(byCode["1100"]).toMatchObject({
      account_type: "asset",
      amount: "10000.00",
    })
    // AP fell (a payment), which is a USE of cash — negative, on a
    // liability account whose balance also went down.
    expect(byCode["2000"]).toMatchObject({
      account_type: "liability",
      amount: "-2500.00",
    })
    // Cash itself, and any account with no change in the period, are absent.
    expect(byCode["1000"]).toBeUndefined()
    expect(byCode["1200"]).toBeUndefined()
  })

  it("is visible to the finance function only", async () => {
    const [refusedRows, refusedTotals] = await withTenant(
      AS_PLAIN_EMPLOYEE,
      (tx) => Promise.all([acc.cashFlowStatement(tx), acc.cashFlowTotals(tx)]),
    )
    expect(refusedRows).toEqual([])
    expect(refusedTotals).toEqual({
      beginning_cash: "0",
      ending_cash: "0",
      net_income: "0",
      working_capital_change: "0",
      operating_cash_flow: "0",
      investing_cash_flow: "0",
      financing_cash_flow: "0",
      net_change_in_cash: "0",
      computed_ending_cash: "0",
      reconciles: true,
    })

    const ownerRows = await withTenant(AS_OWNER, (tx) =>
      acc.cashFlowStatement(tx),
    )
    expect(ownerRows.length).toBeGreaterThan(0)
  })
})

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

describe("AR aging", () => {
  afterAll(async () => {
    await closeConnections()
  })

  // Every open invoice in the fixture shares due_date = 2026-02-20, so
  // varying `asOf` walks the same balances through each bucket in turn —
  // including every boundary an off-by-one would get wrong.
  it("buckets by days past due, walking the same balances through each bucket as `asOf` moves", async () => {
    const asOfDates = {
      current: "2026-02-20", // 0 days
      at28: "2026-03-20", // 28 days
      at30: "2026-03-22", // 30 days — still 1-30
      at31: "2026-03-23", // 31 days — now 31-60
      at33: "2026-03-25", // 33 days
      at60: "2026-04-21", // 60 days — still 31-60
      at61: "2026-04-22", // 61 days — now 61-90
      at90: "2026-05-21", // 90 days — still 61-90
      at91: "2026-05-22", // 91 days — now 90+
    }
    const results = await withTenant(AS_OWNER, async (tx) => {
      const out: Record<string, acc.ArAgingRow[]> = {}
      for (const [key, asOf] of Object.entries(asOfDates)) {
        out[key] = await acc.arAging(tx, { asOf })
      }
      return out
    })

    const acme = (rows: acc.ArAgingRow[]) =>
      rows.find((r) => r.customer_name === "Acme Manufacturing")
    const britannia = (rows: acc.ArAgingRow[]) =>
      rows.find((r) => r.customer_name === "Britannia Retail Group")

    expect(acme(results.current)?.current).toBe("34883.72")
    expect(acme(results.current)?.days_1_30).toBe("0.00")
    expect(britannia(results.current)?.current).toBe("18860.00")
    expect(britannia(results.current)?.currency).toBe("GBP")

    expect(acme(results.at28)?.days_1_30).toBe("34883.72")
    expect(acme(results.at28)?.current).toBe("0.00")

    expect(acme(results.at30)?.days_1_30).toBe("34883.72")
    expect(acme(results.at30)?.days_31_60).toBe("0.00")

    expect(acme(results.at31)?.days_31_60).toBe("34883.72")
    expect(acme(results.at31)?.days_1_30).toBe("0.00")

    expect(acme(results.at33)?.days_31_60).toBe("34883.72")

    expect(acme(results.at60)?.days_31_60).toBe("34883.72")
    expect(acme(results.at60)?.days_61_90).toBe("0.00")

    expect(acme(results.at61)?.days_61_90).toBe("34883.72")
    expect(acme(results.at61)?.days_31_60).toBe("0.00")

    expect(acme(results.at90)?.days_61_90).toBe("34883.72")
    expect(acme(results.at90)?.days_90_plus).toBe("0.00")

    expect(acme(results.at91)?.days_90_plus).toBe("34883.72")
    expect(acme(results.at91)?.days_61_90).toBe("0.00")

    // The five buckets must partition the total — this is what a gap
    // between two adjacent bucket predicates would fail, which a single
    // boundary shift doesn't catch.
    for (const rows of Object.values(results)) {
      for (const r of rows) {
        const bucketSum =
          Number(r.current) +
          Number(r.days_1_30) +
          Number(r.days_31_60) +
          Number(r.days_61_90) +
          Number(r.days_90_plus)
        expect(bucketSum).toBeCloseTo(Number(r.total), 2)
      }
    }
  })

  it("excludes a draft invoice, and reads the invoice's own currency, not base currency", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      acc.arAging(tx, { asOf: "2026-02-20" }),
    )
    expect(rows.some((r) => r.customer_name === "Helios Energy")).toBe(false)

    const britannia = rows.find(
      (r) => r.customer_name === "Britannia Retail Group",
    )
    // INV-2026-002 is GBP 18860.00 / base (USD) 23852.20 — this must read
    // the invoice's own currency figure, not the converted one.
    expect(britannia?.total).toBe("18860.00")
    expect(britannia?.currency).toBe("GBP")
  })

  it("is visible to the finance function only", async () => {
    const refused = await withTenant(AS_PLAIN_EMPLOYEE, (tx) =>
      acc.arAging(tx, { asOf: "2026-02-20" }),
    )
    expect(refused).toEqual([])

    const owner = await withTenant(AS_OWNER, (tx) =>
      acc.arAging(tx, { asOf: "2026-02-20" }),
    )
    expect(owner.length).toBeGreaterThan(0)
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
    // JE-2026-0000 is dated 2026-01-01, JE-2026-0001/0002/0003 are dated
    // 2026-01-21, and everything else in the fixture is dated later (0005 on
    // the 25th, 0004/0006/0007/0008 in February) — an as-of filter that
    // actually works excludes all of the later ones.
    const [asOfJan21, beforeAnyPosting, unfiltered] = await withTenant(
      AS_OWNER,
      async (tx) => [
        await acc.trialBalanceTotals(tx, { asOf: "2026-01-21" }),
        await acc.trialBalanceTotals(tx, { asOf: "2025-01-01" }),
        await acc.trialBalanceTotals(tx),
      ],
    )
    expect(asOfJan21.debits).toBe("201100.00")
    expect(asOfJan21.credits).toBe("201100.00")
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

describe("profit and loss period comparison", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("`previous_period` is an equal-length window immediately before `from`, not a calendar month", async () => {
    // Feb 2026 is 28 days; the trailing 28-day window before Feb 1 lands on
    // Jan 4, not Jan 1 — an honest consequence of comparing by window length
    // rather than snapping to calendar boundaries the report doesn't assume.
    const c = await withTenant(AS_OWNER, (tx) =>
      acc.profitAndLossComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
    )
    expect(c.prior_from).toBe("2026-01-04")
    expect(c.prior_to).toBe("2026-01-31")
    expect(c.current_revenue).toBe("0")
    expect(c.current_expenses).toBe("900.00")
    expect(c.current_net_income).toBe("-900.00")
    expect(c.prior_revenue).toBe("42300.00")
    expect(c.prior_expenses).toBe("98320.00")
    expect(c.prior_net_income).toBe("-56020.00")
    expect(c.revenue_change).toBe("-42300.00")
    expect(c.expenses_change).toBe("-97420.00")
    expect(c.net_income_change).toBe("55120.00")
  })

  it("`previous_year` shifts both dates back exactly a year, handled by Postgres date arithmetic", async () => {
    const c = await withTenant(AS_OWNER, (tx) =>
      acc.profitAndLossComparison(tx, {
        from: "2026-01-21",
        to: "2026-01-21",
        compareTo: "previous_year",
      }),
    )
    expect(c.prior_from).toBe("2025-01-21")
    expect(c.prior_to).toBe("2025-01-21")
    expect(c.current_revenue).toBe("42300.00")
    expect(c.current_expenses).toBe("96500.00")
    // The fixture has no 2025 activity at all — the comparison year is a
    // real zero, not an artifact of the query excluding it.
    expect(c.prior_revenue).toBe("0")
    expect(c.prior_expenses).toBe("0")
    expect(c.prior_net_income).toBe("0")
  })

  it("is visible to the finance function only", async () => {
    const refused = await withTenant(AS_PLAIN_EMPLOYEE, (tx) =>
      acc.profitAndLossComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
    )
    expect(refused.current_revenue).toBe("0")
    expect(refused.current_expenses).toBe("0")
    expect(refused.prior_revenue).toBe("0")
    expect(refused.prior_expenses).toBe("0")

    const owner = await withTenant(AS_OWNER, (tx) =>
      acc.profitAndLossComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
    )
    expect(owner.prior_revenue).not.toBe("0")
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
      amount: "68900.00",
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
    expect(byCode["3000"]).toMatchObject({
      account_type: "equity",
      amount: "20000.00",
    })
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
    expect(totals.assets).toBe("59061.53")
    expect(totals.liabilities).toBe("95981.53")
    expect(totals.equity).toBe("20000.00")
    expect(totals.net_income).toBe("-56920.00")
    expect(totals.total_equity).toBe("-36920.00")
    expect(totals.total_liabilities_and_equity).toBe("59061.53")
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
    expect(asOfJan21.assets).toBe("62300.00")
    expect(asOfJan21.liabilities).toBe("96500.00")
    expect(asOfJan21.net_income).toBe("-54200.00")
    expect(asOfJan21.total_liabilities_and_equity).toBe("62300.00")
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
    expect(totals.ending_cash).toBe("68900.00")
    expect(totals.net_income).toBe("-56920.00")
    expect(totals.working_capital_change).toBe("105820.00")
    expect(totals.operating_cash_flow).toBe("48900.00")
    expect(totals.investing_cash_flow).toBe("0")
    // The opening-balance entry crediting Retained Earnings (accounting.test.ts
    // "the statement of changes in equity") is the fixture's only equity-side
    // posting, so it's also the first time this term has ever been non-zero.
    expect(totals.financing_cash_flow).toBe("20000.00")
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
    expect(feb.beginning_cash).toBe("62300.00")
    expect(feb.ending_cash).toBe("68900.00")
    expect(feb.net_income).toBe("-900.00")
    expect(feb.working_capital_change).toBe("7500.00")
    expect(feb.operating_cash_flow).toBe("6600.00")
    expect(feb.computed_ending_cash).toBe("68900.00")
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

  it("lists an equity-account posting as a financing-activity row, not folded into operating", async () => {
    // Unfiltered, so the fixture's opening-balance entry crediting Retained
    // Earnings (see "the statement of changes in equity") is in scope — the
    // Feb-only period above excludes it, so this is the only case that
    // exercises the Financing Activities section with a real row at all.
    const rows = await withTenant(AS_OWNER, (tx) => acc.cashFlowStatement(tx))
    const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r]))
    expect(byCode["3000"]).toMatchObject({
      account_type: "equity",
      amount: "20000.00",
    })
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

describe("cash flow period comparison", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("`previous_period` figures match cashFlowTotals() run independently over the same two windows", async () => {
    const [c, feb, jan] = await withTenant(AS_OWNER, async (tx) => [
      await acc.cashFlowComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
      await acc.cashFlowTotals(tx, { from: "2026-02-01", to: "2026-02-28" }),
      await acc.cashFlowTotals(tx, { from: "2026-01-04", to: "2026-01-31" }),
    ])
    expect(c.prior_from).toBe("2026-01-04")
    expect(c.prior_to).toBe("2026-01-31")
    expect(c.current_operating_cash_flow).toBe(feb.operating_cash_flow)
    expect(c.current_financing_cash_flow).toBe(feb.financing_cash_flow)
    expect(c.prior_operating_cash_flow).toBe(jan.operating_cash_flow)
    expect(c.prior_financing_cash_flow).toBe(jan.financing_cash_flow)
    expect(c.current_operating_cash_flow).toBe("6600.00")
    expect(c.prior_operating_cash_flow).toBe("42300.00")
    expect(c.operating_cash_flow_change).toBe("-35700.00")
    // Neither window touches the equity account (the fixture's only equity
    // posting is dated 2026-01-01, before both windows), so financing stays
    // genuinely zero on both sides rather than an artifact of the query.
    expect(c.current_financing_cash_flow).toBe("0.00")
    expect(c.prior_financing_cash_flow).toBe("0.00")
    expect(c.financing_cash_flow_change).toBe("0.00")
  })

  it("is visible to the finance function only", async () => {
    const refused = await withTenant(AS_PLAIN_EMPLOYEE, (tx) =>
      acc.cashFlowComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
    )
    expect(refused.current_operating_cash_flow).toBe("0")
    expect(refused.prior_operating_cash_flow).toBe("0")

    const owner = await withTenant(AS_OWNER, (tx) =>
      acc.cashFlowComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
    )
    expect(owner.prior_operating_cash_flow).not.toBe("0")
  })
})

describe("the statement of changes in equity", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("lists every active equity account, even with zero activity — the equity section is a fixed set of lines, not a large chart", async () => {
    // As of a date before the fixture's earliest posting, Retained Earnings
    // has no activity at all — and it still appears, at all zeros, because
    // every active equity account is listed by construction (a LEFT JOIN
    // against postings), not because this account happens to have data.
    const beforeAnyActivity = await withTenant(AS_OWNER, (tx) =>
      acc.equityStatement(tx, { to: "2025-12-31" }),
    )
    const byCodeBefore = Object.fromEntries(
      beforeAnyActivity.map((r) => [r.account_code, r]),
    )
    expect(byCodeBefore["3000"]).toMatchObject({
      account_name: "Retained Earnings",
      beginning_balance: "0",
      direct_changes: "0",
      ending_balance: "0",
    })

    const rows = await withTenant(AS_OWNER, (tx) => acc.equityStatement(tx))
    const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r]))
    expect(byCode["3000"]).toMatchObject({
      account_name: "Retained Earnings",
      beginning_balance: "0",
      direct_changes: "20000.00",
      ending_balance: "20000.00",
    })
  })

  it("net income is shown as its own line, never folded into an equity account's direct changes", async () => {
    const totals = await withTenant(AS_OWNER, (tx) =>
      acc.equityStatementTotals(tx),
    )
    expect(totals.beginning_equity).toBe("0")
    expect(totals.direct_changes).toBe("20000.00")
    expect(totals.net_income).toBe("-56920.00")
    expect(totals.ending_equity).toBe("20000.00")
    // The figure that actually matches balanceSheetTotals().total_equity
    // for the same `to` date — proven directly, not just asserted in prose.
    expect(totals.ending_equity_including_current_earnings).toBe("-36920.00")
    const bs = await withTenant(AS_OWNER, (tx) => acc.balanceSheetTotals(tx))
    expect(totals.ending_equity_including_current_earnings).toBe(
      bs.total_equity,
    )
  })

  it("is visible to the finance function only", async () => {
    // chart_of_accounts itself is RLS-restricted to the finance function
    // (row-visibility.test.ts), so a refused actor sees no accounts at all
    // here too — not merely accounts with no activity.
    const [refusedRows, refusedTotals] = await withTenant(
      AS_PLAIN_EMPLOYEE,
      (tx) =>
        Promise.all([acc.equityStatement(tx), acc.equityStatementTotals(tx)]),
    )
    expect(refusedRows).toEqual([])
    expect(refusedTotals).toEqual({
      beginning_equity: "0",
      direct_changes: "0",
      net_income: "0",
      ending_equity: "0",
      ending_equity_including_current_earnings: "0",
    })

    const ownerRows = await withTenant(AS_OWNER, (tx) =>
      acc.equityStatement(tx),
    )
    expect(ownerRows.length).toBeGreaterThan(0)
  })
})

describe("equity statement period comparison", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("`previous_period` figures match equityStatementTotals() run independently over the same two windows", async () => {
    const [c, feb, jan] = await withTenant(AS_OWNER, async (tx) => [
      await acc.equityComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
      await acc.equityStatementTotals(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
      }),
      await acc.equityStatementTotals(tx, {
        from: "2026-01-04",
        to: "2026-01-31",
      }),
    ])
    expect(c.prior_from).toBe("2026-01-04")
    expect(c.prior_to).toBe("2026-01-31")
    expect(c.current_direct_changes).toBe(feb.direct_changes)
    expect(c.current_net_income).toBe(feb.net_income)
    expect(c.prior_direct_changes).toBe(jan.direct_changes)
    expect(c.prior_net_income).toBe(jan.net_income)
    expect(c.current_net_income).toBe("-900.00")
    expect(c.prior_net_income).toBe("-56020.00")
    expect(c.net_income_change).toBe("55120.00")
    // The fixture's only equity posting is dated 2026-01-01, before both
    // windows, so direct_changes is genuinely zero on both sides.
    expect(c.current_direct_changes).toBe("0.00")
    expect(c.prior_direct_changes).toBe("0.00")
    expect(c.direct_changes_change).toBe("0.00")
  })

  it("is visible to the finance function only", async () => {
    const refused = await withTenant(AS_PLAIN_EMPLOYEE, (tx) =>
      acc.equityComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
    )
    expect(refused.current_net_income).toBe("0")
    expect(refused.prior_net_income).toBe("0")

    const owner = await withTenant(AS_OWNER, (tx) =>
      acc.equityComparison(tx, {
        from: "2026-02-01",
        to: "2026-02-28",
        compareTo: "previous_period",
      }),
    )
    expect(owner.prior_net_income).not.toBe("0")
  })
})

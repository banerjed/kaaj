import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant } from "../db/tenant"
import * as pay from "./payables.repo"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: "6d466aa9-e51a-5d52-9015-152600855932",
}

describe("bills", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("stored subtotal equals the sum of its lines", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => pay.listBills(tx))
    expect(rows.length).toBeGreaterThan(0)
    for (const b of rows) {
      expect(b.line_count, `${b.bill_number} has no lines`).toBeGreaterThan(0)
      expect(
        Number(b.line_subtotal),
        `${b.bill_number}: stored ${b.subtotal}, lines sum to ${b.line_subtotal}`,
      ).toBeCloseTo(Number(b.subtotal), 2)
    }
  })

  it("total is subtotal plus tax, and due is total less paid", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => pay.listBills(tx))
    for (const b of rows) {
      expect(Number(b.total)).toBeCloseTo(
        Number(b.subtotal) + Number(b.tax_total),
        2,
      )
      expect(Number(b.amount_due)).toBeCloseTo(
        Number(b.total) - Number(b.amount_paid),
        2,
      )
    }
  })

  it("has a bill carrying tax, so the tax path is exercised", async () => {
    // Three of the four bills have zero tax. Without the fourth, "total equals
    // subtotal plus tax" would pass on `x + 0 = x` every time.
    const rows = await withTenant(AS_OWNER, (tx) => pay.listBills(tx))
    expect(rows.some((b) => Number(b.tax_total) > 0)).toBe(true)
  })

  it("payments never exceed the bill, and agree with amount_paid", async () => {
    const result = await withTenant(AS_OWNER, async (tx) => {
      const rows = await pay.listBills(tx)
      const out = []
      for (const b of rows) {
        const ps = await pay.paymentsForBill(tx, b.id)
        out.push({
          n: b.bill_number,
          received: ps.reduce((a, p) => a + Number(p.amount ?? 0), 0),
          paid: Number(b.amount_paid),
          total: Number(b.total),
        })
      }
      return out
    })
    for (const r of result) {
      expect(r.received, `${r.n}: paid more than billed`).toBeLessThanOrEqual(
        r.total + 0.01,
      )
      expect(r.received).toBeCloseTo(r.paid, 2)
    }
  })

  it("never calls a draft or cancelled bill overdue", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => pay.listBills(tx))
    for (const b of rows) {
      if (["draft", "void", "cancelled"].includes(b.status ?? "")) {
        expect(
          b.is_overdue,
          `${b.bill_number} is ${b.status} but flagged`,
        ).toBe(false)
      }
    }
  })

  it("lines carry an expense account", async () => {
    // A bill line with no account cannot be posted to the ledger.
    const lines = await withTenant(AS_OWNER, async (tx) => {
      const [b] = await pay.listBills(tx)
      return pay.billLines(tx, b.id)
    })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.account_name !== null)).toBe(true)
  })
})

describe("bank accounts", () => {
  it("keeps the bank's balance and the feed's balance as separate facts", async () => {
    // They are different claims: one is what the bank reports, the other is
    // derived from what has been imported. Collapsing them into one number
    // would hide exactly the gap a reconciliation screen exists to show.
    const rows = await withTenant(AS_OWNER, (tx) => pay.bankAccounts(tx))
    expect(rows.length).toBeGreaterThan(0)

    const agreeing = rows.filter(
      (a) =>
        a.feed_balance !== null &&
        Number(a.feed_balance) === Number(a.current_balance),
    )
    const differing = rows.filter(
      (a) =>
        a.feed_balance !== null &&
        Number(a.feed_balance) !== Number(a.current_balance),
    )
    const noFeed = rows.filter((a) => a.feed_balance === null)

    // All three states, so every branch of the page is rendered by the fixture
    // rather than only the happy one.
    expect(agreeing.length, "no account agrees with its feed").toBeGreaterThan(
      0,
    )
    expect(
      differing.length,
      "no account differs from its feed",
    ).toBeGreaterThan(0)
    expect(
      noFeed.length,
      "no account without imported transactions",
    ).toBeGreaterThan(0)
  })

  it("an account with no transactions reports no feed balance, not zero", async () => {
    // Zero would read as "the account is empty", which is a different and much
    // more alarming claim than "nothing has been imported".
    const rows = await withTenant(AS_OWNER, (tx) => pay.bankAccounts(tx))
    for (const a of rows) {
      if (a.transaction_count === 0) expect(a.feed_balance).toBeNull()
    }
  })

  it("never returns an account number in any form", async () => {
    // account_number_ct, iban_ct, routing_number_ct and swift_code_ct are
    // ciphertext with no plaintext last-four beside them. The value stays out
    // of the returned type entirely (L39).
    const [a] = await withTenant(AS_OWNER, (tx) => pay.bankAccounts(tx))
    for (const k of Object.keys(a)) {
      expect(k).not.toMatch(/account_number|iban|routing|swift/)
    }
  })

  it("counts what still needs matching", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => pay.bankAccounts(tx))
    expect(rows.some((a) => a.unmatched_count > 0)).toBe(true)
  })
})

describe("bank transactions", () => {
  it("carries credits and debits, with debits negative", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => pay.bankTransactions(tx))
    expect(rows.length).toBeGreaterThan(0)
    const credits = rows.filter((t) => t.transaction_type === "credit")
    const debits = rows.filter((t) => t.transaction_type === "debit")
    expect(credits.length).toBeGreaterThan(0)
    expect(debits.length).toBeGreaterThan(0)
    expect(credits.every((t) => Number(t.amount) > 0)).toBe(true)
    expect(debits.every((t) => Number(t.amount) < 0)).toBe(true)
  })

  it("filters by account and by status, without passing '' to a cast", async () => {
    const result = await withTenant(AS_OWNER, async (tx) => {
      const [acct] = await pay.bankAccounts(tx)
      return {
        all: await pay.bankTransactions(tx),
        one: await pay.bankTransactions(tx, { accountId: acct.id }),
        unmatched: await pay.bankTransactions(tx, { status: "unmatched" }),
        name: acct.account_name,
      }
    })
    expect(result.all.length).toBeGreaterThan(result.one.length)
    expect(result.one.every((t) => t.account_name === result.name)).toBe(true)
    expect(result.unmatched.length).toBeGreaterThan(0)
    expect(result.unmatched.every((t) => t.status === "unmatched")).toBe(true)
  })

  it("shows every reconciliation state the screen has to render", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => pay.bankTransactions(tx))
    const states = new Set(rows.map((t) => t.status))
    expect(states.size).toBeGreaterThan(2)
  })
})

import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "./client"
import { withTenant, type Tx } from "./tenant"
import { pageOf, type Paged } from "./paged"
import * as acc from "../accounting/accounting.repo"
import * as pay from "../accounting/payables.repo"
import {
  fxRevaluation,
  fxRevaluationPage,
} from "../accounting/fx_revaluation.repo"

const AS_OWNER = {
  tenantId: "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1",
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: "6d466aa9-e51a-5d52-9015-152600855932",
}

/** Every page, in order, until the total is reached. */
async function allPages<T>(
  tx: Tx,
  size: number,
  read: (tx: Tx, n: number) => Promise<Paged<T>>,
): Promise<{ rows: T[]; totals: number[] }> {
  const rows: T[] = []
  const totals: number[] = []
  for (let n = 1; ; n++) {
    const page = await read(tx, n)
    totals.push(page.total)
    rows.push(...page.rows)
    expect(page.rows.length).toBeLessThanOrEqual(size)
    if (rows.length >= page.total || page.rows.length === 0) break
  }
  return { rows, totals }
}

/**
 * A paged report must be the unpaged one cut into pieces: same rows, same
 * order, nothing repeated or skipped at a page boundary, and a total that
 * counts every row — the page shows the total, and the export reads whole.
 */
describe("paged reports equal their unpaged selves", () => {
  afterAll(async () => {
    await closeConnections()
  })

  const cases: {
    name: string
    whole: (tx: Tx) => Promise<unknown[]>
    page: (tx: Tx, n: number) => Promise<Paged<unknown>>
  }[] = [
    {
      name: "AR aging",
      whole: (tx) => acc.arAging(tx, { asOf: "2026-02-20" }),
      page: (tx, n) =>
        acc.arAgingPage(tx, { asOf: "2026-02-20" }, pageOf(n, 1)),
    },
    {
      name: "customer balances",
      whole: (tx) => acc.customerBalances(tx),
      page: (tx, n) => acc.customerBalancesPage(tx, pageOf(n, 1)),
    },
    {
      name: "AP due soon",
      whole: (tx) => pay.apDueSoon(tx, { asOf: "2026-01-01", withinDays: 365 }),
      page: (tx, n) =>
        pay.apDueSoonPage(
          tx,
          { asOf: "2026-01-01", withinDays: 365 },
          pageOf(n, 1),
        ),
    },
    {
      name: "FX revaluation, receivables then payables",
      whole: (tx) => fxRevaluation(tx, "2026-03-15"),
      page: async (tx, n) => {
        const p = await fxRevaluationPage(tx, "2026-03-15", {
          receivables: pageOf(n, 1),
          payables: pageOf(n, 1),
        })
        return { rows: p.receivables.rows, total: p.receivables.total }
      },
    },
  ]

  for (const c of cases) {
    it(c.name, async () => {
      await withTenant(AS_OWNER, async (tx) => {
        let whole = await c.whole(tx)
        if (c.name.startsWith("FX")) {
          whole = (whole as { kind: string }[]).filter(
            (r) => r.kind === "receivable",
          )
        }
        // An empty report would pass this vacuously (L50).
        expect(whole.length).toBeGreaterThan(0)
        const { rows, totals } = await allPages(tx, 1, c.page)
        expect(rows).toEqual(whole)
        expect(new Set(totals)).toEqual(new Set([whole.length]))
      })
    })
  }

  it("FX payables page independently of receivables", async () => {
    // The fixture's bills are all USD, so nothing would be revalued; make the
    // open ones foreign inside a transaction that is rolled back.
    const rollback = new Error("__rollback__")
    const outcome = await withTenant(AS_OWNER, async (tx) => {
      await tx`
        UPDATE bills SET currency = 'GBP', exchange_rate = 1.27
         WHERE amount_due > 0 AND status NOT IN ('draft', 'void', 'cancelled')
      `
      const whole = (await fxRevaluation(tx, "2026-03-15")).filter(
        (r) => r.kind === "payable",
      )
      const { rows } = await allPages(tx, 1, async (tx, n) => {
        const p = await fxRevaluationPage(tx, "2026-03-15", {
          receivables: pageOf(1, 1),
          payables: pageOf(n, 1),
        })
        return p.payables
      })
      throw Object.assign(rollback, { whole, rows })
    }).catch((e) => {
      if (e !== rollback) throw e
      return e as unknown as { whole: unknown[]; rows: unknown[] }
    })
    expect(outcome.whole.length).toBeGreaterThan(0)
    expect(outcome.rows).toEqual(outcome.whole)
  })
})

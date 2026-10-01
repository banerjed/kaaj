import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as deals from "./deals.repo"

/**
 * The pipeline board's read path. `crm_deals` is SCALE_SENSITIVE, so the
 * board pages each COLUMN and takes its counts and totals from the database
 * rather than from the cards it happens to have loaded. Every case rolls back.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}

const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
const BRITANNIA = "ac7a04b4-a28e-5a15-9993-596db32c8d4e"
const YUKI = "fa4c9324-158b-55b7-acdd-7fe7917bc7cf"
const QUALIFIED = "11111111-c1a1-4000-8000-000000000002"
const NEW_INQUIRY = "11111111-c1a1-4000-8000-000000000001"

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

const seed =
  (stageId: string, n: number, over: Partial<deals.DealInput> = {}) =>
  async (tx: Tx) => {
    for (let i = 0; i < n; i++) {
      await deals.create(tx, NORTHWIND, {
        customer_id: ACME,
        customer_contact_id: null,
        stage_id: stageId,
        name: `Seeded deal ${stageId.slice(-1)}-${i}`,
        value_amount: "1000.00",
        currency: "USD",
        probability_percent: 50,
        expected_close_date: null,
        owner_id: YUKI,
        ...over,
      })
    }
  }

afterAll(async () => {
  await closeConnections()
})

describe("listForBoard", () => {
  it("caps each column independently, so a busy stage cannot starve the others", async () => {
    await inRollback(async (tx) => {
      await seed(QUALIFIED, 5)(tx)
      await seed(NEW_INQUIRY, 5)(tx)

      const rows = await deals.listForBoard(tx, { perStage: 2 })
      const inStage = (id: string) => rows.filter((r) => r.stage_id === id)

      // A single LIMIT over the whole board would have emptied one of these.
      expect(inStage(QUALIFIED)).toHaveLength(2)
      expect(inStage(NEW_INQUIRY)).toHaveLength(2)
    })
  })

  it("expands only the named column", async () => {
    await inRollback(async (tx) => {
      await seed(QUALIFIED, 5)(tx)
      await seed(NEW_INQUIRY, 5)(tx)

      const rows = await deals.listForBoard(tx, {
        perStage: 2,
        expandStageId: QUALIFIED,
        expandLimit: 4,
      })
      expect(rows.filter((r) => r.stage_id === QUALIFIED)).toHaveLength(4)
      expect(rows.filter((r) => r.stage_id === NEW_INQUIRY)).toHaveLength(2)
    })
  })

  it("takes the newest of a column, not an arbitrary slice", async () => {
    await inRollback(async (tx) => {
      await seed(NEW_INQUIRY, 3)(tx)
      const all = await deals.listForBoard(tx, { perStage: 50 })
      const newest = all.filter((r) => r.stage_id === NEW_INQUIRY)[0]

      const paged = await deals.listForBoard(tx, { perStage: 1 })
      expect(
        paged.filter((r) => r.stage_id === NEW_INQUIRY).map((r) => r.id),
      ).toEqual([newest.id])
    })
  })

  it("asks for no stage without passing '' to a cast (L37)", async () => {
    await inRollback(async (tx) => {
      await expect(
        deals.listForBoard(tx, { perStage: 20, expandStageId: null }),
      ).resolves.toBeInstanceOf(Array)
    })
  })
})

describe("stageSummary", () => {
  it("counts what the column HOLDS, not what the board loaded", async () => {
    await inRollback(async (tx) => {
      await seed(NEW_INQUIRY, 5)(tx)

      const loaded = (await deals.listForBoard(tx, { perStage: 2 })).filter(
        (r) => r.stage_id === NEW_INQUIRY,
      )
      const summary = (await deals.stageSummary(tx)).find(
        (s) => s.stage_id === NEW_INQUIRY,
      )

      expect(loaded).toHaveLength(2)
      // Counting the loaded cards would report the page size as the pipeline.
      expect(summary?.deal_count).toBe(5)
    })
  })

  /**
   * A figure adding USD to GBP is not a number anyone can act on, and money
   * is never converted for display (BR-FP-003). The sum is also done in SQL:
   * adding two money strings in JavaScript is concatenation or a float64.
   */
  it("keeps a column's currencies apart rather than adding them together", async () => {
    await inRollback(async (tx) => {
      await seed(NEW_INQUIRY, 2, { value_amount: "100.00", currency: "USD" })(
        tx,
      )
      await seed(NEW_INQUIRY, 1, {
        customer_id: BRITANNIA,
        value_amount: "50.00",
        currency: "GBP",
      })(tx)

      const summary = (await deals.stageSummary(tx)).find(
        (s) => s.stage_id === NEW_INQUIRY,
      )
      expect(summary?.totals).toEqual([
        { currency: "GBP", amount: "50.00" },
        { currency: "USD", amount: "200.00" },
      ])
    })
  })

  it("sums exactly, as a string — the board used to add money in JavaScript", async () => {
    await inRollback(async (tx) => {
      await seed(NEW_INQUIRY, 1, { value_amount: "0.10" })(tx)
      await seed(NEW_INQUIRY, 1, { value_amount: "0.20" })(tx)

      const summary = (await deals.stageSummary(tx)).find(
        (s) => s.stage_id === NEW_INQUIRY,
      )
      const usd = summary?.totals.find((t) => t.currency === "USD")

      expect(typeof usd?.amount).toBe("string")
      // `Number("0.10") + Number("0.20")` is 0.30000000000000004.
      expect(usd?.amount).toBe("0.30")
    })
  })

  it("omits a deal with no value from the totals but still counts it", async () => {
    await inRollback(async (tx) => {
      await seed(NEW_INQUIRY, 1, { value_amount: null, currency: null })(tx)
      const summary = (await deals.stageSummary(tx)).find(
        (s) => s.stage_id === NEW_INQUIRY,
      )
      expect(summary?.deal_count).toBe(1)
      expect(summary?.totals).toEqual([])
    })
  })
})

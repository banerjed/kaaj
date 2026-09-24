import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { closeConnections } from "$lib/server/db/client"
import { actions } from "./+page.server"

/**
 * The `refresh` action's 502 path (`+page.server.ts`'s own message-building,
 * not `refreshExchangeRates()`'s) is otherwise unexercised: `fx_rates.test.ts`
 * only asserts on `FxRefreshResult`, never on the action that turns a
 * total failure into a response. Real tenant connection, real DB — only
 * Yahoo is faked, matching `fx_rates.test.ts`'s own approach.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const LOCALS = {
  tenantId: NORTHWIND,
  tenantRole: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
  customerContactId: null,
  customerId: null,
  user: { id: "00000000-0000-0000-0000-000000000000" },
} as App.Locals

const REAL_FETCH = globalThis.fetch
const NO_PRICE_RESPONSE = {
  ok: true,
  status: 200,
  json: async () => ({ chart: { result: [] } }),
} as Response

function stubYahooAllFail() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (/finance\.yahoo\.com\/v8\/finance\/chart\//.test(url)) {
        return NO_PRICE_RESPONSE
      }
      return REAL_FETCH(url, init)
    }),
  )
}

describe("actions.refresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  afterAll(async () => {
    await closeConnections()
  })

  it("returns a 502 naming every currency and reason when all of them fail", async () => {
    stubYahooAllFail()

    const result = await actions.refresh({ locals: LOCALS } as never)

    expect(result).toMatchObject({ status: 502 })
    const message = (result as { data?: { message?: string } }).data?.message
    expect(message).toContain("CAD")
    expect(message).toContain("GBP")
    expect(message).toContain("EUR")
    expect(message).toContain("INR")
    expect(message).toContain("no usable price in Yahoo's response")
  })
})

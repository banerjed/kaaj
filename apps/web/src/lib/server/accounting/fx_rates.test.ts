import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import postgres from "postgres"
import { closeConnections } from "../db/client"
import { withTenant } from "../db/tenant"
import { refreshExchangeRates } from "./fx_rates"
import { listCurrentExchangeRates } from "./exchange_rates.repo"

/**
 * `refreshExchangeRates()` writes through the service role over PostgREST —
 * a different connection from `withTenant`'s app_user one, so there is no
 * transaction to roll back. Cleanup below deletes the specific rows this
 * file wrote, via a superuser connection (RLS carries no DELETE policy for
 * this table at all, matching "written by service role"; app_user's own
 * blanket DELETE grant can't reach it either). This escape hatch is
 * test-only — application code never gets this connection.
 */
const superuser = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { types: {} },
)

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
const TODAY = new Date().toISOString().slice(0, 10)
const TEST_CURRENCIES = ["CAD", "GBP", "EUR", "INR"]

/**
 * `supabaseServiceRole`'s own PostgREST calls go through the SAME global
 * `fetch` these tests stub to fake out Yahoo — captured before any stubbing
 * so a Yahoo-only mock can pass every other request straight through to it,
 * rather than every test also needing to fake a PostgREST response.
 */
const REAL_FETCH = globalThis.fetch

function yahooResponse(regularMarketPrice: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      chart: { result: [{ meta: { regularMarketPrice } }] },
    }),
  } as Response
}

const NO_PRICE_RESPONSE = {
  ok: true,
  status: 200,
  json: async () => ({ chart: { result: [] } }),
} as Response

/** Fakes only requests to Yahoo; anything else (the real PostgREST call) passes through. */
function stubYahoo(priceFor: (symbol: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const match = /finance\.yahoo\.com\/v8\/finance\/chart\/([^?]+)/.exec(url)
      if (match) return priceFor(match[1])
      return REAL_FETCH(url, init)
    }),
  )
}

async function cleanup() {
  await superuser`
    DELETE FROM exchange_rates
     WHERE source = 'yahoo' AND rate_date = ${TODAY}::date
       AND from_currency = ANY(${TEST_CURRENCIES})
  `
}

describe("refreshExchangeRates", () => {
  beforeEach(async () => {
    await cleanup()
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await cleanup()
  })
  afterAll(async () => {
    await superuser.end({ timeout: 5 })
    await closeConnections()
  })

  it("fetches, inverts, and upserts a currency -> USD rate for every configured currency", async () => {
    // 1 USD = 1.3905 CAD, so 1 CAD -> 0.719166 USD — the inversion, not the
    // raw Yahoo quote, is what recomputeInvoiceTotals's exchange_rate needs.
    stubYahoo((symbol) => {
      if (symbol === "CAD=X") return yahooResponse(1.3905)
      if (symbol === "GBP=X") return yahooResponse(0.7404)
      if (symbol === "EUR=X") return yahooResponse(0.865)
      if (symbol === "INR=X") return yahooResponse(95.54)
      throw new Error(`unexpected symbol ${symbol}`)
    })

    const result = await refreshExchangeRates()
    expect(result.failed).toEqual([])
    expect(result.refreshed.map((r) => r.currency).sort()).toEqual(
      TEST_CURRENCIES.slice().sort(),
    )
    expect(result.refreshed.find((r) => r.currency === "CAD")?.rate).toBe(
      "0.719166",
    )

    const rows = await withTenant(AS_OWNER, (tx) =>
      listCurrentExchangeRates(tx),
    )
    const cad = rows.find(
      (r) => r.from_currency === "CAD" && r.rate_date === TODAY,
    )
    expect(cad?.rate).toBe("0.719166")
    expect(cad?.inverse_rate).toBe("1.390500")
    expect(cad?.source).toBe("yahoo")
    expect(cad?.is_manual).toBe(false)
  })

  it("is idempotent within a day: a second refresh updates the same row, not a duplicate", async () => {
    stubYahoo(() => yahooResponse(1.3905))
    await refreshExchangeRates()

    stubYahoo(() => yahooResponse(1.4))
    await refreshExchangeRates()

    const count = await superuser<{ n: string }[]>`
      SELECT count(*)::text AS n FROM exchange_rates
       WHERE source = 'yahoo' AND rate_date = ${TODAY}::date AND from_currency = 'CAD'
    `
    expect(count[0].n).toBe("1")

    const rows = await withTenant(AS_OWNER, (tx) =>
      listCurrentExchangeRates(tx),
    )
    const cad = rows.find(
      (r) => r.from_currency === "CAD" && r.rate_date === TODAY,
    )
    // 1 / 1.4, the SECOND call's price — proves the row was overwritten, not
    // left at the first call's value.
    expect(cad?.rate).toBe("0.714286")
  })

  it("one currency's bad response doesn't fail the others", async () => {
    stubYahoo((symbol) =>
      symbol === "GBP=X" ? NO_PRICE_RESPONSE : yahooResponse(1.3905),
    )

    const result = await refreshExchangeRates()
    expect(result.failed).toEqual([
      { currency: "GBP", reason: "no usable price in Yahoo's response" },
    ])
    expect(result.refreshed.map((r) => r.currency).sort()).toEqual(
      ["CAD", "EUR", "INR"].sort(),
    )
  })
})

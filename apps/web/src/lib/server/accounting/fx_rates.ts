import { supabaseServiceRole } from "$lib/server/supabase_service_role"

/**
 * A fixed, small set — not every ISO currency, per the roadmap's own scope
 * (US-ACC-052/036). Each Yahoo symbol quotes USD per one unit of the
 * currency (confirmed against the live endpoint: `CAD=X` -> "USD/CAD").
 */
const YAHOO_SYMBOLS: Record<string, string> = {
  CAD: "CAD=X",
  GBP: "GBP=X",
  EUR: "EUR=X",
  INR: "INR=X",
}

export type FxRefreshResult = {
  refreshed: { currency: string; rate: string }[]
  failed: { currency: string; reason: string }[]
}

async function fetchUsdPerUnit(symbol: string): Promise<number> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  )
  if (!res.ok) throw new Error(`Yahoo responded ${res.status}`)
  const body = (await res.json()) as {
    chart?: { result?: { meta?: { regularMarketPrice?: unknown } }[] }
  }
  const price = body.chart?.result?.[0]?.meta?.regularMarketPrice
  if (typeof price !== "number" || !(price > 0)) {
    throw new Error("no usable price in Yahoo's response")
  }
  return price
}

/**
 * Pulls today's rate for each of `YAHOO_SYMBOLS` and upserts it into
 * `exchange_rates` — global reference data with no `tenant_id`, so this
 * writes once for every tenant rather than per tenant. Stored as
 * currency -> USD, matching the direction `invoices.exchange_rate` /
 * `bills.exchange_rate` already multiply by by (`recomputeInvoiceTotals`:
 * `base_subtotal = subtotal * exchange_rate`) — Yahoo's own quote is the
 * other way round (USD -> currency), so it's inverted here, not stored raw.
 * `rate_date` is today in the server's own clock: a calendar-day label for
 * "which day's fetch this is," not a value ever compared against a stored
 * timestamp for equality (unlike L43's concern), so ordinary clock drift
 * doesn't matter here.
 *
 * Idempotent per calendar day: `(from_currency, to_currency, rate_date,
 * source)` is a real unique index, and a second call the same day
 * overwrites rather than duplicating — confirmed against the running
 * database, not assumed (a bare unique index, not a named constraint,
 * still satisfies PostgREST's `on_conflict`).
 *
 * One currency's failure (Yahoo down, a bad response shape) does not fail
 * the others — each is fetched and written independently, and the caller
 * decides what a partial refresh means for the page.
 */
export async function refreshExchangeRates(): Promise<FxRefreshResult> {
  const today = new Date().toISOString().slice(0, 10)
  const result: FxRefreshResult = { refreshed: [], failed: [] }

  for (const [currency, symbol] of Object.entries(YAHOO_SYMBOLS)) {
    try {
      const usdPerUnit = await fetchUsdPerUnit(symbol)
      // Both values already originate as a JS float (Yahoo's own JSON), and
      // stay one through a single rounding step to the column's 6dp scale —
      // this is NOT the "NUMERIC came back from Postgres as a string, don't
      // reparse it" case CLAUDE.md's money rule warns about (a rate this
      // small is nowhere near float64's precision limit); the STRING forms
      // below exist only for display/audit, not to protect a value already
      // read from the database.
      const rate = Number((1 / usdPerUnit).toFixed(6)) // currency -> USD
      const inverseRate = Number(usdPerUnit.toFixed(6)) // USD -> currency
      const { error } = await supabaseServiceRole.from("exchange_rates").upsert(
        {
          from_currency: currency,
          to_currency: "USD",
          rate_date: today,
          rate,
          inverse_rate: inverseRate,
          source: "yahoo",
          is_manual: false,
        },
        { onConflict: "from_currency,to_currency,rate_date,source" },
      )
      if (error) throw new Error(error.message)
      result.refreshed.push({ currency, rate: rate.toFixed(6) })
    } catch (e) {
      result.failed.push({
        currency,
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return result
}

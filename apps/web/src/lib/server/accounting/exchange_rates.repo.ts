import type { Tx } from "../db/tenant"

export type ExchangeRateRow = {
  from_currency: string
  to_currency: string
  rate_date: string
  rate: string
  inverse_rate: string
  source: string
  is_manual: boolean
}

/**
 * `exchange_rates` carries no `tenant_id` — it is global reference data, and
 * its own RLS policy (`USING (true)`) already lets every signed-in session
 * read it, so this goes through the normal tenant-scoped connection like
 * any other read. Only writing it needs the service role (`fx_rates.ts`).
 * Returns the most recent rate per currency pair, not full history.
 */
export async function listCurrentExchangeRates(
  tx: Tx,
): Promise<ExchangeRateRow[]> {
  return tx<ExchangeRateRow[]>`
    SELECT DISTINCT ON (from_currency, to_currency)
           from_currency, to_currency,
           rate_date::text, rate::text, inverse_rate::text,
           source, is_manual
      FROM exchange_rates
     ORDER BY from_currency, to_currency, rate_date DESC
  `
}

/**
 * The `currency`→USD rate in effect on `asOfDate` — the latest rate dated on
 * or before it, since refresh is manual-trigger-only (US-ACC-052's own
 * remaining gap) and a rate for the exact day is not guaranteed to exist.
 * Returns `null` when no rate at or before that date is on file at all;
 * callers fall back to treating no rate as no gain/loss rather than
 * refusing a real settlement.
 */
export async function rateAsOf(
  tx: Tx,
  currency: string,
  asOfDate: string,
): Promise<string | null> {
  const [row] = await tx<{ rate: string }[]>`
    SELECT rate::text
      FROM exchange_rates
     WHERE from_currency = ${currency} AND to_currency = 'USD'
       AND rate_date <= ${asOfDate}::date
     ORDER BY rate_date DESC
     LIMIT 1
  `
  return row?.rate ?? null
}

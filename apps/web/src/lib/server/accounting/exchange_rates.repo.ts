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

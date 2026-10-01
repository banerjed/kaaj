import type { Tx } from "../db/tenant"
import { paged, type Page, type Paged } from "../db/paged"

/**
 * Unrealized FX gain/loss on open foreign-currency AR/AP as of a chosen date
 * (US-ACC-053) — report-only. Unlike settlement FX gain/loss
 * (`settlementFxDelta`, `accounting.repo.ts`), nothing here posts a journal
 * entry: a non-reversing revaluation adjustment would double-count against
 * settlement's own recognition the next time the same invoice/bill actually
 * settles, and this codebase has no reversing-entry mechanism yet. See the
 * Tier 7 entry in `docs/module-accounting.md` for the reasoning and for why
 * bank-account balances are deliberately not included here (no per-account
 * booking rate to revalue against, unlike an invoice/bill's own stored
 * `exchange_rate`).
 */
export type FxRevaluationRow = {
  kind: "receivable" | "payable"
  documentNumber: string
  partyName: string | null
  currency: string
  amountDue: string
  bookedRate: string
  /** Null when no exchange rate is on file on or before `asOf`. */
  asOfRate: string | null
  bookedBase: string
  /** Null when `asOfRate` is null — nothing to revalue against. */
  revaluedBase: string | null
  /** Signed: positive is a gain, negative a loss — same convention as
   *  `calculateRealizedFxGainLoss`. Null when `asOfRate` is null. */
  unrealizedGainLoss: string | null
}

type Row = {
  document_number: string
  party_name: string | null
  currency: string
  amount_due: string
  booked_rate: string
  as_of_rate: string | null
  booked_base: string
  revalued_base: string | null
  unrealized_gain_loss: string | null
}

function toRow(kind: FxRevaluationRow["kind"], r: Row): FxRevaluationRow {
  return {
    kind,
    documentNumber: r.document_number,
    partyName: r.party_name,
    currency: r.currency,
    amountDue: r.amount_due,
    bookedRate: r.booked_rate,
    asOfRate: r.as_of_rate,
    bookedBase: r.booked_base,
    revaluedBase: r.revalued_base,
    unrealizedGainLoss: r.unrealized_gain_loss,
  }
}

export async function fxRevaluation(
  tx: Tx,
  asOf?: string,
): Promise<FxRevaluationRow[]> {
  const openAr = await tx<Row[]>`
    SELECT q.* FROM (${openArQuery(tx, asOf)}) q ORDER BY ${byParty(tx)}
  `
  const openAp = await tx<Row[]>`
    SELECT q.* FROM (${openApQuery(tx, asOf)}) q ORDER BY ${byParty(tx)}
  `
  return [
    ...openAr.map((r) => toRow("receivable", r)),
    ...openAp.map((r) => toRow("payable", r)),
  ]
}

/** `fxRevaluation()` as two independently paged sections, in the same order. */
export async function fxRevaluationPage(
  tx: Tx,
  asOf: string | undefined,
  pages: { receivables: Page; payables: Page },
): Promise<{
  receivables: Paged<FxRevaluationRow>
  payables: Paged<FxRevaluationRow>
}> {
  const ar = await paged<Row>(
    tx,
    openArQuery(tx, asOf),
    byParty(tx),
    pages.receivables,
  )
  const ap = await paged<Row>(
    tx,
    openApQuery(tx, asOf),
    byParty(tx),
    pages.payables,
  )
  return {
    receivables: {
      rows: ar.rows.map((r) => toRow("receivable", r)),
      total: ar.total,
    },
    payables: {
      rows: ap.rows.map((r) => toRow("payable", r)),
      total: ap.total,
    },
  }
}

/** Customer or vendor, then document — the order both sections always had. */
const byParty = (tx: Tx) => tx`q.party_name, q.document_number`

// Same "open" predicate arAging()/apDueSoon() already use — a live,
// current-state figure; `asOf` only picks which exchange rate to revalue
// against, the same way it only picks aging buckets there.
function openArQuery(tx: Tx, asOf?: string) {
  const asOfDate = asOf || null
  return tx`
    SELECT i.invoice_number AS document_number, c.customer_name AS party_name,
           i.currency, i.amount_due::text AS amount_due,
           i.exchange_rate::text AS booked_rate,
           ar.rate::text AS as_of_rate,
           round(i.amount_due * i.exchange_rate, 2)::text AS booked_base,
           round(i.amount_due * ar.rate, 2)::text AS revalued_base,
           (round(i.amount_due * ar.rate, 2)
              - round(i.amount_due * i.exchange_rate, 2))::text
             AS unrealized_gain_loss
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      LEFT JOIN LATERAL (
        SELECT rate FROM exchange_rates er
         WHERE er.from_currency = i.currency AND er.to_currency = 'USD'
           AND er.rate_date <= COALESCE(${asOfDate}::date, CURRENT_DATE)
         ORDER BY er.rate_date DESC LIMIT 1
      ) ar ON true
     WHERE i.currency <> 'USD'
       AND i.amount_due > 0
       AND i.status NOT IN ('draft', 'void')
  `
}

// Payable's cash line is the opposite side from a receivable's, so the
// same rate movement reads as the opposite outcome — the currency
// strengthening is a gain to collect (AR) but a loss to owe more of
// (AP). Same reasoning as settlementFxDelta's direction split.
function openApQuery(tx: Tx, asOf?: string) {
  const asOfDate = asOf || null
  return tx`
    SELECT b.bill_number AS document_number, v.vendor_name AS party_name,
           b.currency, b.amount_due::text AS amount_due,
           b.exchange_rate::text AS booked_rate,
           ar.rate::text AS as_of_rate,
           round(b.amount_due * b.exchange_rate, 2)::text AS booked_base,
           round(b.amount_due * ar.rate, 2)::text AS revalued_base,
           (round(b.amount_due * b.exchange_rate, 2)
              - round(b.amount_due * ar.rate, 2))::text
             AS unrealized_gain_loss
      FROM bills b
      LEFT JOIN vendors v ON v.id = b.vendor_id
      LEFT JOIN LATERAL (
        SELECT rate FROM exchange_rates er
         WHERE er.from_currency = b.currency AND er.to_currency = 'USD'
           AND er.rate_date <= COALESCE(${asOfDate}::date, CURRENT_DATE)
         ORDER BY er.rate_date DESC LIMIT 1
      ) ar ON true
     WHERE b.currency <> 'USD'
       AND b.amount_due > 0
       AND b.status NOT IN ('draft', 'void', 'cancelled')
  `
}

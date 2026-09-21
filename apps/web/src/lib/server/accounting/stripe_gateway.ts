import Stripe from "stripe"

/**
 * A tenant's own Stripe secret key, used only against that tenant's own
 * Stripe account — never `PRIVATE_STRIPE_API_KEY` (Kaaj's own SaaS billing
 * account, wired up in `(admin)/account/subscription_helpers.server.ts`).
 */
export function stripeClientFor(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: "2023-08-16" })
}

const KEY_SHAPE = /^sk_(live|test)_[A-Za-z0-9]+$/

/** A precise field error before ever calling Stripe, not a generic API failure. */
export function looksLikeStripeSecretKey(key: string): boolean {
  return KEY_SHAPE.test(key)
}

export function isLiveStripeKey(key: string): boolean {
  return key.startsWith("sk_live_")
}

/** Last 4 characters — enough for a tenant to tell which key is configured, never enough to reconstruct it. */
export function last4(key: string): string {
  return key.slice(-4)
}

export type StripeValidation = { ok: true } | { ok: false; reason: string }

/**
 * A read-only call that only succeeds with a real, active key — proves the
 * key works before it is sealed and relied on later, at invoice-issuance
 * time, when a bad key would otherwise surface as a silently missing
 * payment link with no clue why.
 */
export async function validateStripeSecretKey(
  secretKey: string,
): Promise<StripeValidation> {
  try {
    await stripeClientFor(secretKey).balance.retrieve()
    return { ok: true }
  } catch (e) {
    if (e instanceof Stripe.errors.StripeAuthenticationError) {
      return {
        ok: false,
        reason: "Stripe rejected that key — check it is correct and active.",
      }
    }
    return {
      ok: false,
      reason: "Could not reach Stripe to verify that key. Try again.",
    }
  }
}

/**
 * Stripe's zero-decimal currencies (unit_amount is already whole units, no
 * ×100) and its three-decimal currencies (unit_amount is thousandths — not
 * implemented here, so refused explicitly rather than silently 10x wrong).
 * https://stripe.com/docs/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
])
const THREE_DECIMAL_CURRENCIES = new Set(["bhd", "jod", "kwd", "omr", "tnd"])

export class UnsupportedCurrency extends Error {
  constructor(readonly currency: string) {
    super(`${currency} is not supported for an online payment link`)
    this.name = "UnsupportedCurrency"
  }
}

/**
 * `amount` is a decimal STRING (CLAUDE.md § Money) — split into integer
 * whole/fractional parts and combined with integer arithmetic, never
 * `Number(amount) * 100`, which routes a large or awkward decimal through a
 * float intermediate and can round the wrong minor unit onto a real charge.
 */
export function toStripeMinorUnits(amount: string, currency: string): number {
  const lower = currency.toLowerCase()
  if (THREE_DECIMAL_CURRENCIES.has(lower))
    throw new UnsupportedCurrency(currency)

  const [whole, frac = ""] = amount.split(".")
  const wholeUnits = Number(whole)
  if (ZERO_DECIMAL_CURRENCIES.has(lower)) return wholeUnits

  const minorFraction = Number(frac.padEnd(2, "0").slice(0, 2))
  return wholeUnits * 100 + minorFraction
}

/**
 * A Payment Link, not a Checkout Session — a Session's URL expires within 24
 * hours (Stripe's own cap for `mode: "payment"`), which would go stale long
 * before a `net_30` invoice is even due. A Payment Link has no expiry, so
 * it's the only one safe to store on the invoice and embed in a PDF/email
 * that may be opened weeks later. One-off Price + Product, created together,
 * since this amount will never recur under its own catalog entry.
 */
export async function createInvoicePaymentLink(
  secretKey: string,
  invoice: {
    invoiceId: string
    invoiceNumber: string
    tenantId: string
    amountDue: string
    currency: string
  },
): Promise<{ url: string; id: string }> {
  const stripe = stripeClientFor(secretKey)
  const unitAmount = toStripeMinorUnits(invoice.amountDue, invoice.currency)

  const price = await stripe.prices.create({
    currency: invoice.currency.toLowerCase(),
    unit_amount: unitAmount,
    product_data: { name: `Invoice ${invoice.invoiceNumber}` },
  })

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: {
      tenant_id: invoice.tenantId,
      invoice_id: invoice.invoiceId,
      invoice_number: invoice.invoiceNumber,
    },
  })

  return { url: link.url, id: link.id }
}

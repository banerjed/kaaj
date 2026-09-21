import { vi, describe, it, expect, beforeEach } from "vitest"

// Real sends aren't exercised here (this environment has no live Stripe
// account to test against, matching mailer.test.ts's own posture for
// Resend) — the constructor is mocked, but `Stripe.errors.*` are the REAL
// classes (imported via vi.importActual) so `instanceof` checks in
// stripe_gateway.ts against a genuinely thrown error still work.
vi.mock("stripe", async () => {
  const actual = await vi.importActual<typeof import("stripe")>("stripe")
  const MockStripe = vi.fn() as unknown as typeof actual.default
  MockStripe.errors = actual.default.errors
  return { default: MockStripe }
})

import Stripe from "stripe"
import {
  looksLikeStripeSecretKey,
  isLiveStripeKey,
  last4,
  validateStripeSecretKey,
  toStripeMinorUnits,
  createInvoicePaymentLink,
  UnsupportedCurrency,
} from "./stripe_gateway"

describe("stripe_gateway", () => {
  describe("looksLikeStripeSecretKey", () => {
    it("accepts a live or test secret key", () => {
      expect(looksLikeStripeSecretKey("sk_live_abc123XYZ")).toBe(true)
      expect(looksLikeStripeSecretKey("sk_test_abc123XYZ")).toBe(true)
    })

    it("rejects a restricted key, a publishable key, and garbage", () => {
      expect(looksLikeStripeSecretKey("rk_live_abc123")).toBe(false)
      expect(looksLikeStripeSecretKey("pk_live_abc123")).toBe(false)
      expect(looksLikeStripeSecretKey("not-a-key")).toBe(false)
      expect(looksLikeStripeSecretKey("")).toBe(false)
    })
  })

  it("isLiveStripeKey distinguishes live from test", () => {
    expect(isLiveStripeKey("sk_live_abc")).toBe(true)
    expect(isLiveStripeKey("sk_test_abc")).toBe(false)
  })

  it("last4 returns the trailing characters only", () => {
    expect(last4("sk_live_abcdWXYZ")).toBe("WXYZ")
  })

  describe("toStripeMinorUnits", () => {
    it("multiplies a standard 2-decimal currency by 100, via integer parts (never a float multiply)", () => {
      expect(toStripeMinorUnits("1234.56", "USD")).toBe(123456)
      expect(toStripeMinorUnits("1000.00", "GBP")).toBe(100000)
      expect(toStripeMinorUnits("0.05", "USD")).toBe(5)
    })

    it("passes a zero-decimal currency through unmultiplied", () => {
      expect(toStripeMinorUnits("1500", "JPY")).toBe(1500)
      expect(toStripeMinorUnits("1500.00", "jpy")).toBe(1500)
    })

    it("refuses a three-decimal currency rather than silently mis-scaling it", () => {
      expect(() => toStripeMinorUnits("100.500", "BHD")).toThrow(
        UnsupportedCurrency,
      )
    })
  })

  describe("validateStripeSecretKey", () => {
    const mockBalanceRetrieve = vi.fn()

    beforeEach(() => {
      vi.clearAllMocks()
      vi.mocked(Stripe).mockImplementation(
        () =>
          ({
            balance: { retrieve: mockBalanceRetrieve },
          }) as unknown as Stripe,
      )
    })

    it("succeeds when Stripe accepts the key", async () => {
      mockBalanceRetrieve.mockResolvedValue({ available: [] })
      expect(await validateStripeSecretKey("sk_test_good")).toEqual({
        ok: true,
      })
    })

    it("reports a rejected key distinctly from a generic failure", async () => {
      mockBalanceRetrieve.mockRejectedValue(
        new Stripe.errors.StripeAuthenticationError({
          type: "authentication_error",
          message: "Invalid API Key provided",
        }),
      )
      expect(await validateStripeSecretKey("sk_test_bad")).toEqual({
        ok: false,
        reason: "Stripe rejected that key — check it is correct and active.",
      })
    })

    it("reports a generic failure when Stripe cannot be reached at all", async () => {
      mockBalanceRetrieve.mockRejectedValue(new Error("ETIMEDOUT"))
      const result = await validateStripeSecretKey("sk_test_good")
      expect(result.ok).toBe(false)
    })
  })

  describe("createInvoicePaymentLink", () => {
    const mockPricesCreate = vi.fn()
    const mockPaymentLinksCreate = vi.fn()

    beforeEach(() => {
      vi.clearAllMocks()
      vi.mocked(Stripe).mockImplementation(
        () =>
          ({
            prices: { create: mockPricesCreate },
            paymentLinks: { create: mockPaymentLinksCreate },
          }) as unknown as Stripe,
      )
    })

    it("creates a one-off price for the invoice amount, then a payment link over it", async () => {
      mockPricesCreate.mockResolvedValue({ id: "price_123" })
      mockPaymentLinksCreate.mockResolvedValue({
        id: "plink_123",
        url: "https://buy.stripe.com/test_abc",
      })

      const result = await createInvoicePaymentLink("sk_test_good", {
        invoiceId: "inv-1",
        invoiceNumber: "INV-2026-001",
        tenantId: "tenant-1",
        amountDue: "1234.56",
        currency: "USD",
      })

      expect(mockPricesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "usd",
          unit_amount: 123456,
          product_data: { name: "Invoice INV-2026-001" },
        }),
      )
      expect(mockPaymentLinksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: "price_123", quantity: 1 }],
        }),
      )
      expect(result).toEqual({
        url: "https://buy.stripe.com/test_abc",
        id: "plink_123",
      })
    })

    it("never calls Stripe at all for a three-decimal currency", async () => {
      await expect(
        createInvoicePaymentLink("sk_test_good", {
          invoiceId: "inv-1",
          invoiceNumber: "INV-2026-001",
          tenantId: "tenant-1",
          amountDue: "100.500",
          currency: "BHD",
        }),
      ).rejects.toThrow(UnsupportedCurrency)
      expect(mockPricesCreate).not.toHaveBeenCalled()
    })
  })
})

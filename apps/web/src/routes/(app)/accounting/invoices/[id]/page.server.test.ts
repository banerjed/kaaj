import { vi, afterAll, afterEach, describe, expect, it } from "vitest"

// No fixture tenant has a Stripe key configured (same reasoning as
// payment-gateway/page.server.test.ts) — the real seal/open/DB path is
// exercised, only the network call to Stripe itself is mocked.
vi.mock("stripe", async () => {
  const actual = await vi.importActual<typeof import("stripe")>("stripe")
  const MockStripe = vi.fn() as unknown as typeof actual.default
  MockStripe.errors = actual.default.errors
  return { default: MockStripe }
})

const mockPricesCreate = vi.fn()
const mockPaymentLinksCreate = vi.fn()
import Stripe from "stripe"
vi.mocked(Stripe).mockImplementation(
  () =>
    ({
      prices: { create: mockPricesCreate },
      paymentLinks: { create: mockPaymentLinksCreate },
    }) as unknown as Stripe,
)

import { closeConnections } from "$lib/server/db/client"
import { withTenant } from "$lib/server/db/tenant"
import * as acc from "$lib/server/accounting/accounting.repo"
import {
  savePaymentGatewaySecret,
  disconnectPaymentGateway,
} from "$lib/server/accounting/payment_gateway.repo"
import { actions } from "./+page.server"

/**
 * `emailInvoice` opens its own `withTenant` transaction (same shape as
 * every other action here), so it cannot run inside `inRollback`'s wrapper —
 * the "no email on file" case instead toggles the real fixture row and
 * restores it in `finally`, a real committed mutation kept as narrow and
 * short-lived as the Storage tests' own cleanup discipline.
 *
 * No `PRIVATE_RESEND_API_KEY` is configured in this environment (matching
 * `mailer.test.ts`'s own "not configured" case) — real sends aren't
 * exercised here either, only that the action reaches that honest refusal
 * rather than reporting success.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const ACME = "e40d0f18-1333-5cd1-a969-f5113df51e70"
const INV_2026_001 = "c72699f8-700c-5760-a8e8-19ae6dfd53c5"
// overdue, amount_due > 0 — INV_2026_001 is fully paid (amount_due = 0),
// which createPaymentLink correctly refuses ("nothing is due").
const INV_2026_002_OVERDUE = "a31732ea-dadb-575f-bd99-cbcfeaba29da"
// Already carries a seeded demo payment link (US-ACC-002's own fixture example).
const INV_2026_004_HAS_LINK = "37bd63c2-86a1-513c-8404-b731dd666b28"
const INV_2026_003_DRAFT = "bee0d3ca-72f7-5ba2-9a31-3bbf17daf320"

const NEVER_CALLED = {
  storage: {
    from() {
      throw new Error("must not reach Storage when there is no logo set")
    },
  },
} as unknown as App.Locals["supabase"]

function locals(supabase: App.Locals["supabase"]) {
  return {
    tenantId: NORTHWIND,
    tenantRole: "owner",
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
    user: { id: "00000000-0000-0000-0000-000000000000" },
    supabase,
  } as unknown as App.Locals
}

afterAll(async () => {
  await closeConnections()
})

describe("emailInvoice (US-ACC-008)", () => {
  it("refuses a draft invoice — nothing has been issued yet", async () => {
    const result = (await actions.emailInvoice({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_003_DRAFT },
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["invoice"])
  })

  it("refuses when the customer has no email on file", async () => {
    await withTenant(
      {
        tenantId: NORTHWIND,
        role: "owner",
        functionalRoles: [],
        employeeId: null,
      },
      (tx) => tx`UPDATE customers SET email = NULL WHERE id = ${ACME}::uuid`,
    )
    try {
      const result = (await actions.emailInvoice({
        locals: locals(NEVER_CALLED),
        params: { id: INV_2026_001 },
      } as never)) as { status: number; data: { errorFields: string[] } }
      expect(result.status).toBe(400)
      expect(result.data.errorFields).toEqual(["invoice"])
    } finally {
      await withTenant(
        {
          tenantId: NORTHWIND,
          role: "owner",
          functionalRoles: [],
          employeeId: null,
        },
        (tx) =>
          tx`UPDATE customers SET email = 'ap@acme.example' WHERE id = ${ACME}::uuid`,
      )
    }
  })

  it("reaches an honest not_configured refusal rather than reporting a real send", async () => {
    const result = (await actions.emailInvoice({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_001 },
    } as never)) as { status: number; data: { message: string } }
    expect(result.status).toBe(400)
    expect(result.data.message).toContain("not_configured")
  })
})

const owner = {
  tenantId: NORTHWIND,
  role: "owner" as const,
  functionalRoles: [],
  employeeId: null,
}

async function clearInvoicePaymentLink(invoiceId: string) {
  await withTenant(
    owner,
    (tx) =>
      tx`UPDATE invoices SET payment_url = NULL, payment_gateway = NULL, payment_gateway_id = NULL WHERE id = ${invoiceId}::uuid`,
  )
}

describe("createPaymentLink (US-ACC-002)", () => {
  afterEach(async () => {
    vi.clearAllMocks()
    await clearInvoicePaymentLink(INV_2026_002_OVERDUE)
    await withTenant(owner, (tx) =>
      disconnectPaymentGateway(
        tx,
        NORTHWIND,
        "00000000-0000-0000-0000-000000000000",
      ),
    )
  })

  it("refuses when no Stripe key is configured for the tenant, without calling Stripe", async () => {
    const result = (await actions.createPaymentLink({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_002_OVERDUE },
    } as never)) as { status: number; data: { message: string } }
    expect(result.status).toBe(400)
    expect(result.data.message).toContain("No Stripe key")
    expect(mockPricesCreate).not.toHaveBeenCalled()
  })

  it("refuses to mint a second link for an invoice that already has one, without calling Stripe", async () => {
    await withTenant(owner, (tx) =>
      savePaymentGatewaySecret(
        tx,
        NORTHWIND,
        "00000000-0000-0000-0000-000000000000",
        "sk_test_realkeyABCD",
        { last4: "ABCD", isLiveMode: false },
      ),
    )
    const result = (await actions.createPaymentLink({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_004_HAS_LINK },
    } as never)) as { status: number; data: { message: string } }
    expect(result.status).toBe(400)
    expect(result.data.message).toContain("already has a payment link")
    expect(mockPricesCreate).not.toHaveBeenCalled()
  })

  it("creates a link and stores it on the invoice once Stripe is configured", async () => {
    await withTenant(owner, (tx) =>
      savePaymentGatewaySecret(
        tx,
        NORTHWIND,
        "00000000-0000-0000-0000-000000000000",
        "sk_test_realkeyABCD",
        { last4: "ABCD", isLiveMode: false },
      ),
    )
    mockPricesCreate.mockResolvedValue({ id: "price_1" })
    mockPaymentLinksCreate.mockResolvedValue({
      id: "plink_1",
      url: "https://buy.stripe.com/test_1",
    })

    const result = (await actions.createPaymentLink({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_002_OVERDUE },
    } as never)) as { linkCreated: true }
    expect(result.linkCreated).toBe(true)

    const invoice = await withTenant(owner, (tx) =>
      acc.invoiceById(tx, INV_2026_002_OVERDUE),
    )
    expect(invoice?.payment_url).toBe("https://buy.stripe.com/test_1")
  })

  it("surfaces a warning and leaves the invoice untouched when Stripe itself fails", async () => {
    await withTenant(owner, (tx) =>
      savePaymentGatewaySecret(
        tx,
        NORTHWIND,
        "00000000-0000-0000-0000-000000000000",
        "sk_test_realkeyABCD",
        { last4: "ABCD", isLiveMode: false },
      ),
    )
    mockPricesCreate.mockRejectedValue(new Error("ECONNRESET"))

    const result = (await actions.createPaymentLink({
      locals: locals(NEVER_CALLED),
      params: { id: INV_2026_002_OVERDUE },
    } as never)) as { status: number; data: { message: string } }
    expect(result.status).toBe(400)
    expect(result.data.message).toContain("Could not create")

    const invoice = await withTenant(owner, (tx) =>
      acc.invoiceById(tx, INV_2026_002_OVERDUE),
    )
    expect(invoice?.payment_url ?? null).toBeNull()
  })
})

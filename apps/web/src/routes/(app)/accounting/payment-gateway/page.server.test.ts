import { vi, afterAll, afterEach, describe, expect, it } from "vitest"

/**
 * No fixture tenant has configured Stripe (verify-fixture-coverage.mjs's
 * EXPECTED_SPARSE entries for payment_gateway_settings say why: a
 * hand-written envelope would fail pii.test.ts). The save/disconnect path
 * below runs against the REAL local database — the seal/open round trip,
 * the RLS policy, the upsert — with only the network call to Stripe itself
 * mocked, matching mailer.test.ts's own posture for Resend.
 */
vi.mock("stripe", async () => {
  const actual = await vi.importActual<typeof import("stripe")>("stripe")
  const MockStripe = vi.fn() as unknown as typeof actual.default
  MockStripe.errors = actual.default.errors
  return { default: MockStripe }
})

const mockBalanceRetrieve = vi.fn()
import Stripe from "stripe"
vi.mocked(Stripe).mockImplementation(
  () => ({ balance: { retrieve: mockBalanceRetrieve } }) as unknown as Stripe,
)

import { closeConnections } from "$lib/server/db/client"
import { withTenant } from "$lib/server/db/tenant"
import {
  paymentGatewaySettings,
  stripeSecretKeyFor,
  disconnectPaymentGateway,
} from "$lib/server/accounting/payment_gateway.repo"
import { actions } from "./+page.server"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"

function locals() {
  return {
    tenantId: NORTHWIND,
    tenantRole: "owner",
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
    user: { id: "00000000-0000-0000-0000-000000000000" },
  } as unknown as App.Locals
}

function formRequest(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [k, v] of Object.entries(fields)) formData.set(k, v)
  return { formData: async () => formData } as never
}

const actor = {
  tenantId: NORTHWIND,
  role: "owner" as const,
  functionalRoles: [],
  employeeId: null,
}

afterEach(async () => {
  vi.clearAllMocks()
  // No DELETE grant on this table (append-only, 20260830120000) — "removed"
  // is the same UPDATE-to-null the app's own disconnect action performs.
  await withTenant(actor, (tx) =>
    disconnectPaymentGateway(
      tx,
      NORTHWIND,
      "00000000-0000-0000-0000-000000000000",
    ),
  )
})

afterAll(async () => {
  await closeConnections()
})

describe("payment-gateway save/disconnect (US-ACC-002)", () => {
  it("refuses a key that doesn't look like a Stripe secret key, without calling Stripe", async () => {
    const result = (await actions.save({
      request: formRequest({ secret_key: "not-a-stripe-key" }),
      locals: locals(),
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["secret_key"])
    expect(mockBalanceRetrieve).not.toHaveBeenCalled()
  })

  it("refuses a well-formed key that Stripe itself rejects, and never stores it", async () => {
    mockBalanceRetrieve.mockRejectedValue(
      new Stripe.errors.StripeAuthenticationError({
        type: "authentication_error",
        message: "Invalid API Key provided",
      }),
    )
    const result = (await actions.save({
      request: formRequest({ secret_key: "sk_test_badkey12345" }),
      locals: locals(),
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["secret_key"])

    const stored = await withTenant(actor, (tx) =>
      paymentGatewaySettings(tx, NORTHWIND),
    )
    expect(stored).toBeNull()
  })

  it("saves a valid key sealed, and it opens back to the original plaintext", async () => {
    mockBalanceRetrieve.mockResolvedValue({ available: [] })
    const result = (await actions.save({
      request: formRequest({ secret_key: "sk_test_realkeyABCD" }),
      locals: locals(),
    } as never)) as { saved: true }
    expect(result.saved).toBe(true)

    const settings = await withTenant(actor, (tx) =>
      paymentGatewaySettings(tx, NORTHWIND),
    )
    expect(settings).toEqual({
      secretKeyLast4: "ABCD",
      isLiveMode: false,
      verifiedAt: expect.any(String),
    })

    const opened = await withTenant(actor, (tx) =>
      stripeSecretKeyFor(tx, NORTHWIND),
    )
    expect(opened).toBe("sk_test_realkeyABCD")
  })

  it("disconnect clears the key — settings report unconfigured, and the sealed value opens to null", async () => {
    mockBalanceRetrieve.mockResolvedValue({ available: [] })
    await actions.save({
      request: formRequest({ secret_key: "sk_test_realkeyABCD" }),
      locals: locals(),
    } as never)

    const result = (await actions.disconnect({
      locals: locals(),
    } as never)) as { disconnected: true }
    expect(result.disconnected).toBe(true)

    const settings = await withTenant(actor, (tx) =>
      paymentGatewaySettings(tx, NORTHWIND),
    )
    expect(settings).toBeNull()

    const opened = await withTenant(actor, (tx) =>
      stripeSecretKeyFor(tx, NORTHWIND),
    )
    expect(opened).toBeNull()
  })

  it("a different tenant cannot read the configured key — RLS, not just app logic", async () => {
    mockBalanceRetrieve.mockResolvedValue({ available: [] })
    await actions.save({
      request: formRequest({ secret_key: "sk_test_realkeyABCD" }),
      locals: locals(),
    } as never)

    // A syntactically valid tenant id that isn't Northwind's — the policy
    // compares the JWT's own tenant_id claim against the row's, which needs
    // no real second tenant row to exercise (same shape as
    // settings/company/logo.server.test.ts's OTHER_TENANT).
    const otherTenant = {
      tenantId: "00000000-0000-0000-0000-000000000099",
      role: "owner" as const,
      functionalRoles: [],
      employeeId: null,
    }
    const settings = await withTenant(otherTenant, (tx) =>
      paymentGatewaySettings(tx, NORTHWIND),
    )
    expect(settings).toBeNull()
  })

  it("a plain employee (no finance role) cannot read Northwind's own configured key — the finance-only row policy, not just app logic", async () => {
    mockBalanceRetrieve.mockResolvedValue({ available: [] })
    await actions.save({
      request: formRequest({ secret_key: "sk_test_realkeyABCD" }),
      locals: locals(),
    } as never)

    const employee = {
      tenantId: NORTHWIND,
      role: "employee" as const,
      functionalRoles: [],
      employeeId: null,
    }
    const settings = await withTenant(employee, (tx) =>
      paymentGatewaySettings(tx, NORTHWIND),
    )
    expect(settings).toBeNull()
  })
})

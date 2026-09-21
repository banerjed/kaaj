import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as gateway from "$lib/server/accounting/payment_gateway.repo"
import * as tenants from "$lib/server/platform-tenancy/tenants.repo"
import {
  looksLikeStripeSecretKey,
  isLiveStripeKey,
  last4,
  validateStripeSecretKey,
} from "$lib/server/accounting/stripe_gateway"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/**
 * /accounting/payment-gateway (US-ACC-002) — a tenant's own Stripe secret
 * key, used only to create Payment Links against that tenant's own Stripe
 * account (bring-your-own-key, not Stripe Connect). Same finance-only
 * permission as every other page under this module.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see payment gateway settings.")
  }

  return withTenant(actorFrom(locals), async (tx) => {
    const [settings, company] = await Promise.all([
      gateway.paymentGatewaySettings(tx, locals.tenantId!),
      tenants.getCurrent(tx),
    ])
    return {
      settings,
      mayWrite: can(ctx, "accounting.write"),
      formatContext: {
        locale: company?.default_locale ?? "en-US",
        currency: "USD",
        timezone: company?.default_timezone ?? "UTC",
        timeFormat: company?.time_format ?? "12h",
      },
    }
  })
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const secretKey = f.text("secret_key", { required: true, max: 200 })
    if (secretKey && !looksLikeStripeSecretKey(secretKey))
      f.reject("secret_key")
    if (!f.ok) {
      return fail(
        400,
        f.problem(
          "That doesn't look like a Stripe secret key (starts with sk_live_ or sk_test_).",
        ),
      )
    }

    // A real, network call — validated before opening any transaction (same
    // reasoning as emailInvoice's split: a network call must not run inside
    // a held transaction), and before the key is ever sealed. A key that
    // fails here is never stored.
    const validation = await validateStripeSecretKey(secretKey!)
    if (!validation.ok) {
      return fail(400, {
        message: validation.reason,
        errorFields: ["secret_key"],
      })
    }

    await withTenant(actorFrom(locals), async (tx) => {
      await gateway.savePaymentGatewaySecret(
        tx,
        locals.tenantId!,
        ctx!.employeeId ?? ctx!.userId,
        secretKey!,
        { last4: last4(secretKey!), isLiveMode: isLiveStripeKey(secretKey!) },
      )
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "payment_gateway_settings",
        entityId: locals.tenantId!,
        module: "accounting",
        changes: {
          stripe_key: { from: null, to: `sk_...${last4(secretKey!)}` },
        },
      })
    })
    return { saved: true }
  },

  disconnect: async ({ locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    await withTenant(actorFrom(locals), async (tx) => {
      await gateway.disconnectPaymentGateway(
        tx,
        locals.tenantId!,
        ctx!.employeeId ?? ctx!.userId,
      )
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "payment_gateway_settings",
        entityId: locals.tenantId!,
        module: "accounting",
        changes: { stripe_key: { from: "configured", to: null } },
      })
    })
    return { disconnected: true }
  },
}

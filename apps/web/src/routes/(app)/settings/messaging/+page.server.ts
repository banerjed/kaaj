import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as messaging from "$lib/server/messaging/messaging.repo"
import {
  ADDRESS_MAX,
  CHANNELS,
  LABEL_MAX,
  REGISTRATION_STATUSES,
} from "$lib/server/messaging/messaging.repo"
import { birdConfig, birdProvider } from "$lib/server/messaging/bird"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import * as audit from "$lib/server/audit/audit.repo"

/**
 * /settings/messaging — the firm's numbers and inbound addresses, and the
 * people who asked not to be contacted (docs/37-messaging.md §3).
 * Endpoints change what the public can reach and cost money, so they are
 * the account admins' (tenant.settings.write); opt-outs are part of
 * messaging itself (messaging.write).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "messaging.read")
  const config = birdConfig()

  return withTenant(actorFrom(locals), async (tx) => {
    const [endpoints, optOuts, tenant] = await Promise.all([
      messaging.listEndpoints(tx, { includeArchived: true }),
      messaging.listOptOuts(tx),
      tx<{ company_name: string; default_timezone: string }[]>`
        SELECT company_name, default_timezone FROM tenants WHERE id = ${locals.tenantId}::uuid
      `,
    ])
    return {
      endpoints,
      optOuts,
      companyName: tenant[0]?.company_name ?? "",
      timezone: tenant[0]?.default_timezone ?? "UTC",
      channels: CHANNELS,
      registrationStatuses: REGISTRATION_STATUSES,
      // What the page can offer: no inbound domain means no email address
      // can be minted; no API key means no number can be searched or bought.
      inboundDomain: config.inboundDomain ?? null,
      providerConfigured: !!config.apiKey,
      mayManageEndpoints: can(ctx, "tenant.settings.write"),
      mayManageOptOuts: can(ctx, "messaging.write"),
    }
  })
}

function actorId(locals: App.Locals): string {
  return locals.employeeId ?? locals.user!.id
}

export const actions: Actions = {
  addEmailAddress: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "tenant.settings.write")
    const tenantId = locals.tenantId
    const config = birdConfig()

    const f = new FormReader(await request.formData())
    const label = f.text("label", { required: true, max: LABEL_MAX })
    const prefix = f.text("prefix", { max: 24 })
    if (!f.ok) return fail(400, f.problem("Give the address a label."))
    if (!config.inboundDomain) {
      return fail(400, {
        message:
          "No inbound domain is configured on this server, so no address can be created yet.",
        errorFields: ["label"],
      })
    }

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await messaging.createEmailEndpoint(
          tx,
          tenantId,
          {
            label: label!,
            inboundDomain: config.inboundDomain!,
            prefix: prefix || label!,
          },
          actorId(locals),
        )
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "messaging_endpoints",
          entityId: created.id,
          module: "messaging",
          changes: {
            channel: { from: null, to: "email" },
            address: { from: null, to: created.address },
            label: { from: null, to: label! },
          },
        })
        return { created: created.address }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  /** A number the workspace already owns (bought in Bird's dashboard, or ported), bound to this tenant. */
  registerNumber: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "tenant.settings.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const rawAddress = f.text("address", { required: true, max: ADDRESS_MAX })
    const label = f.text("label", { required: true, max: LABEL_MAX })
    const providerRef = f.text("provider_ref", { max: 80 })
    const countryCode = f.text("country_code", { max: 2 })
    const registrationStatus = f.choice(
      "registration_status",
      REGISTRATION_STATUSES,
      { required: true },
    )
    const address = rawAddress && messaging.normalizePhone(rawAddress)
    if (rawAddress && !address) f.reject("address")
    if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode))
      f.reject("country_code")
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await messaging.registerSmsEndpoint(
          tx,
          tenantId,
          {
            address: address!,
            label: label!,
            providerRef: providerRef || null,
            countryCode: countryCode ? countryCode.toUpperCase() : null,
            registrationStatus: registrationStatus!,
          },
          actorId(locals),
        )
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "messaging_endpoints",
          entityId: created.id,
          module: "messaging",
          changes: {
            channel: { from: null, to: "sms" },
            address: { from: null, to: address! },
            label: { from: null, to: label! },
            registration_status: { from: null, to: registrationStatus! },
          },
        })
        return { created: address! }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  searchNumbers: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "tenant.settings.write")
    const f = new FormReader(await request.formData())
    const countryCode = f.text("country_code", { required: true, max: 2 })
    if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode))
      f.reject("country_code")
    if (!f.ok) return fail(400, f.problem("Give a two-letter country code."))

    const numbers = await birdProvider().searchNumbers({
      countryCode: countryCode!.toUpperCase(),
    })
    return { numbers, searchedCountry: countryCode!.toUpperCase() }
  },

  /** Buys a number from Bird and binds it here in one step; the order is placed BEFORE the row exists, so a failed order leaves nothing behind. */
  orderNumber: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "tenant.settings.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const rawNumber = f.text("number", { required: true, max: ADDRESS_MAX })
    const label = f.text("label", { required: true, max: LABEL_MAX })
    const countryCode = f.text("country_code", { required: true, max: 2 })
    const number = rawNumber && messaging.normalizePhone(rawNumber)
    if (rawNumber && !number) f.reject("number")
    if (countryCode && !/^[A-Za-z]{2}$/.test(countryCode))
      f.reject("country_code")
    if (!f.ok) return fail(400, f.problem())

    const order = await birdProvider().orderNumber(number!)
    if (!order.ordered) {
      return fail(400, {
        message:
          order.reason === "not_configured"
            ? "Bird is not configured on this server, so no number can be bought."
            : `Bird refused the order: ${order.detail ?? "no reason given"}.`,
        errorFields: ["number"],
      })
    }

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await messaging.registerSmsEndpoint(
          tx,
          tenantId,
          {
            address: messaging.normalizePhone(order.number) ?? number!,
            label: label!,
            providerRef: order.numberId,
            countryCode: countryCode!.toUpperCase(),
            registrationStatus: "none",
          },
          actorId(locals),
        )
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "messaging_endpoints",
          entityId: created.id,
          module: "messaging",
          changes: {
            channel: { from: null, to: "sms" },
            address: { from: null, to: order.number },
            provider_ref: { from: null, to: order.numberId },
            label: { from: null, to: label! },
          },
          reason: "Ordered from Bird",
        })
        return { created: order.number }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archiveEndpoint: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "tenant.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing endpoint."))

    return await withTenant(actorFrom(locals), async (tx) => {
      const endpoint = await messaging.endpointById(tx, id!)
      if (!endpoint) error(404, "No such endpoint")
      const archived = await messaging.archiveEndpoint(tx, id!)
      if (!archived) {
        return fail(400, {
          message:
            "That number or address is already retired. Reload the page.",
        })
      }
      await audit.record(tx, ctx!, {
        action: "archive",
        entityType: "messaging_endpoints",
        entityId: id!,
        module: "messaging",
        changes: {
          is_active: { from: "true", to: "false" },
          address: { from: endpoint.address, to: endpoint.address },
        },
      })
      return { archived: true }
    })
  },

  addOptOut: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "messaging.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const channel = f.choice("channel", CHANNELS, { required: true })
    const rawAddress = f.text("address", { required: true, max: ADDRESS_MAX })
    const address =
      channel && rawAddress && messaging.normalizeAddress(channel, rawAddress)
    if (channel && rawAddress && !address) f.reject("address")
    if (!f.ok) return fail(400, f.problem())

    return await withTenant(actorFrom(locals), async (tx) => {
      await messaging.recordOptOut(tx, tenantId, {
        channel: channel!,
        address: address!,
        reason: "manual",
        notedBy: locals.employeeId ?? null,
      })
      await audit.record(tx, ctx!, {
        action: "create",
        entityType: "messaging_opt_outs",
        entityId: null,
        module: "messaging",
        changes: {
          channel: { from: null, to: channel! },
          address: { from: null, to: address! },
          reason: { from: null, to: "manual" },
        },
      })
      return { optedOut: address! }
    })
  },

  revokeOptOut: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "messaging.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing opt-out."))

    return await withTenant(actorFrom(locals), async (tx) => {
      const revoked = await messaging.revokeOptOut(tx, id!)
      if (!revoked) {
        return fail(400, {
          message: "That opt-out is already lifted. Reload the page.",
        })
      }
      await audit.record(tx, ctx!, {
        action: "restore",
        entityType: "messaging_opt_outs",
        entityId: id!,
        module: "messaging",
        changes: { revoked_at: { from: null, to: "now" } },
      })
      return { revoked: true }
    })
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as taxRates from "$lib/server/accounting/tax_rates.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { allEnumerations } from "@kaaj/enums"

/** /accounting/tax-rates — sales tax / VAT configuration (US-ACC-046). */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see tax rates.")
  }

  return {
    taxRates: await withTenant(actorFrom(locals), (tx) =>
      taxRates.listTaxRates(tx),
    ),
    taxTypes: allEnumerations().get("tax_type") ?? [],
    mayWrite: can(ctx, "accounting.write"),
  }
}

const AUDITED_FIELDS = [
  "code",
  "tax_name",
  "tax_type",
  "rate",
  "country",
  "region",
  "jurisdiction",
  "is_reverse_charge",
  "effective_from",
]

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const input = {
      code: f.text("code", { required: true, max: 50 }),
      tax_name: f.text("tax_name", { required: true, max: 255 }),
      tax_type: f.enumValue("tax_type", "tax_type", { required: true }),
      rate: f.decimal("rate", {
        scale: 5,
        integerDigits: 3,
        min: 0,
        // A decimal fraction, not a percentage — 0.08875, not 8.875. Without
        // this, typing the percentage by mistake silently configures an
        // 887.5% tax rather than 8.875%.
        max: 1,
        required: true,
      }),
      country: f.text("country", { required: true, max: 2 }),
      region: f.text("region", { max: 100 }),
      jurisdiction: f.text("jurisdiction", { max: 255 }),
      is_reverse_charge: f.bool("is_reverse_charge"),
      effective_from: f.date("effective_from", { required: true }),
    }
    if (!f.ok) return fail(400, f.problem())

    const actorId = ctx!.employeeId ?? ctx!.userId
    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const { id } = await taxRates.createTaxRate(
          tx,
          locals.tenantId!,
          input,
          actorId,
        )
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "tax_rates",
          entityId: id,
          module: "accounting",
          changes: audit.diff(null, input, AUDITED_FIELDS),
        })
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { saved: true }
  },

  // Two named actions, not one reading a boolean field: `FormReader.bool`
  // treats absence as false, so a hidden `is_active=false` field could never
  // distinguish "turn off" from "field wasn't submitted". Same shape as
  // closePeriod/reopenPeriod.
  deactivate: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing tax rate."))

    const actorId = ctx!.employeeId ?? ctx!.userId
    const updated = await withTenant(actorFrom(locals), async (tx) => {
      const row = await taxRates.setTaxRateActive(tx, id!, false, actorId)
      if (!row) return null
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "tax_rates",
        entityId: id!,
        module: "accounting",
        changes: { is_active: { from: "true", to: "false" } },
      })
      return row
    })
    if (!updated) {
      return fail(400, {
        message: "That tax rate no longer exists. Reload the page.",
      })
    }
    return { toggled: true }
  },

  activate: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing tax rate."))

    const actorId = ctx!.employeeId ?? ctx!.userId
    const updated = await withTenant(actorFrom(locals), async (tx) => {
      const row = await taxRates.setTaxRateActive(tx, id!, true, actorId)
      if (!row) return null
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "tax_rates",
        entityId: id!,
        module: "accounting",
        changes: { is_active: { from: "false", to: "true" } },
      })
      return row
    })
    if (!updated) {
      return fail(400, {
        message: "That tax rate no longer exists. Reload the page.",
      })
    }
    return { toggled: true }
  },
}

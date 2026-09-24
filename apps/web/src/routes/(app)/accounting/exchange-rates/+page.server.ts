import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { listCurrentExchangeRates } from "$lib/server/accounting/exchange_rates.repo"
import { refreshExchangeRates } from "$lib/server/accounting/fx_rates"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

/**
 * /accounting/exchange-rates — the currency -> USD rates invoices/bills
 * convert against (US-ACC-052/036). Global reference data, no `tenant_id`,
 * so every tenant sees the same rows; reading it needs no special
 * privilege (RLS already allows any signed-in session), but refreshing it
 * writes through the service role (`fx_rates.ts`) since no tenant-scoped
 * role has an INSERT/UPDATE policy on this table at all.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see exchange rates.")
  }

  return {
    rates: await withTenant(actorFrom(locals), (tx) =>
      listCurrentExchangeRates(tx),
    ),
    mayWrite: can(ctx, "accounting.write"),
  }
}

export const actions: Actions = {
  // The write and its audit entry are NOT one transaction, unlike every
  // other audited write in this module — `refreshExchangeRates()` goes
  // through the service role over PostgREST, a separate connection from
  // `withTenant`'s tenant-scoped one, and `exchange_rates` has no
  // `tenant_id` to write the audit row alongside in the first place. A
  // crash in the narrow window between them would leave a real rate
  // change unaudited — accepted here because the write is idempotent
  // (re-running it is always safe) and low-stakes reference data, not
  // because the rule stopped mattering.
  refresh: async ({ locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const before = await withTenant(actorFrom(locals), (tx) =>
      listCurrentExchangeRates(tx),
    )
    const beforeByCurrency = new Map(
      before.map((r) => [r.from_currency, r.rate]),
    )

    const result = await refreshExchangeRates()

    if (result.refreshed.length > 0) {
      await withTenant(actorFrom(locals), async (tx) => {
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "exchange_rates",
          entityId: null,
          module: "accounting",
          changes: Object.fromEntries(
            result.refreshed.map(({ currency, rate }) => [
              currency,
              { from: beforeByCurrency.get(currency) ?? "none", to: rate },
            ]),
          ),
          reason:
            result.failed.length > 0
              ? `Yahoo refresh — failed: ${result.failed.map((f) => f.currency).join(", ")}`
              : "Yahoo refresh",
        })
      })
    }

    if (result.failed.length > 0 && result.refreshed.length === 0) {
      return fail(502, {
        message: `Could not reach Yahoo for any currency: ${result.failed
          .map((f) => `${f.currency} (${f.reason})`)
          .join("; ")}`,
      })
    }

    return { refreshed: result.refreshed, failed: result.failed }
  },
}

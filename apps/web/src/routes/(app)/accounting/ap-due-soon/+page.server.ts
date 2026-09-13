import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { AP_DUE_SOON_WINDOWS } from "$lib/server/accounting/payables.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/** /accounting/ap-due-soon — bills coming due, distinct from the overdue flag. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see upcoming bills.")
  }

  const params = new FormData()
  params.append("as_of", url.searchParams.get("as_of") ?? "")
  params.append("within_days", url.searchParams.get("within_days") ?? "")
  const f = new FormReader(params)
  // Read above the gate — inside the object it'd be reported too late (L33).
  const asOf = f.date("as_of")
  const withinDays = f.choice("within_days", AP_DUE_SOON_WINDOWS, {
    fallback: "30",
  })
  if (!f.ok) {
    if (f.errorFields.includes("within_days")) {
      error(400, "That is not one of the available windows.")
    }
    error(400, "That date is not a real date.")
  }

  const withinDaysNum = Number(withinDays)

  return withTenant(actorFrom(locals), async (tx) => ({
    rows: await pay.apDueSoon(tx, {
      asOf: asOf ?? "",
      withinDays: withinDaysNum,
    }),
    windows: AP_DUE_SOON_WINDOWS,
    filters: { asOf: asOf ?? "", withinDays: withinDaysNum },
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}

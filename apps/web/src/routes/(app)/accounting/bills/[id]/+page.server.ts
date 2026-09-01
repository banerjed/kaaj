import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) error(403, "Only finance can see bills.")
  return withTenant(actorFrom(locals), async (tx) => {
    const bill = await pay.billById(tx, params.id)
    if (!bill) error(404, "No such bill")
    return {
      bill,
      lines: await pay.billLines(tx, bill.id),
      payments: await pay.paymentsForBill(tx, bill.id),
    }
  })
}

import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see invoices.")
  }
  return withTenant(actorFrom(locals), async (tx) => {
    const invoice = await acc.invoiceById(tx, params.id)
    if (!invoice) error(404, "No such invoice")
    return {
      invoice,
      lines: await acc.invoiceLines(tx, invoice.id),
      payments: await acc.paymentsFor(tx, invoice.id),
    }
  })
}

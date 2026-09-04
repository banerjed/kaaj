import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { TICKET_STATUSES } from "$lib/server/ticketing/ticketing.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/** /ticketing — staff view. Business areas and every business area's own tickets. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "ticketing.read.own") && !can(ctx, "ticketing.read.all")) {
    error(403, "You cannot see tickets.")
  }

  const params = new FormData()
  params.append("status", url.searchParams.get("status") ?? "")
  const f = new FormReader(params)
  const status = f.choice("status", TICKET_STATUSES) ?? ""
  const businessAreaId = url.searchParams.get("business_area") || undefined

  const readsAll = can(ctx, "ticketing.read.all")

  return withTenant(actorFrom(locals), async (tx) => ({
    businessAreas: await ticketing.businessAreas(tx),
    tickets: await ticketing.listTickets(tx, {
      status,
      businessAreaId,
      ownedByEmployeeId: readsAll ? undefined : (ctx!.employeeId ?? undefined),
    }),
    statuses: TICKET_STATUSES,
    filters: { status, businessAreaId: businessAreaId ?? "" },
    readsAll,
  }))
}

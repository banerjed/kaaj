import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { TICKET_STATUSES } from "$lib/server/ticketing/ticketing.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const PAGE_SIZE = 20

/** /ticketing — staff view. Top-level filters for every base field; business areas and their category trees for the cascading selects. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "ticketing.read.own") && !can(ctx, "ticketing.read.all")) {
    error(403, "You cannot see tickets.")
  }

  const params = new FormData()
  for (const key of [
    "status",
    "business_area",
    "category",
    "subcategory",
    "logger",
    "assignee",
    "subscriber",
    "q",
  ]) {
    params.append(key, url.searchParams.get(key) ?? "")
  }
  const f = new FormReader(params)
  const status = f.choice("status", TICKET_STATUSES) ?? ""
  const businessAreaId = url.searchParams.get("business_area") || undefined
  const categoryId = url.searchParams.get("category") || undefined
  const subcategoryId = url.searchParams.get("subcategory") || undefined
  const loggerId = url.searchParams.get("logger") || undefined
  const assigneeId = url.searchParams.get("assignee") || undefined
  const subscriberId = url.searchParams.get("subscriber") || undefined
  const search = url.searchParams.get("q") || undefined

  // Nothing is queried until at least one filter is set — at tens of
  // thousands of tickets, "show everything" is not a useful default and not
  // a cheap one either.
  const hasFilters = Boolean(
    status ||
    businessAreaId ||
    categoryId ||
    subcategoryId ||
    loggerId ||
    assigneeId ||
    subscriberId ||
    search,
  )

  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  const readsAll = can(ctx, "ticketing.read.all")

  return withTenant(actorFrom(locals), async (tx) => {
    const businessAreas = await ticketing.businessAreas(tx)
    const categoriesByArea = await ticketing.allCategoriesByArea(tx)

    const filters = {
      status,
      businessAreaId,
      categoryId,
      subcategoryId,
      loggerEmployeeId: loggerId,
      assigneeEmployeeId: assigneeId,
      subscriberEmployeeId: subscriberId,
      search,
      ownedByEmployeeId: readsAll ? undefined : (ctx!.employeeId ?? undefined),
    }

    const [tickets, total] = hasFilters
      ? await Promise.all([
          ticketing.listTickets(tx, {
            ...filters,
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
          }),
          ticketing.countTickets(tx, filters),
        ])
      : [[], 0]

    return {
      businessAreas,
      categoriesByArea,
      people: await employees.managerOptions(tx),
      tickets,
      total,
      page,
      pageSize: PAGE_SIZE,
      hasFilters,
      statuses: TICKET_STATUSES,
      filters: {
        status,
        businessAreaId: businessAreaId ?? "",
        categoryId: categoryId ?? "",
        subcategoryId: subcategoryId ?? "",
        loggerId: loggerId ?? "",
        assigneeId: assigneeId ?? "",
        subscriberId: subscriberId ?? "",
        search: search ?? "",
      },
      readsAll,
    }
  })
}

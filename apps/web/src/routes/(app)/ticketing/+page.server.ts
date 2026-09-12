import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { TICKET_STATUSES } from "$lib/server/ticketing/ticketing.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

const PAGE_SIZE = 20

// Below this many tickets, listing everything costs about as much as the
// count query we already run to decide — so a tenant this small gets a
// normal list page instead of an empty one asking it to filter first.
const UNFILTERED_LISTING_THRESHOLD = 500

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

  // Whether the request itself asked for a filter. Below
  // UNFILTERED_LISTING_THRESHOLD tickets, an unfiltered request still gets a
  // listing (see below); above it, "show everything" stops being a useful
  // default and stops being a cheap one too, so it gets nothing instead.
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
    const categoriesByArea: Record<
      string,
      Awaited<ReturnType<typeof ticketing.categoriesFor>>
    > = {}
    for (const ba of businessAreas) {
      categoriesByArea[ba.id] = await ticketing.categoriesFor(tx, ba.id)
    }

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

    let tickets: Awaited<ReturnType<typeof ticketing.listTickets>>
    let total: number
    let effectiveHasFilters = hasFilters

    if (hasFilters) {
      ;[tickets, total] = await Promise.all([
        ticketing.listTickets(tx, {
          ...filters,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        ticketing.countTickets(tx, filters),
      ])
    } else {
      const scopeOnly = { ownedByEmployeeId: filters.ownedByEmployeeId }
      const unfilteredTotal = await ticketing.countTickets(tx, scopeOnly)
      if (unfilteredTotal <= UNFILTERED_LISTING_THRESHOLD) {
        tickets = await ticketing.listTickets(tx, {
          ...scopeOnly,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        })
        total = unfilteredTotal
        effectiveHasFilters = true
      } else {
        tickets = []
        total = 0
      }
    }

    return {
      businessAreas,
      categoriesByArea,
      people: await employees.managerOptions(tx),
      tickets,
      total,
      page,
      pageSize: PAGE_SIZE,
      hasFilters: effectiveHasFilters,
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

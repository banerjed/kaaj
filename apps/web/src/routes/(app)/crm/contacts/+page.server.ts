import { error } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as contacts from "$lib/server/customers/customer-contacts.repo"
import * as customers from "$lib/server/customers/customers.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { pickerQuery, searchCustomers } from "$lib/server/pickers"

const PAGE_SIZE = 20

/** The "shared contact database" view — every contact, across every client. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  const search = url.searchParams.get("q") ?? ""
  const customerId = url.searchParams.get("company") ?? ""
  const department = url.searchParams.get("dept") ?? ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const [result, departmentOptions, selectedCompany] = await Promise.all([
      contacts.list(tx, {
        search,
        customerId,
        department,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      contacts.departments(tx),
      customerId ? customers.getById(tx, customerId) : null,
    ])

    return {
      contacts: result.rows,
      total: result.total,
      page,
      pageSize: PAGE_SIZE,
      departmentOptions,
      filters: { search, customerId, department },
      selectedCompany,
    }
  })
}

export const actions: Actions = {
  /**
   * Backs the client-filter `Combobox` — a tenant can have thousands of
   * clients, so the picker searches on demand rather than choosing from a
   * preloaded list, same shape as ticketing's `searchTickets`.
   */
  searchCompanies: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchCustomers(tx, q),
    }))
  },
}

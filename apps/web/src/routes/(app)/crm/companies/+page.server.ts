import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as customers from "$lib/server/customers/customers.repo"
import { pickerQuery, searchEmployees } from "$lib/server/pickers"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import type { RelationshipStatus } from "$lib/server/customers/customers.repo"

import { pageParam } from "$lib/server/db/paged"
const PAGE_SIZE = 50

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  const status = url.searchParams.get("status") as RelationshipStatus | null
  const relationshipStatus =
    status && customers.RELATIONSHIP_STATUSES.includes(status)
      ? status
      : undefined

  const page = pageParam(url)

  return withTenant(actorFrom(locals), async (tx) => {
    const { rows, total } = await customers.list(tx, {
      relationshipStatus,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
    return {
      companies: rows,
      total,
      page,
      pageSize: PAGE_SIZE,
      relationshipStatuses: customers.RELATIONSHIP_STATUSES,
      customerTypes: customers.CUSTOMER_TYPES,
      selectedStatus: relationshipStatus ?? "",
    }
  })
}

function readForm(f: FormReader) {
  return {
    customer_name: f.text("customer_name", { required: true, max: 255 }),
    customer_type: f.choice("customer_type", customers.CUSTOMER_TYPES, {
      required: true,
    }),
    relationship_status: f.choice(
      "relationship_status",
      customers.RELATIONSHIP_STATUSES,
      { required: true },
    ),
    industry: f.text("industry", { max: 100 }),
    company_size: f.text("company_size", { max: 50 }),
    website: f.text("website", { max: 255 }),
    phone: f.text("phone", { max: 20 }),
    email: f.text("email", { max: 255 }),
    notes: f.text("notes", { max: 5000 }),
    currency: f.currency("currency", { required: true }),
    account_manager_id: f.uuid("account_manager_id"),
    acquisition_source: f.text("acquisition_source", { max: 100 }),
  }
}

/**
 * A person client, captured in one form. `createIndividual` writes the
 * `customers` account and its single contact together — see the repo for why
 * a person is still two rows.
 */
function readPerson(f: FormReader) {
  return {
    first_name: f.text("first_name", { required: true, max: 100 }),
    last_name: f.text("last_name", { required: true, max: 100 }),
    // Optional on purpose: a walk-in client often has only a phone.
    email: f.text("email", { max: 255 }),
    phone: f.text("phone", { max: 20 }),
    relationship_status: f.choice(
      "relationship_status",
      customers.RELATIONSHIP_STATUSES,
      { required: true },
    ),
    currency: f.currency("currency", { required: true }),
    account_manager_id: f.uuid("account_manager_id"),
    notes: null,
  }
}

export const actions: Actions = {
  /** Backs the account-manager picker. */
  searchPeople: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchEmployees(tx, q),
    }))
  },

  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const id = f.uuid("id")
    // Only the create form carries `kind`; an edit posts the business shape.
    const isPerson =
      !id && f.choice("kind", ["person", "business"]) === "person"
    const person = isPerson ? readPerson(f) : null
    const input = isPerson ? null : readForm(f)
    if (!f.ok) {
      return fail(400, {
        ...f.problem("Some fields need attention."),
        editing: id || "new",
      })
    }

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        if (person) {
          await customers.createIndividual(tx, tenantId, {
            ...person,
            first_name: person.first_name!,
            last_name: person.last_name!,
            relationship_status: person.relationship_status!,
            currency: person.currency!,
          })
        } else if (id) await customers.update(tx, id, input!)
        else await customers.create(tx, tenantId, input!)
        return { saved: true }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

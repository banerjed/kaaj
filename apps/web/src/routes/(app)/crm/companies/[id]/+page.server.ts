import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as customers from "$lib/server/customers/customers.repo"
import * as contacts from "$lib/server/customers/customer-contacts.repo"
import * as deals from "$lib/server/crm/deals.repo"
import * as activities from "$lib/server/crm/activities.repo"
import * as pipelineStages from "$lib/server/crm/pipeline-stages.repo"
import { pickerQuery, searchEmployees } from "$lib/server/pickers"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import * as customFields from "$lib/server/custom-fields/custom-fields.repo"
import { CustomFieldWriteRefused } from "$lib/server/custom-fields/custom-fields.repo"
import {
  customFieldProblem,
  readCustomFieldValues,
} from "$lib/server/custom-fields/read-values"

const SCOPE = { entityType: "company" } as const

const ACTIVITY_PAGE_SIZE = 10
const DEAL_PAGE_SIZE = 20

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "crm.read")

  const pageParam = (name: string) =>
    Math.max(1, Number(url.searchParams.get(name)) || 1)
  const activityPage = pageParam("activities")
  const dealPage = pageParam("deals")

  return withTenant(actorFrom(locals), async (tx) => {
    const company = await customers.getById(tx, params.id)
    if (!company) error(404, "Client not found")
    const fieldValues = await customFields.valuesFor(tx, "company", [params.id])
    const people = await contacts.listForCustomer(tx, params.id)

    return {
      company,
      isPersonAccount: customers.isPersonAccount(
        company.customer_type,
        people.length,
      ),
      fieldDefs: await customFields.definitionsFor(tx, SCOPE),
      fieldValues: fieldValues[params.id] ?? [],
      contacts: people,
      deals: await deals.listForCustomer(tx, params.id, {
        limit: DEAL_PAGE_SIZE,
        offset: (dealPage - 1) * DEAL_PAGE_SIZE,
      }),
      dealPage,
      dealPageSize: DEAL_PAGE_SIZE,
      dealValue: await deals.valueByCurrencyForCustomer(tx, params.id),
      activities: await activities.listForCustomer(tx, params.id, {
        limit: ACTIVITY_PAGE_SIZE,
        offset: (activityPage - 1) * ACTIVITY_PAGE_SIZE,
      }),
      activityPage,
      activityPageSize: ACTIVITY_PAGE_SIZE,
      pipelineStages: await pipelineStages.list(tx),
      relationshipStatuses: customers.RELATIONSHIP_STATUSES,
      customerTypes: customers.CUSTOMER_TYPES,
      activityTypes: activities.ACTIVITY_TYPES,
    }
  })
}

export const actions: Actions = {
  /** Backs the account-manager and deal-owner pickers. */
  searchPeople: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchEmployees(tx, q),
    }))
  },

  save: async ({ request, params, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "crm.write")

    const data = await request.formData()
    const f = new FormReader(data)

    // `kind` says which SET OF FIELDS the browser sent — it is a fact about
    // the rendered form. It never decides which write path runs: that comes
    // from the stored `customer_type`, read inside the transaction below.
    const kind = f.choice("kind", ["person", "business"], { required: true })

    // Both branches' fields are read before the `!f.ok` gate (L33); only the
    // branch that was actually submitted carries `required`.
    const person = {
      first_name: f.text("first_name", {
        required: kind === "person",
        max: 100,
      }),
      last_name: f.text("last_name", { required: kind === "person", max: 100 }),
    }
    const input = {
      customer_name: f.text("customer_name", {
        required: kind === "business",
        max: 255,
      }),
      customer_type: f.choice("customer_type", customers.CUSTOMER_TYPES, {
        required: kind === "business",
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
    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const fieldDefs = await customFields.definitionsFor(tx, SCOPE)
        const fieldValues = readCustomFieldValues(f, data, fieldDefs)
        if (!f.ok) return fail(400, customFieldProblem(f, fieldDefs))

        const current = await customers.getById(tx, params.id)
        if (!current) error(404, "Client not found")
        const people = await contacts.listForCustomer(tx, params.id)
        const isPerson = customers.isPersonAccount(
          current.customer_type,
          people.length,
        )
        // A stale tab would otherwise run the business branch over a person,
        // leaving `customer_name` no longer derived and the account's email
        // out of step with the contact row's copy.
        if (isPerson !== (kind === "person")) {
          return fail(409, {
            message:
              "This client changed while the form was open. Reload the page and try again.",
          })
        }

        if (isPerson) {
          const updated = await customers.updateIndividual(tx, params.id, {
            first_name: person.first_name!,
            last_name: person.last_name!,
            email: input.email,
            phone: input.phone,
            relationship_status: input.relationship_status!,
            currency: input.currency!,
            account_manager_id: input.account_manager_id,
            notes: input.notes,
          })
          // A write that matched nothing must not report success (L68).
          if (!updated) error(404, "Client not found")
        } else {
          // `required` is conditional above, so the reader's type is widened;
          // the gate has already passed for the branch that was submitted.
          await customers.update(tx, params.id, {
            ...input,
            customer_name: input.customer_name!,
          })
        }
        await customFields.saveValues(
          tx,
          locals.tenantId!,
          SCOPE,
          params.id,
          fieldValues,
          ctx!.employeeId ?? ctx!.userId,
        )
        return { saved: true }
      })
    } catch (e) {
      if (e instanceof CustomFieldWriteRefused) {
        return fail(400, {
          message: "Those fields could not be saved. Reload and try again.",
        })
      }
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  addContact: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const input = {
      customer_id: params.id,
      first_name: f.text("first_name", { required: true, max: 100 }),
      last_name: f.text("last_name", { required: true, max: 100 }),
      email: f.text("email", { max: 255 }),
      phone: f.text("phone", { max: 20 }),
      title: f.text("title", { max: 100 }),
      department: f.text("department", { max: 100 }),
      is_primary: f.bool("is_primary"),
    }
    if (!f.ok) return fail(400, f.problem("Some fields need attention."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        // The page hides the button for a person account, and a hidden
        // control is not a permission (L44). A second contact would both
        // break the layout and make the client unsaveable.
        const current = await customers.getById(tx, params.id)
        if (!current) error(404, "Client not found")
        const people = await contacts.listForCustomer(tx, params.id)
        if (customers.isPersonAccount(current.customer_type, people.length)) {
          return fail(400, {
            message:
              "This client is a person, not a business — they are their own contact. Edit their details instead.",
          })
        }

        await contacts.create(tx, tenantId, input)
        return { contactAdded: true }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  addDeal: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "crm.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const input = {
      customer_id: params.id,
      customer_contact_id: f.uuid("customer_contact_id"),
      stage_id: f.uuid("stage_id", { required: true }),
      name: f.text("name", { required: true, max: 300 }),
      value_amount: f.decimal("value_amount", { scale: 2 }),
      currency: f.currency("currency"),
      probability_percent: f.integer("probability_percent", {
        min: 0,
        max: 100,
      }),
      expected_close_date: f.date("expected_close_date"),
      owner_id: f.uuid("owner_id", { required: true }),
    }
    if (!f.ok) return fail(400, f.problem("Some fields need attention."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        await deals.create(tx, tenantId, input)
        return { dealAdded: true }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  addActivity: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "crm.write")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const input = {
      customer_id: params.id,
      customer_contact_id: f.uuid("customer_contact_id"),
      deal_id: f.uuid("deal_id"),
      activity_type: f.choice("activity_type", activities.ACTIVITY_TYPES, {
        required: true,
      }),
      subject: f.text("subject", { max: 300 }),
      body: f.text("body", { max: 5000 }),
    }
    if (!f.ok) return fail(400, f.problem("Some fields need attention."))

    return withTenant(actorFrom(locals), async (tx) => {
      await activities.create(tx, tenantId, input, ctx!.employeeId ?? "")
      return { activityAdded: true }
    })
  },
}

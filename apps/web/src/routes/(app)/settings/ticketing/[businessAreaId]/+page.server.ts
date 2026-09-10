import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import * as audit from "$lib/server/audit/audit.repo"

/** /settings/ticketing/[businessAreaId] — categories, subcategories, and the default-visible member list for one business area. */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")

  return withTenant(actorFrom(locals), async (tx) => {
    const businessArea = await ticketing.businessAreaById(
      tx,
      params.businessAreaId,
    )
    if (!businessArea) error(404, "No such business area")
    const { categories, subcategories } = await ticketing.categoriesFor(
      tx,
      params.businessAreaId,
    )
    return {
      businessArea,
      categories,
      subcategories,
      members: await ticketing.businessAreaMembers(tx, params.businessAreaId),
      employees: await employees.managerOptions(tx),
      customFields: await ticketing.customFieldDefinitionsFor(
        tx,
        params.businessAreaId,
      ),
    }
  })
}

export const actions: Actions = {
  addCategory: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const name = f.text("name", { required: true, max: 255 })
    if (!f.ok) return fail(400, f.problem("Name a category."))

    try {
      await withTenant(actorFrom(locals), (tx) =>
        ticketing.createCategory(
          tx,
          tenantId,
          ctx!.employeeId ?? ctx!.userId,
          params.businessAreaId,
          name!,
        ),
      )
      return { categoryAdded: true }
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archiveCategory: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing category."))

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.archiveCategory(tx, id!),
    )
    return { categoryArchived: true }
  },

  addSubcategory: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const categoryId = f.uuid("category_id", { required: true })
    const name = f.text("name", { required: true, max: 255 })
    if (!f.ok)
      return fail(400, f.problem("Choose a category and name the subcategory."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const category = await ticketing.categoriesFor(
          tx,
          params.businessAreaId,
        )
        if (!category.categories.some((c) => c.id === categoryId)) {
          return fail(400, {
            message: "That category isn't in this business area.",
          })
        }
        await ticketing.createSubcategory(
          tx,
          tenantId,
          ctx!.employeeId ?? ctx!.userId,
          categoryId!,
          name!,
        )
        return { subcategoryAdded: true }
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archiveSubcategory: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing subcategory."))

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.archiveSubcategory(tx, id!),
    )
    return { subcategoryArchived: true }
  },

  // Default membership decides who reads every non-private ticket in this
  // area (staff_ticket_visibility) — a rights change, audited like an
  // individual ticket's assignee/subscriber grant.
  saveMembers: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const data = await request.formData()
    const memberIds = formList(data, "member_ids")

    await withTenant(actorFrom(locals), async (tx) => {
      const before = await ticketing.businessAreaMembers(
        tx,
        params.businessAreaId,
      )
      await ticketing.setBusinessAreaMembers(
        tx,
        tenantId,
        params.businessAreaId,
        memberIds,
        ctx!.employeeId ?? ctx!.userId,
      )
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "ticketing_business_area_members",
        entityId: params.businessAreaId,
        changes: {
          member_ids: {
            from: before
              .map((m) => m.employee_id)
              .sort()
              .join(","),
            to: [...memberIds].sort().join(","),
          },
        },
      })
    })
    return { membersSaved: true }
  },

  // Tier 2 customization (docs/06-customization-model.md) — configuration
  // data, not a rights or pay change, same treatment as addCategory.
  addCustomField: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId

    const data = await request.formData()
    const f = new FormReader(data)
    const label = f.text("label", { required: true, max: 255 })
    const helpText = f.text("help_text", { max: 500 })
    const dataType = f.choice("data_type", ticketing.CUSTOM_FIELD_DATA_TYPES, {
      required: true,
    })
    const isRequired = data.get("is_required") === "on"
    if (!f.ok) return fail(400, f.problem("Name the field and choose a type."))

    const options =
      dataType === "select"
        ? formList(data, "options")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((optionLabel) => ({
              value: optionLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
              label: optionLabel,
            }))
        : null
    if (dataType === "select" && (!options || options.length === 0)) {
      return fail(400, {
        errorFields: ["options"],
        message: "A select field needs at least one option.",
      })
    }

    try {
      await withTenant(actorFrom(locals), (tx) =>
        ticketing.createCustomFieldDefinition(
          tx,
          tenantId,
          params.businessAreaId,
          {
            label: label!,
            helpText,
            dataType: dataType!,
            options,
            isRequired,
          },
        ),
      )
      return { customFieldAdded: true }
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  archiveCustomField: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing field."))

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.archiveCustomFieldDefinition(tx, id!),
    )
    return { customFieldArchived: true }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import { pickerQuery, searchEmployees } from "$lib/server/pickers"
import * as groups from "$lib/server/groups/groups.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { pageOf, pageParam } from "$lib/server/db/paged"
import * as audit from "$lib/server/audit/audit.repo"
import * as customFields from "$lib/server/custom-fields/custom-fields.repo"
import { customFieldSettingsHandlers } from "$lib/server/custom-fields/settings-actions"

/** /settings/ticketing/[businessAreaId] — categories, subcategories, members, group access and custom fields for one business area. */
const MEMBER_PAGE_SIZE = 50

export const load: PageServerLoad = async ({ locals, params, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "firm.settings.read")
  const memberPage = pageParam(url, "members")

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
      members: await ticketing.businessAreaMembersPage(
        tx,
        params.businessAreaId,
        pageOf(memberPage, MEMBER_PAGE_SIZE),
      ),
      memberPage,
      memberPageSize: MEMBER_PAGE_SIZE,
      customFields: await customFields.definitionsFor(tx, {
        entityType: "ticket",
        businessAreaId: params.businessAreaId,
      }),
      groupGrants: await ticketing.businessAreaGroups(
        tx,
        params.businessAreaId,
      ),
      allGroups: await groups.listGroups(tx),
    }
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fields = customFieldSettingsHandlers(({ params }) =>
  UUID.test(params.businessAreaId ?? "")
    ? { entityType: "ticket", businessAreaId: params.businessAreaId! }
    : null,
)

export const actions: Actions = {
  /** Backs the default-viewers picker. */
  searchPeople: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.read")
    const q = pickerQuery(new FormReader(await request.formData()))
    return withTenant(actorFrom(locals), async (tx) => ({
      results: await searchEmployees(tx, q),
    }))
  },

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
  // individual ticket's assignee/subscriber grant. One person at a time: the
  // list is paged, so there is no whole list to submit.
  addMember: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const employeeId = f.uuid("employee_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const added = await withTenant(actorFrom(locals), async (tx) => {
      const changed = await ticketing.addBusinessAreaMember(
        tx,
        tenantId,
        params.businessAreaId,
        employeeId,
        ctx!.employeeId ?? ctx!.userId,
      )
      if (changed) {
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "ticketing_business_area_members",
          entityId: params.businessAreaId,
          changes: { employee_id: { from: "", to: employeeId } },
          reason: "member added",
        })
      }
      return changed
    })
    if (!added) {
      return fail(400, { message: "That person is already a member." })
    }
    return { memberAdded: true }
  },

  removeMember: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const ctx = contextFrom(locals)

    const f = new FormReader(await request.formData())
    const employeeId = f.uuid("employee_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const removed = await withTenant(actorFrom(locals), async (tx) => {
      const changed = await ticketing.removeBusinessAreaMember(
        tx,
        params.businessAreaId,
        employeeId,
      )
      if (changed) {
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "ticketing_business_area_members",
          entityId: params.businessAreaId,
          changes: { employee_id: { from: employeeId, to: "" } },
          reason: "member removed",
        })
      }
      return changed
    })
    if (!removed) {
      return fail(400, { message: "That person is no longer a member." })
    }
    return { memberRemoved: true }
  },

  // Same rights-change shape as the member actions, one level of indirection up —
  // a group granted here reads every non-private ticket in this area for
  // every current and future member (docs/28-user-groups.md).
  saveGroups: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "firm.settings.write")
    const tenantId = locals.tenantId
    const ctx = contextFrom(locals)

    const data = await request.formData()
    const groupIds = formList(data, "group_ids")

    await withTenant(actorFrom(locals), async (tx) => {
      const before = await ticketing.businessAreaGroups(
        tx,
        params.businessAreaId,
      )
      await ticketing.setBusinessAreaGroups(
        tx,
        tenantId,
        params.businessAreaId,
        groupIds,
        ctx!.employeeId ?? ctx!.userId,
      )
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "ticketing_business_area_group_grants",
        entityId: params.businessAreaId,
        changes: {
          group_ids: {
            from: before
              .map((g) => g.group_id)
              .sort()
              .join(","),
            to: [...groupIds].sort().join(","),
          },
        },
      })
    })
    return { groupsSaved: true }
  },

  addField: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.addField(event)
  },
  archiveField: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.archiveField(event)
  },
  renameCategory: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.renameCategory(event)
  },
  moveField: async (event) => {
    requireCan(contextFrom(event.locals), "firm.settings.write")
    return fields.moveField(event)
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as ticketing from "$lib/server/ticketing/ticketing.repo"
import {
  TicketingRefused,
  TICKET_STATUSES,
} from "$lib/server/ticketing/ticketing.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader, formList } from "$lib/server/forms"
import * as audit from "$lib/server/audit/audit.repo"

/** A picker (parent/link candidates) never needs the whole tenant's ticket table. */
const PICKER_LIMIT = 50

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every entry must be a real UUID shape — these feed `::uuid[]` casts, and a crafted value there is a raw Postgres 500, not a form error. */
function idList(f: FormReader, data: FormData, field: string): string[] {
  const ids = formList(data, field)
  if (ids.some((id) => !UUID_RE.test(id))) f.reject(field)
  return ids
}

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "ticketing.read.own") && !can(ctx, "ticketing.read.all")) {
    error(403, "You cannot see tickets.")
  }
  return withTenant(actorFrom(locals), async (tx) => {
    const ticket = await ticketing.ticketById(tx, params.id)
    if (!ticket) error(404, "No such ticket")
    const [
      updates,
      siblingTickets,
      linkCandidates,
      people,
      customFieldDefinitions,
      tasks,
    ] = await Promise.all([
      ticketing.ticketUpdatesSummary(tx, ticket.id),
      // Same business area only — a parent must live there (updateTicketCore
      // enforces it server-side too). Capped: a business area can still run
      // to thousands of tickets.
      ticketing.listTickets(tx, {
        businessAreaId: ticket.business_area_id,
        excludeIds: [ticket.id],
        limit: PICKER_LIMIT,
      }),
      // Cross-business-area, so unlike the parent picker this can't scope by
      // area — capped to the most recently logged tickets instead of the
      // whole tenant table (advisor note: this used to fetch every ticket).
      // Deliberately NOT excluding already-linked tickets: the template
      // merges this with `ticket.linked` so an existing link outside the
      // most-recent 50 still has an option to stay selected.
      ticketing.listTickets(tx, {
        excludeIds: [ticket.id],
        limit: PICKER_LIMIT,
      }),
      employees.managerOptions(tx),
      ticketing.customFieldDefinitionsFor(tx, ticket.business_area_id),
      ticketing.ticketTasksFor(tx, ticket.id),
    ])
    return {
      ticket,
      updates,
      customFieldDefinitions,
      tasks,
      statuses: TICKET_STATUSES,
      possibleParents: siblingTickets,
      linkCandidates,
      people,
      mayWrite:
        can(ctx, "ticketing.write.own") || can(ctx, "ticketing.write.all"),
      // Assignee grants change ticket visibility (staff_ticket_visibility) —
      // gated the same way addAssignee/removeAssignee always were.
      mayManageAssignees: can(ctx, "ticketing.write.all"),
    }
  })
}

function actorId(ctx: ReturnType<typeof contextFrom>): string {
  return ctx!.employeeId ?? ctx!.userId
}

/** Applies the diff between `before` and `after` via `add`/`remove`, both audited by the caller-supplied grant/revoke functions. Returns the changed ids for a single combined audit entry, or null if nothing moved. */
async function reconcile(
  before: Set<string>,
  after: Set<string>,
  add: (id: string) => Promise<void>,
  remove: (id: string) => Promise<void>,
): Promise<{ from: string; to: string } | null> {
  let changed = false
  for (const id of after) {
    if (!before.has(id)) {
      await add(id)
      changed = true
    }
  }
  for (const id of before) {
    if (!after.has(id)) {
      await remove(id)
      changed = true
    }
  }
  if (!changed) return null
  return { from: [...before].sort().join(","), to: [...after].sort().join(",") }
}

export const actions: Actions = {
  /**
   * The unified edit form — subject, status, due date, executive summary,
   * parent, assignees, subscribers, linked tickets, and an optional comment,
   * all in one submit. Replaces what used to be nine separate actions
   * (setStatus/setDueDate/setParent/addAssignee/removeAssignee/addSubscriber/
   * removeSubscriber/addLink/removeLink/addUpdate) so a person changing three
   * things doesn't make three round trips. An empty comment is valid — only
   * changing the due date should not require writing something.
   */
  saveTicket: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticketing.write.own")
    const tenantId = locals.tenantId
    const actor = actorId(ctx)
    const mayManageAssignees = can(ctx, "ticketing.write.all")

    const data = await request.formData()
    const f = new FormReader(data)
    const title = f.text("title", { required: true, max: 255 })
    const status = f.choice("status", TICKET_STATUSES, { required: true })
    const dueDate = f.date("due_date", { required: true })
    const externalSummary = f.html("external_summary", { max: 20000 })
    const parentId = f.uuid("parent_id")
    const content = f.html("content", { max: 20000 })
    const visibility = f.choice("visibility", ["internal", "external"], {
      required: true,
    })
    const subscriberIds = new Set(idList(f, data, "subscriber_ids"))
    const linkedIds = new Set(idList(f, data, "linked_ticket_ids"))
    const assigneeIds = mayManageAssignees
      ? new Set(idList(f, data, "assignee_ids"))
      : null
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const ticket = await ticketing.ticketById(tx, params.id)
        if (!ticket) error(404, "No such ticket")

        await ticketing.updateTicketCore(
          tx,
          params.id,
          {
            title: title!,
            status: status!,
            dueDate: dueDate!,
            externalSummary: externalSummary || null,
            parentId: parentId || null,
          },
          actor,
        )

        const subscriberChange = await reconcile(
          new Set(ticket.subscribers.map((s) => s.employee_id)),
          subscriberIds,
          (id) => ticketing.addSubscriber(tx, params.id, id, actor),
          (id) => ticketing.removeSubscriber(tx, params.id, id),
        )
        const assigneeChange = assigneeIds
          ? await reconcile(
              new Set(ticket.assignees.map((a) => a.employee_id)),
              assigneeIds,
              (id) => ticketing.addAssignee(tx, params.id, id, actor),
              (id) => ticketing.removeAssignee(tx, params.id, id),
            )
          : null
        await reconcile(
          new Set(ticket.linked.map((l) => l.id)),
          linkedIds,
          (id) => ticketing.addLink(tx, params.id, id, actor),
          (id) => ticketing.removeLink(tx, params.id, id),
        )

        // Assignee/subscriber changes are the only rights-changing part of
        // this action (staff_ticket_visibility) — title/status/due
        // date/parent stay unaudited, exactly as setStatus/setDueDate/
        // setParent were. audit.diff-shaped: only the fields that moved.
        if (assigneeChange || subscriberChange) {
          await audit.record(tx, ctx!, {
            action: "role_grant",
            entityType: "ticketing_tickets",
            entityId: params.id,
            changes: {
              ...(assigneeChange ? { assignee_ids: assigneeChange } : {}),
              ...(subscriberChange ? { subscriber_ids: subscriberChange } : {}),
            },
          })
        }

        // An editor with nothing typed can still submit markup like "<p></p>"
        // — strip tags before deciding whether there's a comment to post.
        if (content && content.replace(/<[^>]+>/g, "").trim() !== "") {
          await ticketing.addUpdate(
            tx,
            tenantId,
            params.id,
            ticket.ticket_number,
            content,
            { employeeId: actor, visibility: visibility! },
          )
        }

        return { saved: true }
      })
    } catch (e) {
      if (e instanceof TicketingRefused && e.reason === "parent_is_self") {
        return fail(400, { message: "A ticket cannot be its own parent." })
      }
      if (
        e instanceof TicketingRefused &&
        e.reason === "parent_different_business_area"
      ) {
        return fail(400, {
          message: "A parent ticket must be in the same business area.",
        })
      }
      if (e instanceof TicketingRefused) {
        return fail(400, { message: "That ticket no longer exists." })
      }
      throw e
    }
  },

  loadMoreUpdates: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "ticketing.read.own")

    const f = new FormReader(await request.formData())
    const afterId = f.uuid("after_id", { required: true })
    const beforeId = f.uuid("before_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    const middle = await withTenant(actorFrom(locals), (tx) =>
      ticketing.ticketUpdatesMiddle(tx, params.id, {
        afterId: afterId!,
        beforeId: beforeId!,
      }),
    )
    return { middle }
  },

  // Dynamic — one field per this ticket's business-area definitions, read by
  // data_type. Validated here (required, type-shape) so a crafted POST
  // hits the same rules the form does, never only the browser.
  setCustomFields: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "ticketing.write.own")
    const data = await request.formData()
    const f = new FormReader(data)

    return withTenant(actorFrom(locals), async (tx) => {
      const ticket = await ticketing.ticketById(tx, params.id)
      if (!ticket) error(404, "No such ticket")
      const defs = await ticketing.customFieldDefinitionsFor(
        tx,
        ticket.business_area_id,
      )

      const values: Record<string, string | number | boolean | null> = {}
      for (const def of defs) {
        const name = `cf_${def.field_key}`
        if (def.data_type === "boolean") {
          values[def.field_key] = data.get(name) === "on"
        } else if (def.data_type === "number") {
          values[def.field_key] = f.integer(name, {
            required: def.is_required,
          })
        } else if (def.data_type === "date") {
          values[def.field_key] = f.date(name, { required: def.is_required })
        } else if (def.data_type === "select") {
          values[def.field_key] = f.choice(
            name,
            def.options?.map((o) => o.value) ?? [],
            { required: def.is_required },
          )
        } else {
          values[def.field_key] = f.text(name, {
            required: def.is_required,
            max: 500,
          })
        }
      }
      if (!f.ok) return fail(400, f.problem())

      await ticketing.setCustomFieldValues(tx, params.id, values)
      return { customFieldsSet: true }
    })
  },

  // Tasks — not audited (register.ts): a checklist item, same shape as
  // projects/[id]::addTask/moveTask, changes nobody's money/employment/rights.
  addTask: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticketing.write.own")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const title = f.text("title", { required: true, max: 255 })
    const assigneeId = f.uuid("assignee_id")
    const dueDate = f.date("due_date")
    if (!f.ok) return fail(400, f.problem("Name the task."))

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.addTask(
        tx,
        tenantId,
        params.id,
        { title: title!, assigneeEmployeeId: assigneeId, dueDate },
        actorId(ctx),
      ),
    )
    return { taskAdded: true }
  },

  toggleTask: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticketing.write.own")
    const data = await request.formData()
    const f = new FormReader(data)
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.setTaskDone(
        tx,
        id!,
        data.get("is_done") === "true",
        actorId(ctx),
      ),
    )
    return { taskToggled: true }
  },

  archiveTask: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "ticketing.write.own")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    await withTenant(actorFrom(locals), (tx) => ticketing.archiveTask(tx, id!))
    return { taskArchived: true }
  },
}

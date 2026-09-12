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
import { FormReader, formList, formString } from "$lib/server/forms"
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
    // Parent/linked-ticket candidates are no longer preloaded here: the
    // `Combobox` pickers search on demand via `?/searchTickets`, and the
    // ticket's OWN current parent/links already arrive on `ticket` itself
    // (ticketById), so there's no "merge the current value back into a
    // capped candidate list" step to do — unlike a plain `<select>`, a
    // Combobox's selected item doesn't need to appear in its own options.
    const [updates, people, customFieldDefinitions, tasks, referenceLinks] =
      await Promise.all([
        ticketing.ticketUpdatesSummary(tx, ticket.id),
        employees.managerOptions(tx),
        ticketing.customFieldDefinitionsFor(tx, ticket.business_area_id),
        ticketing.ticketTasksFor(tx, ticket.id),
        ticketing.referenceLinksFor(tx, ticket.id),
      ])
    return {
      ticket,
      updates,
      customFieldDefinitions,
      tasks,
      referenceLinks,
      statuses: TICKET_STATUSES,
      // A value, not a type — `updatesMiddlePageSize` has to travel through
      // `load`'s return rather than a direct import, since a `+page.svelte`
      // may only import a `$lib/server/*` VALUE if it's erased at compile
      // time (`import type`); this one is read at runtime to size a page.
      updatesMiddlePageSize: ticketing.UPDATES_MIDDLE_PAGE_SIZE,
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
    const isPrivate = f.bool("private")
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const ticket = await ticketing.ticketById(tx, params.id)
        if (!ticket) error(404, "No such ticket")

        const { before } = await ticketing.updateTicketCore(
          tx,
          params.id,
          {
            title: title!,
            status: status!,
            dueDate: dueDate!,
            externalSummary: externalSummary || null,
            parentId: parentId || null,
            isPrivate,
          },
          actor,
        )
        const privateChange =
          before.private !== isPrivate
            ? { from: String(before.private), to: String(isPrivate) }
            : null

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

        // Assignee/subscriber changes, and flipping `private`, are the only
        // rights-changing parts of this action (staff_ticket_visibility) —
        // title/status/due date/parent stay unaudited, exactly as
        // setStatus/setDueDate/setParent were. audit.diff-shaped: only the
        // fields that moved.
        if (assigneeChange || subscriberChange || privateChange) {
          await audit.record(tx, ctx!, {
            action: "role_grant",
            entityType: "ticketing_tickets",
            entityId: params.id,
            changes: {
              ...(assigneeChange ? { assignee_ids: assigneeChange } : {}),
              ...(subscriberChange ? { subscriber_ids: subscriberChange } : {}),
              ...(privateChange ? { private: privateChange } : {}),
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

  /**
   * Backs the Parent/Linked-tickets `Combobox` (item 2): the picker options
   * shipped by `load` are capped at `PICKER_LIMIT` most-recently-logged, so
   * an autocomplete that only ever searched THAT list would report "no
   * results" for a real ticket sitting just outside it. This runs the same
   * `listTickets` query the picker's default list uses, but scoped to
   * whatever was actually typed.
   */
  searchTickets: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "ticketing.read.own")
    const data = await request.formData()
    const scope = formString(data, "scope") === "parent" ? "parent" : "link"
    const q = formString(data, "q")

    return withTenant(actorFrom(locals), async (tx) => {
      const ticket = await ticketing.ticketById(tx, params.id)
      if (!ticket) error(404, "No such ticket")
      const rows = await ticketing.listTickets(tx, {
        businessAreaId:
          scope === "parent" ? ticket.business_area_id : undefined,
        excludeIds: [ticket.id],
        search: q || undefined,
        limit: PICKER_LIMIT,
      })
      return {
        results: rows.map((t) => ({
          id: t.id,
          label: `${t.ticket_number} — ${t.title}`,
          sublabel: t.status,
        })),
      }
    })
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

    // Named task_title, not title — the unified edit form above has a field
    // by that exact name, and a shared `form` prop means a collision here
    // would highlight (or auto-open) the WRONG form on a refusal.
    const f = new FormReader(await request.formData())
    const title = f.text("task_title", { required: true, max: 255 })
    if (!f.ok) return fail(400, f.problem("Name the task."))

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.addTask(
        tx,
        tenantId,
        params.id,
        { title: title! },
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

  // Reference links — not audited (register.ts): a pasted URL, same
  // reasoning as addTask/archiveTask.
  addReferenceLink: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "ticketing.write.own")
    const tenantId = locals.tenantId

    const f = new FormReader(await request.formData())
    const label = f.text("link_label", { required: true, max: 255 })
    const url = f.text("link_url", { required: true, max: 2048 })
    // http(s) only — this becomes a real <a href>, and a javascript:/data:
    // scheme there is a stored-XSS vector, not a cosmetic validation nicety.
    if (url && !/^https?:\/\//i.test(url)) f.reject("link_url")
    if (!f.ok) return fail(400, f.problem("Give the link a label and a URL."))

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.addReferenceLink(
        tx,
        tenantId,
        params.id,
        { label: label!, url: url! },
        actorId(ctx),
      ),
    )
    return { linkAdded: true }
  },

  archiveReferenceLink: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "ticketing.write.own")
    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    await withTenant(actorFrom(locals), (tx) =>
      ticketing.archiveReferenceLink(tx, id!),
    )
    return { linkArchived: true }
  },
}

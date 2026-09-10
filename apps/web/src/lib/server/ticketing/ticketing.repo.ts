import type { Tx } from "../db/tenant"
import { sanitizeRichText } from "../rich-text"

/**
 * Tickets — one repository, two callers. Staff and portal routes both read
 * and write through these functions; RLS (app.is_portal_contact() /
 * app.current_customer_id() for the portal, app.reads_all_tickets() /
 * business-area membership for staff — 20260905090000 and
 * 20260909120000_ticketing_visibility.sql) is what actually separates what
 * each caller can see, the same principle as receivables and payables
 * sharing one postJournal.
 */

/**
 * What a ticket's status may be. Plain `text` with no CHECK behind it, so
 * this list IS the constraint (L57).
 */
export const TICKET_STATUSES = [
  "open",
  "active",
  "awaiting_response",
  "suspended",
  "duplicate",
  "closed",
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export class TicketingRefused extends Error {
  constructor(
    readonly reason:
      | "no_such_ticket"
      | "no_such_business_area"
      | "no_such_category"
      | "not_portal_visible"
      | "parent_different_business_area"
      | "parent_is_self",
    readonly detail?: string,
  ) {
    super(reason)
    this.name = "TicketingRefused"
  }
}

export type BusinessAreaRow = {
  id: string
  prefix: string
  name: string
  portal_visible: boolean
}

export async function businessAreas(
  tx: Tx,
  filters: { portalVisibleOnly?: boolean } = {},
): Promise<BusinessAreaRow[]> {
  const { portalVisibleOnly = false } = filters
  return tx<BusinessAreaRow[]>`
    SELECT id, prefix, name,
           coalesce(settings->>'portalVisible', 'false') = 'true' AS portal_visible
      FROM ticketing_business_areas
     WHERE is_active
       AND (${portalVisibleOnly} = FALSE
            OR coalesce(settings->>'portalVisible', 'false') = 'true')
     ORDER BY name
  `
}

export type CategoryRow = { id: string; name: string; is_active: boolean }
export type SubcategoryRow = CategoryRow & { category_id: string }

/** For a filter bar or a create/edit form — every category in the area, and every subcategory under any of them. */
export async function categoriesFor(
  tx: Tx,
  businessAreaId: string,
): Promise<{ categories: CategoryRow[]; subcategories: SubcategoryRow[] }> {
  const categories = await tx<CategoryRow[]>`
    SELECT id, name, is_active FROM ticketing_categories
     WHERE business_area_id = ${businessAreaId}::uuid
     ORDER BY name
  `
  const subcategories = await tx<SubcategoryRow[]>`
    SELECT s.id, s.name, s.is_active, s.category_id
      FROM ticketing_subcategories s
      JOIN ticketing_categories c ON c.id = s.category_id
     WHERE c.business_area_id = ${businessAreaId}::uuid
     ORDER BY s.name
  `
  return { categories, subcategories }
}

export type TicketRow = {
  id: string
  ticket_number: string
  business_area_name: string | null
  title: string
  category_name: string
  subcategory_name: string | null
  status: string
  priority: string | null
  severity: string
  due_date: string | null
  logged_at: Date
  customer_name: string | null
  reported_by_name: string | null
  /** Whether the reporter is a portal contact rather than staff. */
  is_portal: boolean
  assignee_count: number
}

const TICKET_COLUMNS = `
  t.id, t.ticket_number,
  ba.name AS business_area_name,
  t.title, cat.name AS category_name, sub.name AS subcategory_name,
  t.status, t.priority, t.severity,
  to_char(t.due_date,'YYYY-MM-DD') AS due_date,
  t.logged_at,
  c.customer_name,
  coalesce(t.reported_by_name,
            e.first_name || ' ' || e.last_name) AS reported_by_name,
  (t.logger_contact_id IS NOT NULL) AS is_portal,
  (SELECT count(*)::int FROM ticketing_ticket_assignees a WHERE a.ticket_id = t.id AND a.is_active) AS assignee_count
`

const TICKET_FROM = `
    FROM ticketing_tickets t
    LEFT JOIN ticketing_business_areas ba ON ba.id = t.business_area_id
    LEFT JOIN ticketing_categories cat    ON cat.id = t.category_id
    LEFT JOIN ticketing_subcategories sub ON sub.id = t.subcategory_id
    LEFT JOIN customers c               ON c.id = t.customer_id
    LEFT JOIN employees e               ON e.id = t.logger_employee_id
`

const TICKET_SELECT = `SELECT ${TICKET_COLUMNS}${TICKET_FROM}`

export type TicketFilters = {
  businessAreaId?: string
  categoryId?: string
  subcategoryId?: string
  status?: string
  loggerEmployeeId?: string
  assigneeEmployeeId?: string
  subscriberEmployeeId?: string
  /** Matches subject or any update's text (search_vector, both already indexed), or the ticket number directly — search_vector doesn't tokenize "IT-0002" usefully, and a picker's most common query is the number itself. */
  search?: string
  /** Set for `ticketing.read.own` — only tickets this employee raised or is assigned/subscribed to. */
  ownedByEmployeeId?: string
  /** Ticket ids to exclude — a picker excluding the ticket being edited and, for links, ones already linked. */
  excludeIds?: string[]
  /** Caps the row count — a picker (parent/link candidates) never needs the whole table, and the list page paginates with it. */
  limit?: number
  offset?: number
}

function ticketFilterClause(filters: TicketFilters) {
  const businessAreaId = filters.businessAreaId || null
  const categoryId = filters.categoryId || null
  const subcategoryId = filters.subcategoryId || null
  const status = filters.status ?? ""
  const loggerId = filters.loggerEmployeeId || null
  const assigneeId = filters.assigneeEmployeeId || null
  const subscriberId = filters.subscriberEmployeeId || null
  const search = filters.search?.trim() || ""
  const ownedBy = filters.ownedByEmployeeId || null
  const excludeIds = filters.excludeIds ?? []
  return {
    businessAreaId,
    categoryId,
    subcategoryId,
    status,
    loggerId,
    assigneeId,
    subscriberId,
    search,
    ownedBy,
    excludeIds,
  }
}

export async function listTickets(
  tx: Tx,
  filters: TicketFilters = {},
): Promise<TicketRow[]> {
  const {
    businessAreaId,
    categoryId,
    subcategoryId,
    status,
    loggerId,
    assigneeId,
    subscriberId,
    search,
    ownedBy,
    excludeIds,
  } = ticketFilterClause(filters)
  const limit = filters.limit ?? null
  const offset = filters.offset ?? 0
  return tx<TicketRow[]>`
    ${tx.unsafe(TICKET_SELECT)}
     WHERE (${businessAreaId}::uuid IS NULL OR t.business_area_id = ${businessAreaId}::uuid)
       AND (${categoryId}::uuid IS NULL OR t.category_id = ${categoryId}::uuid)
       AND (${subcategoryId}::uuid IS NULL OR t.subcategory_id = ${subcategoryId}::uuid)
       AND (${status} = '' OR t.status = ${status})
       AND (${loggerId}::uuid IS NULL OR t.logger_employee_id = ${loggerId}::uuid)
       AND (${assigneeId}::uuid IS NULL OR EXISTS (
              SELECT 1 FROM ticketing_ticket_assignees a
               WHERE a.ticket_id = t.id AND a.employee_id = ${assigneeId}::uuid AND a.is_active))
       AND (${subscriberId}::uuid IS NULL OR EXISTS (
              SELECT 1 FROM ticketing_ticket_subscribers s
               WHERE s.ticket_id = t.id AND s.employee_id = ${subscriberId}::uuid AND s.is_active))
       AND (${search} = '' OR t.search_vector @@ plainto_tsquery('simple', ${search}) OR t.ticket_number ILIKE ${"%" + search + "%"})
       AND (${ownedBy}::uuid IS NULL
            OR t.logger_employee_id = ${ownedBy}::uuid
            OR EXISTS (SELECT 1 FROM ticketing_ticket_assignees a
                        WHERE a.ticket_id = t.id AND a.employee_id = ${ownedBy}::uuid AND a.is_active)
            OR EXISTS (SELECT 1 FROM ticketing_ticket_subscribers s
                        WHERE s.ticket_id = t.id AND s.employee_id = ${ownedBy}::uuid AND s.is_active))
       AND (${excludeIds.length === 0} OR NOT (t.id = ANY(${excludeIds}::uuid[])))
     ORDER BY t.logged_at DESC
     ${limit === null ? tx`` : tx`LIMIT ${limit} OFFSET ${offset}`}
  `
}

/** The total matching a filter set — same predicates as `listTickets`, for the list page's pagination controls. */
export async function countTickets(
  tx: Tx,
  filters: TicketFilters = {},
): Promise<number> {
  const {
    businessAreaId,
    categoryId,
    subcategoryId,
    status,
    loggerId,
    assigneeId,
    subscriberId,
    search,
    ownedBy,
  } = ticketFilterClause(filters)
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM ticketing_tickets t
     WHERE (${businessAreaId}::uuid IS NULL OR t.business_area_id = ${businessAreaId}::uuid)
       AND (${categoryId}::uuid IS NULL OR t.category_id = ${categoryId}::uuid)
       AND (${subcategoryId}::uuid IS NULL OR t.subcategory_id = ${subcategoryId}::uuid)
       AND (${status} = '' OR t.status = ${status})
       AND (${loggerId}::uuid IS NULL OR t.logger_employee_id = ${loggerId}::uuid)
       AND (${assigneeId}::uuid IS NULL OR EXISTS (
              SELECT 1 FROM ticketing_ticket_assignees a
               WHERE a.ticket_id = t.id AND a.employee_id = ${assigneeId}::uuid AND a.is_active))
       AND (${subscriberId}::uuid IS NULL OR EXISTS (
              SELECT 1 FROM ticketing_ticket_subscribers s
               WHERE s.ticket_id = t.id AND s.employee_id = ${subscriberId}::uuid AND s.is_active))
       AND (${search} = '' OR t.search_vector @@ plainto_tsquery('simple', ${search}) OR t.ticket_number ILIKE ${"%" + search + "%"})
       AND (${ownedBy}::uuid IS NULL
            OR t.logger_employee_id = ${ownedBy}::uuid
            OR EXISTS (SELECT 1 FROM ticketing_ticket_assignees a
                        WHERE a.ticket_id = t.id AND a.employee_id = ${ownedBy}::uuid AND a.is_active)
            OR EXISTS (SELECT 1 FROM ticketing_ticket_subscribers s
                        WHERE s.ticket_id = t.id AND s.employee_id = ${ownedBy}::uuid AND s.is_active))
  `
  return n
}

export type PersonRow = { employee_id: string; name: string }

/** A cross-reference to another ticket — carries `status` so the UI can grey out/strike a closed one, never re-fetched separately. */
export type TicketRef = {
  id: string
  ticket_number: string
  title: string
  status: string
}

export type TicketDetail = TicketRow & {
  description: string | null
  external_summary: string | null
  internal_summary: string | null
  business_area_id: string
  category_id: string
  subcategory_id: string | null
  private: boolean
  parent_ticket_id: string | null
  parent_ticket_number: string | null
  parent_ticket_title: string | null
  parent_ticket_status: string | null
  assignees: PersonRow[]
  subscribers: PersonRow[]
  linked: TicketRef[]
  children: TicketRef[]
  /** Keyed by field_key — pair with `customFieldDefinitionsFor(business_area_id)` to render. */
  custom_fields: Record<string, string | number | boolean | null>
}

/** Sanitized again on the way out — defense in depth for any row a `RichTextEditor` didn't write (fixtures, a future direct SQL insert). */
export async function ticketById(
  tx: Tx,
  id: string,
): Promise<TicketDetail | null> {
  const [row] = await tx<
    (TicketRow & {
      description: string | null
      external_summary: string | null
      internal_summary: string | null
      business_area_id: string
      category_id: string
      subcategory_id: string | null
      private: boolean
      parent_ticket_id: string | null
      parent_ticket_number: string | null
      parent_ticket_title: string | null
      parent_ticket_status: string | null
      custom_fields: Record<string, string | number | boolean | null>
    })[]
  >`
    SELECT ${tx.unsafe(TICKET_COLUMNS)},
           t.description, t.external_summary, t.internal_summary,
           t.business_area_id, t.category_id, t.subcategory_id, t.private,
           t.parent_ticket_id, p.ticket_number AS parent_ticket_number,
           p.title AS parent_ticket_title, p.status AS parent_ticket_status,
           coalesce(t.custom_fields, '{}'::jsonb) AS custom_fields
    ${tx.unsafe(TICKET_FROM)}
    LEFT JOIN ticketing_tickets p ON p.id = t.parent_ticket_id
     WHERE t.id = ${id}::uuid
  `
  if (!row) return null

  const [assignees, subscribers, linked, children] = await Promise.all([
    tx<PersonRow[]>`
      SELECT a.employee_id, e.first_name || ' ' || e.last_name AS name
        FROM ticketing_ticket_assignees a
        JOIN employees e ON e.id = a.employee_id
       WHERE a.ticket_id = ${id}::uuid AND a.is_active
       ORDER BY name
    `,
    tx<PersonRow[]>`
      SELECT s.employee_id, e.first_name || ' ' || e.last_name AS name
        FROM ticketing_ticket_subscribers s
        JOIN employees e ON e.id = s.employee_id
       WHERE s.ticket_id = ${id}::uuid AND s.is_active
       ORDER BY name
    `,
    tx<TicketRef[]>`
      SELECT lt.id, lt.ticket_number, lt.title, lt.status
        FROM ticketing_ticket_links l
        JOIN ticketing_tickets lt
          ON lt.id = (CASE WHEN l.ticket_id = ${id}::uuid THEN l.linked_ticket_id ELSE l.ticket_id END)
       WHERE (l.ticket_id = ${id}::uuid OR l.linked_ticket_id = ${id}::uuid) AND l.is_active
       ORDER BY lt.ticket_number
    `,
    tx<TicketRef[]>`
      SELECT id, ticket_number, title, status
        FROM ticketing_tickets
       WHERE parent_ticket_id = ${id}::uuid
       ORDER BY ticket_number
    `,
  ])

  return {
    ...row,
    description: row.description && sanitizeRichText(row.description),
    external_summary:
      row.external_summary && sanitizeRichText(row.external_summary),
    internal_summary:
      row.internal_summary && sanitizeRichText(row.internal_summary),
    assignees,
    subscribers,
    linked,
    children,
  }
}

export type TicketUpdateRow = {
  id: string
  author_name: string | null
  content_text: string | null
  visibility: string | null
  created_at: Date
}

const UPDATE_SELECT = `
  SELECT u.id,
         coalesce(u.author_name, e.first_name || ' ' || e.last_name,
                  cc.first_name || ' ' || cc.last_name) AS author_name,
         u.content_text, u.visibility, u.created_at
    FROM ticketing_updates u
    LEFT JOIN employees e         ON e.id = u.author_employee_id
    LEFT JOIN customer_contacts cc ON cc.id = u.author_contact_id
`

/**
 * The full thread, oldest first — for the portal reply view, where a
 * customer's own ticket runs to a handful of updates, not hundreds. The
 * staff detail page uses `ticketUpdatesSummary`/`ticketUpdatesMiddle`
 * instead; this stays the simple case for the caller that doesn't need it.
 */
export async function ticketUpdates(
  tx: Tx,
  ticketId: string,
): Promise<TicketUpdateRow[]> {
  const rows = await tx<TicketUpdateRow[]>`
    ${tx.unsafe(UPDATE_SELECT)}
     WHERE u.ticket_id = ${ticketId}::uuid
     ORDER BY u.created_at
  `
  return sanitizeUpdates(rows)
}

function sanitizeUpdates(rows: TicketUpdateRow[]): TicketUpdateRow[] {
  return rows.map((r) => ({
    ...r,
    content_text: r.content_text && sanitizeRichText(r.content_text),
  }))
}

/**
 * The efficient view of a ticket's updates: never the full set. Newest 3,
 * the very first, and a total count — the collapsed middle
 * (`ticketUpdatesMiddle`) is a separate, paginated round trip on expand.
 * Internal updates are already filtered out for a portal contact by RLS —
 * never re-checked here.
 */
export async function ticketUpdatesSummary(
  tx: Tx,
  ticketId: string,
): Promise<{
  total: number
  latest: TicketUpdateRow[]
  first: TicketUpdateRow | null
}> {
  const [{ n: total }] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ticketing_updates WHERE ticket_id = ${ticketId}::uuid
  `
  if (total === 0) return { total: 0, latest: [], first: null }

  const latest = await tx<TicketUpdateRow[]>`
    ${tx.unsafe(UPDATE_SELECT)}
     WHERE u.ticket_id = ${ticketId}::uuid
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT 3
  `
  const [first] = await tx<TicketUpdateRow[]>`
    ${tx.unsafe(UPDATE_SELECT)}
     WHERE u.ticket_id = ${ticketId}::uuid
     ORDER BY u.created_at ASC, u.id ASC
     LIMIT 1
  `

  // At small totals "latest 3" and "first" overlap — de-dupe by id so the
  // opening update never renders twice.
  const seen = new Set(latest.map((r) => r.id))
  return {
    total,
    latest: sanitizeUpdates(latest),
    first: seen.has(first.id) ? null : sanitizeUpdates([first])[0],
  }
}

/** Every page of the hidden middle is this many rows — shared with the client so the "did that exhaust it" check in `+page.svelte` can't drift from what the server actually paginates by. */
export const UPDATES_MIDDLE_PAGE_SIZE = 20

/**
 * The collapsed middle, most-recent-of-the-hidden-range first, paginated —
 * never the whole set at once (item 6: the feed reads newest-to-oldest
 * throughout, so the hidden section must too, not just the top 3).
 * `afterId` is the fixed floor (the ticket's opening update); `beforeId` is
 * the moving cursor, starting at the boundary of the visible "latest 3" and
 * walking backward in time one page at a time.
 *
 * The WHERE clause compares the full `(created_at, id)` pair, matching the
 * ORDER BY tiebreak — comparing `created_at` alone would drop or repeat rows
 * that share a timestamp (the fixture has several, e.g. the bulk-generated
 * IT-0004 updates).
 */
export async function ticketUpdatesMiddle(
  tx: Tx,
  ticketId: string,
  opts: { afterId: string; beforeId: string; limit?: number },
): Promise<TicketUpdateRow[]> {
  const limit = opts.limit ?? UPDATES_MIDDLE_PAGE_SIZE
  const rows = await tx<TicketUpdateRow[]>`
    ${tx.unsafe(UPDATE_SELECT)}
     WHERE u.ticket_id = ${ticketId}::uuid
       AND (u.created_at, u.id) > (SELECT created_at, id FROM ticketing_updates WHERE id = ${opts.afterId}::uuid)
       AND (u.created_at, u.id) < (SELECT created_at, id FROM ticketing_updates WHERE id = ${opts.beforeId}::uuid)
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT ${limit}
  `
  return sanitizeUpdates(rows)
}

/** Who is creating this ticket — exactly one of the two, mirrors tenant_users. */
export type Logger =
  { employeeId: string } | { contactId: string; customerId: string }

async function nextTicketNumber(
  tx: Tx,
  tenantId: string,
  businessAreaId: string,
): Promise<{ ticketNumber: string; prefix: string; sequence: number }> {
  const [area] = await tx<{ prefix: string; next: number }[]>`
    UPDATE ticketing_business_areas
       SET current_sequence = current_sequence + 1
     WHERE id = ${businessAreaId}::uuid AND tenant_id = ${tenantId}::uuid
    RETURNING prefix, current_sequence AS next
  `
  if (!area) throw new TicketingRefused("no_such_business_area")
  return {
    ticketNumber: `${area.prefix}-${String(area.next).padStart(4, "0")}`,
    prefix: area.prefix,
    sequence: area.next,
  }
}

export async function createTicket(
  tx: Tx,
  tenantId: string,
  input: {
    businessAreaId: string
    title: string
    description: string
    categoryId: string
    subcategoryId: string | null
    dueDate: string
  },
  logger: Logger,
): Promise<{ id: string; ticketNumber: string }> {
  if ("contactId" in logger) {
    const [area] = await tx<{ ok: boolean }[]>`
      SELECT coalesce(settings->>'portalVisible', 'false') = 'true' AS ok
        FROM ticketing_business_areas WHERE id = ${input.businessAreaId}::uuid
    `
    if (!area) throw new TicketingRefused("no_such_business_area")
    if (!area.ok) throw new TicketingRefused("not_portal_visible")
  }

  const [category] = await tx<{ ok: boolean }[]>`
    SELECT TRUE AS ok FROM ticketing_categories
     WHERE id = ${input.categoryId}::uuid AND business_area_id = ${input.businessAreaId}::uuid
  `
  if (!category) throw new TicketingRefused("no_such_category")

  const { ticketNumber, prefix, sequence } = await nextTicketNumber(
    tx,
    tenantId,
    input.businessAreaId,
  )

  const loggerEmployeeId = "employeeId" in logger ? logger.employeeId : null
  const loggerContactId = "contactId" in logger ? logger.contactId : null
  const customerId = "customerId" in logger ? logger.customerId : null
  const lastUpdatedBy =
    "employeeId" in logger ? logger.employeeId : logger.contactId

  // Denormalized at write time, not resolved via a join at read time — a
  // portal contact's name would otherwise need to survive a JOIN into
  // customer_contacts on every staff list render, and an employee's name a
  // JOIN a portal viewer can never see past the employees table's own RLS.
  let reportedByName: string | null = null
  let reportedByEmail: string | null = null
  if ("contactId" in logger) {
    const [contact] = await tx<
      { first_name: string; last_name: string; email: string }[]
    >`
      SELECT first_name, last_name, email FROM customer_contacts WHERE id = ${logger.contactId}::uuid
    `
    if (contact) {
      reportedByName = `${contact.first_name} ${contact.last_name}`
      reportedByEmail = contact.email
    }
  }

  const [ticket] = await tx<{ id: string }[]>`
    INSERT INTO ticketing_tickets (
      tenant_id, business_area_id, ticket_number, prefix, sequence_number,
      title, subject, description, category_id, subcategory_id, status,
      severity, due_date, logged_at, updated_at, logger_employee_id,
      logger_contact_id, customer_id, last_updated_by, reported_by_name,
      reported_by_email
    ) VALUES (
      ${tenantId}::uuid, ${input.businessAreaId}::uuid, ${ticketNumber}, ${prefix}, ${sequence},
      ${input.title}, ${input.title}, ${input.description},
      ${input.categoryId}::uuid, ${input.subcategoryId}::uuid, 'open', 'medium',
      ${input.dueDate}::date,
      now(), now(), ${loggerEmployeeId}::uuid, ${loggerContactId}::uuid,
      ${customerId}::uuid, ${lastUpdatedBy}, ${reportedByName}, ${reportedByEmail}
    )
    RETURNING id
  `
  return { id: ticket.id, ticketNumber }
}

/** Who is authoring this update. A portal contact's update is always external — enforced by RLS on INSERT, not re-checked here. */
export type Author =
  | { employeeId: string; visibility: "internal" | "external" }
  | { contactId: string }

export async function addUpdate(
  tx: Tx,
  tenantId: string,
  ticketId: string,
  ticketNumber: string,
  content: string,
  author: Author,
): Promise<void> {
  const authorEmployeeId = "employeeId" in author ? author.employeeId : null
  const authorContactId = "contactId" in author ? author.contactId : null
  const authorId = authorEmployeeId ?? authorContactId
  const visibility = "employeeId" in author ? author.visibility : "external"

  // Denormalized at write time — a portal viewer's own RLS on `employees`
  // would otherwise blank out the name of any staff member who replied.
  let authorName: string | null = null
  if (authorEmployeeId) {
    const [employee] = await tx<{ first_name: string; last_name: string }[]>`
      SELECT first_name, last_name FROM employees WHERE id = ${authorEmployeeId}::uuid
    `
    if (employee) authorName = `${employee.first_name} ${employee.last_name}`
  } else if (authorContactId) {
    const [contact] = await tx<{ first_name: string; last_name: string }[]>`
      SELECT first_name, last_name FROM customer_contacts WHERE id = ${authorContactId}::uuid
    `
    if (contact) authorName = `${contact.first_name} ${contact.last_name}`
  }

  await tx`
    INSERT INTO ticketing_updates (
      tenant_id, ticket_id, ticket_number, update_type,
      author_id, author_employee_id, author_contact_id, author_name,
      content_text, comment_text, visibility, is_internal, created_at
    ) VALUES (
      ${tenantId}::uuid, ${ticketId}::uuid, ${ticketNumber}, 'comment',
      ${authorId}::uuid, ${authorEmployeeId}::uuid, ${authorContactId}::uuid, ${authorName},
      ${content}, ${content}, ${visibility}, ${visibility === "internal"}, now()
    )
  `
  await tx`
    UPDATE ticketing_tickets
       SET updated_at = now(), last_updated_by = ${authorId}
     WHERE id = ${ticketId}::uuid
  `
}

export type TicketCoreBefore = {
  title: string
  status: string
  due_date: string | null
  external_summary: string | null
  parent_ticket_id: string | null
}

/**
 * Every plain ticket field the unified edit form on `/ticketing/[id]` can
 * change, applied in one UPDATE — replaces what used to be three separate
 * actions (setStatus/setDueDate/setParent). `resolved_at`/`closed_at` only
 * move when status is actually CHANGING (`status IS DISTINCT FROM`) — the old
 * per-action setStatus only ran on a deliberate status edit, so a save that
 * merely touches the due date must not re-stamp resolved_at on an already-
 * closed ticket. The vocabulary has no separate "resolved" step anymore
 * (TICKET_STATUSES) — `closed` is the one completion state, so both columns
 * stamp together on the move to it; `resolved_at` is kept rather than
 * dropped so any existing reader of "time to resolution" (the fixture's SLA
 * check among them) still gets a value.
 */
export async function updateTicketCore(
  tx: Tx,
  ticketId: string,
  input: {
    title: string
    status: TicketStatus
    dueDate: string
    externalSummary: string | null
    parentId: string | null
  },
  actorId: string,
): Promise<{ before: TicketCoreBefore }> {
  if (input.parentId) {
    const problem = await parentWouldBeInvalid(tx, ticketId, input.parentId)
    if (problem === "self") throw new TicketingRefused("parent_is_self")
    if (problem === "different_business_area") {
      throw new TicketingRefused("parent_different_business_area")
    }
  }

  const [before] = await tx<TicketCoreBefore[]>`
    SELECT title, status, to_char(due_date, 'YYYY-MM-DD') AS due_date,
           external_summary, parent_ticket_id
      FROM ticketing_tickets WHERE id = ${ticketId}::uuid
  `
  if (!before) throw new TicketingRefused("no_such_ticket")

  await tx`
    UPDATE ticketing_tickets
       SET title = ${input.title}, subject = ${input.title},
           status = ${input.status},
           resolved_at = CASE WHEN ${input.status} = 'closed' AND status IS DISTINCT FROM ${input.status} THEN now() ELSE resolved_at END,
           closed_at   = CASE WHEN ${input.status} = 'closed'   AND status IS DISTINCT FROM ${input.status} THEN now() ELSE closed_at   END,
           due_date = ${input.dueDate}::date,
           external_summary = ${input.externalSummary},
           parent_ticket_id = ${input.parentId}::uuid,
           updated_at = now(), last_updated_by = ${actorId}
     WHERE id = ${ticketId}::uuid
  `
  return { before }
}

// -----------------------------------------------------------------------------
// People — assignees, subscribers, parent, links. Each of these changes who
// may READ the ticket (subscribers directly, via staff_ticket_visibility;
// assignees the same way) as well as who's on the hook for it, so every one
// of these is an audited action (audit/register.ts) — not the exemption the
// ticket's own comment/status-change actions get.
// -----------------------------------------------------------------------------

export async function addAssignee(
  tx: Tx,
  ticketId: string,
  employeeId: string,
  actorId: string,
): Promise<void> {
  // ON CONFLICT reactivates rather than colliding — the app cannot DELETE
  // (20260830120000_append_only.sql), so a prior removal left the row behind
  // with is_active = FALSE.
  await tx`
    INSERT INTO ticketing_ticket_assignees (tenant_id, ticket_id, employee_id, added_by)
    SELECT tenant_id, id, ${employeeId}::uuid, ${actorId}
      FROM ticketing_tickets WHERE id = ${ticketId}::uuid
    ON CONFLICT (tenant_id, ticket_id, employee_id)
    DO UPDATE SET is_active = TRUE, added_at = now(), added_by = EXCLUDED.added_by
  `
}

export async function removeAssignee(
  tx: Tx,
  ticketId: string,
  employeeId: string,
): Promise<void> {
  await tx`
    UPDATE ticketing_ticket_assignees SET is_active = FALSE
     WHERE ticket_id = ${ticketId}::uuid AND employee_id = ${employeeId}::uuid
  `
}

export async function addSubscriber(
  tx: Tx,
  ticketId: string,
  employeeId: string,
  actorId: string,
): Promise<void> {
  await tx`
    INSERT INTO ticketing_ticket_subscribers (tenant_id, ticket_id, employee_id, added_by)
    SELECT tenant_id, id, ${employeeId}::uuid, ${actorId}
      FROM ticketing_tickets WHERE id = ${ticketId}::uuid
    ON CONFLICT (tenant_id, ticket_id, employee_id)
    DO UPDATE SET is_active = TRUE, added_at = now(), added_by = EXCLUDED.added_by
  `
}

export async function removeSubscriber(
  tx: Tx,
  ticketId: string,
  employeeId: string,
): Promise<void> {
  await tx`
    UPDATE ticketing_ticket_subscribers SET is_active = FALSE
     WHERE ticket_id = ${ticketId}::uuid AND employee_id = ${employeeId}::uuid
  `
}

/** Would setting `parentId` as ticketId's parent be invalid — a different business area, or itself? */
export async function parentWouldBeInvalid(
  tx: Tx,
  ticketId: string,
  parentId: string,
): Promise<"different_business_area" | "self" | null> {
  if (ticketId === parentId) return "self"
  const [rows] = await tx<{ ticket_ba: string; parent_ba: string }[]>`
    SELECT
      (SELECT business_area_id FROM ticketing_tickets WHERE id = ${ticketId}::uuid) AS ticket_ba,
      (SELECT business_area_id FROM ticketing_tickets WHERE id = ${parentId}::uuid) AS parent_ba
  `
  if (!rows || rows.ticket_ba !== rows.parent_ba)
    return "different_business_area"
  return null
}

export async function addLink(
  tx: Tx,
  ticketId: string,
  linkedTicketId: string,
  actorId: string,
): Promise<void> {
  await tx`
    INSERT INTO ticketing_ticket_links (tenant_id, ticket_id, linked_ticket_id, created_by)
    SELECT tenant_id, least(${ticketId}::uuid, ${linkedTicketId}::uuid),
           greatest(${ticketId}::uuid, ${linkedTicketId}::uuid), ${actorId}
      FROM ticketing_tickets WHERE id = ${ticketId}::uuid
    ON CONFLICT (tenant_id, least(ticket_id, linked_ticket_id), greatest(ticket_id, linked_ticket_id))
    DO UPDATE SET is_active = TRUE, created_at = now(), created_by = EXCLUDED.created_by
  `
}

export async function removeLink(
  tx: Tx,
  ticketId: string,
  linkedTicketId: string,
): Promise<void> {
  await tx`
    UPDATE ticketing_ticket_links SET is_active = FALSE
     WHERE least(ticket_id, linked_ticket_id) = least(${ticketId}::uuid, ${linkedTicketId}::uuid)
       AND greatest(ticket_id, linked_ticket_id) = greatest(${ticketId}::uuid, ${linkedTicketId}::uuid)
  `
}

// -----------------------------------------------------------------------------
// Settings — business areas, categories/subcategories, default membership.
// Reuses firm.settings.read/write (no per-business-area admin scope).
// -----------------------------------------------------------------------------

export type BusinessAreaSettingsRow = {
  id: string
  prefix: string
  name: string
  description: string | null
  is_active: boolean
}

export async function listBusinessAreasForSettings(
  tx: Tx,
): Promise<BusinessAreaSettingsRow[]> {
  return tx<BusinessAreaSettingsRow[]>`
    SELECT id, prefix, name, description, is_active
      FROM ticketing_business_areas
     ORDER BY name
  `
}

export async function createBusinessArea(
  tx: Tx,
  tenantId: string,
  actorId: string,
  input: { prefix: string; name: string; description: string | null },
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO ticketing_business_areas
      (tenant_id, prefix, name, description, active, is_active, created_at, created_by, updated_at)
    VALUES (${tenantId}::uuid, ${input.prefix}, ${input.name}, ${input.description},
            TRUE, TRUE, now(), ${actorId}, now())
    RETURNING id
  `
  return row
}

export async function updateBusinessArea(
  tx: Tx,
  id: string,
  input: { prefix: string; name: string; description: string | null },
): Promise<void> {
  await tx`
    UPDATE ticketing_business_areas
       SET prefix = ${input.prefix}, name = ${input.name},
           description = ${input.description}, updated_at = now()
     WHERE id = ${id}::uuid
  `
}

export async function archiveBusinessArea(
  tx: Tx,
  id: string,
): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE ticketing_business_areas SET is_active = FALSE, active = FALSE
     WHERE id = ${id}::uuid
    RETURNING id
  `
  return !!row
}

export async function businessAreaById(
  tx: Tx,
  id: string,
): Promise<BusinessAreaSettingsRow | null> {
  const [row] = await tx<BusinessAreaSettingsRow[]>`
    SELECT id, prefix, name, description, is_active
      FROM ticketing_business_areas WHERE id = ${id}::uuid
  `
  return row ?? null
}

export async function createCategory(
  tx: Tx,
  tenantId: string,
  actorId: string,
  businessAreaId: string,
  name: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO ticketing_categories (tenant_id, business_area_id, name, created_by)
    VALUES (${tenantId}::uuid, ${businessAreaId}::uuid, ${name}, ${actorId})
    RETURNING id
  `
  return row
}

export async function archiveCategory(tx: Tx, id: string): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE ticketing_categories SET is_active = FALSE WHERE id = ${id}::uuid
    RETURNING id
  `
  return !!row
}

export async function createSubcategory(
  tx: Tx,
  tenantId: string,
  actorId: string,
  categoryId: string,
  name: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO ticketing_subcategories (tenant_id, category_id, name, created_by)
    VALUES (${tenantId}::uuid, ${categoryId}::uuid, ${name}, ${actorId})
    RETURNING id
  `
  return row
}

export async function archiveSubcategory(tx: Tx, id: string): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE ticketing_subcategories SET is_active = FALSE WHERE id = ${id}::uuid
    RETURNING id
  `
  return !!row
}

export type MemberRow = { employee_id: string; name: string }

export async function businessAreaMembers(
  tx: Tx,
  businessAreaId: string,
): Promise<MemberRow[]> {
  return tx<MemberRow[]>`
    SELECT m.employee_id, e.first_name || ' ' || e.last_name AS name
      FROM ticketing_business_area_members m
      JOIN employees e ON e.id = m.employee_id
     WHERE m.business_area_id = ${businessAreaId}::uuid AND m.is_active
     ORDER BY name
  `
}

/**
 * Replaces the whole membership list in one go — the settings page submits a
 * checkbox list, not one grant at a time. No DELETE
 * (20260830120000_append_only.sql): anyone dropped from the list is
 * deactivated, and anyone re-added later reactivates their existing row via
 * the same ON CONFLICT path `addAssignee`/`addSubscriber` use.
 */
export async function setBusinessAreaMembers(
  tx: Tx,
  tenantId: string,
  businessAreaId: string,
  employeeIds: string[],
  actorId: string,
): Promise<void> {
  await tx`
    UPDATE ticketing_business_area_members
       SET is_active = FALSE
     WHERE business_area_id = ${businessAreaId}::uuid
       AND is_active
       AND NOT (employee_id = ANY(${employeeIds}::uuid[]))
  `
  if (employeeIds.length === 0) return
  await tx`
    INSERT INTO ticketing_business_area_members (tenant_id, business_area_id, employee_id, added_by)
    SELECT ${tenantId}::uuid, ${businessAreaId}::uuid, unnest(${employeeIds}::uuid[]), ${actorId}
    ON CONFLICT (tenant_id, business_area_id, employee_id)
    DO UPDATE SET is_active = TRUE, added_at = now(), added_by = EXCLUDED.added_by
  `
}

// -----------------------------------------------------------------------------
// Custom fields — Tier 2 customization (docs/06-customization-model.md).
// `custom_field_definitions` already exists for employees/tasks; this is
// ticketing's use of it, scoped per business area via the
// `business_area_id` column 20260909130000 added. Values live on
// ticketing_tickets.custom_fields, keyed by field_key, exactly as the doc
// describes — definitions and values are deliberately separate tables.
// -----------------------------------------------------------------------------

export const CUSTOM_FIELD_DATA_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
] as const
export type CustomFieldDataType = (typeof CUSTOM_FIELD_DATA_TYPES)[number]

export type CustomFieldOption = { value: string; label: string }

export type CustomFieldDefinition = {
  id: string
  field_key: string
  label: string
  help_text: string | null
  data_type: CustomFieldDataType
  options: CustomFieldOption[] | null
  is_required: boolean
  display_order: number
}

/** Every active field this business area's tickets carry, in display order — the form-rendering read, for both the settings page and the ticket detail page. */
export async function customFieldDefinitionsFor(
  tx: Tx,
  businessAreaId: string,
): Promise<CustomFieldDefinition[]> {
  return tx<CustomFieldDefinition[]>`
    SELECT id, field_key, label, help_text, data_type, options, is_required, display_order
      FROM custom_field_definitions
     WHERE entity_type = 'ticket' AND business_area_id = ${businessAreaId}::uuid AND is_active
     ORDER BY display_order, label
  `
}

/** `snake_case`, matching the JSONB key convention every other custom field already uses (shirt_size, parking_spot, ...). */
function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export async function createCustomFieldDefinition(
  tx: Tx,
  tenantId: string,
  businessAreaId: string,
  input: {
    label: string
    helpText: string | null
    dataType: CustomFieldDataType
    options: CustomFieldOption[] | null
    isRequired: boolean
  },
): Promise<{ id: string }> {
  const fieldKey = slugifyFieldKey(input.label)
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO custom_field_definitions
      (tenant_id, entity_type, business_area_id, field_key, label, help_text,
       data_type, options, is_required, display_order)
    SELECT ${tenantId}::uuid, 'ticket', ${businessAreaId}::uuid, ${fieldKey}, ${input.label},
           ${input.helpText}, ${input.dataType},
           ${input.options ? tx.json(input.options as never) : null},
           ${input.isRequired},
           coalesce((SELECT max(display_order) + 1 FROM custom_field_definitions
                      WHERE entity_type = 'ticket' AND business_area_id = ${businessAreaId}::uuid), 1)
    RETURNING id
  `
  return row
}

export async function archiveCustomFieldDefinition(
  tx: Tx,
  id: string,
): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE custom_field_definitions SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}::uuid AND entity_type = 'ticket'
    RETURNING id
  `
  return !!row
}

export async function setCustomFieldValues(
  tx: Tx,
  ticketId: string,
  values: Record<string, string | number | boolean | null>,
): Promise<void> {
  await tx`
    UPDATE ticketing_tickets
       SET custom_fields = ${tx.json(values as never)}, updated_at = now()
     WHERE id = ${ticketId}::uuid
  `
}

// -----------------------------------------------------------------------------
// Tasks — a per-ticket checklist. Replaces the dead `ticketing_tickets.tasks`
// JSONB column (20260909140000). Visibility is inherited from the ticket
// (staff_task_visibility), not re-decided here; not audited, same reasoning
// as `projects/[id]::addTask`/`moveTask` (audit/register.ts) — a checklist
// item changes nobody's money, employment or rights.
// -----------------------------------------------------------------------------

export type TicketTask = {
  id: string
  title: string
  assignee_employee_id: string | null
  assignee_name: string | null
  due_date: string | null
  is_done: boolean
  done_at: Date | null
}

export async function ticketTasksFor(
  tx: Tx,
  ticketId: string,
): Promise<TicketTask[]> {
  return tx<TicketTask[]>`
    SELECT t.id, t.title, t.assignee_employee_id,
           e.first_name || ' ' || e.last_name AS assignee_name,
           to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.is_done, t.done_at
      FROM ticketing_ticket_tasks t
      LEFT JOIN employees e ON e.id = t.assignee_employee_id
     WHERE t.ticket_id = ${ticketId}::uuid AND t.is_active
     ORDER BY t.is_done, t.display_order, t.created_at
  `
}

export async function addTask(
  tx: Tx,
  tenantId: string,
  ticketId: string,
  input: {
    title: string
    assigneeEmployeeId: string | null
    dueDate: string | null
  },
  actorId: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO ticketing_ticket_tasks
      (tenant_id, ticket_id, title, assignee_employee_id, due_date, display_order, created_by)
    VALUES (
      ${tenantId}::uuid, ${ticketId}::uuid, ${input.title},
      ${input.assigneeEmployeeId}::uuid, ${input.dueDate}::date,
      coalesce((SELECT max(display_order) + 1 FROM ticketing_ticket_tasks WHERE ticket_id = ${ticketId}::uuid), 1),
      ${actorId}
    )
    RETURNING id
  `
  return row
}

export async function setTaskDone(
  tx: Tx,
  taskId: string,
  isDone: boolean,
  actorId: string,
): Promise<void> {
  await tx`
    UPDATE ticketing_ticket_tasks
       SET is_done = ${isDone},
           done_at = CASE WHEN ${isDone} THEN now() ELSE NULL END,
           done_by = CASE WHEN ${isDone} THEN ${actorId} ELSE NULL END
     WHERE id = ${taskId}::uuid
  `
}

export async function archiveTask(tx: Tx, taskId: string): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE ticketing_ticket_tasks SET is_active = FALSE WHERE id = ${taskId}::uuid
    RETURNING id
  `
  return !!row
}

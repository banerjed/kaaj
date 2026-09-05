import type { Tx } from "../db/tenant"
import { sanitizeRichText } from "../rich-text"

/**
 * Tickets — one repository, two callers. Staff and portal routes both read
 * and write through these functions; RLS (app.is_portal_contact() /
 * app.current_customer_id(), 20260905090000_ticketing_portal.sql) is what
 * actually separates what each caller can see, the same principle as
 * receivables and payables sharing one postJournal.
 */

/**
 * What a ticket's status may be. Plain `text` with no CHECK behind it, so
 * this list IS the constraint (L57).
 */
export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export class TicketingRefused extends Error {
  constructor(
    readonly reason:
      "no_such_ticket" | "no_such_business_area" | "not_portal_visible",
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
  categories: { key: string; label: string }[]
  portal_visible: boolean
}

export async function businessAreas(
  tx: Tx,
  filters: { portalVisibleOnly?: boolean } = {},
): Promise<BusinessAreaRow[]> {
  const { portalVisibleOnly = false } = filters
  return tx<BusinessAreaRow[]>`
    SELECT id, prefix, name,
           coalesce(categories, '[]'::jsonb) AS categories,
           coalesce(settings->>'portalVisible', 'false') = 'true' AS portal_visible
      FROM ticketing_business_areas
     WHERE is_active
       AND (${portalVisibleOnly} = FALSE
            OR coalesce(settings->>'portalVisible', 'false') = 'true')
     ORDER BY name
  `
}

export type TicketRow = {
  id: string
  ticket_number: string
  business_area_name: string | null
  title: string
  category: string | null
  status: string
  priority: string | null
  severity: string
  due_date: string | null
  logged_at: Date
  customer_name: string | null
  reported_by_name: string | null
  /** Whether the reporter is a portal contact rather than staff. */
  is_portal: boolean
}

const TICKET_COLUMNS = `
  t.id, t.ticket_number,
  ba.name AS business_area_name,
  t.title, t.category, t.status, t.priority, t.severity,
  to_char(t.due_date,'YYYY-MM-DD') AS due_date,
  t.logged_at,
  c.customer_name,
  coalesce(t.reported_by_name,
            e.first_name || ' ' || e.last_name) AS reported_by_name,
  (t.logger_contact_id IS NOT NULL) AS is_portal
`

const TICKET_FROM = `
    FROM ticketing_tickets t
    LEFT JOIN ticketing_business_areas ba ON ba.id = t.business_area_id
    LEFT JOIN customers c               ON c.id = t.customer_id
    LEFT JOIN employees e               ON e.id = t.logger_employee_id
`

const TICKET_SELECT = `SELECT ${TICKET_COLUMNS}${TICKET_FROM}`

export async function listTickets(
  tx: Tx,
  filters: {
    businessAreaId?: string
    status?: string
    /** Set for `ticketing.read.own` — only tickets this employee raised or is assigned to. */
    ownedByEmployeeId?: string
  } = {},
): Promise<TicketRow[]> {
  const businessAreaId = filters.businessAreaId || null
  const status = filters.status ?? ""
  const ownedBy = filters.ownedByEmployeeId || null
  return tx<TicketRow[]>`
    ${tx.unsafe(TICKET_SELECT)}
     WHERE (${businessAreaId}::uuid IS NULL OR t.business_area_id = ${businessAreaId}::uuid)
       AND (${status} = '' OR t.status = ${status})
       AND (${ownedBy}::uuid IS NULL
            OR t.logger_employee_id = ${ownedBy}::uuid
            OR t.assignees @> to_jsonb(${ownedBy}::text))
     ORDER BY t.logged_at DESC
  `
}

export type TicketDetail = TicketRow & {
  description: string | null
  external_summary: string | null
  internal_summary: string | null
  business_area_id: string
}

/** Sanitized again on the way out — defense in depth for any row a `RichTextEditor` didn't write (fixtures, a future direct SQL insert). */
export async function ticketById(
  tx: Tx,
  id: string,
): Promise<TicketDetail | null> {
  const [row] = await tx<TicketDetail[]>`
    SELECT ${tx.unsafe(TICKET_COLUMNS)},
           t.description, t.external_summary, t.internal_summary, t.business_area_id
    ${tx.unsafe(TICKET_FROM)}
     WHERE t.id = ${id}::uuid
  `
  if (!row) return null
  return {
    ...row,
    description: row.description && sanitizeRichText(row.description),
    external_summary:
      row.external_summary && sanitizeRichText(row.external_summary),
    internal_summary:
      row.internal_summary && sanitizeRichText(row.internal_summary),
  }
}

export type TicketUpdateRow = {
  id: string
  author_name: string | null
  content_text: string | null
  visibility: string | null
  created_at: Date
}

/**
 * Internal updates are already filtered out for a portal contact by RLS —
 * never re-checked here. `content_text` is sanitized again on the way out —
 * defense in depth for any row a `RichTextEditor` didn't write.
 */
export async function ticketUpdates(
  tx: Tx,
  ticketId: string,
): Promise<TicketUpdateRow[]> {
  const rows = await tx<TicketUpdateRow[]>`
    SELECT u.id,
           coalesce(u.author_name, e.first_name || ' ' || e.last_name,
                    cc.first_name || ' ' || cc.last_name) AS author_name,
           u.content_text, u.visibility, u.created_at
      FROM ticketing_updates u
      LEFT JOIN employees e         ON e.id = u.author_employee_id
      LEFT JOIN customer_contacts cc ON cc.id = u.author_contact_id
     WHERE u.ticket_id = ${ticketId}::uuid
     ORDER BY u.created_at
  `
  return rows.map((r) => ({
    ...r,
    content_text: r.content_text && sanitizeRichText(r.content_text),
  }))
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
    category: string
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
      title, subject, description, category, status, severity, due_date,
      logged_at, updated_at, logger_employee_id, logger_contact_id,
      customer_id, last_updated_by, reported_by_name, reported_by_email
    ) VALUES (
      ${tenantId}::uuid, ${input.businessAreaId}::uuid, ${ticketNumber}, ${prefix}, ${sequence},
      ${input.title}, ${input.title}, ${input.description}, ${input.category},
      'open', 'medium', ${input.dueDate}::date,
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

export async function setStatus(
  tx: Tx,
  ticketId: string,
  status: TicketStatus,
  actorId: string,
): Promise<{ from: string }> {
  const [before] = await tx<{ status: string }[]>`
    SELECT status FROM ticketing_tickets WHERE id = ${ticketId}::uuid
  `
  if (!before) throw new TicketingRefused("no_such_ticket")

  await tx`
    UPDATE ticketing_tickets
       SET status = ${status},
           resolved_at = CASE WHEN ${status} = 'resolved' THEN now() ELSE resolved_at END,
           closed_at   = CASE WHEN ${status} = 'closed'   THEN now() ELSE closed_at   END,
           updated_at = now(), last_updated_by = ${actorId}
     WHERE id = ${ticketId}::uuid
  `
  return { from: before.status }
}

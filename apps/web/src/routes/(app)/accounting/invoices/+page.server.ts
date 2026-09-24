import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { sendTemplatedEmail } from "$lib/mailer"
import { constraintFailure } from "$lib/server/db/constraints"
import { money, calendarDate, localeForCurrency } from "$lib/format"
import { env } from "$env/dynamic/private"

// "viewed" has no equivalent in accounting.repo.ts's INVOICE_STATUSES — a
// pre-existing divergence, left alone; "credited" and "written_off" are
// added to both.
const STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
  "void",
  "credited",
  "written_off",
] as const

const PAGE_SIZE = 20

/** /accounting/invoices — accounts receivable; gated to finance. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see invoices.")
  }

  const params = new FormData()
  params.append("status", url.searchParams.get("status") ?? "")
  const f = new FormReader(params)
  const status = f.choice("status", STATUSES) ?? ""
  const overdueOnly = url.searchParams.get("overdue") === "1"
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const [invoices, total] = await Promise.all([
      acc.listInvoices(tx, {
        status,
        overdueOnly,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      acc.countInvoices(tx, { status, overdueOnly }),
    ])
    return {
      invoices,
      total,
      page,
      pageSize: PAGE_SIZE,
      statuses: STATUSES,
      filters: { status, overdueOnly },
      mayWrite: can(ctx, "accounting.write"),
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }
  })
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_invoice":
      return {
        message:
          "One or more selected invoices are no longer eligible for a reminder — refresh and try again.",
        errorFields: ["invoice_ids"],
      }
    case "duplicate_invoice":
      return {
        message: "The same invoice was selected twice.",
        errorFields: ["invoice_ids"],
      }
    default:
      return {
        message: "Reminders could not be sent.",
        errorFields: ["invoice_ids"],
      }
  }
}

export const actions: Actions = {
  /**
   * Sends a reminder email for each selected, still-overdue invoice.
   * Best-effort per invoice, not all-or-nothing like a batch payment: a
   * missing customer email or an invoice already reminded today is skipped
   * and reported, not a reason to withhold the reminders that CAN go out.
   * `last_reminded_at` is only set for invoices `sendTemplatedEmail`
   * confirmed were actually dispatched (L68) — sent-then-recorded, not the
   * other way round, since the alternative (record first) risks marking an
   * invoice reminded when the send itself then fails.
   */
  sendReminders: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const formData = await request.formData()
    const f = new FormReader(formData)
    // Extracted straight from field NAMES, shape-checked against a real UUID
    // grouping (not just "36 hex-or-dash characters", which would let
    // `invoice_------------------------------------` through to a raw
    // `::uuid[]` cast and a 500 rather than a field error) — rather than
    // fetched from an unbounded "every overdue invoice" query first.
    // invoicesForReminder below re-validates each one is real, overdue and
    // belongs to this tenant, the same "never trust a checkbox" discipline
    // as payBatch, without a full-table pre-fetch to get there.
    const UUID_FIELD =
      /^invoice_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
    const invoiceIds = [...formData.keys()]
      .map((k) => UUID_FIELD.exec(k)?.[1])
      .filter(
        (id): id is string =>
          id !== undefined && formData.get(`invoice_${id}`) === "on",
      )
    if (invoiceIds.length === 0) f.reject("invoice_ids")
    if (!f.ok) return fail(400, f.problem())

    try {
      // Read-then-send-then-write, in three steps — no transaction open
      // across the send loop below, which is one real outbound HTTP round
      // trip per selected invoice. The same restructuring emailInvoice uses
      // for its own single send: a transaction held across a network call
      // is the shape `verify-no-loop-queries.mjs` exists to catch for a
      // query, and this is its network-call equivalent, worse here because
      // a reminder batch is N invoices holding one Postgres connection for
      // the whole run rather than one.
      const { rows, locations } = await withTenant(
        actorFrom(locals),
        async (tx) => ({
          rows: await acc.invoicesForReminder(tx, locals.tenantId!, invoiceIds),
          locations: await locationsRepo.list(tx),
        }),
      )

      // No per-tenant verified sending domain exists yet — every reminder
      // goes out through the platform's own shared address, with the
      // firm's name as the display name so the recipient sees who it's
      // actually from.
      const senderAddress =
        env.PRIVATE_FROM_ADMIN_EMAIL || env.PRIVATE_ADMIN_EMAIL

      const sentIds: string[] = []
      const skipped: { invoiceNumber: string; reason: string }[] = []
      for (const inv of rows) {
        if (!inv.email) {
          skipped.push({
            invoiceNumber: inv.invoice_number,
            reason: "no email on file",
          })
          continue
        }
        if (inv.reminded_today) {
          skipped.push({
            invoiceNumber: inv.invoice_number,
            reason: "already reminded today",
          })
          continue
        }
        const locale = localeForCurrency(
          locations,
          inv.currency,
          inv.default_locale,
        )
        const result = await sendTemplatedEmail({
          subject: `Payment reminder: Invoice ${inv.invoice_number}`,
          to_emails: [inv.email],
          from_email: `${inv.company_name} <${senderAddress}>`,
          template_name: "payment_reminder",
          template_properties: {
            invoiceNumber: inv.invoice_number,
            firmName: inv.company_name,
            amountDue: money(inv.amount_due, inv.currency, locale),
            dueDate: calendarDate(inv.due_date, locale),
          },
        })
        if (result.sent) {
          sentIds.push(inv.id)
        } else {
          skipped.push({
            invoiceNumber: inv.invoice_number,
            reason:
              result.reason === "not_configured"
                ? "email is not configured for this environment"
                : "the email failed to send",
          })
        }
      }

      if (sentIds.length > 0) {
        await withTenant(actorFrom(locals), async (tx) => {
          await acc.recordRemindersSent(tx, sentIds)
          const remindedRows = rows.filter((r) => sentIds.includes(r.id))
          // No single entityId spans a batch, so `invoice_numbers` and
          // `reminded_customers` are what makes this row answerable to "was
          // this customer ever chased?" — the question the register's own
          // "who told the customer what, and when" justification is about.
          await audit.record(tx, ctx!, {
            action: "send",
            entityType: "invoices",
            module: "accounting",
            changes: {
              reminders_sent: { from: null, to: String(sentIds.length) },
              invoice_numbers: {
                from: null,
                to: remindedRows.map((r) => r.invoice_number).join(", "),
              },
              reminded_customers: {
                from: null,
                to: remindedRows.map((r) => r.customer_name).join(", "),
              },
            },
          })
        })
      }

      return { reminded: { sent: sentIds.length, skipped } }
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import {
  AccountingRefused,
  RECURRING_FREQUENCIES,
} from "$lib/server/accounting/accounting.repo"
import * as taxRates from "$lib/server/accounting/tax_rates.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

const MAX_LINES = 50

/** /accounting/recurring-invoices — schedules that generate draft invoices
 *  on demand; there is no scheduler in this codebase to run them on their own. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see recurring invoices.")
  }

  return withTenant(actorFrom(locals), async (tx) => ({
    schedules: await acc.listRecurringSchedules(tx),
    customers: await acc.listCustomersForPicker(tx),
    taxRates: (await taxRates.listTaxRates(tx)).filter((r) => r.is_active),
    frequencies: RECURRING_FREQUENCIES,
    mayWrite: can(ctx, "accounting.write"),
  }))
}

function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_customer":
      return {
        message:
          "That customer no longer exists. Reload the page and pick one from the current list.",
        errorFields: ["customer_id"],
      }
    case "no_lines":
      return {
        message: "A schedule needs at least one line.",
        errorFields: ["lines"],
      }
    case "no_such_schedule":
      return { message: "That schedule no longer exists.", errorFields: [] }
    case "customer_tax_exempt":
      return {
        message: `${e.detail ?? "A customer"} is tax-exempt as of the invoice date, but its schedule's template lines carry tax. Remove the tax amount from the schedule, or deactivate it.`,
        errorFields: [],
      }
    case "number_taken":
      return {
        message: `Could not allocate an invoice number for ${e.detail ?? "a schedule"}. Try again.`,
        errorFields: [],
      }
    case "no_such_account":
      return {
        message: `The chart of accounts has no ${e.detail}. Nothing was generated.`,
        errorFields: [],
      }
    default:
      return { message: "That schedule could not be saved.", errorFields: [] }
  }
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const customerId = f.uuid("customer_id", { required: true })
    const frequency = f.choice("frequency", RECURRING_FREQUENCIES, {
      required: true,
    })
    const nextRunDate = f.date("next_run_date", { required: true })
    const dueInDays = f.integer("due_in_days", {
      required: true,
      min: 0,
      max: 365,
    })
    const exchangeRate = f.decimal("exchange_rate", {
      scale: 6,
      required: true,
      min: 0.000001,
    })
    const paymentTerms = f.text("payment_terms", { max: 50 })
    const notes = f.text("notes", { max: 2000 })

    // Read every field BEFORE the `!f.ok` gate (L33/L68) — same discipline
    // as invoices/new's line loop.
    const lineCount = f.integer("line_count", {
      required: true,
      min: 0,
      max: MAX_LINES,
    })
    const lines: acc.NewInvoiceLine[] = []
    for (let i = 0; i < (lineCount ?? 0); i++) {
      const description = f.text(`lines.${i}.description`, {
        max: 500,
        required: true,
      })
      const quantity = f.decimal(`lines.${i}.quantity`, {
        scale: 2,
        required: true,
        min: 0.01,
      })
      const unitPrice = f.decimal(`lines.${i}.unit_price`, {
        scale: 2,
        required: true,
        min: 0,
      })
      const discountPercent = f.decimal(`lines.${i}.discount_percent`, {
        scale: 2,
        min: 0,
        max: 100,
      })
      const taxAmount = f.decimal(`lines.${i}.tax_amount`, {
        scale: 2,
        min: 0,
      })
      const taxRateId = f.uuid(`lines.${i}.tax_rate_id`)
      lines.push({
        description: description ?? "",
        quantity: quantity ?? "0",
        unitPrice: unitPrice ?? "0",
        discountPercent: discountPercent ?? "0",
        taxAmount: taxAmount ?? "0",
        taxRateId: taxRateId ?? null,
      })
    }
    if ((lineCount ?? 0) < 1) f.reject("lines")
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { id } = await acc.createRecurringSchedule(
          tx,
          locals.tenantId!,
          {
            customerId: customerId!,
            frequency,
            nextRunDate: nextRunDate!,
            dueInDays: dueInDays!,
            exchangeRate: exchangeRate!,
            paymentTerms,
            notes,
            lines,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "recurring_schedules",
          entityId: id,
          module: "accounting",
          changes: {
            customer_id: { from: null, to: customerId },
            frequency: { from: null, to: frequency },
          },
        })
        return { created: true }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  toggle: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const scheduleId = f.uuid("schedule_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from, to } = await acc.toggleRecurringSchedule(
          tx,
          scheduleId!,
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "recurring_schedules",
          entityId: scheduleId!,
          module: "accounting",
          changes: { is_active: { from: String(from), to: String(to) } },
        })
        return { toggled: true }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** Generates one draft invoice per schedule due today or earlier, once, on
   *  demand — there is no scheduler in this codebase to run it automatically. */
  generate: async ({ locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const generated = await acc.generateDueInvoices(
          tx,
          locals.tenantId!,
          ctx!.employeeId ?? ctx!.userId,
        )
        if (generated.length > 0) {
          await audit.record(tx, ctx!, {
            action: "create",
            entityType: "invoices",
            module: "accounting",
            changes: {
              invoices_generated: {
                from: null,
                to: String(generated.length),
              },
              invoice_numbers: {
                from: null,
                to: generated.map((g) => g.invoiceNumber).join(", "),
              },
              generated_customers: {
                from: null,
                to: generated.map((g) => g.customerName).join(", "),
              },
            },
          })
        }
        return { generated }
      })
    } catch (e) {
      // Unlike the reconciliation rules' `apply` (a set-based UPDATE that
      // cannot refuse), generateDueInvoices calls createInvoice per due
      // schedule — a customer marked tax-exempt after its schedule was set
      // up, or five colliding invoice-number attempts, both throw here, and
      // the whole run must not become an uncaught 500 (L66).
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

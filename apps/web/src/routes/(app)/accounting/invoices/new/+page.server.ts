import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

const MAX_LINES = 50

/** /accounting/invoices/new — a draft invoice; issuing it is a separate, audited step. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see invoices.")
  }
  return withTenant(actorFrom(locals), async (tx) => ({
    customers: await acc.listCustomersForPicker(tx),
  }))
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
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
        message: "An invoice needs at least one line.",
        errorFields: ["lines"],
      }
    case "no_such_account":
      return {
        message: `The chart of accounts has no ${e.detail}. Nothing was created.`,
        errorFields: ["lines"],
      }
    case "number_taken":
      return {
        message: "Could not allocate an invoice number. Try again.",
        errorFields: ["invoice"],
      }
    default:
      return {
        message: "That invoice could not be created.",
        errorFields: ["invoice"],
      }
  }
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const customerId = f.uuid("customer_id", { required: true })
    const invoiceDate = f.date("invoice_date", { required: true })
    const dueDate = f.date("due_date", { required: true })
    const exchangeRate = f.decimal("exchange_rate", {
      scale: 6,
      required: true,
      min: 0.000001,
    })
    const paymentTerms = f.text("payment_terms", { max: 50 })
    const notes = f.text("notes", { max: 2000 })

    // Read every field BEFORE the `!f.ok` gate (L33/L68) — including every
    // row, so a row that fails validation is reported, not silently dropped.
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
      lines.push({
        description: description ?? "",
        quantity: quantity ?? "0",
        unitPrice: unitPrice ?? "0",
        discountPercent: discountPercent ?? "0",
        taxAmount: taxAmount ?? "0",
      })
    }
    // A rule the readers above cannot express on their own — zero rows is
    // valid to EACH per-row reader (there are none to fail) but invalid for
    // the invoice as a whole.
    if ((lineCount ?? 0) < 1) f.reject("lines")
    // No override message — `f.problem()`'s default names the actual
    // field(s) that failed (customer, a date, or a specific line), which
    // matters here more than usual: this form has far more ways to fail
    // than a typical one, and "That invoice is not valid." would be true of
    // all of them and useful for none.
    if (!f.ok) return fail(400, f.problem())

    let created
    try {
      created = await withTenant(actorFrom(locals), async (tx) => {
        // Deliberately not audited — a draft recognises no revenue yet, and
        // `issue()` (the money-moving step) already is. See audit/register.ts.
        return acc.createInvoice(
          tx,
          locals.tenantId!,
          {
            customerId: customerId!,
            invoiceDate: invoiceDate!,
            dueDate: dueDate!,
            exchangeRate: exchangeRate!,
            paymentTerms,
            notes,
            lines,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }

    // Redirect rather than re-render — avoids a duplicate submission on the
    // unique invoice_number, same reasoning as employees/new.
    redirect(303, `/accounting/invoices/${created.id}`)
  },
}

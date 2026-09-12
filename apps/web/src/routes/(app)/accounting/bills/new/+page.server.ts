import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

const MAX_LINES = 50

/** /accounting/bills/new — a draft bill; approving it is a separate, audited step. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see bills.")
  }
  return withTenant(actorFrom(locals), async (tx) => ({
    vendors: await pay.listVendorsForPicker(tx),
    accounts: await pay.listExpenseAccountsForPicker(tx),
  }))
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_vendor":
      return {
        message:
          "That vendor no longer exists. Reload the page and pick one from the current list.",
        field: "vendor_id",
      }
    case "no_lines":
      return {
        message: "A bill needs at least one line.",
        field: "lines",
      }
    default:
      return { message: "That bill could not be created.", field: "bill" }
  }
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const vendorId = f.uuid("vendor_id", { required: true })
    const billNumber = f.text("bill_number", { max: 50, required: true })
    const reference = f.text("reference", { max: 100 })
    const billDate = f.date("bill_date", { required: true })
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
    const lines: pay.NewBillLine[] = []
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
      const taxAmount = f.decimal(`lines.${i}.tax_amount`, {
        scale: 2,
        min: 0,
      })
      const expenseAccountId = f.uuid(`lines.${i}.expense_account_id`, {
        required: true,
      })
      lines.push({
        description: description ?? "",
        quantity: quantity ?? "0",
        unitPrice: unitPrice ?? "0",
        taxAmount: taxAmount ?? "0",
        expenseAccountId: expenseAccountId ?? "",
      })
    }
    // A rule the readers above cannot express on their own — zero rows is
    // valid to EACH per-row reader (there are none to fail) but invalid for
    // the bill as a whole.
    if ((lineCount ?? 0) < 1) f.reject("lines")
    // No override message — `f.problem()`'s default names the actual
    // field(s) that failed (vendor, a date, or a specific line).
    if (!f.ok) return fail(400, f.problem())

    let created
    try {
      created = await withTenant(actorFrom(locals), async (tx) => {
        // Deliberately not audited — a draft recognises no liability yet,
        // and approve() (the money-moving step) already is. See
        // audit/register.ts.
        return pay.createBill(
          tx,
          locals.tenantId!,
          {
            vendorId: vendorId!,
            billNumber: billNumber!,
            reference,
            billDate: billDate!,
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
    // unique (vendor, bill_number) pair, same reasoning as invoices/new.
    redirect(303, `/accounting/bills/${created.id}`)
  },
}

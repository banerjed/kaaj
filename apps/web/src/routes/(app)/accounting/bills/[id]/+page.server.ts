import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** The `payment_method` enum, which `enumValue` reads from @kaaj/enums. */
const METHODS = [
  "wire_transfer",
  "direct_deposit",
  "check",
  "cash",
  "mobile_payment",
] as const

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) error(403, "Only finance can see bills.")
  return withTenant(actorFrom(locals), async (tx) => {
    const bill = await pay.billById(tx, params.id)
    if (!bill) error(404, "No such bill")
    return {
      bill,
      lines: await pay.billLines(tx, bill.id),
      payments: await pay.paymentsForBill(tx, bill.id),
      mayWrite: can(ctx, "accounting.write"),
      methods: METHODS,
      bankAccounts: await tx<{ id: string; account_name: string }[]>`
        SELECT id, account_name FROM bank_accounts ORDER BY account_name
      `,
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }
  })
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_bill":
      return { message: "That bill no longer exists.", field: "bill" }
    case "no_such_account":
      return {
        message: `The chart of accounts has no ${e.detail}. Nothing was posted.`,
        field: "bill",
      }
    case "wrong_status":
      return {
        message: `That is not something this bill can do (${e.detail}).`,
        field: "bill",
      }
    case "no_lines":
      return {
        message:
          "A bill with no lines says nothing is owed, which looks exactly like lines that failed to load.",
        field: "bill",
      }
    case "does_not_balance":
      return {
        message: `That posting does not balance and was not written (${e.detail}). Nothing was changed.`,
        field: "bill",
      }
    case "period_closed":
      return {
        message: `${e.detail}. A closed period does not accept new postings — reopening one is a deliberate act with its own record.`,
        field: "bill",
      }
    case "overpayment":
      // No raw figure here — e.detail has no currency attached; the reloaded
      // page shows Outstanding, formatted, right below.
      return {
        message: "That is more than is outstanding on this bill.",
        field: "amount",
      }
    case "self_approval":
      return {
        message: "Whoever approved this bill cannot also pay it.",
        field: "bill",
      }
    case "number_taken":
      return { message: "That number is taken. Try again.", field: "bill" }
    case "no_such_invoice":
      return { message: "That is not a bill.", field: "bill" }
  }
}

export const actions: Actions = {
  /** Approve the bill and recognise the liability in the same transaction. */
  approve: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from, entryNumber } = await pay.approveBill(
          tx,
          locals.tenantId!,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await pay.billById(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "approve",
          entityType: "bills",
          entityId: params.id,
          module: "accounting",
          changes: {
            status: { from, to: "approved" },
            // Money as a STRING, always.
            total: { from: null, to: after?.total ?? null },
            journal_entry: { from: null, to: entryNumber },
          },
        })
        return { approved: entryNumber }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** Pay the vendor: DR Accounts Payable, CR Cash, in the same write. */
  recordPayment: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    // `min` here keeps the zero/negative case a field error, not a CHECK 500 (L66).
    const amount = f.decimal("amount", {
      scale: 2,
      required: true,
      min: 0.01,
    })
    const paymentDate = f.date("payment_date", { required: true })
    const method = f.choice("payment_method", METHODS, { required: true })
    const reference = f.text("reference", { max: 100 })
    const bankAccountId = f.uuid("bank_account_id")
    if (!f.ok) return fail(400, f.problem("That payment is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const before = await pay.billById(tx, params.id)
        const { paymentNumber, status } = await pay.recordVendorPayment(
          tx,
          locals.tenantId!,
          {
            billId: params.id,
            amount: amount!,
            paymentDate: paymentDate!,
            method: method!,
            reference,
            bankAccountId,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await pay.billById(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "record_payment",
          entityType: "bills",
          entityId: params.id,
          module: "accounting",
          changes: {
            payment: { from: null, to: paymentNumber },
            amount: { from: null, to: amount },
            amount_due: {
              from: before?.amount_due ?? null,
              to: after?.amount_due ?? null,
            },
            status: { from: before?.status ?? null, to: status },
          },
        })
        return { paid: paymentNumber, status }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      // A bank account chosen from a list that has since changed.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { compareDecimal } from "$lib/decimal"

/** The `payment_method` enum, which `enumValue` reads from @kaaj/enums. */
const METHODS = [
  "wire_transfer",
  "direct_deposit",
  "check",
  "cash",
  "mobile_payment",
] as const

/** /accounting/receive-payment — one payment allocated across several of a customer's open invoices, lockbox-style. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see this.")
  }

  const params = new FormData()
  params.append("customer_id", url.searchParams.get("customer_id") ?? "")
  const f = new FormReader(params)
  // Read before the gate (L33).
  const customerId = f.uuid("customer_id")
  if (!f.ok) error(400, "That is not a valid customer.")

  return withTenant(actorFrom(locals), async (tx) => ({
    customers: await acc.listCustomersForPicker(tx),
    openInvoices: customerId
      ? await acc.openInvoicesForCustomer(tx, customerId)
      : [],
    filters: { customerId: customerId ?? "" },
    mayWrite: can(ctx, "accounting.write"),
    methods: METHODS,
    bankAccounts: await tx<{ id: string; account_name: string }[]>`
      SELECT id, account_name FROM bank_accounts ORDER BY account_name
    `,
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
  }))
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_invoice":
      return {
        message:
          "One of those invoices no longer exists. Reload and try again.",
        errorFields: ["allocations"],
      }
    case "wrong_customer":
      return {
        message: `${e.detail} belongs to a different customer. Reload and try again.`,
        errorFields: ["allocations"],
      }
    case "duplicate_invoice":
      return {
        message: "The same invoice is allocated twice. Reload and try again.",
        errorFields: ["allocations"],
      }
    case "wrong_status":
      return {
        message: e.detail ?? "That invoice cannot be paid.",
        errorFields: ["allocations"],
      }
    case "currency_mismatch":
      return {
        message: "Those invoices are not all in the same currency.",
        errorFields: ["allocations"],
      }
    case "overpayment":
      return {
        message: `${e.detail}: that allocation is more than is outstanding on it.`,
        errorFields: ["allocations"],
      }
    case "allocation_mismatch":
      return {
        message: "The amounts allocated don't add up to the total received.",
        errorFields: ["total_amount"],
      }
    case "no_lines":
      return {
        message: "Select at least one invoice to allocate this payment to.",
        errorFields: ["allocations"],
      }
    case "no_such_bill":
    case "no_such_account":
    case "no_such_customer":
    case "no_such_vendor":
    case "does_not_balance":
    case "period_closed":
    case "number_taken":
    case "self_approval":
    case "no_such_bank_transaction":
    case "no_such_payment":
    case "direction_mismatch":
    case "already_matched":
      // Not reachable from this action, but the reason type is shared
      // across the whole module — the switch stays exhaustive.
      return {
        message: "That payment could not be recorded.",
        errorFields: ["allocations"],
      }
  }
}

export const actions: Actions = {
  allocate: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const customerId = f.uuid("customer_id", { required: true })
    // `min` here keeps the zero/negative case a field error, not a CHECK 500 (L66).
    const totalAmount = f.decimal("total_amount", {
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
        // The eligible invoice set comes from a fresh, authoritative query —
        // never from field names the client submitted — the same discipline
        // `matchBankTransaction`'s doc comment describes: a picker is UX,
        // not a boundary a crafted POST can be trusted to respect.
        const open = await acc.openInvoicesForCustomer(tx, customerId!)
        const allocations: acc.LockboxAllocation[] = []
        for (const inv of open) {
          const amount = f.decimal(`alloc_${inv.id}`, { scale: 2, min: 0 })
          if (amount && compareDecimal(amount, "0") > 0) {
            allocations.push({ invoiceId: inv.id, amount })
          }
        }
        // A rule the per-row readers above cannot express on their own —
        // zero selected is valid to each one (there's nothing to fail) but
        // invalid for the payment as a whole.
        if (allocations.length === 0) f.reject("allocations")
        if (!f.ok) return fail(400, f.problem())

        const { paymentNumber, statuses } = await acc.recordLockboxPayment(
          tx,
          locals.tenantId!,
          {
            customerId: customerId!,
            allocations,
            totalAmount: totalAmount!,
            paymentDate: paymentDate!,
            method: method!,
            reference,
            bankAccountId,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "record_payment",
          entityType: "payments",
          entityId: customerId!,
          module: "accounting",
          changes: {
            payment: { from: null, to: paymentNumber },
            total_amount: { from: null, to: totalAmount },
            invoices_paid: {
              from: null,
              to: statuses.map((s) => s.invoiceNumber).join(", "),
            },
          },
        })
        return { paid: paymentNumber, statuses }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

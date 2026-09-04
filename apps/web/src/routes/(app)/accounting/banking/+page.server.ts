import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { BANK_TRANSACTION_STATUSES } from "$lib/server/accounting/payables.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/** /accounting/banking — accounts, and the transactions still to reconcile. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see banking.")
  }

  const params = new FormData()
  params.append("account", url.searchParams.get("account") ?? "")
  params.append("status", url.searchParams.get("status") ?? "")
  const f = new FormReader(params)
  // Read before the gate: a reader called inside the object built afterwards
  // runs after `f.ok` was checked, so its rejection is raised too late (L33).
  const accountId = f.uuid("account")
  const status = f.choice("status", BANK_TRANSACTION_STATUSES) ?? ""
  if (!f.ok) error(400, "That is not a valid account.")

  return withTenant(actorFrom(locals), async (tx) => {
    const transactions = await pay.bankTransactions(tx, {
      accountId: accountId ?? "",
      status,
    })
    const unmatchedIds = transactions
      .filter((t) => t.status === "unmatched")
      .map((t) => t.id)
    return {
      accounts: await pay.bankAccounts(tx),
      transactions,
      candidates: await pay.candidatePaymentsForTransactions(tx, unmatchedIds),
      mayWrite: can(ctx, "accounting.write"),
      statuses: BANK_TRANSACTION_STATUSES,
      filters: { accountId: accountId ?? "", status },
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }
  })
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_bank_transaction":
      return { message: "That transaction no longer exists.", field: "match" }
    case "no_such_payment":
      return { message: "That payment no longer exists.", field: "payment_id" }
    case "wrong_status":
      return {
        message: `That is not something this transaction can do (${e.detail}).`,
        field: "match",
      }
    case "currency_mismatch":
      return {
        message: "That payment is in a different currency.",
        field: "payment_id",
      }
    case "direction_mismatch":
      return {
        message: e.detail ?? "Money moved the wrong way.",
        field: "payment_id",
      }
    case "already_matched":
      return {
        message: "That payment is already matched to a different transaction.",
        field: "payment_id",
      }
    case "no_such_invoice":
    case "no_such_bill":
    case "no_such_account":
    case "no_lines":
    case "does_not_balance":
    case "period_closed":
    case "overpayment":
    case "number_taken":
    case "self_approval":
      // Not reachable from this action — matching never posts a journal or
      // touches an invoice/bill — but the reason type is shared with those
      // domains, so the switch stays exhaustive rather than falling through.
      return { message: "That could not be matched.", field: "match" }
  }
}

export const actions: Actions = {
  /** Tag a transaction as matched to a payment already on the books. */
  match: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const transactionId = f.uuid("transaction_id", { required: true })
    const paymentId = f.uuid("payment_id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing payment."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        await pay.matchBankTransaction(tx, transactionId!, paymentId!)
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "bank_transactions",
          entityId: transactionId!,
          module: "accounting",
          changes: {
            status: { from: "unmatched", to: "matched" },
            matched_to_id: { from: null, to: paymentId },
          },
        })
        return { matched: true }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { BILL_STATUSES } from "$lib/server/accounting/payables.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

const PAGE_SIZE = 20

/** The `payment_method` enum, which `enumValue` reads from @kaaj/enums —
 *  same list `receive-payment` uses. */
const METHODS = [
  "wire_transfer",
  "direct_deposit",
  "check",
  "cash",
  "mobile_payment",
] as const

/** /accounting/bills — accounts payable. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see bills.")
  }

  const params = new FormData()
  params.append("status", url.searchParams.get("status") ?? "")
  const f = new FormReader(params)
  const status = f.choice("status", BILL_STATUSES) ?? ""
  const unapprovedOnly = url.searchParams.get("unapproved") === "1"
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const [bills, total] = await Promise.all([
      pay.listBills(tx, {
        status,
        unapprovedOnly,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      pay.countBills(tx, { status, unapprovedOnly }),
    ])
    return {
      bills,
      total,
      page,
      pageSize: PAGE_SIZE,
      statuses: BILL_STATUSES,
      filters: { status, unapprovedOnly },
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
      return {
        message: "One of those bills no longer exists. Reload and try again.",
        errorFields: ["bill_ids"],
      }
    case "duplicate_bill":
      return {
        message: "The same bill is selected twice. Reload and try again.",
        errorFields: ["bill_ids"],
      }
    case "wrong_status":
      return {
        message: e.detail ?? "That bill cannot be paid.",
        errorFields: ["bill_ids"],
      }
    case "self_approval":
      return {
        message: e.detail ?? "You cannot pay a bill you approved yourself.",
        errorFields: ["bill_ids"],
      }
    case "currency_mismatch":
      return {
        message: `${e.detail}: a single payment can't mix currencies. Pay those in separate batches.`,
        errorFields: ["bill_ids"],
      }
    case "no_lines":
      return {
        message: "Select at least one bill to pay.",
        errorFields: ["bill_ids"],
      }
    default:
      // Every other reason belongs to a different action (creating a bill,
      // approving one, matching a bank transaction, ...) and is not
      // reachable from this one.
      return {
        message: "That batch could not be paid.",
        errorFields: ["bill_ids"],
      }
  }
}

export const actions: Actions = {
  payBatch: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const formData = await request.formData()
    const f = new FormReader(formData)
    const paymentDate = f.date("payment_date", { required: true })
    const method = f.choice("payment_method", METHODS, { required: true })
    const reference = f.text("reference", { max: 100 })
    const bankAccountId = f.uuid("bank_account_id")
    if (!f.ok) return fail(400, f.problem("That payment is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        // The eligible bill set comes from a fresh, authoritative query —
        // never from field names the client submitted — same discipline
        // `receive-payment`'s own action documents: a checkbox is UX, not a
        // boundary a crafted POST can be trusted to respect.
        const candidates = [
          ...(await pay.listBills(tx, { status: "approved" })),
          ...(await pay.listBills(tx, { status: "partial" })),
        ]
        const billIds = candidates
          .filter((b) => f.bool(`bill_${b.id}`))
          .map((b) => b.id)
        if (billIds.length === 0) f.reject("bill_ids")
        if (!f.ok) return fail(400, f.problem())

        const { payments } = await pay.payBillsInBatch(
          tx,
          locals.tenantId!,
          {
            billIds,
            paymentDate: paymentDate!,
            method: method!,
            reference,
            bankAccountId,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "record_payment",
          entityType: "bills",
          entityId: billIds[0],
          module: "accounting",
          changes: {
            payments: {
              from: null,
              to: payments.map((p) => p.paymentNumber).join(", "),
            },
            bills_paid: {
              from: null,
              to: payments.flatMap((p) => p.billNumbers).join(", "),
            },
          },
        })
        return { paid: payments }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

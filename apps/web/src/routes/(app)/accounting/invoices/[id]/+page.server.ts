import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

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
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see invoices.")
  }
  return withTenant(actorFrom(locals), async (tx) => {
    const invoice = await acc.invoiceById(tx, params.id)
    if (!invoice) error(404, "No such invoice")
    return {
      invoice,
      lines: await acc.invoiceLines(tx, invoice.id),
      payments: await acc.paymentsFor(tx, invoice.id),
      mayWrite: can(ctx, "accounting.write"),
      methods: METHODS,
      bankAccounts: await tx<{ id: string; account_name: string }[]>`
        SELECT id, account_name FROM bank_accounts ORDER BY account_name
      `,
    }
  })
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_invoice":
      return { message: "That invoice no longer exists.", field: "invoice" }
    case "no_such_account":
      return {
        message: `The chart of accounts has no ${e.detail}. Nothing was posted.`,
        field: "invoice",
      }
    case "wrong_status":
      return {
        message: `That is not something this invoice can do (${e.detail}).`,
        field: "invoice",
      }
    case "no_lines":
      return {
        message:
          e.detail ??
          "An invoice with no lines says the customer owes nothing, which looks exactly like lines that failed to load.",
        field: "invoice",
      }
    case "does_not_balance":
      return {
        message: `That posting does not balance and was not written (${e.detail}). Nothing was changed.`,
        field: "invoice",
      }
    case "period_closed":
      return {
        message: `${e.detail}. A closed period does not accept new postings — reopening one is a deliberate act with its own record.`,
        field: "invoice",
      }
    case "overpayment":
      // The raw figure is deliberately NOT interpolated here. `e.detail` is a
      // NUMERIC string with no currency attached, and a bare "2443.75" beside
      // a page that renders every other figure through `money()` is exactly
      // the drift CLAUDE.md forbids — a number without its currency is not a
      // number. The reloaded page shows Outstanding, formatted, directly below.
      return {
        message: "That is more than is outstanding on this invoice.",
        field: "amount",
      }
    case "number_taken":
      return { message: "That number is taken. Try again.", field: "invoice" }
  }
}

export const actions: Actions = {
  /**
   * Issue the invoice, and recognise the revenue in the same transaction.
   *
   * Audited as `send`: it is the moment a customer is told they owe money, and
   * the moment revenue enters the ledger. Both are things somebody is later
   * asked to justify.
   */
  issue: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from, entryNumber } = await acc.issueInvoice(
          tx,
          locals.tenantId!,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await acc.invoiceById(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "send",
          entityType: "invoices",
          entityId: params.id,
          module: "accounting",
          changes: {
            status: { from, to: "sent" },
            // Money as a STRING, always.
            total: { from: null, to: after?.total ?? null },
            journal_entry: { from: null, to: entryNumber },
          },
        })
        return { issued: entryNumber }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** Receive money against it: DR Cash, CR Receivables, in the same write. */
  recordPayment: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    // Every reader above the gate (L33). `decimal` keeps the amount a string
    // from the browser to Postgres — the one number here that must not round.
    const amount = f.decimal("amount", { scale: 2, required: true })
    const paymentDate = f.date("payment_date", { required: true })
    const method = f.choice("payment_method", METHODS, { required: true })
    const reference = f.text("reference", { max: 100 })
    const bankAccountId = f.uuid("bank_account_id")
    if (!f.ok) return fail(400, f.problem("That payment is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const before = await acc.invoiceById(tx, params.id)
        const { paymentNumber, status } = await acc.recordPayment(
          tx,
          locals.tenantId!,
          {
            invoiceId: params.id,
            amount: amount!,
            paymentDate: paymentDate!,
            method: method!,
            reference,
            bankAccountId,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await acc.invoiceById(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "record_payment",
          entityType: "invoices",
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
      throw e
    }
  },

  /**
   * Void a draft.
   *
   * Draft only: once issued, the revenue is in the ledger and removing it is a
   * credit note — a new document reversing the first — not an edit to the
   * original.
   */
  voidInvoice: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const reason = f.text("reason", { max: 500, required: true })
    if (!f.ok) return fail(400, f.problem("Say why it is being voided."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from } = await acc.voidInvoice(
          tx,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
          reason!,
        )
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "invoices",
          entityId: params.id,
          module: "accounting",
          changes: { status: { from, to: "void" } },
          // Prose in `reason`, never mixed with values — redaction matches
          // field NAMES.
          reason,
        })
        return { voided: true }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },
}

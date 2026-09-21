import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { renderInvoicePdf } from "$lib/server/accounting/invoice_pdf"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import * as gateway from "$lib/server/accounting/payment_gateway.repo"
import {
  createInvoicePaymentLink,
  UnsupportedCurrency,
} from "$lib/server/accounting/stripe_gateway"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import { sendTemplatedEmail } from "$lib/mailer"
import { money, calendarDate, localeForCurrency } from "$lib/format"
import { env } from "$env/dynamic/private"

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
    const [lines, linesTotal, payments, paymentsTotal, credits, creditsTotal] =
      await Promise.all([
        acc.invoiceLines(tx, invoice.id),
        acc.countInvoiceLines(tx, invoice.id),
        acc.paymentsFor(tx, invoice.id),
        acc.countPaymentsFor(tx, invoice.id),
        acc.creditsFor(tx, invoice.id),
        acc.countCreditsFor(tx, invoice.id),
      ])
    return {
      invoice,
      lines,
      linesTotal,
      payments,
      paymentsTotal,
      credits,
      creditsTotal,
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
    case "no_such_invoice":
      return {
        message: "That invoice no longer exists.",
        errorFields: ["invoice"],
      }
    case "no_such_account":
      return {
        message: `The chart of accounts has no ${e.detail}. Nothing was posted.`,
        errorFields: ["invoice"],
      }
    case "wrong_status":
      return {
        message: `That is not something this invoice can do (${e.detail}).`,
        errorFields: ["invoice"],
      }
    case "no_lines":
      return {
        message:
          e.detail ??
          "An invoice with no lines says the customer owes nothing, which looks exactly like lines that failed to load.",
        errorFields: ["invoice"],
      }
    case "does_not_balance":
      return {
        message: `That posting does not balance and was not written (${e.detail}). Nothing was changed.`,
        errorFields: ["invoice"],
      }
    case "period_closed":
      return {
        message: `${e.detail}. A closed period does not accept new postings — reopening one is a deliberate act with its own record.`,
        errorFields: ["invoice"],
      }
    case "overpayment":
      // No raw figure here — e.detail has no currency attached; the reloaded
      // page shows Outstanding, formatted, right below.
      return {
        message: "That is more than is outstanding on this invoice.",
        errorFields: ["amount"],
      }
    case "over_credit":
      return {
        message: "That is more than is outstanding on this invoice.",
        errorFields: ["credit_amount"],
      }
    case "over_writeoff":
      return {
        message: "That is more than is outstanding on this invoice.",
        errorFields: ["writeoff_amount"],
      }
    case "number_taken":
      return {
        message: "That number is taken. Try again.",
        errorFields: ["invoice"],
      }
    case "customer_tax_exempt":
      return {
        message:
          "This customer is tax-exempt as of the invoice date. Remove the tax amount from every line before issuing, or edit the date if the exemption has since expired.",
        errorFields: ["invoice"],
      }
    case "too_many_lines":
      return {
        message: `This invoice has ${e.detail} lines — too many for a PDF.`,
        errorFields: ["invoice"],
      }
    default:
      // Every other reason belongs to a different action — the lockbox
      // batch at /accounting/receive-payment, matching a bank transaction,
      // etc. — and is not reachable from this one. A `default` rather than
      // an exhaustive list of them, so a reason added elsewhere in the
      // shared `AccountingRefused` type never needs an edit here to keep
      // compiling — two other routes' exhaustive lists silently fell behind
      // exactly this way when `over_credit`/`over_writeoff` were added.
      return {
        message: "That could not be completed.",
        errorFields: ["invoice"],
      }
  }
}

type PaymentLinkResult =
  | { outcome: "created"; link: { url: string; gatewayId: string } }
  /** Not eligible, or no gateway configured — never a reason to fail the caller (e.g. `issue`). */
  | { outcome: "skipped"; reason: string }
  /** Eligible and configured, but the Stripe call itself failed. */
  | { outcome: "failed"; warning: string }

/**
 * Decides whether an invoice gets a payment link and, if so, calls Stripe —
 * but does NOT write the result or audit it. Reads the sealed key and the
 * invoice inside one short transaction, then calls Stripe OUTSIDE any
 * transaction (same split as `emailInvoice`). Never throws — an invoice
 * that has already been issued and posted to the ledger must not be undone
 * by a Stripe hiccup.
 *
 * The write + audit entry is left to each caller, deliberately: L40 needs
 * them in the SAME transaction as each other, and verify-audit-coverage.mjs
 * checks that lexically, action body by action body — a shared helper's own
 * `audit.record` call would be invisible to it (a "review question, not an
 * exemption" per its own doc comment). A few duplicated lines beats a write
 * this checker can no longer see.
 */
async function decidePaymentLink(
  locals: App.Locals,
  invoiceId: string,
): Promise<PaymentLinkResult> {
  const [secretKey, invoice] = await withTenant(
    actorFrom(locals),
    async (tx): Promise<[string | null, acc.InvoiceRow | null]> => {
      const key = await gateway.stripeSecretKeyFor(tx, locals.tenantId!)
      return [key, await acc.invoiceById(tx, invoiceId)]
    },
  )

  if (!invoice) return { outcome: "skipped", reason: "No such invoice." }
  // The UI's own "may.createPaymentLink" gate already hides the retry
  // button once a link exists — checked again here since a client-side
  // gate is never the real boundary. Retry is for a missing link, not a
  // replacement: minting a second live Payment Link would leave the first
  // one (charging whatever was owed when IT was created) still chargeable
  // in Stripe, and there would be nothing here to say so — the audit
  // entry's own "from" would have to lie about what was there before.
  if (invoice.payment_url) {
    return {
      outcome: "skipped",
      reason: "This invoice already has a payment link.",
    }
  }
  if (!secretKey) {
    return {
      outcome: "skipped",
      reason: "No Stripe key is configured for this tenant.",
    }
  }
  if (invoice.status === "draft" || invoice.status === "void") {
    return {
      outcome: "skipped",
      reason: "A draft or void invoice has nothing to pay.",
    }
  }
  if (!invoice.amount_due || Number(invoice.amount_due) <= 0) {
    return { outcome: "skipped", reason: "Nothing is due on this invoice." }
  }

  try {
    const link = await createInvoicePaymentLink(secretKey, {
      invoiceId,
      invoiceNumber: invoice.invoice_number,
      tenantId: locals.tenantId!,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
    })
    return { outcome: "created", link: { url: link.url, gatewayId: link.id } }
  } catch (e) {
    if (e instanceof UnsupportedCurrency) {
      return {
        outcome: "failed",
        warning: `No payment link was created: ${invoice.currency} is not supported for online payment yet.`,
      }
    }
    return {
      outcome: "failed",
      warning:
        "Could not create a Stripe payment link for this invoice. You can retry from this page.",
    }
  }
}

export const actions: Actions = {
  /** Issue the invoice and recognise revenue in the same transaction. */
  issue: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    let issued: string
    try {
      ;({ issued } = await withTenant(actorFrom(locals), async (tx) => {
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
      }))
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }

    const linkResult = await decidePaymentLink(locals, params.id)
    if (linkResult.outcome === "created") {
      await withTenant(actorFrom(locals), async (tx) => {
        await acc.setInvoicePaymentLink(
          tx,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
          linkResult.link,
        )
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "invoices",
          entityId: params.id,
          module: "accounting",
          changes: { payment_url: { from: null, to: linkResult.link.url } },
        })
      })
    }
    return {
      issued,
      paymentLinkWarning:
        linkResult.outcome === "failed" ? linkResult.warning : null,
    }
  },

  /** Retries payment-link creation — a transient Stripe failure at issuance, or an invoice issued before this feature existed. */
  createPaymentLink: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const result = await decidePaymentLink(locals, params.id)
    if (result.outcome === "failed") {
      return fail(400, { message: result.warning, errorFields: [] })
    }
    if (result.outcome === "skipped") {
      return fail(400, { message: result.reason, errorFields: ["invoice"] })
    }

    await withTenant(actorFrom(locals), async (tx) => {
      await acc.setInvoicePaymentLink(
        tx,
        params.id,
        ctx!.employeeId ?? ctx!.userId,
        result.link,
      )
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "invoices",
        entityId: params.id,
        module: "accounting",
        changes: { payment_url: { from: null, to: result.link.url } },
      })
    })
    return { linkCreated: true }
  },

  /** Receive money against it: DR Cash, CR Receivables, in the same write. */
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
      // A bank account chosen from a list that has since changed.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  /** A credit memo: DR Revenue, CR Receivables — reverses revenue without cash. */
  recordCredit: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    // `min` here keeps the zero/negative case a field error, not a CHECK 500 (L66).
    const amount = f.decimal("credit_amount", {
      scale: 2,
      required: true,
      min: 0.01,
    })
    const creditDate = f.date("credit_date", { required: true })
    const reason = f.text("credit_reason", { max: 500, required: true })
    if (!f.ok) return fail(400, f.problem("That credit is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const before = await acc.invoiceById(tx, params.id)
        const { creditNumber, status } = await acc.recordCreditMemo(
          tx,
          locals.tenantId!,
          {
            invoiceId: params.id,
            amount: amount!,
            creditDate: creditDate!,
            reason: reason!,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await acc.invoiceById(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "record_credit",
          entityType: "invoices",
          entityId: params.id,
          module: "accounting",
          changes: {
            credit: { from: null, to: creditNumber },
            amount: { from: null, to: amount },
            amount_due: {
              from: before?.amount_due ?? null,
              to: after?.amount_due ?? null,
            },
            status: { from: before?.status ?? null, to: status },
          },
          reason,
        })
        return { credited: creditNumber, status }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** A bad-debt write-off: DR Bad Debt Expense, CR Receivables. Not a credit memo — the sale still happened. */
  recordWriteOff: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    // `min` here keeps the zero/negative case a field error, not a CHECK 500 (L66).
    const amount = f.decimal("writeoff_amount", {
      scale: 2,
      required: true,
      min: 0.01,
    })
    const writeoffDate = f.date("writeoff_date", { required: true })
    const reason = f.text("writeoff_reason", { max: 500, required: true })
    if (!f.ok) return fail(400, f.problem("That write-off is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const before = await acc.invoiceById(tx, params.id)
        const { creditNumber, status } = await acc.recordWriteOff(
          tx,
          locals.tenantId!,
          {
            invoiceId: params.id,
            amount: amount!,
            creditDate: writeoffDate!,
            reason: reason!,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await acc.invoiceById(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "record_writeoff",
          entityType: "invoices",
          entityId: params.id,
          module: "accounting",
          changes: {
            writeoff: { from: null, to: creditNumber },
            amount: { from: null, to: amount },
            amount_due: {
              from: before?.amount_due ?? null,
              to: after?.amount_due ?? null,
            },
            status: { from: before?.status ?? null, to: status },
          },
          reason,
        })
        return { writtenOff: creditNumber, status }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** Void a draft only — once issued, reversing it needs a credit note, not an edit. */
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

  emailInvoice: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    type Refusal = { message: string; errorFields: string[] }

    // Read-only lookup, its own short transaction: the PDF render below is
    // CPU work and the logo download and email send are network calls, none
    // of which should hold a Postgres transaction open while they run.
    let data: acc.InvoiceForPdf
    let locale: string
    try {
      ;[data, locale] = await withTenant(
        actorFrom(locals),
        async (tx): Promise<[acc.InvoiceForPdf, string]> => {
          const invoiceData = await acc.invoiceForPdf(tx, params.id)
          const [tenant, locations] = await Promise.all([
            tx<{ default_locale: string }[]>`
            SELECT default_locale FROM tenants WHERE id = ${locals.tenantId}::uuid
          `,
            locationsRepo.list(tx),
          ])
          return [
            invoiceData,
            localeForCurrency(
              locations,
              invoiceData.currency,
              tenant[0]?.default_locale ?? "en-US",
            ),
          ]
        },
      )
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }

    // The UI's own "may.email" gate already excludes drafts — checked again
    // here since a client-side gate is never the real boundary. A draft has
    // nothing posted yet; emailing it would hand a customer a document that
    // isn't actually owed.
    if (data.status === "draft") {
      return fail(400, {
        message: "A draft invoice has not been issued yet — issue it first.",
        errorFields: ["invoice"],
      } satisfies Refusal)
    }
    if (!data.customer_email) {
      return fail(400, {
        message:
          "This customer has no email on file. Add one before emailing an invoice.",
        errorFields: ["invoice"],
      } satisfies Refusal)
    }

    let logoBytes: Buffer | null = null
    if (data.company_logo_storage_key) {
      const { data: logo } = await locals.supabase.storage
        .from("tenant-logos")
        .download(data.company_logo_storage_key)
      if (logo) logoBytes = Buffer.from(await logo.arrayBuffer())
    }
    const pdf = await renderInvoicePdf(data, logoBytes)

    const senderAddress =
      env.PRIVATE_FROM_ADMIN_EMAIL || env.PRIVATE_ADMIN_EMAIL
    const result = await sendTemplatedEmail({
      subject: `Invoice ${data.invoice_number} from ${data.company_name}`,
      to_emails: [data.customer_email],
      from_email: `${data.company_name} <${senderAddress}>`,
      template_name: "invoice_email",
      template_properties: {
        invoiceNumber: data.invoice_number,
        firmName: data.company_name,
        amountDue: money(data.amount_due, data.currency, locale),
        dueDate: data.due_date ? calendarDate(data.due_date, locale) : "",
        paymentUrl: data.payment_url ?? "",
      },
      attachments: [{ filename: `${data.invoice_number}.pdf`, content: pdf }],
    })
    if (!result.sent) {
      return fail(400, {
        message: `Could not send the email (${result.reason}).`,
        errorFields: [],
      } satisfies Refusal)
    }

    await withTenant(actorFrom(locals), async (tx) => {
      await audit.record(tx, ctx!, {
        action: "update",
        entityType: "invoices",
        entityId: params.id,
        module: "accounting",
        changes: {
          emailed_to: { from: null, to: data.customer_email },
        },
      })
    })
    return { emailSent: data.customer_email }
  },
}

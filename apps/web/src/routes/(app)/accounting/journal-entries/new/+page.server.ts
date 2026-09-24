import { error, fail, redirect } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { listExpenseAccountsForPicker } from "$lib/server/accounting/payables.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { compareDecimal } from "$lib/decimal"
import { constraintFailure } from "$lib/server/db/constraints"

const MAX_LINES = 50

/** /accounting/journal-entries/new — a manual adjustment or correction, posted immediately (US-ACC-034). */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the general ledger.")
  }
  return withTenant(actorFrom(locals), async (tx) => ({
    accounts: await listExpenseAccountsForPicker(tx),
  }))
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_such_account":
      return {
        message:
          "One of these lines points at an account that no longer exists. Reload the page and pick from the current list.",
        errorFields: ["lines"],
      }
    case "no_lines":
      return {
        message: "A journal entry needs at least two lines.",
        errorFields: ["lines"],
      }
    case "does_not_balance":
      return {
        message: `That entry does not balance and was not posted (${e.detail}).`,
        errorFields: ["lines"],
      }
    case "period_closed":
      return {
        message: `${e.detail}. Pick a date in an open period.`,
        errorFields: ["entry_date"],
      }
    default:
      return {
        message: "That journal entry could not be posted.",
        errorFields: ["entry"],
      }
  }
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const entryDate = f.date("entry_date", { required: true })
    const description = f.text("description", { max: 500, required: true })
    const reference = f.text("reference", { max: 100 })
    const currency = f.currency("currency", { required: true })
    const exchangeRate = f.decimal("exchange_rate", {
      scale: 6,
      required: true,
      min: 0.000001,
    })

    // Read every field BEFORE the `!f.ok` gate (L33/L68) — including every
    // row, so a row that fails validation is reported, not silently dropped.
    const lineCount = f.integer("line_count", {
      required: true,
      min: 0,
      max: MAX_LINES,
    })
    const lines: acc.ManualJournalLine[] = []
    for (let i = 0; i < (lineCount ?? 0); i++) {
      const accountId = f.uuid(`lines.${i}.account_id`, { required: true })
      const lineDescription = f.text(`lines.${i}.description`, {
        max: 500,
        required: true,
      })
      const debit = f.decimal(`lines.${i}.debit`, { scale: 2, min: 0 }) ?? "0"
      const credit = f.decimal(`lines.${i}.credit`, { scale: 2, min: 0 }) ?? "0"
      // A real double-entry line carries exactly one side — both blank would
      // otherwise vanish silently (postJournal drops zero-amount lines
      // before its own line-count check), and both filled is not a line
      // anyone meant to enter.
      const debitSet = compareDecimal(debit, "0") > 0
      const creditSet = compareDecimal(credit, "0") > 0
      if (debitSet === creditSet) f.reject(`lines.${i}.debit`)
      lines.push({
        accountId: accountId ?? "",
        debit,
        credit,
        description: lineDescription ?? "",
      })
    }
    // A rule the per-row readers above cannot express on their own — zero
    // rows is valid to EACH per-row reader (there are none to fail) but
    // invalid for the entry as a whole.
    if ((lineCount ?? 0) < 2) f.reject("lines")
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const posted = await acc.recordManualJournalEntry(
          tx,
          locals.tenantId!,
          {
            date: entryDate!,
            description: description!,
            reference,
            currency: currency!,
            exchangeRate: exchangeRate!,
            lines,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "post_journal_entry",
          entityType: "journal_entries",
          entityId: posted.id,
          module: "accounting",
          changes: {
            entry: { from: null, to: posted.entryNumber },
            total_debit: { from: null, to: posted.totalDebit },
            lines: { from: null, to: String(lines.length) },
          },
          reason: description!,
        })
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }

    redirect(303, "/accounting/ledger")
  },
}

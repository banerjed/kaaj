import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /accounting/year-end-close — zero revenue/expense into retained earnings (US-ACC-051). */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see year-end close.")
  }

  const params = new FormData()
  params.append("as_of", url.searchParams.get("as_of") ?? "")
  const f = new FormReader(params)
  const asOf = f.date("as_of")
  if (!f.ok) error(400, "That date is not a real date.")

  return withTenant(actorFrom(locals), async (tx) => ({
    asOf: asOf ?? "",
    preview: asOf ? await acc.previewYearEndClose(tx, asOf) : null,
    mayWrite: can(ctx, "accounting.write"),
  }))
}

/** A domain refusal the page can show, rather than a constraint name in a 500. */
function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_lines":
      return {
        message:
          "Every revenue and expense account is already at zero as of this date — there is nothing to close.",
        errorFields: ["as_of"],
      }
    case "period_closed":
      return {
        message: `${e.detail}. Pick a date in an open period, or reopen that one first.`,
        errorFields: ["as_of"],
      }
    case "no_such_account":
      return {
        message: `The chart of accounts has no Retained Earnings account. Nothing was closed.`,
        errorFields: ["as_of"],
      }
    case "allocation_mismatch":
      return {
        message: `${e.detail}. Review the new preview and close again if it still looks right.`,
        errorFields: ["as_of"],
      }
    default:
      return {
        message: "That could not be completed.",
        errorFields: ["as_of"],
      }
  }
}

export const actions: Actions = {
  close: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const asOf = f.date("as_of", { required: true })
    const expectedNetIncome = f.decimal("expected_net_income", {
      scale: 2,
      required: true,
    })
    if (!f.ok) return fail(400, f.problem())

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const { entryNumber, netIncome } = await acc.yearEndClose(
          tx,
          locals.tenantId!,
          { asOf: asOf!, expectedNetIncome: expectedNetIncome! },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "year_end_close",
          entityType: "journal_entries",
          module: "accounting",
          changes: {
            entry: { from: null, to: entryNumber },
            as_of: { from: null, to: asOf },
            net_income: { from: null, to: netIncome },
          },
        })
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { closed: true, asOf }
  },
}

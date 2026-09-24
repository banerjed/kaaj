import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import {
  AccountingRefused,
  AMORTIZATION_KINDS,
} from "$lib/server/accounting/accounting.repo"
import { listExpenseAccountsForPicker } from "$lib/server/accounting/payables.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/**
 * /accounting/accruals — §11: accruals (auto-reversing, posted immediately —
 * no scheduler involved) and deferred revenue/prepaid expense amortization
 * (a schedule, posted on demand — same manual-trigger shape as recurring
 * invoices and the reconciliation rules' apply-now action).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see accruals.")
  }

  return withTenant(actorFrom(locals), async (tx) => ({
    periods: (await acc.listAccountingPeriods(tx)).filter(
      (p) => p.status === "open",
    ),
    accounts: await listExpenseAccountsForPicker(tx),
    schedules: await acc.listAmortizationSchedules(tx),
    kinds: AMORTIZATION_KINDS,
    mayWrite: can(ctx, "accounting.write"),
  }))
}

function refusal(
  e: AccountingRefused,
  context: "accrual" | "postDue" = "accrual",
) {
  switch (e.reason) {
    case "no_such_period":
      return {
        message:
          "That period no longer exists. Reload the page and pick from the current list.",
        errorFields: ["period_id"],
      }
    case "no_next_period":
      return {
        message: `No period follows ${e.detail} — an accrual needs a next period to reverse into.`,
        errorFields: ["period_id"],
      }
    case "period_closed":
      return context === "postDue"
        ? {
            message: `A due schedule falls in ${e.detail} — reopen that period before posting due amortizations, or none of this run's entries post.`,
            errorFields: [],
          }
        : {
            message: `${e.detail}. Pick an open period, or reopen the next one first.`,
            errorFields: ["period_id"],
          }
    case "no_such_account":
      return {
        message:
          "That account no longer exists. Reload the page and pick from the current list.",
        errorFields: ["expense_account_id"],
      }
    case "does_not_balance":
      return {
        message: "That entry does not balance and was not posted.",
        errorFields: [],
      }
    default:
      return { message: "That could not be posted.", errorFields: [] }
  }
}

export const actions: Actions = {
  recordAccrual: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const periodId = f.uuid("period_id", { required: true })
    const expenseAccountId = f.uuid("expense_account_id", { required: true })
    const amount = f.decimal("amount", {
      scale: 2,
      required: true,
      min: 0.01,
    })
    const description = f.text("description", { max: 500, required: true })
    const reference = f.text("reference", { max: 100 })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const result = await acc.recordAccrual(
          tx,
          locals.tenantId!,
          {
            periodId: periodId!,
            expenseAccountId: expenseAccountId!,
            amount: amount!,
            description: description!,
            reference,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "post_journal_entry",
          entityType: "journal_entries",
          entityId: result.accrualEntryId,
          module: "accounting",
          changes: {
            accrual_entry: { from: null, to: result.accrualEntryNumber },
            reversal_entry: { from: null, to: result.reversalEntryNumber },
            amount: { from: null, to: amount! },
          },
          reason: description!,
        })
        return { accrual: result }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  createSchedule: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const kind = f.choice("kind", AMORTIZATION_KINDS, { required: true })
    const balanceSheetAccountId = f.uuid("balance_sheet_account_id", {
      required: true,
    })
    const incomeStatementAccountId = f.uuid("income_statement_account_id", {
      required: true,
    })
    const totalAmount = f.decimal("total_amount", {
      scale: 2,
      required: true,
      min: 0.01,
    })
    const periodsTotal = f.integer("periods_total", {
      required: true,
      min: 1,
      max: 360,
    })
    const nextRunDate = f.date("next_run_date", { required: true })
    const description = f.text("description", { max: 500, required: true })
    const reference = f.text("reference", { max: 100 })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { id } = await acc.createAmortizationSchedule(
          tx,
          locals.tenantId!,
          {
            kind,
            balanceSheetAccountId: balanceSheetAccountId!,
            incomeStatementAccountId: incomeStatementAccountId!,
            totalAmount: totalAmount!,
            periodsTotal: periodsTotal!,
            nextRunDate: nextRunDate!,
            description: description!,
            reference,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "amortization_schedules",
          entityId: id,
          module: "accounting",
          changes: {
            kind: { from: null, to: kind },
            total_amount: { from: null, to: totalAmount },
            periods_total: { from: null, to: String(periodsTotal) },
          },
        })
        return { scheduleCreated: true }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  /** Posts one recognition entry per schedule due today or earlier, once, on
   *  demand — there is no scheduler in this codebase to run it automatically. */
  postDue: async ({ locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const posted = await acc.postDueAmortizations(
          tx,
          locals.tenantId!,
          ctx!.employeeId ?? ctx!.userId,
        )
        if (posted.length > 0) {
          await audit.record(tx, ctx!, {
            action: "post_journal_entry",
            entityType: "journal_entries",
            module: "accounting",
            changes: {
              entries_posted: { from: null, to: String(posted.length) },
              entry_numbers: {
                from: null,
                to: posted.map((p) => p.entryNumber).join(", "),
              },
            },
          })
        }
        return { posted }
      })
    } catch (e) {
      if (e instanceof AccountingRefused)
        return fail(400, refusal(e, "postDue"))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as base from "$lib/server/compensation/compensation_base.repo"
import { RaiseRefused } from "$lib/server/compensation/compensation_base.repo"
import * as allowances from "$lib/server/compensation/compensation_allowances.repo"
import * as variable from "$lib/server/compensation/compensation_variable.repo"
import * as equity from "$lib/server/compensation/compensation_equity.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

/** Mirrors what the fixture and the schema actually use. */
const TYPES = ["salary", "hourly", "commission", "retainer"] as const

/**
 * /compensation/[employeeId] — one person's whole package.
 *
 * The row policy decides what comes back: your own record reaches you, and
 * everything reaches HR, payroll and an auditor. A person who may not see this
 * employee gets empty lists rather than an error, so the page says so rather
 * than rendering a blank shell (L21).
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const id = params.employeeId

  return withTenant(actorFrom(locals), async (tx) => {
    const [person] = await tx<
      {
        id: string
        first_name: string
        last_name: string
        job_title: string | null
      }[]
    >`
      SELECT id, first_name, last_name, job_title
        FROM employees WHERE id = ${id}::uuid
    `
    if (!person) error(404, "No such employee")

    const history = await base.listForEmployee(tx, id)
    return {
      person,
      // Newest first; the open row (no effective_to) is the current one.
      history,
      allowances: await allowances.currentForEmployee(tx, id),
      variable: await variable.currentForEmployee(tx, id),
      equity: await equity.forEmployee(tx, id),
      mayRecordChange: can(ctx, "compensation.write"),
      isSelf: ctx?.employeeId === id,
    }
  })
}

export const actions: Actions = {
  /**
   * Record a pay change.
   *
   * Two things this must not get wrong, both already handled by `addRaise`:
   * it closes the row it supersedes rather than leaving two open, and it
   * refuses a same-date, backdated or overlapping write instead of corrupting
   * the history.
   *
   * What is added here is the AUDIT ENTRY, in the same transaction. A pay
   * change is the example CLAUDE.md names: written afterwards or best-effort,
   * the trail records what the application believed happened, and the two
   * diverge exactly when someone is asking why (L40).
   */
  raise: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "compensation.write")

    const f = new FormReader(await request.formData())
    // Every field read BEFORE the gate. A reader called inside the object
    // built after `if (!f.ok)` runs once the gate has already passed, so its
    // rejection is raised too late to report — and a non-required field
    // returns null on rejection, saving NULL and answering saved: true (L33).
    const effectiveFrom = f.date("effective_from", { required: true })
    const amount = f.decimal("amount", { scale: 2, required: true })
    const currency = f.currency("currency", { required: true })
    const payFrequency = f.enumValue("pay_frequency", "pay_frequency", {
      required: true,
    })
    const compensationType = f.choice("compensation_type", TYPES, {
      required: true,
    })
    const annualEquivalent = f.decimal("annual_equivalent", { scale: 2 })
    const overtimeEligible = f.bool("overtime_eligible")
    const changeReason = f.text("change_reason", { max: 500 })

    if (!f.ok) return fail(400, f.problem("That pay change is not valid."))

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await base.addRaise(
          tx,
          locals.tenantId!,
          {
            employee_id: params.employeeId,
            effective_from: effectiveFrom!,
            compensation_type: compensationType!,
            amount: amount!,
            currency: currency!,
            pay_frequency: payFrequency!,
            annual_equivalent: annualEquivalent,
            overtime_eligible: overtimeEligible ?? false,
            change_reason: changeReason,
          },
          ctx!.employeeId ?? ctx!.userId,
        )

        // SAME TRANSACTION as the change itself. The fields that changed, not
        // a row dump: audit_log holds INSERT and SELECT only, so anything
        // written here is written forever.
        await audit.record(tx, ctx!, {
          action: "pay_change",
          entityType: "compensation_base",
          entityId: params.employeeId,
          module: "compensation",
          changes: {
            effective_from: effectiveFrom,
            amount,
            currency,
            pay_frequency: payFrequency,
            compensation_type: compensationType,
            change_reason: changeReason,
          },
        })
      })
    } catch (e) {
      if (e instanceof RaiseRefused) {
        return fail(400, {
          message:
            e.reason === "duplicate_date"
              ? "A pay record already starts on that date. Correct that record instead of adding another."
              : e.reason === "would_overlap"
                ? "That date overlaps a record already in place. Pick a date after the current one starts."
                : "That amount is larger than the column can hold.",
          field:
            e.reason === "amount_out_of_range" ? "amount" : "effective_from",
        })
      }
      throw e
    }

    return { recorded: true }
  },
}

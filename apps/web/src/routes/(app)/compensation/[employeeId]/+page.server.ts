import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as base from "$lib/server/compensation/compensation_base.repo"
import { RaiseRefused } from "$lib/server/compensation/compensation_base.repo"
import * as allowances from "$lib/server/compensation/compensation_allowances.repo"
import * as variable from "$lib/server/compensation/compensation_variable.repo"
import * as equity from "$lib/server/compensation/compensation_equity.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

/** Mirrors what the fixture and the schema actually use. */
const TYPES = ["salary", "hourly", "commission", "retainer"] as const

/** /compensation/[employeeId] — row policy scopes what returns; a refused viewer gets empty lists, not an error (L21). */
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
      // For per-market number formatting; see localeForCurrency.
      locations: await locationsRepo.list(tx),
    }
  })
}

export const actions: Actions = {
  /** Record a pay change; `addRaise` handles closing/overlap. Audit entry is in the same transaction (L40). */
  raise: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "compensation.write")

    const f = new FormReader(await request.formData())
    // Read above the gate — inside the object it'd be reported too late (L33).
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
        // Read the prior value first — the audit trail needs before AND after.
        const previous = (
          await base.listForEmployee(tx, params.employeeId)
        ).find((r) => r.effective_to === null)

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

        // Same transaction; only the fields that changed, as strings (L41).
        await audit.record(tx, ctx!, {
          action: "pay_change",
          entityType: "compensation_base",
          entityId: params.employeeId,
          module: "compensation",
          changes: {
            amount: { from: previous?.amount ?? null, to: amount },
            currency: { from: previous?.currency ?? null, to: currency },
            pay_frequency: {
              from: previous?.pay_frequency ?? null,
              to: payFrequency,
            },
            compensation_type: {
              from: previous?.compensation_type ?? null,
              to: compensationType,
            },
            effective_from: {
              from: previous?.effective_from ?? null,
              to: effectiveFrom,
            },
          },
          reason: changeReason,
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

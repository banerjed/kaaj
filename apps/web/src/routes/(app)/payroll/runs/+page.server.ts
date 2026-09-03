import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as runs from "$lib/server/payroll/payroll_runs.repo"
import { RunRefused } from "$lib/server/payroll/payroll_runs.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

// Vocabulary comes from the repository, so the filter can't drift from the lifecycle (L57).
const STATUSES = runs.RUN_STATUSES

/** What the fixture uses, and what the column will accept. */
const RUN_TYPES = ["regular", "off_cycle", "correction", "bonus"] as const

/** /payroll/runs — reading a run reads everyone's pay, so gated on `compensation.read.all`; opening one needs `payroll.run` instead. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "compensation.read.all")) {
    error(403, "Only payroll or HR can see pay runs.")
  }

  const params = new FormData()
  for (const k of ["country", "status"]) {
    params.append(k, url.searchParams.get(k) ?? "")
  }
  const f = new FormReader(params)
  const country = f.text("country", { max: 2, upper: true })
  const status = f.choice("status", STATUSES) ?? ""

  return withTenant(actorFrom(locals), async (tx) => ({
    runs: await runs.list(tx, {
      country: country ?? undefined,
      status,
    }),
    statuses: STATUSES,
    runTypes: RUN_TYPES,
    filters: { country: country ?? "", status },
    mayOpen: can(ctx, "payroll.run"),
    schedules: await tx<{ id: string; name: string; currency: string }[]>`
      SELECT id, name, currency FROM payroll_pay_schedules
       WHERE is_active IS NOT FALSE
       ORDER BY name
    `,
  }))
}

export const actions: Actions = {
  /** Open a draft run header only — line computation needs tax tables not in this database (see repo). Audited in the same transaction (L40). */
  openRun: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "payroll.run")

    const f = new FormReader(await request.formData())
    // Every reader above the gate (L33).
    const periodStart = f.date("pay_period_start", { required: true })
    const periodEnd = f.date("pay_period_end", { required: true })
    const payDate = f.date("pay_date", { required: true })
    const country = f.text("country", { max: 2, upper: true, required: true })
    const currency = f.currency("currency", { required: true })
    const runType = f.choice("run_type", RUN_TYPES, { required: true })
    const scheduleId = f.uuid("pay_schedule_id")

    // Rules the reader cannot express, so they arrive through the same path as
    // every other failure and the page can put the cursor on the field.
    if (periodEnd && periodStart && periodEnd < periodStart) {
      f.reject("pay_period_end")
    }
    // A pay date before the period it pays for is a typo with a bank transfer
    // behind it.
    if (payDate && periodEnd && payDate < periodEnd) f.reject("pay_date")

    if (!f.ok) return fail(400, f.problem("That pay run is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await runs.createRun(
          tx,
          locals.tenantId!,
          {
            pay_period_start: periodStart!,
            pay_period_end: periodEnd!,
            pay_date: payDate!,
            country: country!,
            currency: currency!,
            run_type: runType!,
            pay_schedule_id: scheduleId,
          },
          ctx!.employeeId ?? ctx!.userId,
        )

        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "payroll_runs",
          entityId: created.id,
          module: "payroll",
          changes: {
            run_id: { from: null, to: created.run_id },
            pay_period_start: { from: null, to: periodStart },
            pay_period_end: { from: null, to: periodEnd },
            pay_date: { from: null, to: payDate },
            country: { from: null, to: country },
            currency: { from: null, to: currency },
            run_status: { from: null, to: "draft" },
          },
        })

        return { opened: created.run_id }
      })
    } catch (e) {
      if (e instanceof RunRefused) {
        return fail(400, {
          message:
            e.reason === "number_taken"
              ? `A run already covers that period and country (${e.detail}). Two runs for one period is how somebody gets paid twice.`
              : "That pay run could not be opened.",
          field: "pay_period_start",
        })
      }
      // A schedule chosen from a list that has since changed.
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },
}

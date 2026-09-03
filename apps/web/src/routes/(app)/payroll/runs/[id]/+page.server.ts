import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as runs from "$lib/server/payroll/payroll_runs.repo"
import { RunRefused } from "$lib/server/payroll/payroll_runs.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/** /payroll/runs/[id] — the run, and every payslip in it. */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "compensation.read.all")) {
    error(403, "Only payroll or HR can see pay runs.")
  }

  return withTenant(actorFrom(locals), async (tx) => {
    const run = await runs.byId(tx, params.id)
    if (!run) error(404, "No such pay run")
    return {
      run,
      lines: await runs.linesFor(tx, run.id),
      // Calculator and approver are separate permissions (DB-enforced too).
      mayRun: can(ctx, "payroll.run"),
      mayApprove: can(ctx, "payroll.approve"),
      // The person who calculated it cannot approve it, whatever they hold.
      isCalculator: run.calculated_by_name !== null && can(ctx, "payroll.run"),
    }
  })
}

/** A domain refusal the page can put on a field, rather than a 500. */
function refusal(e: RunRefused) {
  switch (e.reason) {
    case "no_such_run":
      return { message: "That pay run no longer exists.", field: "run" }
    case "wrong_status":
      return {
        message: `A run cannot make that move (${e.detail}). Reload — someone else may have moved it.`,
        field: "run",
      }
    case "no_lines":
      return {
        message:
          "That run has no payslips in it. A run calculated over nothing reports zero and looks like a finished period in which nobody was paid.",
        field: "run",
      }
    case "self_approval":
      return {
        message:
          "You calculated this run, so you cannot approve it. That is separation of duties, and the database enforces it too.",
        field: "run",
      }
    case "never_calculated":
      return {
        message:
          "Nothing has calculated this run, so approving it would be one person doing the whole thing.",
        field: "run",
      }
    case "number_taken":
      return { message: "That run number is taken.", field: "run" }
  }
}

/** Change-set for a transition; totals are recomputed from the lines, money as strings (L41). */
function movement(
  from: runs.RunStatus,
  to: runs.RunStatus,
  after: runs.PayrollRun | null,
) {
  return {
    run_status: { from, to },
    employee_count: { from: null, to: String(after?.employee_count ?? 0) },
    total_gross_pay: { from: null, to: after?.total_gross_pay ?? null },
    total_net_pay: { from: null, to: after?.total_net_pay ?? null },
  }
}

// Each action writes its own audit entry inline — not via a shared helper,
// since verify-audit-coverage.mjs checks each action's body separately.
export const actions: Actions = {
  /** The lines are in; the header now describes them. */
  calculate: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "payroll.run")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from } = await runs.markCalculated(
          tx,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await runs.byId(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "payroll_runs",
          entityId: params.id,
          module: "payroll",
          changes: movement(from, "calculated", after),
        })
        return { moved: "calculated", from }
      })
    } catch (e) {
      if (e instanceof RunRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** The money is committed from here. Never by whoever calculated it. */
  approve: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "payroll.approve")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from } = await runs.approve(
          tx,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await runs.byId(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "approve",
          entityType: "payroll_runs",
          entityId: params.id,
          module: "payroll",
          changes: movement(from, "approved", after),
        })
        return { moved: "approved", from }
      })
    } catch (e) {
      if (e instanceof RunRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** The payment file is cut from here. */
  finalize: async ({ locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "payroll.approve")

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from } = await runs.finalize(
          tx,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
        )
        const after = await runs.byId(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "submit",
          entityType: "payroll_runs",
          entityId: params.id,
          module: "payroll",
          changes: movement(from, "finalized", after),
        })
        return { moved: "finalized", from }
      })
    } catch (e) {
      if (e instanceof RunRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** Cancel before finalisation — no route back; corrected by raising another run. */
  cancel: async ({ request, locals, params }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "payroll.run")

    const f = new FormReader(await request.formData())
    const reason = f.text("reason", { max: 500, required: true })
    if (!f.ok) {
      return fail(400, f.problem("Say why the run is being cancelled."))
    }

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from } = await runs.cancel(
          tx,
          params.id,
          ctx!.employeeId ?? ctx!.userId,
          reason,
        )
        const after = await runs.byId(tx, params.id)
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "payroll_runs",
          entityId: params.id,
          module: "payroll",
          changes: movement(from, "cancelled", after),
          // Prose goes in `reason`, never mixed with values — redaction
          // matches field NAMES.
          reason,
        })
        return { moved: "cancelled", from }
      })
    } catch (e) {
      if (e instanceof RunRefused) return fail(400, refusal(e))
      throw e
    }
  },
}

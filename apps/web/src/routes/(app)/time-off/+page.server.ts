import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as requests from "$lib/server/hr/hr_time_off_requests.repo"
import { DecisionRefused } from "$lib/server/hr/hr_time_off_requests.repo"
import * as balances from "$lib/server/hr/hr_time_off_balances.repo"
import * as policies from "$lib/server/hr/hr_time_off_policies.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import {
  can,
  contextFrom,
  managesEmployee,
  requireCan,
} from "$lib/server/auth/can"

/** /time-off — module-hr.md. Shows the approval queue and the signed-in employee's own balances. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const userId = locals.user?.id

  const status = url.searchParams.get("status") ?? ""

  return withTenant(actorFrom(locals), async (tx) => {
    const [me] = await tx<{ employee_id: string | null }[]>`
      SELECT employee_id FROM tenant_users WHERE user_id = ${userId ?? null}
    `
    const myEmployeeId = me?.employee_id ?? null

    return {
      requests: await requests.list(tx, { status }),
      myBalances: myEmployeeId
        ? await balances.forEmployee(tx, myEmployeeId)
        : [],
      policies: await policies.list(tx),
      locations: await locationsRepo.list(tx),
      myEmployeeId,
      filters: { status },
    }
  })
}

export const actions: Actions = {
  decide: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    // A manager may decide for their own reports without timeoff.approve; checked once the requester is known.
    if (!can(ctx, "timeoff.approve") && !can(ctx, "employee.read.reports")) {
      requireCan(ctx, "timeoff.approve")
    }
    const userId = locals.user?.id
    if (!userId) error(403, "No user")

    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    const decision = f.choice("decision", ["approved", "denied"] as const, {
      required: true,
    })
    // Shown to the requester, so it is bounded like any other stored text.
    const denialReason = f.text("denial_reason", { max: 1000 })

    if (!f.ok) return fail(400, f.problem("Missing request."))

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        // Approver is an employee, not an auth user — resolved here to keep the repository auth-free.
        const [me] = await tx<{ employee_id: string | null }[]>`
          SELECT employee_id FROM tenant_users WHERE user_id = ${userId}
        `
        if (!me?.employee_id) throw new DecisionRefused("self_approval")

        // Needed before the reporting-line check.
        const [subject] = await tx<
          { employee_id: string; total_hours: string }[]
        >`
          SELECT employee_id, total_hours::text AS total_hours
            FROM hr_time_off_requests WHERE id = ${id}
        `
        // Not the same as "already decided" — a missing row is a request that doesn't exist.
        if (!subject) throw new DecisionRefused("not_found")

        if (
          ctx &&
          !can(ctx, "timeoff.approve") &&
          !(await managesEmployee(tx, ctx, subject.employee_id))
        ) {
          throw new DecisionRefused("not_your_report")
        }
        await requests.decide(
          tx,
          id,
          decision as requests.Decision,
          me.employee_id,
          denialReason,
        )

        // Same transaction as the decision itself (L40).
        if (ctx) {
          await audit.record(tx, ctx, {
            action: decision === "approved" ? "approve" : "deny",
            entityType: "hr_time_off_requests",
            entityId: id,
            module: "hr",
            changes: {
              status: { from: "pending", to: decision },
            },
            reason: denialReason,
          })
        }
      })
    } catch (e) {
      if (e instanceof DecisionRefused) {
        return fail(400, {
          message:
            e.reason === "self_approval"
              ? "You cannot decide your own leave request."
              : e.reason === "not_your_report"
                ? "You can only decide requests from people who report to you."
                : e.reason === "not_found"
                  ? "That request no longer exists. Reload the page."
                  : "That request has already been decided.",
        })
      }
      throw e
    }

    return { decided: decision }
  },
}

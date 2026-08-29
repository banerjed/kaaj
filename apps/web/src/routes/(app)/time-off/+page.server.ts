import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as requests from "$lib/server/hr/hr_time_off_requests.repo"
import { DecisionRefused } from "$lib/server/hr/hr_time_off_requests.repo"
import * as balances from "$lib/server/hr/hr_time_off_balances.repo"
import * as policies from "$lib/server/hr/hr_time_off_policies.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant } from "$lib/server/db/tenant"
import { formString } from "$lib/server/forms"

/**
 * /time-off — module-hr.md.
 *
 * Shows the approval queue and, for whoever is signed in, their own balances.
 * The employee record is found from `tenant_users.employee_id`, which is the
 * link between an auth identity and a person in the firm.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const userId = locals.user?.id

  const status = url.searchParams.get("status") ?? ""

  return withTenant(locals.tenantId, async (tx) => {
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
    const tenantId = locals.tenantId
    const userId = locals.user?.id
    if (!userId) error(403, "No user")

    const data = await request.formData()
    const id = formString(data, "id")
    const decision = formString(data, "decision")
    const denialReason = formString(data, "denial_reason").trim() || null

    if (!id) return fail(400, { message: "Missing request." })
    if (decision !== "approved" && decision !== "denied") {
      return fail(400, { message: "Unknown decision." })
    }

    try {
      await withTenant(tenantId, async (tx) => {
        // The approver is an EMPLOYEE, not an auth user. Resolving it here
        // keeps the repository free of auth concepts.
        const [me] = await tx<{ employee_id: string | null }[]>`
          SELECT employee_id FROM tenant_users WHERE user_id = ${userId}
        `
        if (!me?.employee_id) throw new DecisionRefused("self_approval")
        await requests.decide(tx, id, decision, me.employee_id, denialReason)
      })
    } catch (e) {
      if (e instanceof DecisionRefused) {
        return fail(400, {
          message:
            e.reason === "self_approval"
              ? "You cannot decide your own leave request."
              : "That request has already been decided.",
        })
      }
      throw e
    }

    return { decided: decision }
  },
}

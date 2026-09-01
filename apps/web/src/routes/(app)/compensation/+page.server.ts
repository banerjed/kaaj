import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as base from "$lib/server/compensation/compensation_base.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

/**
 * /compensation — your own pay, and everyone's if you may see it.
 *
 * **Nothing here filters by person.** `compensation_base` carries a
 * row-visibility policy (20260831090000): the database returns your own row
 * to you, and every row to HR, payroll and an auditor. Re-filtering in the
 * repository would duplicate the rule in a second place, and the two would
 * eventually disagree — the policy is the rule, and disclosure.test.ts asserts
 * it against eleven actor archetypes.
 *
 * So there is no permission gate on the page either. Everyone may look; what
 * they SEE is decided one layer down, and an employee who is not HR simply
 * gets one row: their own.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)

  return withTenant(actorFrom(locals), async (tx) => {
    const rows = await base.currentForAll(tx)

    return {
      rows,
      // Drives the wording, not the data: the data is already scoped.
      seesEveryone: can(ctx, "compensation.read.all"),
      mayRecordChange: can(ctx, "compensation.write"),
      myEmployeeId: ctx?.employeeId ?? null,
    }
  })
}

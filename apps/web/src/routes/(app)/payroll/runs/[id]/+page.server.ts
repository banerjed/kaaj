import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as runs from "$lib/server/payroll/payroll_runs.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

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
    return { run, lines: await runs.linesFor(tx, run.id) }
  })
}

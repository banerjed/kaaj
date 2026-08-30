import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as runs from "$lib/server/payroll/payroll_runs.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

// Mirrors payroll_runs_status_is_known (20260831140000).
const STATUSES = [
  "draft",
  "calculating",
  "calculated",
  "approved",
  "finalized",
  "paid",
  "cancelled",
] as const

/**
 * /payroll/runs — module-payroll.md.
 *
 * Read-only. Calculating, approving and finalising a run all move money and
 * need the audit trail plus the separation of duties the schema already
 * enforces; they are not built.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  // Reading a run means reading everyone's pay in it.
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
    filters: { country: country ?? "", status },
  }))
}

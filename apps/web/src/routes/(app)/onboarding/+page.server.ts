import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as onboarding from "$lib/server/hr/hr_onboarding.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

/**
 * /onboarding — module-hr.md § Onboarding.
 *
 * Read-only for this slice. Generating a plan for a hire is a write, and it
 * should record WHICH template was chosen and why — a plan whose provenance is
 * lost cannot be explained when someone asks why a hire missed a step.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const readsAll = can(ctx, "employee.read.all")
  const me = ctx?.employeeId ?? null

  return withTenant(actorFrom(locals), async (tx) => ({
    // HR sees every hire's checklist; everyone else sees their own tasks and
    // the ones they have been asked to do.
    tasks: readsAll
      ? await onboarding.tasks(tx)
      : [
          ...(await onboarding.tasks(tx, { employeeId: me ?? undefined })),
          ...(await onboarding.tasks(tx, { assignedTo: me ?? undefined })),
        ].filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i),
    templates: readsAll ? await onboarding.templates(tx) : [],
    readsAll,
    me,
  }))
}

import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as reviews from "$lib/server/hr/hr_reviews.repo"
import * as goals from "$lib/server/hr/hr_goals.repo"
import * as feedback from "$lib/server/hr/hr_feedback.repo"
import { withTenant } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

/**
 * /performance — module-hr.md § Performance Management.
 *
 * Read-only for this slice. Writing a review, acknowledging one, and moving a
 * cycle between stages all need an audit trail — the roadmap's note that
 * approval state must not be inferable from a query alone applies here as much
 * as to time off.
 *
 * The repository, not this page, decides what a reader may see. A manager's
 * draft assessment is withheld from its subject there, so a second read path
 * cannot forget.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)

  const reader = {
    employeeId: ctx?.employeeId ?? null,
    readsAll: can(ctx, "performance.read.all"),
  }

  return withTenant(locals.tenantId, async (tx) => {
    const visible = await reviews.visibleTo(tx, reader)

    // Who this person manages, for the `manager_only` feedback rule. Resolved
    // here rather than in the repository so the repository stays a pure
    // question of visibility, and so this is one query rather than one per
    // note.
    const manages = reader.employeeId
      ? (
          await tx<{ id: string }[]>`
            WITH RECURSIVE reports AS (
              SELECT id FROM employees WHERE manager_id = ${reader.employeeId}
              UNION ALL
              SELECT e.id FROM employees e JOIN reports r ON e.manager_id = r.id
            )
            SELECT id FROM reports
          `
        ).map((r) => r.id)
      : []

    // Goals for exactly the people whose reviews this reader may see, so the
    // two halves of the page cannot disagree about who exists.
    const subjects = [...new Set(visible.map((r) => r.employee_id))]

    return {
      reviews: visible,
      goals: await goals.forEmployees(tx, subjects),
      feedback: await feedback.visibleTo(tx, { ...reader, manages }),
      cycles: await reviews.cycles(tx),
      progress: reader.readsAll
        ? await reviews.cycleProgress(tx, "2026-H1")
        : [],
      me: reader.employeeId,
      readsAll: reader.readsAll,
    }
  })
}

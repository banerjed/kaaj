import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as reviews from "$lib/server/hr/hr_reviews.repo"
import * as goals from "$lib/server/hr/hr_goals.repo"
import * as feedback from "$lib/server/hr/hr_feedback.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { ReviewRefused } from "$lib/server/hr/hr_reviews.repo"

/**
 * /performance — module-hr.md § Performance Management.
 *
 * Submitting and acknowledging a review both write an audit entry in the same
 * transaction as the change. Acknowledgement in particular is the ONLY evidence
 * that a person read their review, which is the fact that matters in a dispute
 * about a performance process — inferring it from a status column alone would
 * leave nobody able to say when, or who recorded it.
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

  return withTenant(actorFrom(locals), async (tx) => {
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

/** Messages a person can act on, not the refusal reason. */
const REFUSALS: Record<string, string> = {
  not_found: "That review no longer exists.",
  not_yours: "This is not your review to change.",
  wrong_status: "This review has already moved on.",
  backwards: "A review cannot go back a step.",
  nothing_to_submit: "Write your assessment before submitting it.",
}

export const actions: Actions = {
  submit: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "performance.write")

    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing review."))

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await reviews.submit(tx, id, { employeeId: ctx.employeeId })
        await audit.record(tx, ctx, {
          action: "submit",
          entityType: "review",
          entityId: id,
          module: "hr",
          // Never the assessment itself — audit.repo redacts it anyway, and
          // this table cannot be deleted from.
          changes: { status: { from: "draft", to: "submitted" } },
        })
      })
    } catch (e) {
      if (e instanceof ReviewRefused) {
        return fail(400, {
          message: REFUSALS[e.reason] ?? "That is not allowed.",
        })
      }
      throw e
    }
    return { submitted: true }
  },

  acknowledge: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    // Everyone acknowledges their OWN review, so this is the floor rather than
    // performance.write — the repository refuses anyone else's.
    requireCan(ctx, "performance.read.self")

    const f = new FormReader(await request.formData())
    const id = f.uuid("id", { required: true })
    if (!f.ok) return fail(400, f.problem("Missing review."))

    try {
      await withTenant(actorFrom(locals), async (tx) => {
        await reviews.acknowledge(tx, id, { employeeId: ctx.employeeId })
        await audit.record(tx, ctx, {
          action: "acknowledge",
          entityType: "review",
          entityId: id,
          module: "hr",
          changes: { status: { from: "submitted", to: "acknowledged" } },
        })
      })
    } catch (e) {
      if (e instanceof ReviewRefused) {
        return fail(400, {
          message: REFUSALS[e.reason] ?? "That is not allowed.",
        })
      }
      throw e
    }
    return { acknowledged: true }
  },
}

import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as objectives from "$lib/server/objectives/objectives.repo"
import { ObjectiveWriteRefused } from "$lib/server/objectives/objectives.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

const { OBJECTIVE_TYPES, OBJECTIVE_STATUSES } = objectives

/**
 * /objectives — the strategic layer over projects. No read gate, matching
 * /projects: an objective is firm business, every employee may see it.
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)

  return withTenant(actorFrom(locals), async (tx) => ({
    objectives: await objectives.list(tx),
    types: OBJECTIVE_TYPES,
    statuses: OBJECTIVE_STATUSES,
    // UI convenience only — the action re-enforces this gate.
    mayCreate: can(ctx, "projects.write"),
    clients: await tx<{ id: string; client_name: string }[]>`
      SELECT id, client_name FROM clients ORDER BY client_name
    `,
    owners: await tx<{ id: string; name: string }[]>`
      SELECT id, first_name || ' ' || last_name AS name
        FROM employees
       WHERE employment_status = 'active'
       ORDER BY first_name, last_name
    `,
    locations: await locationsRepo.list(tx),
  }))
}

export const actions: Actions = {
  /** Create an objective. Audited — target/actual revenue are figures an executive reads. */
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    const name = f.text("objective_name", { max: 200, required: true })
    const description = f.text("description", { max: 2000 })
    const type = f.choice("objective_type", OBJECTIVE_TYPES, {
      required: true,
    })
    const status = f.choice("status", OBJECTIVE_STATUSES, { required: true })
    const clientId = f.uuid("client_id")
    const ownerId = f.uuid("owner_employee_id")
    const startDate = f.date("start_date")
    const targetEnd = f.date("target_end_date")
    const fiscalYear = f.text("fiscal_year", { max: 10 })
    const quarter = f.text("quarter", { max: 10 })
    const targetRevenue = f.decimal("target_revenue", { scale: 4 })
    const currency = f.currency("currency", { required: true })

    if (startDate && targetEnd && targetEnd < startDate) {
      f.reject("target_end_date")
    }

    if (!f.ok) return fail(400, f.problem("That objective is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await objectives.createObjective(
          tx,
          locals.tenantId!,
          {
            objective_name: name!,
            description,
            objective_type: type!,
            status: status!,
            client_id: clientId,
            owner_employee_id: ownerId,
            start_date: startDate,
            target_end_date: targetEnd,
            fiscal_year: fiscalYear,
            quarter,
            target_revenue: targetRevenue,
            currency: currency!,
          },
          ctx!.employeeId ?? ctx!.userId,
        )

        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "objectives",
          entityId: created.id,
          module: "projects",
          changes: {
            objective_number: { from: null, to: created.objective_number },
            objective_name: { from: null, to: name },
            status: { from: null, to: status },
            target_revenue: { from: null, to: targetRevenue },
            currency: { from: null, to: currency },
          },
        })

        return { created: created.objective_number }
      })
    } catch (e) {
      if (e instanceof ObjectiveWriteRefused) {
        return fail(400, {
          message:
            "Another objective was created at the same moment and took that number. Try again.",
          field: "objective_name",
        })
      }
      throw e
    }
  },
}

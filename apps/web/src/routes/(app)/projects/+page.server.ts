import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as projects from "$lib/server/projects/projects.repo"
import { ProjectWriteRefused } from "$lib/server/projects/projects.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

// The vocabularies come from the repository, not from a copy here. These
// columns are plain `text` with no enum and no CHECK behind them, so the list
// is the only control — and two lists are one list that will disagree.
const {
  PROJECT_STATUSES: STATUSES,
  PROJECT_HEALTHS: HEALTHS,
  PROJECT_PRIORITIES: PRIORITIES,
} = projects

/**
 * /projects — the project list.
 *
 * No permission gate on the READ: a project is firm business data and everyone
 * in the firm may see the board. What a CLIENT sees is a different boundary
 * entirely, and lives in `clientVisibleOnly`. Creating one is gated —
 * `projects.write`.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)

  const params = new FormData()
  for (const k of ["status", "health"]) {
    params.append(k, url.searchParams.get(k) ?? "")
  }
  const f = new FormReader(params)
  const status = f.choice("status", STATUSES) ?? ""
  const health = f.choice("health", HEALTHS) ?? ""

  return withTenant(actorFrom(locals), async (tx) => ({
    projects: await projects.list(tx, { status, health }),
    statuses: STATUSES,
    healths: HEALTHS,
    priorities: PRIORITIES,
    filters: { status, health },
    // The form is only rendered for someone who may submit it. The gate is
    // still enforced in the action — a hidden form is a UI convenience, never
    // a control.
    mayCreate: can(ctx, "projects.write"),
    // Options for the create form. Both are firm-wide reference data the
    // whole board already sees.
    clients: await tx<{ id: string; client_name: string }[]>`
      SELECT id, client_name FROM clients ORDER BY client_name
    `,
    managers: await tx<{ id: string; name: string }[]>`
      SELECT id, first_name || ' ' || last_name AS name
        FROM employees
       WHERE employment_status = 'active'
       ORDER BY first_name, last_name
    `,
  }))
}

export const actions: Actions = {
  /**
   * Create a project.
   *
   * Audited: `budget`, `hourly_rate` and `is_billable` are what a client is
   * eventually billed against, so "who set this, and to what" is a question
   * with money behind it. The audit entry goes in the SAME transaction as the
   * INSERT — written afterwards, the trail records what the application
   * believed happened (L40).
   */
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    // Every reader ABOVE the gate. Called inside the object built after
    // `if (!f.ok)` it runs once the gate has passed, so a rejection is raised
    // too late to report — and a non-required field returns null on rejection,
    // saving NULL and answering success (L33).
    const projectName = f.text("project_name", { max: 200, required: true })
    const description = f.text("description", { max: 2000 })
    const clientId = f.uuid("client_id")
    const managerId = f.uuid("project_manager_id")
    const status = f.choice("status", STATUSES, { required: true })
    const priority = f.choice("priority", PRIORITIES, { required: true })
    const health = f.choice("health_status", HEALTHS, { required: true })
    const startDate = f.date("start_date")
    const targetEnd = f.date("target_end_date")
    // numeric(18,4): a rate of 12.3456/hour is meaningful, and money is a
    // string end to end — `decimal` never lets it become a float64.
    const budget = f.decimal("budget", { scale: 4 })
    const currency = f.currency("currency", { required: true })
    const estimatedHours = f.decimal("estimated_hours", { scale: 4 })
    const hourlyRate = f.decimal("hourly_rate", { scale: 4 })
    const isBillable = f.bool("is_billable")

    // A rule the reader cannot express, so it arrives through the same path as
    // every other failure and the page can put the cursor on the field.
    if (startDate && targetEnd && targetEnd < startDate) {
      f.reject("target_end_date")
    }

    if (!f.ok) return fail(400, f.problem("That project is not valid."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const created = await projects.createProject(
          tx,
          locals.tenantId!,
          {
            project_name: projectName!,
            description,
            client_id: clientId,
            project_manager_id: managerId,
            status: status!,
            priority: priority!,
            health_status: health!,
            start_date: startDate,
            target_end_date: targetEnd,
            budget,
            currency: currency!,
            estimated_hours: estimatedHours,
            is_billable: isBillable,
            hourly_rate: hourlyRate,
          },
          ctx!.employeeId ?? ctx!.userId,
        )

        // A creation has no "from". Recording null on the left is honest —
        // it says the field did not exist before — and keeps the shape the
        // table stores for every other entry.
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "projects",
          entityId: created.id,
          module: "projects",
          changes: {
            project_number: { from: null, to: created.project_number },
            project_name: { from: null, to: projectName },
            status: { from: null, to: status },
            budget: { from: null, to: budget },
            currency: { from: null, to: currency },
            hourly_rate: { from: null, to: hourlyRate },
            is_billable: { from: null, to: String(isBillable) },
          },
        })

        return { created: created.project_number }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) {
        return fail(400, {
          message:
            "Another project was created at the same moment and took that number. Try again.",
          field: "project_name",
        })
      }
      throw e
    }
  },
}

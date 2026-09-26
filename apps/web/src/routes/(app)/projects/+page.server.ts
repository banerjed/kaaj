import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as projects from "$lib/server/projects/projects.repo"
import { ProjectWriteRefused } from "$lib/server/projects/projects.repo"
import * as objectives from "$lib/server/objectives/objectives.repo"
import * as templates from "$lib/server/projects/templates.repo"
import { TemplateWriteRefused } from "$lib/server/projects/templates.repo"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"

// Vocabulary comes from the repository — two copies of a text-column list would drift (L57).
const {
  PROJECT_STATUSES: STATUSES,
  PROJECT_HEALTHS: HEALTHS,
  PROJECT_PRIORITIES: PRIORITIES,
} = projects

/**
 * /projects — the project list. No read gate: the board is firm-wide. Client
 * visibility is a separate boundary (`clientVisibleOnly`); creating is gated on `projects.write`.
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
    // UI convenience only — the action re-enforces this gate.
    mayCreate: can(ctx, "projects.write"),
    // Options for the create form; firm-wide reference data.
    clients: await tx<{ id: string; client_name: string }[]>`
      SELECT id, client_name FROM clients ORDER BY client_name
    `,
    managers: await tx<{ id: string; name: string }[]>`
      SELECT id, first_name || ' ' || last_name AS name
        FROM employees
       WHERE employment_status = 'active'
       ORDER BY first_name, last_name
    `,
    objectives: await objectives.list(tx),
    // For per-market number formatting; see localeForCurrency.
    locations: await locationsRepo.list(tx),
    templates: await templates.listTemplates(tx),
  }))
}

export const actions: Actions = {
  /** Create a project. Audited (billing fields) in the same transaction as the INSERT (L40). */
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "projects.write")

    const f = new FormReader(await request.formData())
    // Every reader above the `if (!f.ok)` gate — see CLAUDE.md's FormReader ordering rule (L33).
    const projectName = f.text("project_name", { max: 200, required: true })
    const description = f.text("description", { max: 2000 })
    const clientId = f.uuid("client_id")
    const managerId = f.uuid("project_manager_id")
    const objectiveId = f.uuid("objective_id")
    const status = f.choice("status", STATUSES, { required: true })
    const priority = f.choice("priority", PRIORITIES, { required: true })
    const health = f.choice("health_status", HEALTHS, { required: true })
    const startDate = f.date("start_date")
    const targetEnd = f.date("target_end_date")
    const budget = f.decimal("budget", { scale: 4 })
    const currency = f.currency("currency", { required: true })
    const estimatedHours = f.decimal("estimated_hours", { scale: 4 })
    const hourlyRate = f.decimal("hourly_rate", { scale: 4 })
    const isBillable = f.bool("is_billable")
    const templateId = f.uuid("template_id")

    // f.reject: a rule the reader can't express, but the field still gets marked.
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
            objective_id: objectiveId,
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

        // A creation has no "from" — null on the left keeps the same shape as every other entry.
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

        // Seed the task list from a template, if one was picked. A `for`
        // loop calling createTask once per template task is bounded by how
        // many tasks are IN THE TEMPLATE (a human-curated list a person
        // built via "Save as template"), never by table growth — same shape
        // as accounting's invoice_lines/bill_lines loops
        // (verify-no-loop-queries.mjs EXEMPT).
        if (templateId) {
          const templateTasks = await templates.tasksFromTemplate(
            tx,
            templateId,
          )
          for (const tt of templateTasks) {
            const dueDate =
              startDate && tt.due_offset_days !== null
                ? addDays(startDate, tt.due_offset_days)
                : null
            await projects.createTask(
              tx,
              locals.tenantId!,
              {
                project_id: created.id,
                task_name: tt.task_name,
                description: tt.description,
                status: "todo",
                priority: tt.priority,
                assigned_to: null,
                start_date: null,
                due_date: dueDate,
                estimated_hours: tt.estimated_hours,
                is_billable: true,
              },
              ctx!.employeeId ?? ctx!.userId,
            )
          }
          await templates.recordUse(tx, templateId)
        }

        return { created: created.project_number }
      })
    } catch (e) {
      if (e instanceof ProjectWriteRefused) {
        if (e.reason === "no_such_objective") {
          return fail(400, {
            message: "That objective no longer exists. Reload and try again.",
            field: "objective_id",
          })
        }
        return fail(400, {
          message:
            "Another project was created at the same moment and took that number. Try again.",
          field: "project_name",
        })
      }
      if (e instanceof TemplateWriteRefused) {
        return fail(400, {
          message: "That template no longer exists. Reload and try again.",
          field: "template_id",
        })
      }
      throw e
    }
  },
}

/** `YYYY-MM-DD` + a day offset — plain date arithmetic, no timezone involved (a DATE column, not a timestamptz). */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

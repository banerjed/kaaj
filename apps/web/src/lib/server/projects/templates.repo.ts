import type { Tx } from "../db/tenant"

/**
 * Project templates (docs/25-project-management-phase2.md). `template_data`
 * is intentionally minimal — a snapshot of a project's TOP-LEVEL tasks only
 * (name, description, priority, estimated hours, and a day-offset from the
 * earliest due date among them). Assignees, dates and dependencies are
 * per-run decisions, never captured: a template is a shape to start from, not
 * a clone of one project's specific schedule or staffing.
 */

export type TemplateTask = {
  task_name: string
  description: string | null
  priority: string | null
  estimated_hours: string | null
  /** Days from the new project's own start date — null if the source task had no due date. */
  due_offset_days: number | null
}

export type TemplateRow = {
  id: string
  template_id: string | null
  name: string
  description: string | null
  category: string | null
  use_count: number
  task_count: number
}

export class TemplateWriteRefused extends Error {
  constructor(readonly reason: "no_such_project" | "no_such_template") {
    super(reason)
    this.name = "TemplateWriteRefused"
  }
}

/** The next `TPL-nnn`, from the numbers already in use — same approach as projects.repo.ts's `nextNumber`. */
async function nextTemplateId(tx: Tx): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT coalesce(
             max(nullif(substring(template_id from '[0-9]+$'), '')::int),
             0
           ) + 1 AS n
      FROM pm_project_templates
  `
  return `TPL-${String(row.n).padStart(3, "0")}`
}

export async function listTemplates(tx: Tx): Promise<TemplateRow[]> {
  return tx<TemplateRow[]>`
    SELECT id, template_id, name, description, category, use_count,
           coalesce(jsonb_array_length(template_data -> 'tasks'), 0) AS task_count
      FROM pm_project_templates
     ORDER BY name
  `
}

/**
 * Capture a project's top-level tasks into a new template. `tenantId` is the
 * caller's own tenant (never derived from the project row) — same discipline
 * as `createTask`/`createProject`.
 */
export async function saveAsTemplate(
  tx: Tx,
  tenantId: string,
  projectId: string,
  input: { name: string; description: string | null; category: string | null },
  actorId: string,
): Promise<{ id: string; template_id: string }> {
  const [project] = await tx<{ id: string }[]>`
    SELECT id FROM projects WHERE id = ${projectId}::uuid
  `
  if (!project) throw new TemplateWriteRefused("no_such_project")

  const tasks = await tx<
    {
      task_name: string
      description: string | null
      priority: string | null
      estimated_hours: string | null
      due_date: string | null
    }[]
  >`
    SELECT task_name, description, priority, estimated_hours::text AS estimated_hours,
           to_char(due_date,'YYYY-MM-DD') AS due_date
      FROM tasks
     WHERE project_id = ${projectId}::uuid AND parent_task_id IS NULL
     ORDER BY task_number
  `

  // The offset anchor is the earliest due date among top-level tasks — a task
  // with no due date gets no offset (createFromTemplate leaves its due_date
  // null rather than guessing one).
  const dueDates = tasks
    .map((t) => t.due_date)
    .filter((d): d is string => d !== null)
  const anchor = dueDates.length
    ? dueDates.reduce((a, b) => (a < b ? a : b))
    : null
  const templateTasks: TemplateTask[] = tasks.map((t) => ({
    task_name: t.task_name,
    description: t.description,
    priority: t.priority,
    estimated_hours: t.estimated_hours,
    due_offset_days:
      t.due_date && anchor
        ? Math.round((Date.parse(t.due_date) - Date.parse(anchor)) / 86_400_000)
        : null,
  }))

  const templateId = await nextTemplateId(tx)
  const [row] = await tx<{ id: string; template_id: string }[]>`
    INSERT INTO pm_project_templates (
      tenant_id, template_id, name, description, category, template_data, created_by
    ) VALUES (
      ${tenantId}::uuid, ${templateId}, ${input.name}, ${input.description},
      ${input.category}, ${tx.json({ tasks: templateTasks } as never)}, ${actorId}
    )
    RETURNING id, template_id
  `
  return row
}

/** The task list a new project should be seeded with — the caller creates each task and refreshes counters, same as any other task write. */
export async function tasksFromTemplate(
  tx: Tx,
  templateId: string,
): Promise<TemplateTask[]> {
  const [row] = await tx<{ template_data: { tasks: TemplateTask[] } }[]>`
    SELECT template_data FROM pm_project_templates WHERE id = ${templateId}::uuid
  `
  if (!row) throw new TemplateWriteRefused("no_such_template")
  return row.template_data.tasks ?? []
}

/** A monotonic usage counter, not a derived aggregate (unlike `task_count`) — a plain increment is correct here. */
export async function recordUse(tx: Tx, templateId: string): Promise<void> {
  await tx`
    UPDATE pm_project_templates SET use_count = use_count + 1
     WHERE id = ${templateId}::uuid
  `
}

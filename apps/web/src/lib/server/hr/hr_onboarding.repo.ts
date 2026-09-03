import type { Tx } from "../db/tenant"

/**
 * hr_onboarding — templates, the tasks they generate, and a new hire's plan.
 *
 * Template selection is deterministic: most specific wins (dept+location >
 * dept > location > default), tie broken by template_code so row order never
 * decides it. `ambiguousFor` reports a real tie rather than resolving it silently.
 */

export type OnboardingTemplate = {
  id: string
  template_code: string
  template_name: string
  description: string | null
  applies_to_department_code: string | null
  applies_to_location_code: string | null
  applies_to_employment_types: string[] | null
  is_default: boolean
  task_count: number
  /** 3 = dept+location, 2 = dept, 1 = location, 0 = default. */
  specificity: number
}

const TEMPLATE_SELECT = `
  SELECT t.id, t.template_code, t.template_name, t.description,
         t.applies_to_department_code, t.applies_to_location_code,
         t.applies_to_employment_types, t.is_default,
         (SELECT count(*)::int FROM hr_onboarding_template_tasks tt
           WHERE tt.template_id = t.id AND tt.is_active) AS task_count,
         (CASE WHEN t.applies_to_department_code IS NOT NULL THEN 2 ELSE 0 END
        + CASE WHEN t.applies_to_location_code   IS NOT NULL THEN 1 ELSE 0 END
         ) AS specificity
    FROM hr_onboarding_templates t
`

export async function templates(tx: Tx): Promise<OnboardingTemplate[]> {
  return tx<OnboardingTemplate[]>`
    ${tx.unsafe(TEMPLATE_SELECT)}
     WHERE t.is_active
     ORDER BY specificity DESC, t.template_code ASC
  `
}

/** Which template a hire gets. Null only if nothing matches, including no default — a configuration gap worth surfacing. */
export async function templateFor(
  tx: Tx,
  hire: {
    departmentCode: string | null
    locationCode: string | null
    employmentType: string
  },
): Promise<OnboardingTemplate | null> {
  const [row] = await tx<OnboardingTemplate[]>`
    ${tx.unsafe(TEMPLATE_SELECT)}
     WHERE t.is_active
       -- Named department applies only there; unnamed applies to any.
       AND (t.applies_to_department_code IS NULL
            OR t.applies_to_department_code = ${hire.departmentCode})
       AND (t.applies_to_location_code IS NULL
            OR t.applies_to_location_code = ${hire.locationCode})
       -- Employment type filters; it is not a specificity dimension.
       AND (t.applies_to_employment_types IS NULL
            OR t.applies_to_employment_types @> to_jsonb(${hire.employmentType}::text))
     ORDER BY specificity DESC, t.template_code ASC
     LIMIT 1
  `
  return row ?? null
}

/** Templates that tie at the winning specificity — `templateFor` always answers, this reports when it was a coin toss. */
export async function ambiguousFor(
  tx: Tx,
  hire: {
    departmentCode: string | null
    locationCode: string | null
    employmentType: string
  },
): Promise<string[]> {
  const matches = await tx<{ template_code: string; specificity: number }[]>`
    ${tx.unsafe(TEMPLATE_SELECT)}
     WHERE t.is_active
       AND (t.applies_to_department_code IS NULL
            OR t.applies_to_department_code = ${hire.departmentCode})
       AND (t.applies_to_location_code IS NULL
            OR t.applies_to_location_code = ${hire.locationCode})
       AND (t.applies_to_employment_types IS NULL
            OR t.applies_to_employment_types @> to_jsonb(${hire.employmentType}::text))
     ORDER BY specificity DESC
  `
  if (matches.length < 2) return []
  const top = matches[0].specificity
  const tied = matches.filter((m) => m.specificity === top)
  return tied.length > 1 ? tied.map((m) => m.template_code) : []
}

export type PlannedTask = {
  task_name: string
  description: string | null
  task_type: string | null
  phase: string | null
  assignee_role: string | null
  due_offset_days: number | null
  is_required: boolean | null
  /** start_date + due_offset_days. Negative offsets land BEFORE the start. */
  due_date: string | null
}

/** The plan a template produces for a start date — offset arithmetic is calendar (DATE), not 86,400-second, so DST is not an issue. */
export async function planFor(
  tx: Tx,
  templateId: string,
  startDate: string,
): Promise<PlannedTask[]> {
  return tx<PlannedTask[]>`
    SELECT task_name, description, task_type, phase, assignee_role,
           due_offset_days, is_required,
           to_char(${startDate}::date + due_offset_days, 'YYYY-MM-DD') AS due_date
      FROM hr_onboarding_template_tasks
     WHERE template_id = ${templateId} AND is_active
     ORDER BY due_offset_days ASC, sort_order ASC, task_name ASC
  `
}

export type OnboardingTask = {
  id: string
  task_id: string | null
  employee_id: string
  employee_name: string
  task_name: string
  description: string | null
  task_type: string | null
  status: string
  priority: string | null
  due_date: string | null
  completion_date: string | null
  assigned_to_employee_id: string | null
  assigned_to_name: string | null
  overdue: boolean
}

const TASK_SELECT = `
  SELECT o.id, o.task_id, o.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         o.task_name, o.description, o.task_type, o.status, o.priority,
         to_char(o.due_date, 'YYYY-MM-DD')        AS due_date,
         to_char(o.completion_date, 'YYYY-MM-DD') AS completion_date,
         o.assigned_to_employee_id,
         a.first_name || ' ' || a.last_name AS assigned_to_name,
         (o.due_date IS NOT NULL
          AND o.due_date < current_date
          AND o.completion_date IS NULL) AS overdue
    FROM hr_onboarding_tasks o
    JOIN employees e ON e.id = o.employee_id
    LEFT JOIN employees a ON a.id = o.assigned_to_employee_id
`

/** Tasks for a hire, or assigned to someone, or both. */
export async function tasks(
  tx: Tx,
  filters: { employeeId?: string; assignedTo?: string } = {},
): Promise<OnboardingTask[]> {
  const employee = filters.employeeId || null
  const assignee = filters.assignedTo || null
  return tx<OnboardingTask[]>`
    ${tx.unsafe(TASK_SELECT)}
     WHERE (${employee}::uuid IS NULL OR o.employee_id = ${employee}::uuid)
       AND (${assignee}::uuid IS NULL
            OR o.assigned_to_employee_id = ${assignee}::uuid)
     ORDER BY o.due_date ASC NULLS LAST, o.task_id ASC
  `
}

/** Tasks whose status and completion date disagree. */
export async function inconsistent(
  tx: Tx,
): Promise<
  { task_id: string | null; status: string; completion_date: string | null }[]
> {
  return tx`
    SELECT task_id, status,
           to_char(completion_date,'YYYY-MM-DD') AS completion_date
      FROM hr_onboarding_tasks
     WHERE (status = 'completed' AND completion_date IS NULL)
        OR (status <> 'completed' AND completion_date IS NOT NULL)
  `
}

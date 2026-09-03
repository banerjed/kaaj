import type { Tx } from "../db/tenant"

/**
 * hr_goals — objectives, and how far along they are.
 *
 * `progress_percentage` is stored but also derivable from
 * `current_value / target_value`; nothing keeps them in step, so
 * `inconsistent()` checks for drift. `weight` is a per-goal importance, not a
 * share of 100 — do not expect it to sum to 100.
 */

export type Goal = {
  id: string
  employee_id: string
  employee_name: string
  goal_title: string
  goal_title_i18n: Record<string, string> | null
  description: string | null
  category: string | null
  measurement_type: string | null
  /** All NUMERIC, so all strings from the driver (L36). Arithmetic in SQL. */
  target_value: string | null
  current_value: string | null
  unit: string | null
  weight: string | null
  progress_percentage: string | null
  status: string | null
  start_date: string | null
  target_date: string | null
  completed_at: Date | null
  /** True when target_date has passed and the goal is not yet complete. */
  overdue: boolean
}

const SELECT = `
  SELECT g.id, g.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         g.goal_title, g.goal_title_i18n, g.description, g.category,
         g.measurement_type,
         g.target_value::text        AS target_value,
         g.current_value::text       AS current_value,
         g.unit,
         g.weight::text              AS weight,
         g.progress_percentage::text AS progress_percentage,
         g.status,
         to_char(g.start_date,'YYYY-MM-DD')  AS start_date,
         to_char(g.target_date,'YYYY-MM-DD') AS target_date,
         g.completed_at,
         (g.target_date IS NOT NULL
          AND g.target_date < current_date
          AND g.completed_at IS NULL) AS overdue
    FROM hr_goals g
    JOIN employees e ON e.id = g.employee_id
`

export async function forEmployee(tx: Tx, employeeId: string): Promise<Goal[]> {
  return tx<Goal[]>`
    ${tx.unsafe(SELECT)}
     WHERE g.employee_id = ${employeeId}
     ORDER BY g.target_date ASC NULLS LAST, g.goal_title ASC
  `
}

/** Goals for everyone this reader may see, resolved by the caller. */
export async function forEmployees(
  tx: Tx,
  employeeIds: string[],
): Promise<Goal[]> {
  if (employeeIds.length === 0) return []
  return tx<Goal[]>`
    ${tx.unsafe(SELECT)}
     WHERE g.employee_id = ANY(${employeeIds}::uuid[])
     ORDER BY employee_name ASC, g.target_date ASC NULLS LAST
  `
}

/** Goals whose stored progress disagrees with current/target — a number managers quote in reviews. */
export async function inconsistent(
  tx: Tx,
): Promise<
  { id: string; goal_title: string; stored: string; computed: string }[]
> {
  return tx`
    SELECT id, goal_title,
           progress_percentage::text AS stored,
           round(current_value / target_value * 100, 2)::text AS computed
      FROM hr_goals
     WHERE target_value IS NOT NULL AND target_value <> 0
       AND current_value IS NOT NULL
       AND progress_percentage IS NOT NULL
       AND progress_percentage
           IS DISTINCT FROM round(current_value / target_value * 100, 2)
  `
}

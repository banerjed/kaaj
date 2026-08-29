import type { Tx } from "../db/tenant"

/**
 * compensation_work_schedules — contracted hours, and the timezone they are
 * worked in. Read by time tracking and by overtime calculation, so the hours
 * here are the denominator for a lot of downstream arithmetic.
 */

export type WorkSchedule = {
  id: string
  employee_id: string
  schedule_name: string | null
  schedule_type: string
  effective_from: string
  effective_to: string | null
  standard_hours_per_week: string | null
  timezone: string | null
  is_active: boolean | null
}

export async function currentForEmployee(
  tx: Tx,
  employeeId: string,
): Promise<WorkSchedule | null> {
  const [row] = await tx<WorkSchedule[]>`
    SELECT id, employee_id, schedule_name, schedule_type::text AS schedule_type,
           to_char(effective_from,'YYYY-MM-DD') AS effective_from,
           to_char(effective_to,'YYYY-MM-DD') AS effective_to,
           standard_hours_per_week::text AS standard_hours_per_week,
           timezone, is_active
      FROM compensation_work_schedules
     WHERE employee_id = ${employeeId}
       AND effective_from <= CURRENT_DATE
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY effective_from DESC
     LIMIT 1
  `
  return row ?? null
}

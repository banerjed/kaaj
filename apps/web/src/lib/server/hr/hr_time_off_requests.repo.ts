import type { Tx } from "../db/tenant"

/**
 * hr_time_off_requests — asking for leave, and the approval of it.
 *
 * `total_hours` is stored, not derived from the dates — how many working
 * hours a range contains depends on the office's holiday calendar, so
 * recomputing on read would silently disagree with what was approved.
 */

export type TimeOffRequest = {
  id: string
  request_id: string | null
  employee_id: string
  employee_name: string
  location_code: string | null
  policy_code: string | null
  policy_name: string | null
  start_date: string
  end_date: string
  total_hours: string
  status: string
  reason: string | null
  approver_name: string | null
  approved_at: string | null
  denied_at: string | null
  denial_reason: string | null
  submitted_at: string | null
}

const SELECT = `
  SELECT r.id, r.request_id, r.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         e.location_code,
         r.policy_code, p.policy_name,
         to_char(r.start_date,'YYYY-MM-DD') AS start_date,
         to_char(r.end_date,'YYYY-MM-DD') AS end_date,
         r.total_hours::text AS total_hours,
         r.status, r.reason,
         a.first_name || ' ' || a.last_name AS approver_name,
         r.approved_at, r.denied_at, r.denial_reason, r.submitted_at
    FROM hr_time_off_requests r
    JOIN employees e ON e.id = r.employee_id
    LEFT JOIN employees a ON a.id = r.approver_id
    LEFT JOIN hr_time_off_policies p ON p.policy_code = r.policy_code
`

export async function list(
  tx: Tx,
  filters: { status?: string; employeeId?: string } = {},
): Promise<TimeOffRequest[]> {
  const { status = "", employeeId = "" } = filters
  // NULL rather than '' for the uuid cast (L37).
  const employee = employeeId || null
  return tx<TimeOffRequest[]>`
    ${tx.unsafe(SELECT)}
     WHERE (${status} = '' OR r.status = ${status})
       AND (${employee}::uuid IS NULL OR r.employee_id = ${employee}::uuid)
     ORDER BY r.start_date DESC
  `
}

export async function getById(
  tx: Tx,
  id: string,
): Promise<TimeOffRequest | null> {
  const [row] = await tx<TimeOffRequest[]>`
    ${tx.unsafe(SELECT)} WHERE r.id = ${id}
  `
  return row ?? null
}

export type Decision = "approved" | "denied"

export class DecisionRefused extends Error {
  constructor(
    readonly reason:
      "not_pending" | "not_found" | "self_approval" | "not_your_report",
  ) {
    super(reason)
    this.name = "DecisionRefused"
  }
}

/**
 * Approve or deny, and move the hours on the balance in the same transaction.
 * `pending`/`used` are both already deducted from `current_balance`, so
 * approval just moves hours between them; denial gives it back. Refuses a
 * non-pending request (double-decide) and self-approval — RLS is tenant
 * isolation only, so this is the only guard against a manager self-granting leave.
 */
export async function decide(
  tx: Tx,
  requestId: string,
  decision: Decision,
  approverId: string,
  denialReason: string | null,
): Promise<void> {
  const [current] = await tx<
    {
      employee_id: string
      status: string
      total_hours: string
      policy_code: string | null
    }[]
  >`
    SELECT employee_id, status, total_hours::text AS total_hours, policy_code
      FROM hr_time_off_requests WHERE id = ${requestId}
  `
  if (!current || current.status !== "pending") {
    throw new DecisionRefused("not_pending")
  }
  if (current.employee_id === approverId) {
    throw new DecisionRefused("self_approval")
  }

  await tx`
    UPDATE hr_time_off_requests
       SET status        = ${decision},
           approver_id   = ${approverId},
           approved_at   = ${decision === "approved" ? tx`now()` : null},
           denied_at     = ${decision === "denied" ? tx`now()` : null},
           denial_reason = ${decision === "denied" ? denialReason : null},
           updated_at    = now()
     WHERE id = ${requestId}
  `

  // Request stores hours; balances are in the policy's unit (days in fixture).
  const HOURS_PER_DAY = 8

  if (decision === "approved") {
    await tx`
      UPDATE hr_time_off_balances b
         SET pending    = b.pending - (${current.total_hours}::numeric / ${HOURS_PER_DAY}),
             used       = b.used    + (${current.total_hours}::numeric / ${HOURS_PER_DAY}),
             updated_at = now()
        FROM hr_time_off_policies p
       WHERE b.policy_id = p.id
         AND p.policy_code = ${current.policy_code}
         AND b.employee_id = ${current.employee_id}
    `
  } else {
    await tx`
      UPDATE hr_time_off_balances b
         SET pending         = b.pending - (${current.total_hours}::numeric / ${HOURS_PER_DAY}),
             current_balance = b.current_balance + (${current.total_hours}::numeric / ${HOURS_PER_DAY}),
             updated_at      = now()
        FROM hr_time_off_policies p
       WHERE b.policy_id = p.id
         AND p.policy_code = ${current.policy_code}
         AND b.employee_id = ${current.employee_id}
    `
  }
}

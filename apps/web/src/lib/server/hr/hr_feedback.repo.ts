import type { Tx } from "../db/tenant"

/**
 * hr_feedback — 360-degree feedback, and the promise not to say who wrote it.
 *
 * `from_employee_id` is never returned for an anonymous note, to anyone —
 * not even HR. It's excluded from the returned type entirely, not filtered
 * after fetch, since no constraint can express "do not SELECT this column".
 *
 * `visibility` is a separate question from anonymity: `private` is the
 * recipient + HR; `manager_only` is the recipient's MANAGER + HR, not the
 * recipient; `public` is everyone.
 */

export type Feedback = {
  id: string
  feedback_id: string | null
  to_employee_id: string
  to_name: string
  /** Null when anonymous. There is no field carrying the id — see above. */
  from_name: string | null
  is_anonymous: boolean
  feedback_type: string | null
  content: string | null
  visibility: string
  tags: string[] | null
  feedback_date: string | null
}

/** The author's name, resolved in SQL and NULL for an anonymous note — the id never leaves the database. */
const SELECT = `
  SELECT f.id, f.feedback_id, f.to_employee_id,
         te.first_name || ' ' || te.last_name AS to_name,
         CASE WHEN f.is_anonymous THEN NULL
              ELSE fe.first_name || ' ' || fe.last_name END AS from_name,
         f.is_anonymous, f.feedback_type, f.content, f.visibility,
         f.tags,
         to_char(f.feedback_date, 'YYYY-MM-DD') AS feedback_date
    FROM hr_feedback f
    JOIN employees te ON te.id = f.to_employee_id
    LEFT JOIN employees fe ON fe.id = f.from_employee_id
`

export type FeedbackReader = {
  employeeId: string | null
  /** HR — reads every note, but still never learns an anonymous author. */
  readsAll: boolean
  /** Employee ids this reader manages, resolved by the caller. */
  manages: string[]
}

export async function visibleTo(
  tx: Tx,
  reader: FeedbackReader,
): Promise<Feedback[]> {
  const me = reader.employeeId || null
  const manages = reader.manages
  return tx<Feedback[]>`
    ${tx.unsafe(SELECT)}
     WHERE ${reader.readsAll}
        OR f.visibility = 'public'
        -- Addressed to you, unless it was written for your manager.
        OR (f.to_employee_id = ${me}::uuid AND f.visibility <> 'manager_only')
        -- About someone you manage, and meant for you.
        OR (f.visibility = 'manager_only'
            AND f.to_employee_id = ANY(${manages}::uuid[]))
     ORDER BY f.feedback_date DESC NULLS LAST, f.feedback_id ASC
  `
}

/** Notes this person has received and may see — excludes `manager_only`, which was written for their manager, not them. */
export async function receivedBy(
  tx: Tx,
  employeeId: string,
): Promise<Feedback[]> {
  return tx<Feedback[]>`
    ${tx.unsafe(SELECT)}
     WHERE f.to_employee_id = ${employeeId}
       AND f.visibility <> 'manager_only'
     ORDER BY f.feedback_date DESC NULLS LAST, f.feedback_id ASC
  `
}

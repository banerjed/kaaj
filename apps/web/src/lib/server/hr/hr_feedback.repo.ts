import type { Tx } from "../db/tenant"

/**
 * hr_feedback — 360-degree feedback, and the promise not to say who wrote it.
 *
 * **`from_employee_id` is never returned for an anonymous note. To anyone.**
 * The column is populated and correct — that is the whole trap. A page that
 * joins to `employees` and renders the author un-anonymises every anonymous
 * note without erroring, without failing a type check, and without anyone
 * noticing until the person who wrote it finds out. No constraint can express
 * "do not SELECT this column", so it is expressed here, once, and the column
 * is not part of the returned type at all.
 *
 * Not even HR. An anonymity promise with an exception is a promise the person
 * making it cannot keep, and "HR can see it for abuse investigations" is how
 * every such promise dies. If that capability is ever needed it should be a
 * separate, audited, deliberately-named path — not a field that happens to be
 * present on the ordinary read.
 *
 * `visibility` decides who may read the note at all, and it is a different
 * question from anonymity:
 *
 *   private       the recipient, and HR
 *   manager_only  the recipient's manager, and HR — NOT the recipient. This is
 *                 feedback ABOUT someone, FOR the person who manages them
 *   public        anyone in the firm
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

/**
 * The author's name, resolved in SQL and NULL for an anonymous note.
 *
 * Done in the query rather than after it so the id never leaves the database.
 * A repository that fetched the id and dropped it in TypeScript would still
 * have put it in a query result, a log line and a heap dump.
 */
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

/**
 * Notes this person has received and may see.
 *
 * `manager_only` is excluded even though it is about them: it was written for
 * whoever manages them, and showing it here would make every such note a
 * message to its subject — which is not what the author chose.
 */
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

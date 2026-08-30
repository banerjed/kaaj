import type { Tx } from "../db/tenant"

/**
 * hr_reviews — performance reviews, and who may read which half of one.
 *
 * **The manager's assessment is hidden from its subject until it is submitted.**
 * A review row carries `self_assessment` and `manager_assessment` side by side
 * with a `status` of draft / submitted / acknowledged. An employee opening
 * their own review while the manager is still drafting would read an unfinished
 * judgement of themselves — which poisons the self-assessment the process
 * depends on, and is a real harm rather than a leak of technical interest.
 *
 * Nothing in the database prevents it: RLS filters by tenant, both halves live
 * in one row, and `employee.read.self` says nothing about status. This
 * repository is the only control, which is why the redaction happens HERE and
 * not in a page — a second read path would have to remember, and would not.
 */

export type ReviewAssessment = Record<string, string>

export type Review = {
  id: string
  review_id: string | null
  employee_id: string
  employee_name: string
  reviewer_id: string | null
  reviewer_name: string | null
  cycle_code: string | null
  cycle_name: string | null
  review_type: string | null
  review_date: string | null
  status: string
  /** numeric(18,4): a string from the driver, like every NUMERIC (L36). */
  overall_rating: string | null
  self_assessment: ReviewAssessment | null
  /** Null when withheld — see `redactFor`. Absent and unwritten look alike. */
  manager_assessment: ReviewAssessment | null
  /** True when a manager assessment exists but this reader may not see it yet. */
  manager_assessment_withheld: boolean
  competencies: unknown
}

/** A manager's half is readable by its subject only from these statuses on. */
const RELEASED = new Set(["submitted", "acknowledged"])

const SELECT = `
  SELECT r.id, r.review_id, r.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         r.reviewer_id,
         rv.first_name || ' ' || rv.last_name AS reviewer_name,
         r.cycle_code, c.cycle_name, r.review_type,
         to_char(r.review_date, 'YYYY-MM-DD') AS review_date,
         r.status, r.overall_rating::text AS overall_rating,
         r.self_assessment, r.manager_assessment, r.competencies
    FROM hr_reviews r
    JOIN employees e ON e.id = r.employee_id
    LEFT JOIN employees rv ON rv.id = r.reviewer_id
    LEFT JOIN hr_review_cycles c ON c.cycle_code = r.cycle_code
`

/** Who is asking, and what the repository is allowed to hand them. */
export type ReviewReader = {
  /** The reader's own employee id, or null if they are not an employee. */
  employeeId: string | null
  /** `performance.read.all` — HR sees drafts, because HR runs the cycle. */
  readsAll: boolean
}

/**
 * Redaction, applied to every row on the way out.
 *
 * The reviewer and anyone with `performance.read.all` see the draft; the
 * subject does not. `manager_assessment_withheld` is returned separately so a
 * page can say "your manager has not finished" rather than silently showing
 * nothing — an empty section reads as "they wrote nothing about me".
 */
function redactFor(row: Review, reader: ReviewReader): Review {
  const hasManagerHalf = row.manager_assessment !== null
  const isSubject = reader.employeeId === row.employee_id
  const isReviewer = reader.employeeId === row.reviewer_id
  const mayReadDraft = reader.readsAll || isReviewer

  if (
    hasManagerHalf &&
    isSubject &&
    !mayReadDraft &&
    !RELEASED.has(row.status)
  ) {
    return {
      ...row,
      manager_assessment: null,
      manager_assessment_withheld: true,
    }
  }
  return { ...row, manager_assessment_withheld: false }
}

/**
 * Reviews this reader may see at all.
 *
 * Visibility is three cases and they are different questions: your own
 * (whatever the status), ones you are writing, and — with the grant —
 * everyone's. A peer sees none, which is what `SEC-EMP-026` in the spec suite
 * asserts independently.
 */
export async function visibleTo(
  tx: Tx,
  reader: ReviewReader,
  filters: { cycleCode?: string; employeeId?: string } = {},
): Promise<Review[]> {
  const cycle = filters.cycleCode || null
  const employee = filters.employeeId || null
  const me = reader.employeeId || null

  const rows = await tx<Review[]>`
    ${tx.unsafe(SELECT)}
     WHERE (${reader.readsAll}
            OR r.employee_id = ${me}::uuid
            OR r.reviewer_id = ${me}::uuid)
       AND (${cycle}::text IS NULL OR r.cycle_code = ${cycle}::text)
       AND (${employee}::uuid IS NULL OR r.employee_id = ${employee}::uuid)
     ORDER BY r.review_date DESC NULLS LAST, employee_name ASC
  `
  return rows.map((r) => redactFor(r, reader))
}

export async function byId(
  tx: Tx,
  reader: ReviewReader,
  id: string,
): Promise<Review | null> {
  const me = reader.employeeId || null
  const [row] = await tx<Review[]>`
    ${tx.unsafe(SELECT)}
     WHERE r.id = ${id}
       AND (${reader.readsAll}
            OR r.employee_id = ${me}::uuid
            OR r.reviewer_id = ${me}::uuid)
  `
  return row ? redactFor(row, reader) : null
}

export type ReviewCycle = {
  id: string
  cycle_code: string
  cycle_name: string | null
  review_type: string | null
  start_date: string | null
  self_assessment_due: string | null
  manager_assessment_due: string | null
  review_meetings_due: string | null
  cycle_close_date: string | null
  status: string | null
  is_active: boolean | null
}

export async function cycles(tx: Tx): Promise<ReviewCycle[]> {
  return tx<ReviewCycle[]>`
    SELECT id, cycle_code, cycle_name, review_type,
           to_char(start_date,'YYYY-MM-DD')            AS start_date,
           to_char(self_assessment_due,'YYYY-MM-DD')   AS self_assessment_due,
           to_char(manager_assessment_due,'YYYY-MM-DD') AS manager_assessment_due,
           to_char(review_meetings_due,'YYYY-MM-DD')   AS review_meetings_due,
           to_char(cycle_close_date,'YYYY-MM-DD')      AS cycle_close_date,
           status, is_active
      FROM hr_review_cycles
     ORDER BY start_date DESC
  `
}

/**
 * How far through a cycle each person's review is.
 *
 * Counted in SQL rather than by reducing over the rows, so the totals do not
 * depend on what the caller was permitted to read — a completion figure that
 * shrinks because the viewer is not HR is worse than no figure.
 */
export async function cycleProgress(
  tx: Tx,
  cycleCode: string,
): Promise<{ status: string; n: number }[]> {
  return tx<{ status: string; n: number }[]>`
    SELECT status, count(*)::int AS n
      FROM hr_reviews WHERE cycle_code = ${cycleCode}
     GROUP BY status ORDER BY status
  `
}

// -----------------------------------------------------------------------------
// Writing
// -----------------------------------------------------------------------------

/**
 * The status sequence, and it only runs one way.
 *
 * draft -> submitted -> acknowledged
 *
 * Backwards is refused rather than allowed-and-audited. Un-submitting a review
 * would retract something the subject has already read, and un-acknowledging
 * one would erase the only evidence that they read it — which is the fact that
 * matters in a dispute about a performance process. A CHECK constraint cannot
 * express this, because it cannot see the row's previous value.
 */
const NEXT: Record<string, string[]> = {
  draft: ["submitted"],
  submitted: ["acknowledged"],
  acknowledged: [],
}

export class ReviewRefused extends Error {
  constructor(
    readonly reason:
      | "not_found"
      | "not_yours"
      | "wrong_status"
      | "backwards"
      | "nothing_to_submit",
  ) {
    super(reason)
    this.name = "ReviewRefused"
  }
}

type Current = {
  employee_id: string
  reviewer_id: string | null
  status: string
  manager_assessment: unknown
}

async function current(tx: Tx, id: string): Promise<Current> {
  const [row] = await tx<Current[]>`
    SELECT employee_id, reviewer_id, status, manager_assessment
      FROM hr_reviews WHERE id = ${id}
  `
  if (!row) throw new ReviewRefused("not_found")
  return row
}

/**
 * Write one half of a review.
 *
 * Only while the review is a draft: once submitted it is the record, and the
 * subject has already read it. Each author writes their own half — a reviewer
 * cannot edit a self-assessment, which would put words in someone's mouth in a
 * document they later acknowledge.
 */
export async function saveAssessment(
  tx: Tx,
  id: string,
  author: { employeeId: string | null },
  half: "self" | "manager",
  assessment: ReviewAssessment,
): Promise<void> {
  const row = await current(tx, id)
  if (row.status !== "draft") throw new ReviewRefused("wrong_status")

  const permitted =
    half === "self"
      ? author.employeeId === row.employee_id
      : author.employeeId === row.reviewer_id
  if (!permitted) throw new ReviewRefused("not_yours")

  if (half === "self") {
    await tx`
      UPDATE hr_reviews
         SET self_assessment = ${tx.json(assessment as never)}, updated_at = now()
       WHERE id = ${id}
    `
  } else {
    await tx`
      UPDATE hr_reviews
         SET manager_assessment = ${tx.json(assessment as never)}, updated_at = now()
       WHERE id = ${id}
    `
  }
}

/**
 * Submit — the reviewer is finished, and the subject may now read their half.
 *
 * This is the moment the redaction in `redactFor` stops applying, so it is the
 * one transition a subject can observe without being told.
 */
export async function submit(
  tx: Tx,
  id: string,
  actor: { employeeId: string | null },
): Promise<void> {
  const row = await current(tx, id)
  if (actor.employeeId !== row.reviewer_id) throw new ReviewRefused("not_yours")
  if (!NEXT[row.status]?.includes("submitted")) {
    throw new ReviewRefused(
      row.status === "draft" ? "wrong_status" : "backwards",
    )
  }
  // Submitting an empty review would release nothing and still tell the subject
  // their review is ready.
  if (row.manager_assessment === null) {
    throw new ReviewRefused("nothing_to_submit")
  }
  await tx`
    UPDATE hr_reviews SET status = 'submitted', updated_at = now()
     WHERE id = ${id}
  `
}

/**
 * Acknowledge — the subject confirms they have read it. Terminal.
 *
 * Only the subject, and only they: an acknowledgement entered by anyone else
 * is a record that a person saw something when nobody knows whether they did.
 */
export async function acknowledge(
  tx: Tx,
  id: string,
  actor: { employeeId: string | null },
): Promise<void> {
  const row = await current(tx, id)
  if (actor.employeeId !== row.employee_id) throw new ReviewRefused("not_yours")
  if (!NEXT[row.status]?.includes("acknowledged")) {
    throw new ReviewRefused(
      row.status === "acknowledged" ? "wrong_status" : "backwards",
    )
  }
  await tx`
    UPDATE hr_reviews SET status = 'acknowledged', updated_at = now()
     WHERE id = ${id}
  `
}

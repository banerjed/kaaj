import type { Tx } from "../db/tenant"

/**
 * Task comments (docs/25-project-management-phase2.md). Same trust boundary
 * as every other task action — gated on `projects.write` at the route, not a
 * new permission string, and (like `moveTask`/`addDependency`) not restricted
 * to the comment's own author: this page has one shared write boundary for
 * the whole board, not per-row ownership, and a comment thread is not the
 * exception. Every comment is `author_type = 'employee'` for now: there is no
 * client-portal task surface yet (Phase 1's own deferral), so `is_internal`
 * is always written `true` rather than left to the column's default — a
 * future client-facing read must opt a comment IN, never rely on a default it
 * doesn't control.
 *
 * Soft delete only (`deleted_at`) — this app never hard-deletes.
 */

export type CommentRow = {
  id: string
  comment_text: string | null
  author_employee_id: string | null
  author_name: string | null
  is_pinned: boolean
  created_at: Date
  edited_at: Date | null
}

export class CommentWriteRefused extends Error {
  constructor(readonly reason: "no_such_task" | "no_such_comment") {
    super(reason)
    this.name = "CommentWriteRefused"
  }
}

/** The next `TC-nnn`, from the numbers already in use — same approach as projects.repo.ts's `nextNumber`. */
async function nextCommentId(tx: Tx): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT coalesce(
             max(nullif(substring(comment_id from '[0-9]+$'), '')::int),
             0
           ) + 1 AS n
      FROM pm_task_comments
  `
  return `TC-${String(row.n).padStart(3, "0")}`
}

/**
 * Every comment for every task in a project, in one query — the project
 * page renders a thread per task, and fetching per-task would be a query
 * inside a loop over the task list (`verify-no-loop-queries.mjs`).
 */
export async function commentsForProject(
  tx: Tx,
  projectId: string,
): Promise<Record<string, CommentRow[]>> {
  const rows = await tx<(CommentRow & { task_id: string })[]>`
    SELECT c.id, c.task_id, c.comment_text, c.author_employee_id,
           e.first_name || ' ' || e.last_name AS author_name,
           c.is_pinned, c.created_at, c.edited_at
      FROM pm_task_comments c
      LEFT JOIN employees e ON e.id = c.author_employee_id
     WHERE c.project_id = ${projectId}::uuid AND c.deleted_at IS NULL
     ORDER BY c.created_at
  `
  const out: Record<string, CommentRow[]> = {}
  for (const { task_id, ...comment } of rows) {
    ;(out[task_id] ??= []).push(comment)
  }
  return out
}

export async function addComment(
  tx: Tx,
  tenantId: string,
  taskId: string,
  projectId: string,
  content: string,
  actorId: string,
): Promise<{ id: string }> {
  const [task] = await tx<{ id: string }[]>`
    SELECT id FROM tasks WHERE id = ${taskId}::uuid AND project_id = ${projectId}::uuid
  `
  if (!task) throw new CommentWriteRefused("no_such_task")

  const commentId = await nextCommentId(tx)
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO pm_task_comments (
      tenant_id, comment_id, task_id, project_id, comment_type, comment_text,
      author_type, author_employee_id, is_internal
    ) VALUES (
      ${tenantId}::uuid, ${commentId}, ${taskId}::uuid, ${projectId}::uuid,
      'comment', ${content}, 'employee', ${actorId}::uuid, TRUE
    )
    RETURNING id
  `
  return row
}

/** Only the comment's own author may edit it — enforced by the caller, which passes the acting employee id to compare. */
export async function editComment(
  tx: Tx,
  commentId: string,
  content: string,
): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE pm_task_comments
       SET comment_text = ${content}, edited_at = now()
     WHERE id = ${commentId}::uuid AND deleted_at IS NULL
    RETURNING id
  `
  if (!row) throw new CommentWriteRefused("no_such_comment")
}

export async function deleteComment(tx: Tx, commentId: string): Promise<void> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE pm_task_comments SET deleted_at = now()
     WHERE id = ${commentId}::uuid AND deleted_at IS NULL
    RETURNING id
  `
  if (!row) throw new CommentWriteRefused("no_such_comment")
}

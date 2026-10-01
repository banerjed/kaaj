/**
 * The vocabulary of per-row actions a list offers — what the row can DO,
 * independent of how it is rendered. The daisyUI classes themselves live in
 * `RowActions.svelte`, as complete strings Tailwind's audit can read (a
 * plain `.ts` file is skipped), the same split as `status-tone.ts` /
 * `StatusBadge.svelte`.
 *
 * Deliberately NOT a general button vocabulary: a consequential domain verb
 * (Approve, Deny, Close period, Match) stays a labelled text button. An
 * icon-only "Approve" on a leave request reads as decoration, not a
 * decision.
 */

export type ActionKind =
  /** Open the row's own page. */
  | "view"
  /** Change the row — a route, or a modal on this page. */
  | "edit"
  /** The row's own sub-configuration page, where one exists. */
  | "settings"
  /** Soft-delete. Always destructive, always a POST. */
  | "archive"
  /** Undo an archive, from an archived-items list. */
  | "restore"
  /** Fetch the row's file. */
  | "download"

/**
 * Exactly one trigger per action, which also decides the element: an anchor
 * navigates, a button changes local state, a form mutates (L30 — these are
 * not interchangeable, and nesting them is invalid HTML).
 */
export type ActionTrigger =
  | { href: string }
  | { onclick: () => void }
  | { post: { action: string; fields?: Record<string, string> } }

export type RowAction = {
  kind: ActionKind
  /**
   * The accessible name: a verb and the row's own subject — `Edit Acme Ltd`,
   * never a bare `Edit`. Thirty icon buttons across the app already follow
   * this; a screen reader hitting ten identical "Edit"s in a table learns
   * nothing from any of them.
   */
  label: string
  /** Optional tooltip, describing the action generally — not a copy of `label`. */
  title?: string
  disabled?: boolean
} & ActionTrigger

export const isLink = (a: RowAction): a is RowAction & { href: string } =>
  "href" in a

export const isPost = (
  a: RowAction,
): a is RowAction & {
  post: { action: string; fields?: Record<string, string> }
} => "post" in a

/** Destructive actions carry `text-error`; nothing else does. */
export const isDestructive = (kind: ActionKind): boolean => kind === "archive"

/**
 * The five tones a status can carry — meaning only. The daisyUI classes
 * themselves live in `StatusBadge.svelte`, as complete strings its audit can
 * read (a plain `.ts` file is skipped).
 */

export type Tone =
  /** Settled, safe, done — paid, approved, present, completed. */
  | "positive"
  /** Needs attention but nothing has failed — partial, late, at risk. */
  | "caution"
  /** Failed, refused, or destructive — void, denied, absent, overdue. */
  | "critical"
  /** Under way, not yet resolved — sent, submitted, in progress. */
  | "progress"
  /** No opinion. The default, and deliberately not a colour. */
  | "neutral"

/**
 * Per-entity status -> tone. `invoices.status`, `bills.status`,
 * `payroll_runs.run_status` and `projects.status`/`health_status` are plain
 * `varchar`/`text` — no enum or CHECK behind them — so this function IS the
 * vocabulary (L57). Each entity keeps its own mapping deliberately ("paid"
 * belongs to invoices, "present" to attendance) rather than one shared
 * switch; what's shared here is only that a list page and its detail page
 * read the SAME mapping instead of a hand-copied one apiece.
 */

export const invoiceStatusTone = (s: string | null): Tone =>
  s === "paid"
    ? "positive"
    : s === "void" || s === "overdue"
      ? "critical"
      : s === "partial"
        ? "caution"
        : s === "sent" || s === "viewed"
          ? "progress"
          : "neutral"

export const billStatusTone = (s: string | null): Tone =>
  s === "paid"
    ? "positive"
    : s === "void" || s === "cancelled"
      ? "critical"
      : s === "partial"
        ? "caution"
        : s === "approved"
          ? "progress"
          : "neutral"

export const payrollRunStatusTone = (s: string): Tone =>
  s === "paid" || s === "finalized"
    ? "positive"
    : s === "approved"
      ? "progress"
      : s === "cancelled"
        ? "critical"
        : "neutral"

/** `projects.health_status` — a PM's own read on the project, not its stage. */
export const projectHealthTone = (h: string | null): Tone =>
  h === "at_risk" ? "caution" : h === "off_track" ? "critical" : "positive"

/** `projects.status` — the project's stage (active/completed/cancelled/...). */
export const projectStatusTone = (s: string | null): Tone =>
  s === "active"
    ? "progress"
    : s === "completed"
      ? "positive"
      : s === "cancelled"
        ? "critical"
        : "neutral"

/** `time_tracking_entries.status` — draft/submitted/approved/rejected. */
export const timeEntryStatusTone = (s: string | null): Tone =>
  s === "approved"
    ? "positive"
    : s === "submitted"
      ? "progress"
      : s === "rejected"
        ? "critical"
        : "neutral"

/** `bank_transactions.status` — unmatched/matched/categorized/reconciled/ignored. */
export const bankTransactionStatusTone = (s: string | null): Tone =>
  s === "reconciled"
    ? "positive"
    : s === "unmatched"
      ? "caution"
      : s === "ignored"
        ? "neutral"
        : "progress"

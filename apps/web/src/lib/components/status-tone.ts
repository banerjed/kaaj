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

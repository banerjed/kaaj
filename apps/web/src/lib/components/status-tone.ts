/**
 * The five tones a status can carry.
 *
 * Eleven pages each held their own `statusClass` ternary returning
 * `badge-success` / `badge-error` / `badge-warning` / `badge-info` /
 * `badge-ghost`. The VOCABULARIES differ and should — "paid" belongs to
 * invoices and "present" to attendance, and merging them would be a worse
 * abstraction, not a better one (L57 puts a column's vocabulary next to the
 * column). What was duplicated eleven times is the daisyUI knowledge: which
 * class, in which order, with which style modifier.
 *
 * This file holds only the MEANING. The classes live in `StatusBadge.svelte`,
 * as complete static strings, because that is the file daisyUI's own audit can
 * read — it inspects markup and class-bearing components, and skips a plain
 * `.ts`. Putting the class names here would put them where nothing checks them.
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

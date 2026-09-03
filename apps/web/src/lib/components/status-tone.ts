/**
 * The five tones a status can carry, and the daisyUI classes behind them.
 *
 * Eleven pages each held their own `statusClass` ternary returning
 * `badge-success` / `badge-error` / `badge-warning` / `badge-info` /
 * `badge-ghost`. The VOCABULARIES differ and should — "paid" belongs to
 * invoices and "present" to attendance, and merging them would be a worse
 * abstraction, not a better one (L57 puts a column's vocabulary next to the
 * column). What was duplicated eleven times is the daisyUI knowledge: which
 * class, in which order, with which style modifier. That is what moved here.
 *
 * A page now says what a status MEANS and this file says how daisyUI spells
 * it, so restyling every status badge in the product is one edit.
 *
 * **Full class names, never assembled.** `badge-${tone}` would be invisible to
 * Tailwind's scanner, which reads source text and cannot evaluate an
 * expression — the class would simply not be generated. Blueprint's rules say
 * the same thing.
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
 * `badge-soft` for the coloured tones, matching the template: Nexus writes
 * `badge badge-soft badge-success badge-sm` and never a solid status badge,
 * and daisyUI's own guidance prefers the soft style for routine status. Solid
 * colour across a dense table reads as an alert rather than a state.
 *
 * `neutral` is `badge-ghost` ALONE. `badge-ghost` and `badge-soft` are both
 * *style* modifiers in daisyUI 5 and are mutually exclusive; combining them
 * gets one style silently ignored.
 */
export const TONE_CLASS: Record<Tone, string> = {
  positive: "badge-soft badge-success",
  caution: "badge-soft badge-warning",
  critical: "badge-soft badge-error",
  progress: "badge-soft badge-info",
  neutral: "badge-ghost",
}

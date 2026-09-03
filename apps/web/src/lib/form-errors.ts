/**
 * Putting the highlight on the field that was refused.
 *
 * Every action answers a rejection with `errorFields` — the names of the
 * fields that failed — alongside the message. Three pages in the product
 * rendered it and thirteen did not, so on most forms a person was told
 * "Check Anchor date." and then had to find the anchor date themselves, with
 * nothing on screen distinguishing it from the nine fields that were fine.
 *
 * The helper lives here rather than being redeclared per page because it was
 * already copied into three files, and a copied rule is a rule that drifts
 * (L57). It is also the reason the modifier is chosen by CONTROL: daisyUI
 * scopes `input-error`, `select-error` and `textarea-error` to their own
 * component, and while all three happen to set the same `--input-color`
 * custom property today, that is an implementation detail of the library and
 * not a promise.
 *
 * `aria` is not optional decoration. A red border is invisible to a screen
 * reader and to anyone who cannot distinguish the hue — `aria-invalid` is what
 * makes "this field is the problem" available to both, and it costs one
 * attribute per control.
 */

/** The shape SvelteKit's `form` prop has after `fail(400, f.problem())`. */
export type FormResult = {
  errorFields?: string[]
  message?: string
} | null

export type FieldErrors = {
  /** daisyUI modifier for an `<input>`, or "" when the field is fine. */
  input: (name: string) => string
  /** daisyUI modifier for a `<select>`. */
  select: (name: string) => string
  /** daisyUI modifier for a `<textarea>`. */
  textarea: (name: string) => string
  /** `aria-invalid`, so the highlight is not colour-only. */
  aria: (name: string) => "true" | undefined
  /** Did this field fail? For anything the three modifiers do not cover. */
  has: (name: string) => boolean
}

export function fieldErrors(form: FormResult): FieldErrors {
  const failed = new Set(form?.errorFields ?? [])
  const mark =
    (kind: "input" | "select" | "textarea") =>
    (name: string): string =>
      failed.has(name) ? `${kind}-error` : ""

  return {
    input: mark("input"),
    select: mark("select"),
    textarea: mark("textarea"),
    aria: (name) => (failed.has(name) ? "true" : undefined),
    has: (name) => failed.has(name),
  }
}

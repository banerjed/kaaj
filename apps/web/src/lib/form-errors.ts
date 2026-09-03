/**
 * Highlights the field(s) named in an action's `errorFields`, one home
 * instead of copies drifting across pages (L57). `aria-invalid` matters as
 * much as the border colour — a screen reader can't see red.
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

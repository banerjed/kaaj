import type { SubmitFunction } from "@sveltejs/kit"

/**
 * Keep a refused modal form on screen with what was typed still in it,
 * instead of a plain POST reload closing it and discarding the edit (L68).
 *
 * ```svelte
 * <form method="POST" action="?/save"
 *       use:enhance={closeOnSuccess(() => (editing = null))}>
 * ```
 */
export function closeOnSuccess(close: () => void): SubmitFunction {
  return () =>
    async ({ update, result }) => {
      await update({ reset: false })
      if (result.type === "success" || result.type === "redirect") close()
    }
}

/** The same, for a non-modal form — a full reload would still discard the edit being refused. */
export const keepValues: SubmitFunction =
  () =>
  async ({ update }) => {
    await update({ reset: false })
  }

/**
 * A native form reset never reaches a `contenteditable` — `RichTextEditor`
 * isn't a form control the browser knows how to clear. Wrap it in
 * `{#key n}` and bump `n` here on success; a refused submission leaves both
 * alone, so the draft survives exactly like every other field (L68).
 *
 * ```svelte
 * <form method="POST" use:enhance={resetOnSuccess(() => richTextKey++)}>
 *   {#key richTextKey}<RichTextEditor name="content" />{/key}
 * ```
 */
export function resetOnSuccess(clear: () => void): SubmitFunction {
  return () =>
    async ({ update, result }) => {
      await update()
      if (result.type === "success" || result.type === "redirect") clear()
    }
}

import type { SubmitFunction } from "@sveltejs/kit"

/**
 * Keep a refused form on screen, with what the person typed still in it.
 *
 * Without this, a `<form method="POST">` submits the browser's own way: the
 * page reloads, every `$state` on it is reconstructed, and a modal driven by
 * `let editing = $state(...)` closes. The action's `fail(400, …)` still comes
 * back, and the alert still renders — but the form it refers to is gone, along
 * with everything typed into it.
 *
 * That made the field highlight unreachable on every modal form in settings:
 * the action named the field, the markup was ready to mark it, and the control
 * was no longer in the document. It is the shape of failure this codebase
 * keeps rediscovering — nothing errored, and the page looked like it had
 * simply not saved (L68).
 *
 * `update({ reset: false })` is the whole point: the default RESETS the form,
 * which on a refusal throws away the person's work at the exact moment they
 * need it back.
 *
 * ```svelte
 * <form method="POST" action="?/save"
 *       use:enhance={closeOnSuccess(() => (editing = null))}>
 * ```
 */
export function closeOnSuccess(close: () => void): SubmitFunction {
  return () =>
    async ({ update, result }) => {
      // `reset: false` keeps the typed values; the refusal is about one field,
      // and blanking the other nine is not a correction anybody asked for.
      await update({ reset: false })
      if (result.type === "success" || result.type === "redirect") close()
    }
}

/**
 * The same, for a form that is not in a modal and has nothing to close.
 *
 * Still worth enhancing: a full reload puts every input back to the value the
 * server last knew, so a refused submission silently discards the edit it is
 * asking the person to fix.
 */
export const keepValues: SubmitFunction =
  () =>
  async ({ update }) => {
    await update({ reset: false })
  }

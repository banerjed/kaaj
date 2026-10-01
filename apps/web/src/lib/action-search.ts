import { deserialize } from "$app/forms"
import type { ComboboxOption } from "$lib/components/Combobox.svelte"

/**
 * A `Combobox` `search` that posts to one of the page's own actions —
 * `?/searchPeople`, `?/searchCustomers` — so the picker asks the server for
 * twenty matches instead of the page shipping every row (CLAUDE.md,
 * Performance). The action answers `{ results: ComboboxOption[] }`.
 * `extra` adds fields, such as the project a task search is scoped to.
 * A picker in a layout, which serves many pages, names its page in full:
 * `/chat?/searchPeople`.
 */
export function actionSearch(
  action: string,
  extra?: () => Record<string, string>,
): (q: string) => Promise<ComboboxOption[]> {
  return async (q) => {
    const body = new FormData()
    body.set("q", q)
    for (const [k, v] of Object.entries(extra?.() ?? {})) body.set(k, v)
    const url = action.includes("?/") ? action : `?/${action}`
    const res = await fetch(url, { method: "POST", body })
    const result = deserialize<
      { results: ComboboxOption[] },
      Record<string, unknown>
    >(await res.text())
    return result.type === "success" ? (result.data?.results ?? []) : []
  }
}

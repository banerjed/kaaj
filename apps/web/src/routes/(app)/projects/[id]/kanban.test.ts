import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * The Kanban board must not fork a second, divergent status-writing path
 * from the list view's own `moveTask` control (docs/23-project-management-
 * phase1.md, test plan item 24). Nothing in the DOM distinguishes "the one
 * true control, reused" from "a second control that happens to look the
 * same" — the only place that distinction is checkable is the source: one
 * `{#snippet}` definition, rendered from more than one call site, with
 * exactly one `?/moveTask` form inside it.
 */

const src = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8")

describe("the Kanban board shares the list view's status control, not a copy of it", () => {
  it("defines statusControl exactly once", () => {
    const definitions = src.match(/\{#snippet statusControl\(/g) ?? []
    expect(definitions).toHaveLength(1)
  })

  it("renders statusControl from more than one call site (list rows, subtask rows, and Kanban cards)", () => {
    const renders = src.match(/\{@render statusControl\(/g) ?? []
    expect(renders.length).toBeGreaterThan(1)
  })

  it("contains exactly one form posting to ?/moveTask — inside that single snippet, not duplicated per view", () => {
    const moveTaskForms = src.match(/action="\?\/moveTask"/g) ?? []
    expect(moveTaskForms).toHaveLength(1)
  })
})

/** Client-safe custom-field helpers, shared by the server repository and the components. */

export const DEFAULT_CATEGORY = "General"

/** Group definitions (already in display order) into their categories, keeping the order. */
export function byCategory<D extends { category: string }>(
  definitions: D[],
): { category: string; fields: D[] }[] {
  const groups: { category: string; fields: D[] }[] = []
  for (const d of definitions) {
    const last = groups[groups.length - 1]
    if (last?.category === d.category) last.fields.push(d)
    else groups.push({ category: d.category, fields: [d] })
  }
  return groups
}

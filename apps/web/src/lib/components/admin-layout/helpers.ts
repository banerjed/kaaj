import type { ISidebarMenuItem } from "./SidebarMenuItem.svelte"

/**
 * The ids of the item matching `url` and every ancestor above it, so the
 * sidebar can expand the right groups and mark the right item active.
 *
 * Nexus found the item recursively and then walked the tree a second time with
 * three hardcoded nested loops to recover its ancestors — traversing everything
 * twice, and silently returning nothing for anything below the third level.
 * This collects the path on the way down, in one pass, at any depth.
 */
export const getActivatedItemParentKeys = (
  menuItems: ISidebarMenuItem[],
  url: string,
): string[] => {
  const walk = (
    items: ISidebarMenuItem[],
    trail: string[],
  ): string[] | null => {
    for (const item of items) {
      const path = [...trail, item.id]
      if (item.url === url) return path
      const found = item.children && walk(item.children, path)
      if (found) return found
    }
    return null
  }

  return walk(menuItems, []) ?? []
}

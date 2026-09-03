import { describe, expect, it } from "vitest"
import { getActivatedItemParentKeys, visibleMenuItems } from "./helpers"
import type { ISidebarMenuItem } from "./SidebarMenuItem.svelte"

/** The sidebar helpers. Not access control, but wrong output offers a 403 link or hides an entitled page. */

const MENU: ISidebarMenuItem[] = [
  { id: "open", label: "Open" },
  { id: "gated", label: "Gated", permission: "accounting.read" },
  {
    id: "group",
    label: "Group",
    children: [
      { id: "child-open", label: "Child Open" },
      {
        id: "child-gated",
        label: "Child Gated",
        permission: "compensation.read.all",
      },
    ],
  },
  {
    id: "all-gated",
    label: "All Gated",
    children: [
      { id: "g1", label: "G1", permission: "payroll.approve" },
      { id: "g2", label: "G2", permission: "payroll.approve" },
    ],
  },
]

const ids = (items: ISidebarMenuItem[]): string[] =>
  items.flatMap((i) => [i.id, ...(i.children ? ids(i.children) : [])])

describe("visibleMenuItems", () => {
  it("keeps entries with no permission, whoever is looking", () => {
    const out = visibleMenuItems(MENU, new Set())
    expect(ids(out)).toContain("open")
    expect(ids(out)).toContain("child-open")
  })

  it("removes an entry whose permission the viewer lacks", () => {
    const out = visibleMenuItems(MENU, new Set())
    expect(ids(out)).not.toContain("gated")
    expect(ids(out)).not.toContain("child-gated")
  })

  it("keeps it when the viewer holds the permission", () => {
    const out = visibleMenuItems(MENU, new Set(["accounting.read"]))
    expect(ids(out)).toContain("gated")
  })

  it("drops a group whose every child was removed", () => {
    // Otherwise the group renders as a chevron that opens onto nothing.
    const out = visibleMenuItems(MENU, new Set())
    expect(ids(out)).not.toContain("all-gated")
  })

  it("keeps a group when even one child survives", () => {
    const out = visibleMenuItems(MENU, new Set())
    expect(ids(out)).toContain("group")
    expect(ids(out)).toContain("child-open")
  })

  it("does not mutate the menu it was given", () => {
    // appMenuItems is a module-level array shared across requests.
    const before = JSON.stringify(MENU)
    visibleMenuItems(MENU, new Set(["accounting.read"]))
    visibleMenuItems(MENU, new Set())
    expect(JSON.stringify(MENU)).toBe(before)
  })

  it("gives two viewers different menus from the same input", () => {
    const rich = ids(
      visibleMenuItems(MENU, new Set(["accounting.read", "payroll.approve"])),
    )
    const poor = ids(visibleMenuItems(MENU, new Set()))
    expect(rich).toContain("gated")
    expect(poor).not.toContain("gated")
  })
})

describe("getActivatedItemParentKeys", () => {
  it("returns the item and every ancestor above it", () => {
    const menu: ISidebarMenuItem[] = [
      {
        id: "a",
        label: "A",
        children: [
          {
            id: "b",
            label: "B",
            children: [{ id: "c", label: "C", url: "/deep" }],
          },
        ],
      },
    ]
    // Nexus returned nothing below the third level; this collects the trail on
    // the way down, at any depth.
    expect(getActivatedItemParentKeys(menu, "/deep")).toEqual(["a", "b", "c"])
  })

  it("returns nothing for a url that is not in the menu", () => {
    expect(getActivatedItemParentKeys(MENU, "/nowhere")).toEqual([])
  })
})

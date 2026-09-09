import { describe, expect, it } from "vitest"
import { BRAND_COLORS } from "./regional"

/**
 * The topbar renders every non-default swatch with fixed white text
 * (Topbar.svelte's `--topbar-fg:#fff`), so each hex here must itself clear
 * WCAG AA (4.5:1) against white — the palette IS the contrast guarantee,
 * with no runtime check behind it. Un-enforced, this is exactly the kind of
 * rule that erodes silently: emerald's first candidate (#059669) was 3.77:1
 * and only caught by computing it, not by looking at the swatch.
 */

function contrastAgainstWhite(hex: string): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return (1 + 0.05) / (luminance + 0.05)
}

describe("BRAND_COLORS", () => {
  for (const c of BRAND_COLORS) {
    if (c.hex === null) continue
    it(`${c.code} (${c.hex}) clears 4.5:1 against white topbar text`, () => {
      expect(contrastAgainstWhite(c.hex)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

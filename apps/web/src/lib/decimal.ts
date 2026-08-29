/**
 * Comparing decimals held as strings.
 *
 * Money is a string end to end (CLAUDE.md § Money), so the ordering checks a
 * validator needs — "is max at least min?", "is this negative?" — cannot go
 * through `Number()` without reintroducing the float this codebase exists to
 * avoid. `numeric(15,2)` at crore scale exceeds what a float64 holds exactly.
 *
 * This compares, and does not add. Arithmetic still happens in SQL.
 */

/** -1, 0 or 1, exactly, for two decimal strings the form reader has shaped. */
export function compareDecimal(a: string, b: string): number {
  const [as, ai, af] = split(a)
  const [bs, bi, bf] = split(b)
  if (as !== bs) return as < bs ? -1 : 1

  const magnitude = compareMagnitude(ai, af, bi, bf)
  // A negative pair orders the other way round: -9 is less than -1.
  return as < 0 ? -magnitude : magnitude
}

export const isNegative = (v: string) => compareDecimal(v, "0") < 0
export const isPositive = (v: string) => compareDecimal(v, "0") > 0

function split(v: string): [sign: number, int: string, frac: string] {
  const negative = v.startsWith("-")
  const body = negative ? v.slice(1) : v
  const [int = "0", frac = ""] = body.split(".")
  // -0 and 0 are the same number; treating them otherwise makes 0 > 0.
  const zero = /^0*$/.test(int) && /^0*$/.test(frac)
  return [zero ? 0 : negative ? -1 : 1, int, frac]
}

function compareMagnitude(
  ai: string,
  af: string,
  bi: string,
  bf: string,
): number {
  const i = ai.replace(/^0+(?=\d)/, "")
  const j = bi.replace(/^0+(?=\d)/, "")
  if (i.length !== j.length) return i.length < j.length ? -1 : 1
  if (i !== j) return i < j ? -1 : 1

  const width = Math.max(af.length, bf.length)
  const x = af.padEnd(width, "0")
  const y = bf.padEnd(width, "0")
  return x === y ? 0 : x < y ? -1 : 1
}

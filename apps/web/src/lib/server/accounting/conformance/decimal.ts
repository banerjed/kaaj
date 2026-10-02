/**
 * Decimal comparison for the conformance runner (spec section 8.4): amounts
 * are decimal strings, compared at two decimal places, never through a
 * float. `cents` is the whole comparison — a BigInt of minor units.
 */
const SHAPE = /^(-?)(\d+)(?:\.(\d+))?$/

export function cents(
  value: string | number | null | undefined,
  scale = 2,
): bigint {
  if (value === null || value === undefined) throw new Error("amount is null")
  const s = String(value).trim()
  const m = SHAPE.exec(s)
  if (!m) throw new Error(`not a decimal: "${s}"`)
  const [, sign, whole, frac = ""] = m
  const digits = (frac + "0".repeat(scale)).slice(0, scale)
  const dropped = frac.slice(scale)
  if (dropped.length > 0 && /[1-9]/.test(dropped)) {
    throw new Error(`"${s}" has more than ${scale} decimal places`)
  }
  const n = BigInt(whole + digits)
  return sign === "-" ? -n : n
}

export function sameAmount(
  a: string | number,
  b: string | number,
  scale = 2,
): boolean {
  return cents(a, scale) === cents(b, scale)
}

export function fromCents(n: bigint, scale = 2): string {
  const neg = n < 0n
  const abs = (neg ? -n : n).toString().padStart(scale + 1, "0")
  const whole = abs.slice(0, abs.length - scale)
  const frac = abs.slice(abs.length - scale)
  return `${neg ? "-" : ""}${whole}${scale > 0 ? "." + frac : ""}`
}

export function looksDecimal(value: unknown): value is string {
  return typeof value === "string" && SHAPE.test(value.trim())
}

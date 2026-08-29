export interface LedgerAmount {
  debit?: number
  credit?: number
  baseDebit?: number
  baseCredit?: number
  currency: string
}

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function sumDebits(values: LedgerAmount[]): number {
  return roundCents(
    values.reduce((total, value) => total + (value.debit ?? 0), 0),
  )
}

export function sumCredits(values: LedgerAmount[]): number {
  return roundCents(
    values.reduce((total, value) => total + (value.credit ?? 0), 0),
  )
}

export function sumBaseDebits(values: LedgerAmount[]): number {
  return roundCents(
    values.reduce(
      (total, value) => total + (value.baseDebit ?? value.debit ?? 0),
      0,
    ),
  )
}

export function sumBaseCredits(values: LedgerAmount[]): number {
  return roundCents(
    values.reduce(
      (total, value) => total + (value.baseCredit ?? value.credit ?? 0),
      0,
    ),
  )
}

export function withinTolerance(
  actual: number,
  expected: number,
  tolerance = 0.01,
): boolean {
  return Math.abs(roundCents(actual) - roundCents(expected)) <= tolerance
}

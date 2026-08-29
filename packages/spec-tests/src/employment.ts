export interface I9Timeline {
  hireDate: string
  terminationDate?: string
  legalHold: boolean
}

export interface EmploymentRecord {
  employeeId: string
  recordType:
    | "status"
    | "manager"
    | "title"
    | "department"
    | "work_location"
    | "compensation"
    | "policy_eligibility"
  effectiveFrom: string
  effectiveTo: string | null
}

export function calculateI9Deadlines(hireDate: string): {
  section1Due: string
  section2Due: string
} {
  return {
    section1Due: hireDate,
    section2Due: addBusinessDays(hireDate, 3),
  }
}

export function calculateI9RetentionUntil(timeline: I9Timeline): string | null {
  if (!timeline.terminationDate) {
    return null
  }

  return maxDate(
    addYears(timeline.hireDate, 3),
    addYears(timeline.terminationDate, 1),
  )
}

export function canPurgeI9(timeline: I9Timeline, asOfDate: string): boolean {
  const retentionUntil = calculateI9RetentionUntil(timeline)

  return (
    !timeline.legalHold && retentionUntil !== null && asOfDate >= retentionUntil
  )
}

export function findOverlappingEmploymentRecords(
  records: EmploymentRecord[],
): EmploymentRecord[] {
  const overlaps: EmploymentRecord[] = []
  const sorted = [...records].sort((left, right) =>
    [left.employeeId, left.recordType, left.effectiveFrom]
      .join("|")
      .localeCompare(
        [right.employeeId, right.recordType, right.effectiveFrom].join("|"),
      ),
  )

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]

    if (
      previous.employeeId === current.employeeId &&
      previous.recordType === current.recordType &&
      intervalsOverlap(previous, current)
    ) {
      overlaps.push(previous, current)
    }
  }

  return Array.from(
    new Map(overlaps.map((record) => [recordKey(record), record])).values(),
  )
}

function intervalsOverlap(
  left: EmploymentRecord,
  right: EmploymentRecord,
): boolean {
  const leftEnd = left.effectiveTo ?? "9999-12-31"
  const rightEnd = right.effectiveTo ?? "9999-12-31"

  return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd
}

function addBusinessDays(dateValue: string, days: number): string {
  const date = parseDate(dateValue)
  let remaining = days

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)

    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      remaining -= 1
    }
  }

  return formatDate(date)
}

function addYears(dateValue: string, years: number): string {
  const date = parseDate(dateValue)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return formatDate(date)
}

function maxDate(left: string, right: string): string {
  return left >= right ? left : right
}

function parseDate(dateValue: string): Date {
  return new Date(`${dateValue}T00:00:00.000Z`)
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function recordKey(record: EmploymentRecord): string {
  return [
    record.employeeId,
    record.recordType,
    record.effectiveFrom,
    record.effectiveTo ?? "",
  ].join("|")
}

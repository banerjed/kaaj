/**
 * The import files of the payroll providers Kaaj exports hours to
 * (docs/37-payroll-provider-integration.md). Pure: hours arrive already
 * classified and rounded, as decimal strings from SQL, and leave as text.
 * Nothing here does arithmetic on an hour value.
 */

export const PAYROLL_PROVIDERS = [
  "adp_run",
  "adp_wfn",
  "gusto",
  "paychex_flex",
] as const
export type PayrollProvider = (typeof PAYROLL_PROVIDERS)[number]

export const PROVIDER_LABELS: Record<PayrollProvider, string> = {
  adp_run: "ADP RUN",
  adp_wfn: "ADP Workforce Now",
  gusto: "Gusto",
  paychex_flex: "Paychex Flex",
}

/** The layout comes from the provider's own guide, or only from third parties. */
export const LAYOUT_CONFIRMED: Record<PayrollProvider, boolean> = {
  adp_run: true,
  adp_wfn: true,
  gusto: false,
  paychex_flex: false,
}

/** Gusto matches employees by name; every other provider needs its own id. */
export const NEEDS_EMPLOYEE_ID: Record<PayrollProvider, boolean> = {
  adp_run: true,
  adp_wfn: true,
  gusto: false,
  paychex_flex: true,
}

export const COMPANY_CODE_LABELS: Record<PayrollProvider, string | null> = {
  adp_run: "Company Code (IID)",
  adp_wfn: "Co Code",
  gusto: null,
  paychex_flex: "Client ID",
}

/**
 * What each provider accepts, checked when the value is saved so that a
 * file is never refused at upload. Workforce Now takes ASCII only; RUN and
 * Paychex ids keep their leading zeros, so they are text.
 */
const COMPANY_CODE: Record<PayrollProvider, RegExp | null> = {
  adp_run: /^[A-Za-z0-9]{1,10}$/,
  adp_wfn: /^[A-Za-z0-9]{2,3}$/,
  gusto: null,
  paychex_flex: /^[0-9]{1,10}$/,
}
const EMPLOYEE_ID: Record<PayrollProvider, RegExp | null> = {
  adp_run: /^[A-Za-z0-9-]{1,15}$/,
  adp_wfn: /^[A-Za-z0-9]{1,6}$/,
  gusto: null,
  paychex_flex: /^[A-Za-z0-9-]{1,20}$/,
}
const CODE: Record<PayrollProvider, RegExp> = {
  adp_run: /^[A-Za-z0-9]{1,10}$/,
  adp_wfn: /^[A-Za-z0-9]{1,10}$/,
  gusto: /^[A-Za-z0-9 ()/-]{1,50}$/,
  paychex_flex: /^[A-Za-z0-9 ()/-]{1,50}$/,
}

export const COMPANY_CODE_HINT: Record<PayrollProvider, string> = {
  adp_run: "Up to 10 letters and digits, from RUN's home page (Customer ID).",
  adp_wfn: "Two or three letters and digits.",
  gusto: "",
  paychex_flex: "Digits only, from the top of Paychex Flex.",
}
export const EMPLOYEE_ID_HINT: Record<PayrollProvider, string> = {
  adp_run:
    "The RUN employee id or time-clock id: up to 15 letters, digits or dashes.",
  adp_wfn: "The File #: up to 6 letters and digits.",
  gusto: "Gusto matches employees by name; no id is needed.",
  paychex_flex: "The Paychex Worker ID: up to 20 letters, digits or dashes.",
}

export const validCompanyCode = (p: PayrollProvider, v: string): boolean =>
  COMPANY_CODE[p]?.test(v) ?? true
export const validEmployeeId = (p: PayrollProvider, v: string): boolean =>
  EMPLOYEE_ID[p]?.test(v) ?? false
export const validCode = (p: PayrollProvider, v: string): boolean =>
  CODE[p].test(v)

/**
 * Workforce Now puts regular and overtime hours in fixed columns, not under
 * a code. The mapping is stored all the same, so "every source with hours
 * has a decision" holds for every provider.
 */
export const FIXED_CODES: Partial<
  Record<PayrollProvider, Record<string, string>>
> = {
  adp_wfn: { regular: "RegHours", overtime: "OTHours" },
}

/** Worked-hour sources. Time off is `time_off:<policy_code>`. */
export const HOUR_TYPES = ["regular", "overtime", "double_time"] as const
export type HourType = (typeof HOUR_TYPES)[number]

export const HOUR_TYPE_LABELS: Record<HourType, string> = {
  regular: "Regular hours",
  overtime: "Overtime hours",
  double_time: "Double-time hours",
}

/** The pay frequencies RUN takes, by `employees.pay_frequency`. */
export const RUN_FREQUENCY: Record<string, { letter: string; word: string }> = {
  weekly: { letter: "W", word: "Weekly" },
  "bi-weekly": { letter: "B", word: "Biweekly" },
  "semi-monthly": { letter: "S", word: "Semimonthly" },
  monthly: { letter: "M", word: "Monthly" },
  quarterly: { letter: "Q", word: "Quarterly" },
}

export type ExportLine = {
  /** `regular`, `overtime`, `double_time` or `time_off:<policy_code>`. */
  source: string
  /** The provider's code for this source (for Gusto, the column name). */
  code: string
  /** Two decimals, from SQL, never zero. */
  hours: string
}

export type ExportEmployee = {
  externalId: string | null
  firstName: string
  lastName: string
  lines: ExportLine[]
}

export type ExportInput = {
  provider: PayrollProvider
  companyCode: string | null
  /** ISO dates, inclusive. */
  from: string
  to: string
  /** `employees.pay_frequency`; required for RUN. */
  frequency: string | null
  employees: ExportEmployee[]
}

export type ExportFile = { filename: string; body: string }

export class ExportFormatError extends Error {}

const CRLF = "\r\n"

/** ISO `2026-09-27` to `09/27/2026`, without a Date: no zone to get wrong. */
function usDate(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`
}

function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** A name is free text a person typed: keep a spreadsheet from running it as a formula. */
function textField(value: string): string {
  return field(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)
}

function csv(rows: string[][]): string {
  return rows.map((r) => r.join(",")).join(CRLF) + CRLF
}

function requireCompanyCode(input: ExportInput): string {
  if (!input.companyCode)
    throw new ExportFormatError(
      `${PROVIDER_LABELS[input.provider]} needs the ${COMPANY_CODE_LABELS[input.provider]}.`,
    )
  return input.companyCode
}

function requireId(e: ExportEmployee, provider: PayrollProvider): string {
  if (!e.externalId)
    throw new ExportFormatError(
      `${e.firstName} ${e.lastName} has no ${PROVIDER_LABELS[provider]} id.`,
    )
  return e.externalId
}

/**
 * RUN's Time Sheet Import: a version row, a heading row, then one row per
 * employee per earnings code. One pay frequency per file.
 */
function adpRun(input: ExportInput): ExportFile {
  const company = requireCompanyCode(input)
  const freq = input.frequency ? RUN_FREQUENCY[input.frequency] : undefined
  if (!freq)
    throw new ExportFormatError(
      "ADP RUN needs one pay frequency per file: weekly, bi-weekly, semi-monthly, monthly or quarterly.",
    )
  const start = usDate(input.from)
  const end = usDate(input.to)
  const rows: string[][] = [
    [
      "Company Code",
      "Pay Frequency",
      "Pay Period Start Date",
      "Pay Period End Date",
      "Employee ID",
      "Earnings Code",
      "Pay Hours",
      "Dollars",
      "Separate Check",
      "Worked In Dept",
      "Rate Code",
    ],
  ]
  for (const e of input.employees) {
    const id = requireId(e, input.provider)
    for (const l of e.lines)
      rows.push([
        field(company),
        freq.letter,
        start,
        end,
        field(id),
        field(l.code),
        l.hours,
        "",
        "0",
        "",
        "BASE",
      ])
  }
  return {
    filename: `${freq.word}-${start.replaceAll("/", "")}-${end.replaceAll("/", "")}.csv`,
    body: "##GENERIC## V1.0" + CRLF + csv(rows),
  }
}

const WFN_PAIRS = 2 // Hours 3 and Hours 4: four code occurrences per record, with Reg and O/T

/** Workforce Now accepts ASCII 32–91 and 93–122 only. */
function wfnText(value: string, what: string): string {
  if (!/^[\x20-\x5b\x5d-\x7a]*$/.test(value))
    throw new ExportFormatError(
      `${what} "${value}" has a character ADP Workforce Now refuses.`,
    )
  return field(value)
}

/**
 * Workforce Now's paydata import: `Co Code, Batch ID, File #` first, regular
 * and overtime in their own columns, every other code in Hours 3/4 pairs. An
 * employee with more than two other codes gets a second record.
 */
function adpWfn(input: ExportInput): ExportFile {
  const company = wfnText(requireCompanyCode(input), "Co Code")
  // Up to 8 characters; one batch per export, named for the period's end.
  const batch = `KJ${input.to.slice(2, 4)}${input.to.slice(5, 7)}${input.to.slice(8, 10)}`
  const rows: string[][] = [
    [
      "Co Code",
      "Batch ID",
      "File #",
      "Reg Hours",
      "O/T Hours",
      "Hours 3 Code",
      "Hours 3 Amount",
      "Hours 4 Code",
      "Hours 4 Amount",
    ],
  ]
  for (const e of input.employees) {
    const id = wfnText(requireId(e, input.provider), "File #")
    const reg = e.lines.find((l) => l.source === "regular")?.hours ?? ""
    const ot = e.lines.find((l) => l.source === "overtime")?.hours ?? ""
    const others = e.lines.filter(
      (l) => l.source !== "regular" && l.source !== "overtime",
    )
    const records = Math.max(1, Math.ceil(others.length / WFN_PAIRS))
    for (let i = 0; i < records; i++) {
      const pairs = others.slice(i * WFN_PAIRS, (i + 1) * WFN_PAIRS)
      const cells = pairs.flatMap((p) => [
        wfnText(p.code, "Hours code"),
        p.hours,
      ])
      while (cells.length < WFN_PAIRS * 2) cells.push("")
      // Empty, never 0: Workforce Now reads an empty field as "no data".
      rows.push([
        company,
        batch,
        id,
        i === 0 ? reg : "",
        i === 0 ? ot : "",
        ...cells,
      ])
    }
  }
  const nameCode = company.length === 2 ? `${company}_` : company
  return { filename: `PR${nameCode}EPI.csv`, body: csv(rows) }
}

/**
 * Gusto's payroll import: one row per employee, matched by name, one column
 * per kind of hours. A blank leaves Gusto's entry alone; a zero would
 * overwrite it, so no zero is ever written.
 */
function gusto(input: ExportInput): ExportFile {
  const columns: string[] = []
  for (const e of input.employees)
    for (const l of e.lines) if (!columns.includes(l.code)) columns.push(l.code)
  const rows: string[][] = [
    ["first_name", "last_name", "title", ...columns.map(textField)],
  ]
  for (const e of input.employees) {
    const byCode = new Map(e.lines.map((l) => [l.code, l.hours]))
    rows.push([
      textField(e.firstName),
      textField(e.lastName),
      "",
      ...columns.map((c) => byCode.get(c) ?? ""),
    ])
  }
  return {
    filename: `gusto-hours-${input.from}-${input.to}.csv`,
    body: csv(rows),
  }
}

/** Paychex Flex's payroll import: one row per employee per pay component. */
function paychexFlex(input: ExportInput): ExportFile {
  const client = requireCompanyCode(input)
  const rows: string[][] = [
    [
      "Client ID",
      "Worker ID",
      "Org",
      "Job Number",
      "Pay Component",
      "Rate",
      "Rate Number",
      "Hours",
      "Units",
      "Line Date",
      "Amount",
      "Check Seq Number",
      "Override State",
      "Override Local",
      "Override Local Jurisdiction",
      "Labor Assignment",
    ],
  ]
  for (const e of input.employees) {
    const id = requireId(e, input.provider)
    for (const l of e.lines)
      rows.push([
        field(client),
        field(id),
        "",
        "",
        field(l.code),
        "",
        "",
        l.hours,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ])
  }
  return {
    filename: `paychex-hours-${input.from}-${input.to}.csv`,
    body: csv(rows),
  }
}

const WRITERS: Record<PayrollProvider, (input: ExportInput) => ExportFile> = {
  adp_run: adpRun,
  adp_wfn: adpWfn,
  gusto,
  paychex_flex: paychexFlex,
}

export function writeExport(input: ExportInput): ExportFile {
  return WRITERS[input.provider](input)
}

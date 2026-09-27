import { createHash } from "node:crypto"
import { parseOfx, ofxDate } from "./ofx"
import {
  decode,
  detectDelimiter,
  tokenize,
  DELIMITERS,
  type Delimiter,
  type Row,
} from "./text"
import {
  dateFormatCandidates,
  decimalCandidates,
  parseAmount,
  parseDate,
  toCents,
  fromCents,
  DATE_FORMATS,
  type DateFormat,
  type DecimalMark,
} from "./values"

/**
 * One bank statement file in, the transactions it holds out — or the reasons
 * it cannot be read without guessing. The contract this module keeps:
 *
 *   - Nothing is decided that some row contradicts. A date format, a decimal
 *     mark, a sign convention is chosen only when EVERY row agrees with it;
 *     otherwise the person is asked.
 *   - A running balance in the file is used as proof: the amounts must
 *     reproduce it, in one order or the other, or the import is refused.
 *   - Every transaction gets a stable id, so importing an overlapping or
 *     repeated statement adds only what is new.
 *
 * Pure: no database, no framework. The action layer adds the account's
 * currency, the saved profile, and the write.
 */

export const ROLES = [
  "ignore",
  "date",
  "value_date",
  "description",
  "memo",
  "reference",
  "type",
  "amount",
  "debit",
  "credit",
  "direction",
  "balance",
  "currency",
] as const
export type Role = (typeof ROLES)[number]

export type CsvMapping = {
  delimiter: Delimiter
  /** Normalised header cells joined by `|`, or `null` for a file with no header row. */
  headerSignature: string | null
  columns: Role[]
  dateFormat: DateFormat
  decimal: DecimalMark
  /** A single amount column where money OUT is positive (typical of card statements). */
  invertSign: boolean
}

export type ParsedTransaction = {
  line: number
  date: string
  valueDate: string | null
  description: string
  reference: string | null
  amount: string
  balance: string | null
  externalId: string
  /** 0-based position in time within this file: later is larger, whichever way the bank sorted it. */
  sequence: number
}

export type Problem = { line: number | null; message: string }

export type Analysis = {
  format: "csv" | "ofx"
  headers: string[] | null
  /** The file's first non-blank line: a header the synonyms did not recognise is offered as one. */
  firstRow: { cells: string[]; signature: string } | null
  columnCount: number
  sample: string[][]
  /** The mapping this result used; null for OFX. */
  mapping: CsvMapping | null
  mappingSource: "explicit" | "profile" | "inferred" | null
  dateFormatChoices: DateFormat[]
  decimalChoices: DecimalMark[]
  transactions: ParsedTransaction[]
  skipped: { line: number; reason: string }[]
  problems: Problem[]
  warnings: string[]
  currency: string | null
  balanceCheck: "passed" | "unavailable"
  /** True when nothing in the file could prove the sign convention, and nobody has confirmed it. */
  needsConfirmation: boolean
  period: { from: string; to: string } | null
  totals: { moneyIn: string; moneyOut: string }
}

export const MAX_ROWS = 20_000
const MAX_REFERENCE = 100

export type AnalyseOptions = {
  accountCurrency: string
  /** A mapping the person chose on the preview; wins over everything. */
  mapping?: CsvMapping | null
  /** The mapping saved from this account's last import. */
  profile?: CsvMapping | null
  /** The person has looked at the preview and confirmed money in is positive. */
  confirmed?: boolean
}

export function analyseStatement(
  bytes: Uint8Array,
  opts: AnalyseOptions,
): Analysis | { fatal: string } {
  const decoded = decode(bytes)
  if (!decoded.ok) return { fatal: decoded.reason }
  return decoded.kind === "ofx"
    ? analyseOfx(decoded.text, opts)
    : analyseCsv(decoded.text, opts)
}

// ---------------------------------------------------------------------------
// Header recognition
// ---------------------------------------------------------------------------

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

const CCY = "(?:[a-z]{3})?"
const HEADER_ROLES: [Role, RegExp][] = [
  ["value_date", /^(valuedate|valuedt|effectivedate)$/],
  [
    "date",
    /^(date|transactiondate|transdate|trandate|txndate|postingdate|posteddate|postdate|dateposted|bookingdate|bookeddate|entrydate)$/,
  ],
  [
    "description",
    /^(description|transactiondescription|details|transactiondetails|narrative|narration|particulars|payee|payeename|name|merchant|merchantname)$/,
  ],
  [
    "memo",
    /^(memo|remarks|notes?|additionalinfo|additionalinformation|extendeddetails)$/,
  ],
  [
    "reference",
    /^(reference|ref|refno|referenceno|referencenumber|chqrefno|chequeno|chqno|checkno|checknumber|chequenumber|transactionreference)$/,
  ],
  ["type", /^(type|transactiontype|trantype|txntype)$/],
  ["direction", /^(drcr|crdr|debitcredit|creditdebit|dc|cd)$/],
  [
    "debit",
    new RegExp(
      `^(debit|debits|debitamount|debitamt|withdrawal|withdrawals|withdrawalamt|withdrawalamount|moneyout|paidout|outflow|dr)${CCY}$`,
    ),
  ],
  [
    "credit",
    new RegExp(
      `^(credit|credits|creditamount|creditamt|deposit|deposits|depositamt|depositamount|moneyin|paidin|inflow|cr)${CCY}$`,
    ),
  ],
  [
    "balance",
    new RegExp(
      `^(balance|runningbalance|runningbal|closingbalance|ledgerbalance|bal)${CCY}$`,
    ),
  ],
  ["amount", new RegExp(`^(amount|transactionamount|amt|txnamount)${CCY}$`)],
  ["currency", /^(currency|ccy|curr|currencycode)$/],
]

function roleForHeader(cell: string): Role {
  const n = normalise(cell)
  for (const [role, re] of HEADER_ROLES) if (re.test(n)) return role
  return "ignore"
}

const signatureOf = (cells: string[]) => cells.map(normalise).join("|")

/** Roles for a header row; a second column claiming a single-use role is ignored (a second description becomes memo). */
function rolesFromHeader(cells: string[]): Role[] {
  const seen = new Set<Role>()
  return cells.map((c) => {
    let role = roleForHeader(c)
    if (role === "description" && seen.has("description")) role = "memo"
    if (role !== "ignore" && role !== "memo" && seen.has(role)) role = "ignore"
    seen.add(role)
    return role
  })
}

function looksLikeHeader(roles: Role[]): boolean {
  return (
    roles.includes("date") &&
    (roles.includes("amount") ||
      roles.includes("debit") ||
      roles.includes("credit"))
  )
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const SUMMARY_LINE =
  /\b(total|totals|opening|closing|balance|brought|carried|forward|summary|statement)\b/i

function analyseCsv(text: string, opts: AnalyseOptions): Analysis {
  const problems: Problem[] = []
  const warnings: string[] = []
  const skipped: { line: number; reason: string }[] = []

  // 1. Which mapping governs: the person's, the saved one if the file still
  //    has the same layout, or one worked out from the file.
  let source: Analysis["mappingSource"] = null
  let chosen: CsvMapping | null = null
  if (opts.mapping) {
    chosen = opts.mapping
    source = "explicit"
  } else if (opts.profile) {
    chosen = opts.profile
    source = "profile"
  }

  const delimiter = chosen?.delimiter ?? detectDelimiter(text)
  const rows = tokenize(text, delimiter)
  const firstRow = rows[0]
    ? { cells: rows[0].cells, signature: signatureOf(rows[0].cells) }
    : null

  let headerIndex = -1
  if (chosen) {
    headerIndex =
      chosen.headerSignature === null
        ? -1
        : rows.findIndex(
            (r) => signatureOf(r.cells) === chosen!.headerSignature,
          )
    if (chosen.headerSignature !== null && headerIndex < 0) {
      if (source === "profile") {
        warnings.push(
          "This file's columns are different from the last import for this account, so they were worked out again. Check them before importing.",
        )
      } else {
        problems.push({
          line: null,
          message:
            "The header row chosen on the preview is not in this file. Upload the same file again.",
        })
      }
      chosen = null
      source = null
    }
  }
  if (!chosen) {
    headerIndex = rows
      .slice(0, 40)
      .findIndex((r) => looksLikeHeader(rolesFromHeader(r.cells)))
  }

  const headers = headerIndex >= 0 ? rows[headerIndex].cells : null
  const columnCount = headers?.length ?? modalWidth(rows)
  const dataRows = (
    headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows
  ).filter((r) => headerIndex >= 0 || r.cells.length === columnCount)
  if (headerIndex < 0) {
    const preamble = rows.filter((r) => r.cells.length !== columnCount)
    for (const r of preamble)
      skipped.push({
        line: r.line,
        reason: "not part of the transaction table",
      })
  } else {
    for (const r of rows.slice(0, headerIndex))
      skipped.push({ line: r.line, reason: "above the header row" })
  }
  const sample = dataRows.slice(0, 5).map((r) => padTo(r.cells, columnCount))

  if (dataRows.length > MAX_ROWS) {
    return emptyResult("csv", headers, columnCount, sample, [
      {
        line: null,
        message: `That file has more than ${MAX_ROWS.toLocaleString("en-US")} lines. Import it in smaller date ranges.`,
      },
    ])
  }

  const columns: Role[] =
    chosen?.columns.slice(0, columnCount) ??
    (headers
      ? rolesFromHeader(headers)
      : inferRolesFromContent(dataRows, columnCount))
  while (columns.length < columnCount) columns.push("ignore")
  if (!chosen && !headers) {
    problems.push({
      line: null,
      message:
        "This file has no header row. Check which column is which below, then preview again.",
    })
  }

  const col = (role: Role) => columns.indexOf(role)
  const mappingProblems = checkRoles(columns)
  if (mappingProblems.length) {
    return {
      ...emptyResult("csv", headers, columnCount, sample, [
        ...problems,
        ...mappingProblems,
      ]),
      firstRow,
      mapping: draftMapping(delimiter, headers, columns),
      mappingSource: source ?? "inferred",
      skipped,
      warnings,
    }
  }

  // 2. Classify lines: transactions, continuations of a description, summaries.
  const dateCol = col("date")
  type Line = { row: Row; cells: string[] }
  const txLines: Line[] = []
  const continuations = new Map<number, string[]>()
  const amountCols = [col("amount"), col("debit"), col("credit")].filter(
    (i) => i >= 0,
  )
  for (const r of dataRows) {
    const cells = padTo(r.cells, columnCount)
    const dateCell = cells[dateCol]
    const hasAmount = amountCols.some((i) => cells[i] !== "")
    if (dateCell === "") {
      const text = columns
        .map((role, i) =>
          role === "description" || role === "memo" ? cells[i] : "",
        )
        .filter(Boolean)
        .join(" ")
      if (!hasAmount && text && txLines.length > 0) {
        const at = txLines.length - 1
        continuations.set(at, [...(continuations.get(at) ?? []), text])
      } else if (
        hasAmount &&
        SUMMARY_LINE.test(cells.join(" ")) &&
        !cells.some((c) => /\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}/.test(c))
      ) {
        skipped.push({ line: r.line, reason: "a summary line" })
      } else if (hasAmount) {
        problems.push({
          line: r.line,
          message: "This line has an amount but no date.",
        })
      } else {
        skipped.push({ line: r.line, reason: "no date or amount" })
      }
      continue
    }
    if (SUMMARY_LINE.test(dateCell) && !/\d/.test(dateCell)) {
      skipped.push({ line: r.line, reason: `a summary line ("${dateCell}")` })
      continue
    }
    txLines.push({ row: r, cells })
  }
  if (txLines.length === 0) {
    problems.push({
      line: null,
      message: "No transactions were found in this file.",
    })
  }

  // 3. Date format and decimal mark: only what every line agrees with.
  const dateFormatChoices = dateFormatCandidates(
    txLines.map((l) => l.cells[dateCol]),
  )
  let dateFormat = chosen?.dateFormat ?? null
  if (!dateFormat) {
    if (dateFormatChoices.length === 1) dateFormat = dateFormatChoices[0]
    else if (dateFormatChoices.length > 1) {
      problems.push({
        line: null,
        message:
          "The dates in this file could be read more than one way (is 03/04 the 3rd of April or March 4th?). Choose the date format below.",
      })
    } else if (txLines.length > 0) {
      const best = bestDateFormat(txLines.map((l) => l.cells[dateCol]))
      for (const l of txLines) {
        if (parseDate(l.cells[dateCol], best) === null) {
          problems.push({
            line: l.row.line,
            message: `"${l.cells[dateCol]}" is not a date.`,
          })
        }
      }
      dateFormat = best
    }
  }

  const moneyCols = [
    col("amount"),
    col("debit"),
    col("credit"),
    col("balance"),
  ].filter((i) => i >= 0)
  const decimalChoices = decimalCandidates(
    txLines.flatMap((l) => moneyCols.map((i) => l.cells[i]).filter(Boolean)),
  )
  let decimal = chosen?.decimal ?? null
  if (!decimal) {
    if (decimalChoices.length === 1) decimal = decimalChoices[0]
    else if (decimalChoices.length > 1) {
      problems.push({
        line: null,
        message:
          "The amounts could use either a comma or a point for decimals (is 1.234 one thousand or one point two?). Choose below.",
      })
    } else {
      problems.push({
        line: null,
        message:
          "Some amounts use a comma for decimals and others a point. Check the file.",
      })
    }
  }

  const mapping: CsvMapping | null =
    dateFormat && decimal
      ? {
          delimiter,
          headerSignature: headers ? signatureOf(headers) : null,
          columns,
          dateFormat,
          decimal,
          invertSign: chosen?.invertSign ?? false,
        }
      : null
  const base = {
    format: "csv" as const,
    headers,
    firstRow,
    columnCount,
    sample,
    mapping: mapping ?? draftMapping(delimiter, headers, columns),
    mappingSource: source ?? ("inferred" as const),
    dateFormatChoices,
    decimalChoices,
    skipped,
    warnings,
    currency: null,
  }
  if (!mapping || problems.length) {
    return {
      ...base,
      transactions: [],
      problems,
      balanceCheck: "unavailable",
      needsConfirmation: false,
      period: null,
      totals: zeroTotals(),
    }
  }

  // 4. Every line into a transaction, or a problem naming the line.
  const cell = (l: Line, role: Role) =>
    col(role) >= 0 ? l.cells[col(role)] : ""
  type Draft = Omit<ParsedTransaction, "externalId" | "amount" | "sequence"> & {
    cents: bigint
    balanceCents: bigint | null
    /** The primary description cell as printed — what the duplicate key hashes. */
    keyText: string
    /** A dated line with a balance and no amount ("Beginning balance"): anchors the balance check, is not imported. */
    anchor: boolean
  }
  const drafts: Draft[] = []
  for (const [i, l] of txLines.entries()) {
    const line = l.row.line
    const noAmount = (["amount", "debit", "credit"] as const).every(
      (r) => cell(l, r) === "",
    )
    if (noAmount && cell(l, "balance") !== "") {
      const b = parseAmount(cell(l, "balance"), mapping.decimal)
      if (!b.ok || b.value === null) {
        problems.push({
          line,
          message: `Balance: ${b.ok ? "blank" : b.reason}.`,
        })
      } else {
        skipped.push({ line, reason: "a balance line with no amount" })
        drafts.push({
          line,
          date: "",
          valueDate: null,
          description: "",
          reference: null,
          balance: null,
          cents: 0n,
          balanceCents: toCents(b.value),
          keyText: "",
          anchor: true,
        })
      }
      continue
    }
    const date = parseDate(cell(l, "date"), mapping.dateFormat)
    const rawValueDate = cell(l, "value_date")
    const valueDate = rawValueDate
      ? parseDate(rawValueDate, mapping.dateFormat)
      : null
    if (rawValueDate && !valueDate)
      problems.push({
        line,
        message: `The value date "${rawValueDate}" is not a date.`,
      })

    const cents = amountOf(l, cell, mapping, (m) =>
      problems.push({ line, message: m }),
    )
    const rawBalance = cell(l, "balance")
    let balanceCents: bigint | null = null
    if (rawBalance) {
      const b = parseAmount(rawBalance, mapping.decimal)
      if (!b.ok) problems.push({ line, message: `Balance: ${b.reason}.` })
      else if (b.value !== null) balanceCents = toCents(b.value)
    }

    const rawCurrency = cell(l, "currency")
    if (
      rawCurrency &&
      rawCurrency.toUpperCase() !== opts.accountCurrency.toUpperCase()
    ) {
      problems.push({
        line,
        message: `This line is in ${rawCurrency}, but the account is in ${opts.accountCurrency}.`,
      })
    }

    const description =
      [cell(l, "description"), ...(continuations.get(i) ?? []), cell(l, "memo")]
        .filter(Boolean)
        .join(" — ") ||
      cell(l, "reference") ||
      cell(l, "type")
    if (!description)
      problems.push({ line, message: "This line has no description." })
    const reference = cell(l, "reference") || null
    if (reference && [...reference].length > MAX_REFERENCE) {
      problems.push({
        line,
        message: `The reference is longer than ${MAX_REFERENCE} characters.`,
      })
    }
    if (date && cents !== null) {
      drafts.push({
        line,
        date,
        valueDate,
        description,
        reference,
        balance: null,
        cents,
        balanceCents,
        keyText:
          cell(l, "description") || cell(l, "reference") || cell(l, "type"),
        anchor: false,
      })
    }
  }
  if (problems.length) {
    return {
      ...base,
      transactions: [],
      problems,
      balanceCheck: "unavailable",
      needsConfirmation: false,
      period: null,
      totals: zeroTotals(),
    }
  }

  // 5. The running balance, where the file has one.
  let balanceCheck: Analysis["balanceCheck"] = "unavailable"
  const hasBalance = drafts.some((d) => d.balanceCents !== null)
  if (drafts.every((d) => d.anchor)) {
    problems.push({
      line: null,
      message: "No transactions were found in this file.",
    })
  }
  // The balance proves the columns and their order are read consistently.
  // It cannot prove DIRECTION: a card statement's balance is the amount owed,
  // in the same convention as its positive charges, so it adds up either
  // way. Direction is the person's to confirm (see needsConfirmation), and
  // "invert" flips amounts and balances together.
  const invert = mapping.invertSign
  if (hasBalance) {
    const holds = balanceHolds(
      drafts.map((d) => ({ cents: d.cents, balance: d.balanceCents })),
    )
    if (holds === true) {
      balanceCheck = "passed"
    } else if (holds === false) {
      const at = firstBalanceBreak(
        drafts.map((d) => ({
          line: d.line,
          cents: d.cents,
          balance: d.balanceCents,
        })),
      )
      problems.push({
        line: at,
        message:
          "The running balance in this file does not add up with these amounts, so something is mapped wrong (for example Money In and Money Out swapped). If your bank lists same-day transactions out of order, set the Balance column to Ignore to import without this check.",
      })
    }
    // null: fewer than two balances to compare, so no proof either way.
  }
  if (problems.length) {
    return {
      ...base,
      transactions: [],
      problems,
      balanceCheck: "unavailable",
      needsConfirmation: false,
      period: null,
      totals: zeroTotals(),
    }
  }

  // 6. Stable ids: the same transaction in an overlapping statement gets the
  //    same id. The key is the date, the UNSIGNED amount and the primary
  //    description cell as printed — so correcting the sign convention or
  //    adding a memo column on a later import cannot re-import a line.
  const flip = (c: bigint) => (invert ? -c : c)
  const real = drafts.filter((d) => !d.anchor)
  const ascending =
    balanceCheck === "passed"
      ? holdsInOrder(
          drafts.map((d) => ({ cents: d.cents, balance: d.balanceCents })),
        ) === true
      : real.length < 2 || real[0].date <= real[real.length - 1].date
  const sequences = chronologicalSequence(
    real.map((d) => d.date),
    ascending,
  )
  const seen = new Map<string, number>()
  const transactions: ParsedTransaction[] = real.map((d, i) => {
    const amount = fromCents(flip(d.cents))
    const unsigned = fromCents(d.cents < 0n ? -d.cents : d.cents)
    const key = `${d.date}|${unsigned}|${normaliseText(d.keyText)}`
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return {
      sequence: sequences[i],
      line: d.line,
      date: d.date,
      valueDate: d.valueDate,
      description: d.description,
      reference: d.reference,
      amount,
      balance: d.balanceCents === null ? null : fromCents(flip(d.balanceCents)),
      externalId: `csv:${sha256(`${key}|${n}`)}`,
    }
  })

  return {
    ...base,
    mapping,
    transactions,
    problems,
    balanceCheck,
    // Nothing in a CSV proves which way money moves relative to these
    // books (step 5), so the first import for an account is confirmed by a
    // person looking at the preview. The saved profile carries that forward.
    needsConfirmation: source !== "profile" && !opts.confirmed,
    period: periodOf(transactions),
    totals: totalsOf(transactions),
  }
}

function amountOf<L>(
  l: L,
  cell: (l: L, role: Role) => string,
  mapping: CsvMapping,
  problem: (message: string) => void,
): bigint | null {
  const parse = (raw: string, label: string): bigint | null | undefined => {
    const r = parseAmount(raw, mapping.decimal)
    if (!r.ok) {
      problem(`${label}: ${r.reason}.`)
      return undefined
    }
    return r.value === null ? null : toCents(r.value)
  }
  if (mapping.columns.includes("amount")) {
    const a = parse(cell(l, "amount"), "Amount")
    if (a === undefined) return null
    if (a === null) {
      problem("This line has no amount.")
      return null
    }
    const direction = cell(l, "direction").toLowerCase()
    if (mapping.columns.includes("direction")) {
      const abs = a < 0n ? -a : a
      if (/^(dr|d|debit|withdrawal)$/.test(direction)) return -abs
      if (/^(cr|c|credit|deposit)$/.test(direction)) return abs
      problem(`"${cell(l, "direction")}" is not Debit or Credit.`)
      return null
    }
    return a
  }
  const d = parse(cell(l, "debit"), "Money out")
  const c = parse(cell(l, "credit"), "Money in")
  if (d === undefined || c === undefined) return null
  if (d === null && c === null) {
    problem("This line has no amount in either Money In or Money Out.")
    return null
  }
  const abs = (x: bigint | null) => (x === null ? 0n : x < 0n ? -x : x)
  return abs(c) - abs(d)
}

/** Balances in file order, or in reverse (newest first): does one reproduce them? */
function balanceHolds(
  rows: { cents: bigint; balance: bigint | null }[],
): boolean | null {
  const forward = holdsInOrder(rows)
  if (forward === true) return true
  const backward = holdsInOrder([...rows].reverse())
  if (backward === true) return true
  return forward === null && backward === null ? null : false
}

/** True, false, or null when there were fewer than two balances to compare. */
function holdsInOrder(
  rows: { cents: bigint; balance: bigint | null }[],
): boolean | null {
  let last: bigint | null = null
  let pending = 0n
  let compared = 0
  for (const r of rows) {
    if (last === null) {
      if (r.balance !== null) last = r.balance
      continue
    }
    pending += r.cents
    if (r.balance !== null) {
      if (last + pending !== r.balance) return false
      last = r.balance
      pending = 0n
      compared++
    }
  }
  return compared > 0 ? true : null
}

function firstBalanceBreak(
  rows: { line: number; cents: bigint; balance: bigint | null }[],
): number | null {
  let last: bigint | null = null
  let pending = 0n
  for (const r of rows) {
    if (last === null) {
      if (r.balance !== null) last = r.balance
      continue
    }
    pending += r.cents
    if (r.balance !== null) {
      if (last + pending !== r.balance) return r.line
      last = r.balance
      pending = 0n
    }
  }
  return null
}

function checkRoles(columns: Role[]): Problem[] {
  const count = (role: Role) => columns.filter((c) => c === role).length
  const problems: string[] = []
  if (count("date") !== 1) problems.push("Choose exactly one Date column.")
  const hasAmount = count("amount") > 0
  const hasSplit = count("debit") > 0 || count("credit") > 0
  if (!hasAmount && !hasSplit)
    problems.push("Choose an Amount column, or Money In and Money Out columns.")
  if (hasAmount && hasSplit)
    problems.push(
      "Use either one Amount column or Money In / Money Out columns, not both.",
    )
  if (count("direction") > 0 && !hasAmount)
    problems.push("A Debit/Credit column needs an Amount column beside it.")
  if (count("description") + count("memo") + count("reference") === 0)
    problems.push("Choose a Description column.")
  for (const role of ROLES) {
    if (role !== "ignore" && role !== "memo" && count(role) > 1)
      problems.push(`Only one column can be ${role}.`)
  }
  return problems.map((message) => ({ line: null, message }))
}

/** For a file with no header: date-like, money-like and wordy columns, as a starting point the person confirms. */
function inferRolesFromContent(rows: Row[], width: number): Role[] {
  const columns: Role[] = Array(width).fill("ignore")
  const values = (i: number) =>
    rows.map((r) => r.cells[i] ?? "").filter(Boolean)
  const dateCol = [...Array(width).keys()].find(
    (i) => values(i).length > 0 && dateFormatCandidates(values(i)).length > 0,
  )
  if (dateCol !== undefined) columns[dateCol] = "date"
  const moneyCols = [...Array(width).keys()].filter(
    (i) =>
      i !== dateCol &&
      values(i).length > 0 &&
      values(i).every((v) => /\d/.test(v) && parseAmount(v, ".").ok),
  )
  if (moneyCols[0] !== undefined) columns[moneyCols[0]] = "amount"
  let wordiest = -1
  let most = 0
  for (let i = 0; i < width; i++) {
    if (columns[i] !== "ignore") continue
    const letters = values(i)
      .join("")
      .replace(/[^a-z]/gi, "").length
    if (letters > most) {
      most = letters
      wordiest = i
    }
  }
  if (wordiest >= 0) columns[wordiest] = "description"
  return columns
}

function bestDateFormat(values: string[]): DateFormat {
  let best: DateFormat = DATE_FORMATS[0]
  let bestCount = -1
  for (const f of DATE_FORMATS) {
    const n = values.filter((v) => parseDate(v, f) !== null).length
    if (n > bestCount) {
      bestCount = n
      best = f
    }
  }
  return best
}

function modalWidth(rows: Row[]): number {
  const freq = new Map<number, number>()
  for (const r of rows)
    freq.set(r.cells.length, (freq.get(r.cells.length) ?? 0) + 1)
  let width = 0
  let most = -1
  for (const [n, f] of freq)
    if (f > most || (f === most && n > width)) [width, most] = [n, f]
  return width
}

function draftMapping(
  delimiter: Delimiter,
  headers: string[] | null,
  columns: Role[],
): CsvMapping {
  return {
    delimiter,
    headerSignature: headers ? signatureOf(headers) : null,
    columns,
    dateFormat: DATE_FORMATS[0],
    decimal: ".",
    invertSign: false,
  }
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

function analyseOfx(text: string, opts: AnalyseOptions): Analysis {
  const problems: Problem[] = []
  const statement = parseOfx(text)
  if (statement.accounts.length > 1) {
    problems.push({
      line: null,
      message: `This file holds ${statement.accounts.length} bank accounts. Download one account at a time from your bank.`,
    })
  }
  if (
    statement.currency &&
    statement.currency !== opts.accountCurrency.toUpperCase()
  ) {
    problems.push({
      line: null,
      message: `This statement is in ${statement.currency}, but the account is in ${opts.accountCurrency}.`,
    })
  }
  if (statement.transactions.length === 0) {
    problems.push({
      line: null,
      message: "No transactions were found in this file.",
    })
  }
  if (statement.transactions.length > MAX_ROWS) {
    problems.push({
      line: null,
      message: `That file has more than ${MAX_ROWS.toLocaleString("en-US")} transactions. Import it in smaller date ranges.`,
    })
  }
  const decimals = decimalCandidates(
    statement.transactions.map((t) => t.amount),
  )
  if (decimals.length !== 1) {
    problems.push({
      line: null,
      message:
        "The amounts in this file do not use one consistent decimal mark.",
    })
  }

  const seen = new Map<string, number>()
  const transactions: ParsedTransaction[] = []
  if (problems.length === 0) {
    for (const t of statement.transactions) {
      const date = ofxDate(t.datePosted)
      if (!date)
        problems.push({
          line: t.line,
          message: `"${t.datePosted}" is not a date.`,
        })
      const amount = parseAmount(t.amount, decimals[0])
      if (!amount.ok)
        problems.push({ line: t.line, message: `Amount: ${amount.reason}.` })
      else if (amount.value === null)
        problems.push({
          line: t.line,
          message: "This transaction has no amount.",
        })
      const description =
        t.name && t.memo && t.memo !== t.name
          ? `${t.name} — ${t.memo}`
          : t.name || t.memo
      if (!description)
        problems.push({
          line: t.line,
          message: "This transaction has no description.",
        })
      const reference = t.checkNum || t.refNum || null
      if (reference && [...reference].length > MAX_REFERENCE) {
        problems.push({
          line: t.line,
          message: `The reference is longer than ${MAX_REFERENCE} characters.`,
        })
      }
      if (!date || !amount.ok || amount.value === null || !description) continue

      let externalId: string
      if (t.fitId) {
        externalId =
          t.fitId.length <= 240 ? `ofx:${t.fitId}` : `ofx#${sha256(t.fitId)}`
      } else {
        const key = `${date}|${amount.value}|${normaliseText(description)}`
        const n = (seen.get(key) ?? 0) + 1
        seen.set(key, n)
        externalId = `ofxh:${sha256(`${key}|${n}`)}`
      }
      transactions.push({
        sequence: 0,
        line: t.line,
        date,
        valueDate: null,
        description,
        reference,
        amount: amount.value,
        balance: null,
        externalId,
      })
    }
  }

  const ofxSequence = chronologicalSequence(
    transactions.map((t) => t.date),
    true,
  )
  transactions.forEach((t, i) => (t.sequence = ofxSequence[i]))
  const ok = problems.length === 0
  return {
    format: "ofx",
    headers: null,
    firstRow: null,
    columnCount: 0,
    sample: [],
    mapping: null,
    mappingSource: null,
    dateFormatChoices: [],
    decimalChoices: [],
    transactions: ok ? transactions : [],
    skipped: [],
    problems,
    warnings: [],
    currency: statement.currency,
    // OFX amounts are signed by the standard (negative is money out), so
    // there is no convention to prove and nothing to confirm.
    balanceCheck: "unavailable",
    needsConfirmation: false,
    period: ok ? periodOf(transactions) : null,
    totals: ok ? totalsOf(transactions) : zeroTotals(),
  }
}

// ---------------------------------------------------------------------------

function emptyResult(
  format: "csv" | "ofx",
  headers: string[] | null,
  columnCount: number,
  sample: string[][],
  problems: Problem[],
): Analysis {
  return {
    format,
    headers,
    firstRow: null,
    columnCount,
    sample,
    mapping: null,
    mappingSource: null,
    dateFormatChoices: [],
    decimalChoices: [],
    transactions: [],
    skipped: [],
    problems,
    warnings: [],
    currency: null,
    balanceCheck: "unavailable",
    needsConfirmation: false,
    period: null,
    totals: zeroTotals(),
  }
}

const padTo = (cells: string[], n: number) =>
  cells.length >= n
    ? cells.slice(0, n)
    : [...cells, ...Array(n - cells.length).fill("")]
const normaliseText = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const zeroTotals = () => ({ moneyIn: "0.00", moneyOut: "0.00" })

function periodOf(ts: ParsedTransaction[]) {
  if (ts.length === 0) return null
  const dates = ts.map((t) => t.date).sort()
  return { from: dates[0], to: dates[dates.length - 1] }
}

function totalsOf(ts: ParsedTransaction[]) {
  let moneyIn = 0n
  let moneyOut = 0n
  for (const t of ts) {
    const c = toCents(t.amount)
    if (c >= 0n) moneyIn += c
    else moneyOut -= c
  }
  return { moneyIn: fromCents(moneyIn), moneyOut: fromCents(moneyOut) }
}

/**
 * Position in time for each line: by date, and within a date by file order in
 * the direction the file runs (a newest-first file's first line is its last).
 */
function chronologicalSequence(dates: string[], ascending: boolean): number[] {
  const order = dates
    .map((date, i) => ({ date, at: ascending ? i : dates.length - 1 - i, i }))
    .sort((a, b) =>
      a.date === b.date ? a.at - b.at : a.date < b.date ? -1 : 1,
    )
  const seq = new Array<number>(dates.length)
  order.forEach((o, rank) => (seq[o.i] = rank))
  return seq
}

/** Canonical JSON of a mapping: the same mapping always serialises the same way. */
export function canonicalMapping(m: CsvMapping | null): string {
  if (!m) return "null"
  return JSON.stringify([
    m.delimiter,
    m.headerSignature,
    m.columns,
    m.dateFormat,
    m.decimal,
    m.invertSign,
  ])
}

export const isDelimiter = (s: string): s is Delimiter =>
  (DELIMITERS as readonly string[]).includes(s)

/**
 * OFX 1.x (SGML: leaf tags are never closed) and OFX 2.x (XML), including
 * Quicken's QFX, which is OFX with extra tags. Only what a statement import
 * needs is read: the account, its currency, and each STMTTRN.
 */

export type OfxTransaction = {
  line: number
  fitId: string | null
  datePosted: string // raw DTPOSTED
  amount: string // raw TRNAMT
  name: string
  memo: string
  checkNum: string
  refNum: string
}

export type OfxStatement = {
  accounts: string[] // distinct ACCTIDs, in file order
  currency: string | null
  transactions: OfxTransaction[]
}

const TAG = /<(\/?)([A-Za-z0-9.]+)>([^<]*)/g

export function parseOfx(text: string): OfxStatement {
  const lineStarts: number[] = [0]
  for (let i = 0; i < text.length; i++)
    if (text[i] === "\n") lineStarts.push(i + 1)
  const lineAt = (offset: number) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  const accounts: string[] = []
  let currency: string | null = null
  const transactions: OfxTransaction[] = []
  let current: OfxTransaction | null = null

  for (const m of text.matchAll(TAG)) {
    const closing = m[1] === "/"
    const tag = m[2].toUpperCase()
    const value = decodeEntities(m[3].trim())

    // SGML may leave STMTTRN unclosed: the next STMTTRN, or the end of the
    // list or statement, ends it.
    if (
      current &&
      (tag === "STMTTRN" ||
        (closing && /^(BANKTRANLIST|STMTRS|CCSTMTRS)$/.test(tag)))
    ) {
      if (!(tag === "STMTTRN" && closing)) {
        transactions.push(current)
        current = null
      }
    }
    if (tag === "STMTTRN") {
      if (!closing) {
        current = {
          line: lineAt(m.index ?? 0),
          fitId: null,
          datePosted: "",
          amount: "",
          name: "",
          memo: "",
          checkNum: "",
          refNum: "",
        }
      } else if (current) {
        transactions.push(current)
        current = null
      }
      continue
    }
    if (closing || value === "") continue

    if (current) {
      if (tag === "FITID") current.fitId = value
      else if (tag === "DTPOSTED") current.datePosted = value
      else if (tag === "TRNAMT") current.amount = value
      else if (tag === "NAME" || tag === "PAYEE") current.name ||= value
      else if (tag === "MEMO") current.memo = value
      else if (tag === "CHECKNUM") current.checkNum = value
      else if (tag === "REFNUM") current.refNum = value
    } else if (tag === "ACCTID") {
      if (!accounts.includes(value)) accounts.push(value)
    } else if (tag === "CURDEF") {
      currency ??= value.toUpperCase()
    }
  }
  if (current) transactions.push(current)
  return { accounts, currency, transactions }
}

/**
 * DTPOSTED is `YYYYMMDD[HHMMSS[.XXX]][[+-]HH[.MM]:TZ]`. The first eight
 * characters ARE the date the bank posted it; turning the whole value into a
 * JS Date and back through a time zone can move it a day (L35).
 */
export function ofxDate(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null
  }
  return `${m[1]}-${m[2]}-${m[3]}`
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

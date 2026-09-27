/**
 * Bytes to text, and text to rows. The file's kind is decided from its
 * CONTENT — never its extension or the browser's MIME type, both of which the
 * uploader controls (docs/testplan-soc2.md SOC-CC6-26).
 */

export type Decoded =
  | { ok: true; text: string; kind: "ofx" | "delimited" }
  | { ok: false; reason: string }

export function decode(bytes: Uint8Array): Decoded {
  if (bytes.length === 0) return { ok: false, reason: "The file is empty." }
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])
  ) {
    return {
      ok: false,
      reason:
        "That is a spreadsheet file. Open it in Excel or Numbers and save it as CSV, or download CSV or OFX from your bank.",
    }
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return {
      ok: false,
      reason:
        "That is a PDF. Download your statement from your bank as CSV or OFX instead.",
    }
  }

  let text: string
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    text = new TextDecoder("utf-8").decode(bytes.subarray(3))
  } else if (startsWith(bytes, [0xff, 0xfe])) {
    text = new TextDecoder("utf-16le").decode(bytes.subarray(2))
  } else if (startsWith(bytes, [0xfe, 0xff])) {
    text = new TextDecoder("utf-16be").decode(bytes.subarray(2))
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      // Not valid UTF-8: most older bank exports are Windows-1252.
      text = new TextDecoder("windows-1252").decode(bytes)
    }
  }
  if (text.includes("\u0000")) {
    return { ok: false, reason: "That does not look like a text file." }
  }

  const head = text.slice(0, 2000)
  if (
    /^\s*OFXHEADER\s*:/i.test(head) ||
    /<\?OFX\b/i.test(head) ||
    /<OFX>/i.test(head)
  ) {
    return { ok: true, text, kind: "ofx" }
  }
  return { ok: true, text, kind: "delimited" }
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((b, i) => bytes[i] === b)
}

export type Row = { line: number; cells: string[] }

export const DELIMITERS = [",", ";", "\t", "|"] as const
export type Delimiter = (typeof DELIMITERS)[number]

/** RFC 4180: quoted fields, doubled quotes, and line breaks inside quotes. */
export function tokenize(text: string, delimiter: Delimiter): Row[] {
  const rows: Row[] = []
  let cells: string[] = []
  let field = ""
  let quoted = false
  let line = 1
  let rowLine = 1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        if (c === "\n") line++
        field += c
      }
      continue
    }
    if (c === '"' && field.trim() === "") {
      quoted = true
      field = ""
    } else if (c === delimiter) {
      cells.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      cells.push(field)
      rows.push({ line: rowLine, cells })
      cells = []
      field = ""
      line++
      rowLine = line
    } else {
      field += c
    }
  }
  if (field !== "" || cells.length > 0) {
    cells.push(field)
    rows.push({ line: rowLine, cells })
  }
  return rows
    .map((r) => ({ line: r.line, cells: r.cells.map((c) => c.trim()) }))
    .filter((r) => r.cells.some((c) => c !== ""))
}

/**
 * The delimiter under which the most rows share one field count (of at
 * least two). Preamble lines above the header count against a candidate
 * only as much as they differ, so a few are tolerated.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text
    .split(/\r\n|\r|\n/)
    .slice(0, 60)
    .join("\n")
  let best: Delimiter = ","
  let bestScore = -1
  for (const d of DELIMITERS) {
    const counts = tokenize(sample, d).map((r) => r.cells.length)
    const freq = new Map<number, number>()
    for (const n of counts) if (n >= 2) freq.set(n, (freq.get(n) ?? 0) + 1)
    let modeCount = 0
    let mode = 0
    for (const [n, f] of freq) {
      if (f > modeCount || (f === modeCount && n > mode)) {
        modeCount = f
        mode = n
      }
    }
    const score = modeCount * 1000 + mode
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/**
 * A report's columns, in export order. `value` reads straight off the
 * repository row — never through `money()`, which locale-formats and
 * therefore corrupts a spreadsheet's own numeric parsing; a money column's
 * `header` names its currency instead (BR-FP-003: currency travels with the
 * amount, never converted for display).
 */
export type CsvColumn<Row> = {
  header: string
  value: (row: Row) => string
}

/** A cell starting with `=`, `+`, `-`, `@`, a tab or a CR is executed as a
 *  formula by Excel/Sheets, not displayed as text — CSV formula injection.
 *  Escaped with a leading `'`, which every spreadsheet treats as "force
 *  text" and strips from the display. `-` belongs in this set the same as
 *  `+` (Excel evaluates a leading `-` as a formula too) — safe to include
 *  only because of the `Number.isNaN` guard below, which is what actually
 *  discriminates a legitimate negative money figure (`-500.00`, left alone)
 *  from a formula-shaped value that happens to start with `-` (`-2+3` as an
 *  account name, escaped). */
function escapeCsvCell(raw: string): string {
  let value = raw
  if (/^[=+\-@\t\r]/.test(value) && Number.isNaN(Number(value))) {
    value = `'${value}`
  }
  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsv<Row>(columns: CsvColumn<Row>[], rows: Row[]): string {
  const lines = [columns.map((c) => escapeCsvCell(c.header)).join(",")]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(","))
  }
  // CRLF per RFC 4180 — Excel on Windows misreads a bare LF as one long row.
  return lines.join("\r\n") + "\r\n"
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

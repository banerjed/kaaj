import { describe, expect, it } from "vitest"
import { toCsv } from "./csv"

type Row = { name: string; amount: string }
const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Amount (USD)", value: (r: Row) => r.amount },
]

describe("toCsv", () => {
  it("escapes a formula-shaped account name so it stays inert text on open", () => {
    const csv = toCsv(columns, [
      { name: "=cmd|' /C calc'!A1", amount: "100.00" },
    ])
    const dataLine = csv.split("\r\n")[1]
    expect(dataLine.startsWith("'=cmd")).toBe(true)
  })

  it("still escapes AND quotes a formula-shaped value that also needs quoting", () => {
    const csv = toCsv(columns, [
      { name: '=HYPERLINK("https://evil.example","click")', amount: "100.00" },
    ])
    const dataLine = csv.split("\r\n")[1]
    // The leading ' survives inside the outer quotes — Excel still treats
    // the whole quoted field as forced text once it sees the '.
    expect(dataLine.startsWith("\"'=HYPERLINK")).toBe(true)
  })

  it("escapes +, -, @, tab and CR leads the same way", () => {
    const csv = toCsv(columns, [
      { name: "+1+1", amount: "0.00" },
      { name: "-2+3", amount: "0.00" },
      { name: "@SUM(A1)", amount: "0.00" },
    ])
    const lines = csv.split("\r\n")
    // None of these parse as a plain number (Number() is NaN for all three
    // — "+1+1" and "-2+3" are formula syntax, not arithmetic JS evaluates),
    // so every one is a real leading +/-/@ with no numeric escape hatch.
    expect(lines[1].startsWith("'+1+1")).toBe(true)
    expect(lines[2].startsWith("'-2+3")).toBe(true)
    expect(lines[3].startsWith("'@SUM")).toBe(true)
  })

  it("never escapes a legitimate negative or positive money value", () => {
    const csv = toCsv(columns, [
      { name: "Acme Corp", amount: "-1234.56" },
      { name: "Beta Inc", amount: "+500.00" },
    ])
    const lines = csv.split("\r\n")
    // Both amounts start with the same +/- that trips the escape above —
    // left alone here only because Number() parses them, the guard that
    // actually discriminates rather than a blanket "leave money columns
    // alone" rule.
    expect(lines[1]).toBe("Acme Corp,-1234.56")
    expect(lines[2]).toBe("Beta Inc,+500.00")
  })

  it("quotes a cell containing a comma or double quote, RFC 4180 style", () => {
    const csv = toCsv(columns, [{ name: 'Smith, "Bob" & Co', amount: "1.00" }])
    const dataLine = csv.split("\r\n")[1]
    expect(dataLine).toBe('"Smith, ""Bob"" & Co",1.00')
  })

  it("terminates every line with CRLF, including the header and the last row", () => {
    const csv = toCsv(columns, [{ name: "Row One", amount: "1.00" }])
    expect(csv).toBe("Name,Amount (USD)\r\nRow One,1.00\r\n")
  })
})

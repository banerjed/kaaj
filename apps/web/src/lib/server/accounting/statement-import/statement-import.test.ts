import { describe, expect, it } from "vitest"
import { analyseStatement, type Analysis, type CsvMapping } from "./analyse"
import {
  parseAmount,
  parseDate,
  decimalCandidates,
  dateFormatCandidates,
} from "./values"

/**
 * The statement parser, against synthetic files shaped like the layouts
 * banks commonly export — not copies of any one bank's file. Each case names
 * the trap it exercises. No database.
 */

const enc = (s: string) => new TextEncoder().encode(s)

function analyse(
  text: string | Uint8Array,
  opts: Partial<Parameters<typeof analyseStatement>[1]> = {},
): Analysis {
  const r = analyseStatement(typeof text === "string" ? enc(text) : text, {
    accountCurrency: "USD",
    ...opts,
  })
  if ("fatal" in r) throw new Error(`fatal: ${r.fatal}`)
  return r
}

const amounts = (a: Analysis) => a.transactions.map((t) => t.amount)

describe("parseAmount — never a float, never rounded", () => {
  it.each([
    ["1,234.56", ".", "1234.56"],
    ["1.234,56", ",", "1234.56"],
    ["12,34,567.80", ".", "1234567.80"], // Indian grouping
    ["(1,234.56)", ".", "-1234.56"],
    ["123.45-", ".", "-123.45"],
    ["−123.45", ".", "-123.45"], // Unicode minus
    ["123.45 DR", ".", "-123.45"],
    ["123.45 CR", ".", "123.45"],
    ["$ 1,000", ".", "1000.00"],
    ["1 234,5", ",", "1234.50"],
    ["12.3400", ".", "12.34"], // trailing zeros lose nothing
    ["-0.00", ".", "0.00"],
    ["9999999999999.99", ".", "9999999999999.99"], // exactly numeric(15,2)
  ] as const)("%s (decimal %s) is %s", (raw, decimal, want) => {
    expect(parseAmount(raw, decimal)).toEqual({ ok: true, value: want })
  })

  it.each([
    ["12.345", "."], // a third place would be rounded away by numeric(15,2)
    ["1,23.45", "."], // bad grouping
    ["12a", "."],
    ["1.2.3", ","],
    ["99999999999999.00", "."], // 14 integer digits
  ] as const)("refuses %s", (raw, decimal) => {
    expect(parseAmount(raw, decimal).ok).toBe(false)
  })

  it("treats blank as no value, not zero", () => {
    expect(parseAmount("  ", ".")).toEqual({ ok: true, value: null })
  })
})

describe("decimalCandidates — decided by every value", () => {
  it("reads strong evidence", () => {
    expect(decimalCandidates(["1,234.56", "12.00"])).toEqual(["."])
    expect(decimalCandidates(["1.234,56", "12,00"])).toEqual([","])
  })
  it("asks when the file cannot tell", () => {
    expect(decimalCandidates(["1,234", "5.678"])).toEqual([".", ","])
  })
  it("never lets weak evidence decide: 1.005 alone is asked, not read as 1005", () => {
    expect(decimalCandidates(["1.005"])).toEqual([".", ","])
    expect(decimalCandidates(["1,005"])).toEqual([".", ","])
    expect(decimalCandidates(["12", "300"])).toEqual(["."])
  })
  it("refuses a file that contradicts itself", () => {
    expect(decimalCandidates(["1.50", "2,50"])).toEqual([])
  })
})

describe("dates — a real calendar date, or nothing", () => {
  it("rejects well-shaped but impossible dates (L67)", () => {
    expect(parseDate("2026-02-31", "YYYY-MM-DD")).toBeNull()
    expect(parseDate("2028-02-29", "YYYY-MM-DD")).toBe("2028-02-29")
    expect(parseDate("2026-02-29", "YYYY-MM-DD")).toBeNull()
  })
  it("reads month names, two-digit years and trailing times", () => {
    expect(parseDate("05-Jan-26", "DD-MMM-YY")).toBe("2026-01-05")
    expect(parseDate("Sept 3, 2026", "MMM DD, YYYY")).toBe("2026-09-03")
    expect(parseDate("22/01/2026 10:15", "DD/MM/YYYY")).toBe("2026-01-22")
    expect(parseDate("05-Jax-26", "DD-MMM-YY")).toBeNull()
  })
  it("keeps every format no row contradicts", () => {
    expect(dateFormatCandidates(["01/02/2026", "03/04/2026"])).toEqual(
      expect.arrayContaining(["MM/DD/YYYY", "DD/MM/YYYY"]),
    )
    expect(dateFormatCandidates(["01/02/2026", "25/04/2026"])).toEqual([
      "DD/MM/YYYY",
    ])
  })
})

describe("CSV — shaped like a US checking export with a summary above the table", () => {
  const file = [
    "Description,,Summary Amt.",
    'Beginning balance as of 01/01/2026,,"1,000.00"',
    'Total credits,,"2,500.00"',
    "",
    "Date,Description,Amount,Running Bal.",
    '01/02/2026,Opening deposit,,"1,000.00"',
    '01/05/2026,ACME PAYMENT,"2,500.00","3,500.00"',
    '01/13/2026,AWS BILL,-120.35,"3,379.65"',
  ].join("\r\n")

  it("finds the header below the preamble, and uses the opening-balance line as the check's anchor", () => {
    const a = analyse(file)
    expect(a.problems).toEqual([])
    expect(a.headers).toEqual(["Date", "Description", "Amount", "Running Bal."])
    expect(a.skipped.map((s) => s.reason)).toEqual(
      expect.arrayContaining([
        "above the header row",
        "a balance line with no amount",
      ]),
    )
    expect(amounts(a)).toEqual(["2500.00", "-120.35"])
    expect(a.balanceCheck).toBe("passed")
  })
})

describe("CSV — clean signed amounts with a running balance", () => {
  const file = [
    "Date,Description,Amount,Balance",
    "2026-01-02,Client payment,2500.00,3500.00",
    "2026-01-03,Coffee,-4.50,3495.50",
    "2026-01-03,Coffee,-4.50,3491.00",
    '2026-01-05,Rent,"-1,200.00",2291.00',
  ].join("\n")

  it("imports and proves the mapping with the balance, but still asks a person to confirm direction the first time", () => {
    const a = analyse(file)
    expect(a.problems).toEqual([])
    expect(amounts(a)).toEqual(["2500.00", "-4.50", "-4.50", "-1200.00"])
    expect(a.balanceCheck).toBe("passed")
    expect(a.needsConfirmation).toBe(true)
    expect(analyse(file, { profile: a.mapping! }).needsConfirmation).toBe(false)
    expect(a.totals).toEqual({ moneyIn: "2500.00", moneyOut: "1209.00" })
    expect(a.period).toEqual({ from: "2026-01-02", to: "2026-01-05" })
  })

  it("gives two identical same-day coffees different ids, and the same ids every time", () => {
    const a = analyse(file)
    const b = analyse(file)
    const ids = a.transactions.map((t) => t.externalId)
    expect(new Set(ids).size).toBe(4)
    expect(b.transactions.map((t) => t.externalId)).toEqual(ids)
  })

  it("gives an overlapping statement the same ids for the overlap", () => {
    const later = [
      "Date,Description,Amount,Balance",
      '2026-01-05,Rent,"-1,200.00",2291.00',
      "2026-01-07,Refund,50.00,2341.00",
    ].join("\n")
    const rentFirst = analyse(file).transactions.find(
      (t) => t.description === "Rent",
    )!
    const rentLater = analyse(later).transactions.find(
      (t) => t.description === "Rent",
    )!
    expect(rentLater.externalId).toBe(rentFirst.externalId)
  })

  it("keeps every id when a later import corrects the sign or the bank adds a memo column", () => {
    const ids = analyse(file).transactions.map((t) => t.externalId)
    const draft = analyse(file).mapping!
    const inverted = analyse(file, {
      mapping: { ...draft, invertSign: true },
      confirmed: true,
    })
    expect(inverted.transactions.map((t) => t.externalId)).toEqual(ids)
    const withMemo = file
      .split("\n")
      .map((l, i) =>
        l.replace(/,(-?[\d"])/, i === 0 ? ",Memo,$1" : ",ref $i,$1"),
      )
      .map((l, i) => (i === 0 ? "Date,Description,Memo,Amount,Balance" : l))
      .join("\n")
    const memo = analyse(withMemo)
    expect(memo.mapping!.columns).toEqual([
      "date",
      "description",
      "memo",
      "amount",
      "balance",
    ])
    expect(memo.transactions.map((t) => t.externalId)).toEqual(ids)
  })

  it("numbers a same-day charge and its reversal by time, so a later newest-first export does not swap them", () => {
    const head = "Date,Description,Amount,Balance"
    const midday = [
      head,
      "2026-01-03,Shop,-50.00,950.00",
      "2026-01-02,Deposit,1000.00,1000.00",
    ]
    const evening = [
      head,
      "2026-01-03,Shop,50.00,1000.00",
      "2026-01-03,Shop,-50.00,950.00",
      "2026-01-02,Deposit,1000.00,1000.00",
    ]
    const idOf = (lines: string[], amount: string) =>
      analyse(lines.join("\n")).transactions.find((t) => t.amount === amount)!
        .externalId
    const later = analyse(evening.join("\n"))
    expect(later.balanceCheck).toBe("passed")
    expect(idOf(evening, "-50.00")).toBe(idOf(midday, "-50.00"))
    expect(idOf(evening, "50.00")).not.toBe(idOf(midday, "-50.00"))
  })

  it("reads the same file newest-first", () => {
    const lines = file.split("\n")
    const reversed = [lines[0], ...lines.slice(1).reverse()].join("\n")
    const a = analyse(reversed)
    expect(a.problems).toEqual([])
    expect(a.balanceCheck).toBe("passed")
  })

  it("refuses when the balance does not add up, naming the line", () => {
    const broken = file.replace("3491.00", "3391.00")
    const a = analyse(broken)
    expect(a.transactions).toEqual([])
    expect(a.problems[0].message).toMatch(/running balance/)
    expect(a.problems[0].line).toBe(4)
  })
})

describe("CSV — shaped like a UK export: Money In / Money Out, day-first dates", () => {
  const file = [
    "Date,Transaction Description,Money Out,Money In,Balance",
    "25/01/2026,TESCO STORES,12.40,,987.60",
    "26/01/2026,SALARY,,2000.00,2987.60",
  ].join("\n")

  it("combines the two columns, and the unambiguous day-first dates", () => {
    const a = analyse(file, { accountCurrency: "GBP" })
    expect(a.problems).toEqual([])
    expect(a.mapping?.dateFormat).toBe("DD/MM/YYYY")
    expect(amounts(a)).toEqual(["-12.40", "2000.00"])
    expect(a.balanceCheck).toBe("passed")
  })

  it("fails the balance check if the columns are swapped", () => {
    const swapped = file.replace("Money Out,Money In", "Money In,Money Out")
    const a = analyse(swapped, { accountCurrency: "GBP" })
    expect(a.problems[0].message).toMatch(/running balance/)
  })
})

describe("CSV — shaped like an Indian export: Withdrawal/Deposit, multi-line narration", () => {
  const file = [
    "Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    '15/01/26,NEFT CR-HDFC-ACME,N00123,,"1,50,000.00","2,50,000.00"',
    ",INVOICE 42,,,,",
    '16/01/26,UPI-ZOMATO,U99,450.00,,"2,49,550.00"',
  ].join("\n")

  it("joins the continuation line and reads Indian digit grouping", () => {
    const a = analyse(file, { accountCurrency: "INR" })
    expect(a.problems).toEqual([])
    expect(a.transactions[0].description).toBe("NEFT CR-HDFC-ACME — INVOICE 42")
    expect(a.transactions[0].reference).toBe("N00123")
    expect(amounts(a)).toEqual(["150000.00", "-450.00"])
  })
})

describe("CSV — shaped like a German export: semicolons, comma decimals", () => {
  const file = [
    "Buchungstag;Verwendungszweck;Betrag;Saldo",
    "02.01.2026;Miete;-1.200,00;3.800,00",
    "03.01.2026;Gutschrift;250,50;4.050,50",
  ].join("\n")

  it("detects the delimiter and decimal comma, but asks which column is which (German headers)", () => {
    const a = analyse(file, { accountCurrency: "EUR" })
    // Unknown header words: no header row recognised, so the person maps it.
    expect(a.problems.map((p) => p.message).join(" ")).toMatch(
      /no header row|Choose/,
    )
  })

  it("imports once the person maps it", () => {
    const first = analyse(file, { accountCurrency: "EUR" })
    const mapping: CsvMapping = {
      delimiter: ";",
      headerSignature: null,
      columns: ["date", "description", "amount", "balance"],
      dateFormat: "DD.MM.YYYY",
      decimal: ",",
      invertSign: false,
    }
    expect(first.mapping?.delimiter).toBe(";")
    // The header line itself is not a transaction; with no header signature
    // it would be read as one, so the explicit mapping names the header.
    const withHeader = {
      ...mapping,
      headerSignature: "buchungstag|verwendungszweck|betrag|saldo",
    }
    const a = analyse(file, { accountCurrency: "EUR", mapping: withHeader })
    expect(a.problems).toEqual([])
    expect(amounts(a)).toEqual(["-1200.00", "250.50"])
    expect(a.balanceCheck).toBe("passed")
  })
})

describe("CSV — shaped like a card statement: charges are positive", () => {
  const file = [
    "Date,Description,Amount,Balance",
    "01/13/2026,AIRLINE,300.00,300.00",
    "01/14/2026,PAYMENT THANK YOU,-300.00,0.00",
    "01/15/2026,HOTEL,125.00,125.00",
  ].join("\n")

  it("adds up either way — the balance is the amount owed — so direction is asked, never inferred", () => {
    const a = analyse(file)
    expect(a.problems).toEqual([])
    expect(a.balanceCheck).toBe("passed")
    expect(amounts(a)).toEqual(["300.00", "-300.00", "125.00"]) // as printed: charges look like money in
    expect(a.needsConfirmation).toBe(true)
  })

  it("flips amounts AND balances together when the person says the file is inverted", () => {
    const draft = analyse(file).mapping!
    const a = analyse(file, {
      mapping: { ...draft, invertSign: true },
      confirmed: true,
    })
    expect(a.problems).toEqual([])
    expect(a.balanceCheck).toBe("passed")
    expect(amounts(a)).toEqual(["-300.00", "300.00", "-125.00"])
    expect(a.transactions.map((t) => t.balance)).toEqual([
      "-300.00",
      "0.00",
      "-125.00",
    ])
    expect(a.needsConfirmation).toBe(false)
  })
})

describe("CSV — no balance column: the sign cannot be proved", () => {
  const file =
    "Date,Description,Amount\n2026-03-01,Something,-10.00\n2026-03-02,Else,20.00\n"

  it("imports only after the person confirms, unless a saved profile vouches for it", () => {
    expect(analyse(file).needsConfirmation).toBe(true)
    expect(analyse(file, { confirmed: true }).needsConfirmation).toBe(false)
    const profile = analyse(file).mapping!
    expect(analyse(file, { profile }).needsConfirmation).toBe(false)
  })
})

describe("CSV — ambiguous dates are asked, never guessed", () => {
  const file =
    "Date,Description,Amount\n01/02/2026,A,-1.00\n03/04/2026,B,-2.00\n"

  it("offers both formats and imports nothing", () => {
    const a = analyse(file)
    expect(a.transactions).toEqual([])
    expect(a.dateFormatChoices).toEqual(
      expect.arrayContaining(["MM/DD/YYYY", "DD/MM/YYYY"]),
    )
    expect(a.problems[0].message).toMatch(/more than one way/)
  })

  it("imports with the person's choice", () => {
    const draft = analyse(file).mapping!
    const a = analyse(file, {
      mapping: { ...draft, dateFormat: "DD/MM/YYYY" },
      confirmed: true,
    })
    expect(a.transactions.map((t) => t.date)).toEqual([
      "2026-02-01",
      "2026-04-03",
    ])
  })
})

describe("CSV — Amount plus a Dr/Cr indicator", () => {
  it("signs by the indicator", () => {
    const a = analyse(
      "Date,Details,Amount,Dr/Cr\n2026-01-01,Fee,15.00,DR\n2026-01-02,Interest,2.50,CR\n",
      { confirmed: true },
    )
    expect(a.problems).toEqual([])
    expect(amounts(a)).toEqual(["-15.00", "2.50"])
  })
})

describe("CSV — lines that are not transactions", () => {
  it("skips a totals footer, and refuses an amount without a date", () => {
    const a = analyse(
      "Date,Description,Amount\n2026-01-01,A,-1.00\n,Total,-1.00\n",
      { confirmed: true },
    )
    expect(a.problems).toEqual([])
    expect(a.skipped.map((s) => s.reason)).toContain("a summary line")

    const b = analyse(
      "Date,Description,Amount\n2026-01-01,A,-1.00\n,B,-2.00\n",
      { confirmed: true },
    )
    expect(b.problems[0]).toEqual({
      line: 3,
      message: "This line has an amount but no date.",
    })
  })

  it("refuses a line in another currency", () => {
    const a = analyse(
      "Date,Description,Amount,Currency\n2026-01-01,A,-1.00,EUR\n",
      { confirmed: true },
    )
    expect(a.problems[0].message).toMatch(/in EUR, but the account is in USD/)
  })

  it("asks about -1.005 rather than reading it as -1005.00, and refuses the third place once told", () => {
    const file = "Date,Description,Amount\n2026-01-01,A,-1.005\n"
    const a = analyse(file, { confirmed: true })
    expect(a.transactions).toEqual([])
    expect(a.decimalChoices).toEqual([".", ","])
    const b = analyse(file, {
      confirmed: true,
      mapping: { ...a.mapping!, decimal: "." },
    })
    expect(b.problems[0].message).toMatch(/more than two decimal places/)
  })
})

describe("CSV — a saved profile whose bank changed its layout", () => {
  it("falls back to working the columns out, and warns", () => {
    const old = analyse(
      "Date,Description,Amount\n2026-01-01,A,-1.00\n",
    ).mapping!
    const a = analyse(
      "Posting Date,Payee,Amount,Balance\n2026-01-01,A,-1.00,9.00\n2026-01-02,B,-1.00,8.00\n",
      { profile: old },
    )
    expect(a.warnings.join(" ")).toMatch(/different from the last import/)
    expect(a.mappingSource).toBe("inferred")
    expect(a.problems).toEqual([])
  })
})

describe("encodings and non-statement files", () => {
  it("reads UTF-16 with a BOM (Excel's 'Unicode text')", () => {
    const text = "Date\tDescription\tAmount\n2026-01-01\tCafé\t-3.00\n"
    const utf16 = new Uint8Array(2 + text.length * 2)
    utf16.set([0xff, 0xfe])
    for (let i = 0; i < text.length; i++) {
      utf16[2 + i * 2] = text.charCodeAt(i) & 0xff
      utf16[3 + i * 2] = text.charCodeAt(i) >> 8
    }
    const a = analyse(utf16, { confirmed: true })
    expect(a.problems).toEqual([])
    expect(a.transactions[0].description).toBe("Café")
  })

  it("reads Windows-1252 when the bytes are not UTF-8", () => {
    const bytes = new Uint8Array([
      ...enc("Date,Description,Amount\n2026-01-01,Caf"),
      0xe9,
      ...enc(",-3.00\n"),
    ])
    expect(
      analyse(bytes, { confirmed: true }).transactions[0].description,
    ).toBe("Café")
  })

  it.each([
    [[0x50, 0x4b, 0x03, 0x04], /spreadsheet/],
    [[0x25, 0x50, 0x44, 0x46], /PDF/],
  ])("refuses %s by its content, whatever it is called", (magic, why) => {
    const r = analyseStatement(new Uint8Array([...magic, 1, 2, 3]), {
      accountCurrency: "USD",
    })
    expect("fatal" in r && r.fatal).toMatch(why)
  })
})

describe("OFX 1.x (SGML, unclosed tags) — and QFX", () => {
  const sgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>USD
<BANKACCTFROM><BANKID>021000021<ACCTID>123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101<DTEND>20260131
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105120000.000[-5:EST]<TRNAMT>-42.10<FITID>2026010501<NAME>GROCERY &amp; CO<MEMO>CARD 1234</STMTTRN>
<STMTTRN><TRNTYPE>CHECK<DTPOSTED>20260131235959[-8:PST]<TRNAMT>-500.00<FITID>2026013102<CHECKNUM>1042<NAME>CHECK 1042
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260110<TRNAMT>1500.00<FITID>2026011003<NAME>PAYROLL
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

  it("reads every transaction, the posted DATE as printed, and ids from FITID", () => {
    const a = analyse(sgml)
    expect(a.problems).toEqual([])
    expect(a.format).toBe("ofx")
    expect(a.transactions.map((t) => [t.date, t.amount, t.externalId])).toEqual(
      [
        ["2026-01-05", "-42.10", "ofx:2026010501"],
        // 23:59:59 PST is Feb 1 in UTC; the bank's posted date is Jan 31 (L35).
        ["2026-01-31", "-500.00", "ofx:2026013102"],
        ["2026-01-10", "1500.00", "ofx:2026011003"],
      ],
    )
    expect(a.transactions[0].description).toBe("GROCERY & CO — CARD 1234")
    expect(a.transactions[1].reference).toBe("1042")
    expect(a.needsConfirmation).toBe(false)
  })

  it("refuses a statement in another currency", () => {
    const a = analyse(sgml, { accountCurrency: "GBP" })
    expect(a.problems[0].message).toMatch(/in USD, but the account is in GBP/)
    expect(a.transactions).toEqual([])
  })

  it("refuses a file holding two accounts", () => {
    const two = sgml.replace(
      "</BANKMSGSRSV1>",
      "<STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>999</BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    )
    expect(analyse(two).problems[0].message).toMatch(/2 bank accounts/)
  })
})

describe("OFX 2.x (XML)", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>EUR</CURDEF>
<BANKACCTFROM><ACCTID>DE89370400440532013000</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260203</DTPOSTED><TRNAMT>-19.99</TRNAMT><FITID>A1</FITID><NAME>Streaming</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

  it("reads the XML form", () => {
    const a = analyse(xml, { accountCurrency: "EUR" })
    expect(a.problems).toEqual([])
    expect(a.transactions).toEqual([
      expect.objectContaining({
        date: "2026-02-03",
        amount: "-19.99",
        description: "Streaming",
        externalId: "ofx:A1",
      }),
    ])
  })
})

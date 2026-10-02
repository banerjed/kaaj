import { describe, expect, it } from "vitest"
import {
  ExportFormatError,
  writeExport,
  type ExportEmployee,
  type ExportInput,
  type PayrollProvider,
} from "./export-formats"

/**
 * The two employees of every provider's documented example: 80 regular and
 * 5 overtime hours, and 72 regular hours with 8 hours of vacation. Codes are
 * per provider, as the customer maps them.
 */
function employees(codes: {
  reg: string
  ot: string
  pto: string
}): ExportEmployee[] {
  return [
    {
      externalId: "000101",
      firstName: "Ana",
      lastName: "Reyes",
      lines: [
        { source: "regular", code: codes.reg, hours: "80.00" },
        { source: "overtime", code: codes.ot, hours: "5.00" },
      ],
    },
    {
      externalId: "000102",
      firstName: "Ben",
      lastName: "Okafor",
      lines: [
        { source: "regular", code: codes.reg, hours: "72.00" },
        { source: "time_off:US-PTO", code: codes.pto, hours: "8.00" },
      ],
    },
  ]
}

function input(
  provider: PayrollProvider,
  over: Partial<ExportInput> = {},
): ExportInput {
  return {
    provider,
    companyCode: null,
    from: "2026-09-14",
    to: "2026-09-27",
    frequency: "bi-weekly",
    employees: [],
    ...over,
  }
}

describe("payroll export files", () => {
  it("ADP RUN: version row, heading, one row per employee per earnings code", () => {
    const file = writeExport(
      input("adp_run", {
        companyCode: "R1ABC",
        employees: employees({ reg: "REG", ot: "OVT", pto: "VAC" }),
      }),
    )
    expect(file.filename).toBe("Biweekly-09142026-09272026.csv")
    expect(file.body).toBe(
      [
        "##GENERIC## V1.0",
        "Company Code,Pay Frequency,Pay Period Start Date,Pay Period End Date,Employee ID,Earnings Code,Pay Hours,Dollars,Separate Check,Worked In Dept,Rate Code",
        "R1ABC,B,09/14/2026,09/27/2026,000101,REG,80.00,,0,,BASE",
        "R1ABC,B,09/14/2026,09/27/2026,000101,OVT,5.00,,0,,BASE",
        "R1ABC,B,09/14/2026,09/27/2026,000102,REG,72.00,,0,,BASE",
        "R1ABC,B,09/14/2026,09/27/2026,000102,VAC,8.00,,0,,BASE",
        "",
      ].join("\r\n"),
    )
  })

  it("ADP RUN refuses a file with no single pay frequency", () => {
    expect(() =>
      writeExport(input("adp_run", { companyCode: "R1ABC", frequency: null })),
    ).toThrow(ExportFormatError)
  })

  it("ADP Workforce Now: fixed columns for regular and overtime, code pairs for the rest", () => {
    const file = writeExport(
      input("adp_wfn", {
        companyCode: "ABC",
        employees: employees({ reg: "-", ot: "-", pto: "V" }),
      }),
    )
    expect(file.filename).toBe("PRABCEPI.csv")
    expect(file.body).toBe(
      [
        "Co Code,Batch ID,File #,Reg Hours,O/T Hours,Hours 3 Code,Hours 3 Amount,Hours 4 Code,Hours 4 Amount",
        // Empty, never 0, where there are no hours.
        "ABC,KJ260927,000101,80.00,5.00,,,,",
        "ABC,KJ260927,000102,72.00,,V,8.00,,",
        "",
      ].join("\r\n"),
    )
  })

  it("ADP Workforce Now: a third other code goes on a second record", () => {
    const file = writeExport(
      input("adp_wfn", {
        companyCode: "AB",
        employees: [
          {
            externalId: "000103",
            firstName: "Cy",
            lastName: "Ito",
            lines: [
              { source: "regular", code: "-", hours: "40.00" },
              { source: "double_time", code: "D", hours: "2.00" },
              { source: "time_off:US-PTO", code: "V", hours: "8.00" },
              { source: "time_off:GLOBAL-SICK", code: "S", hours: "4.00" },
            ],
          },
        ],
      }),
    )
    // A two-character code is padded in the name, not in the file.
    expect(file.filename).toBe("PRAB_EPI.csv")
    expect(file.body.split("\r\n").slice(1, 3)).toEqual([
      "AB,KJ260927,000103,40.00,,D,2.00,V,8.00",
      "AB,KJ260927,000103,,,S,4.00,,",
    ])
  })

  it("ADP Workforce Now refuses a character outside its ASCII range", () => {
    expect(() =>
      writeExport(
        input("adp_wfn", {
          companyCode: "AB\\",
          employees: employees({ reg: "-", ot: "-", pto: "V" }),
        }),
      ),
    ).toThrow(/refuses/)
  })

  it("Gusto: one row per employee by name, a column per kind of hours, blanks not zeros", () => {
    const file = writeExport(
      input("gusto", {
        employees: employees({
          reg: "Regular hours",
          ot: "Overtime hours",
          pto: "Vacation hours",
        }),
      }),
    )
    expect(file.filename).toBe("gusto-hours-2026-09-14-2026-09-27.csv")
    expect(file.body).toBe(
      [
        "first_name,last_name,title,Regular hours,Overtime hours,Vacation hours",
        "Ana,Reyes,,80.00,5.00,",
        "Ben,Okafor,,72.00,,8.00",
        "",
      ].join("\r\n"),
    )
  })

  it("Gusto: a name a spreadsheet would run as a formula is neutralised", () => {
    const file = writeExport(
      input("gusto", {
        employees: [
          {
            externalId: null,
            firstName: "=HYPERLINK(1)",
            lastName: "O'Neil, Jr",
            lines: [
              { source: "regular", code: "Regular hours", hours: "1.00" },
            ],
          },
        ],
      }),
    )
    expect(file.body.split("\r\n")[1]).toBe(`'=HYPERLINK(1),"O'Neil, Jr",,1.00`)
  })

  it("Paychex Flex: one row per employee per pay component, 16 columns", () => {
    const file = writeExport(
      input("paychex_flex", {
        companyCode: "12345678",
        employees: employees({ reg: "Hourly", ot: "Overtime", pto: "PTO" }),
      }),
    )
    expect(file.filename).toBe("paychex-hours-2026-09-14-2026-09-27.csv")
    const lines = file.body.split("\r\n")
    expect(lines[0]).toBe(
      "Client ID,Worker ID,Org,Job Number,Pay Component,Rate,Rate Number,Hours,Units,Line Date,Amount,Check Seq Number,Override State,Override Local,Override Local Jurisdiction,Labor Assignment",
    )
    expect(lines.slice(1, 5)).toEqual([
      "12345678,000101,,,Hourly,,,80.00,,,,,,,,",
      "12345678,000101,,,Overtime,,,5.00,,,,,,,,",
      "12345678,000102,,,Hourly,,,72.00,,,,,,,,",
      "12345678,000102,,,PTO,,,8.00,,,,,,,,",
    ])
    for (const l of lines.slice(1, 5)) expect(l.split(",")).toHaveLength(16)
  })

  it("every provider that needs an id refuses an employee without one", () => {
    for (const provider of ["adp_run", "adp_wfn", "paychex_flex"] as const) {
      const people = employees({ reg: "R", ot: "O", pto: "P" })
      people[1].externalId = null
      expect(() =>
        writeExport(input(provider, { companyCode: "ABC", employees: people })),
      ).toThrow(/has no .* id/)
    }
  })
})

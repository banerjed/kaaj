import { describe, expect, it } from "vitest"
import {
  calculateI9Deadlines,
  calculateI9RetentionUntil,
  canPurgeI9,
  findOverlappingEmploymentRecords,
} from "../src/employment.js"

describe("INV-EMP-002 I-9 timing and retention are explicit", () => {
  it("sets Section 1 due on first employment day and Section 2 due within three business days", () => {
    expect(calculateI9Deadlines("2026-03-06")).toEqual({
      section1Due: "2026-03-06",
      section2Due: "2026-03-11",
    })
  })

  it("keeps I-9 retention until the later of three years after hire or one year after termination", () => {
    expect(
      calculateI9RetentionUntil({
        hireDate: "2022-01-15",
        terminationDate: "2026-03-20",
        legalHold: false,
      }),
    ).toBe("2027-03-20")

    expect(
      calculateI9RetentionUntil({
        hireDate: "2025-06-01",
        terminationDate: "2026-01-01",
        legalHold: false,
      }),
    ).toBe("2028-06-01")
  })

  it("does not purge active employees or records under legal hold", () => {
    expect(
      canPurgeI9(
        {
          hireDate: "2022-01-15",
          terminationDate: "2026-03-20",
          legalHold: true,
        },
        "2028-01-01",
      ),
    ).toBe(false)

    expect(
      canPurgeI9(
        {
          hireDate: "2022-01-15",
          legalHold: false,
        },
        "2028-01-01",
      ),
    ).toBe(false)
  })
})

describe("INV-EMP-003 employment record effective dates do not overlap", () => {
  it("accepts adjacent effective-dated rows for a promotion and title change", () => {
    expect(
      findOverlappingEmploymentRecords([
        {
          employeeId: "EMP-001",
          recordType: "title",
          effectiveFrom: "2026-01-01",
          effectiveTo: "2026-03-31",
        },
        {
          employeeId: "EMP-001",
          recordType: "title",
          effectiveFrom: "2026-04-01",
          effectiveTo: null,
        },
      ]),
    ).toEqual([])
  })

  it("detects overlapping current rows for manager, location, or compensation records", () => {
    expect(
      findOverlappingEmploymentRecords([
        {
          employeeId: "EMP-001",
          recordType: "manager",
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
        },
        {
          employeeId: "EMP-001",
          recordType: "manager",
          effectiveFrom: "2026-03-01",
          effectiveTo: null,
        },
        {
          employeeId: "EMP-001",
          recordType: "work_location",
          effectiveFrom: "2026-02-01",
          effectiveTo: "2026-02-15",
        },
        {
          employeeId: "EMP-001",
          recordType: "work_location",
          effectiveFrom: "2026-02-10",
          effectiveTo: "2026-02-28",
        },
      ]),
    ).toHaveLength(4)
  })
})

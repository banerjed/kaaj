import { describe, expect, it } from "vitest"
import {
  applyDeductionPriority,
  calculateGrossPay,
  calculateIndiaStatutory,
  calculateUsFica,
  canMutatePayrollRun,
  selectEffectiveWithholdingCertificate,
  validatePayrollRun,
} from "../src/payroll.js"
import {
  negativeNetPayrollRun,
  reconciledPayrollRun,
} from "../fixtures/payroll.js"

describe("INV-PAY-001 payroll run immutability", () => {
  it("allows ordinary edits while a run is only a preview", () => {
    expect(
      canMutatePayrollRun({
        runStatus: "preview",
        method: "ordinary-edit",
        actorPermissions: ["payroll:run"],
        auditEvents: [],
      }),
    ).toBe(true)
  })

  it("blocks ordinary edits after approval, submission, or finalization", () => {
    for (const runStatus of ["approved", "submitted", "finalized"] as const) {
      expect(
        canMutatePayrollRun({
          runStatus,
          method: "ordinary-edit",
          actorPermissions: ["payroll:run"],
          auditEvents: [],
        }),
      ).toBe(false)
    }
  })

  it("allows correction only with permission, reason, and audit event", () => {
    expect(
      canMutatePayrollRun({
        runStatus: "finalized",
        method: "correction",
        actorPermissions: ["payroll:correct_finalized_run"],
        reason: "Missed overtime approved by payroll manager",
        auditEvents: ["payroll.correction.created"],
      }),
    ).toBe(true)
  })
})

describe("INV-PAY-002 employee lines reconcile to run totals", () => {
  it("accepts a payroll run whose totals tie to employee lines and net pay formula", () => {
    expect(validatePayrollRun(reconciledPayrollRun)).toEqual([])
  })

  it("flags negative net pay unless an explicit arrears workflow exists", () => {
    expect(validatePayrollRun(negativeNetPayrollRun)).toContain(
      "EMP-US-GARNISH-001 negative net pay requires arrears workflow",
    )
  })

  it("detects a run total that no longer ties to employee-level evidence", () => {
    expect(
      validatePayrollRun({
        ...reconciledPayrollRun,
        totals: {
          ...reconciledPayrollRun.totals,
          netPay: reconciledPayrollRun.totals.netPay + 0.02,
        },
      }),
    ).toContain("payroll run total netPay must reconcile to employee lines")
  })
})

describe("FR-PAY-001 and INV-PAY-003 tax calculations are bounded by effective rules", () => {
  it("caps US Social Security at the wage base and applies Additional Medicare above threshold", () => {
    expect(
      calculateUsFica({
        grossWages: 10000,
        ytdGrossBeforeRun: 165000,
        socialSecurityWageBase: 168600,
        additionalMedicareThreshold: 200000,
      }),
    ).toEqual({
      socialSecurity: 223.2,
      medicare: 145,
      additionalMedicare: 0,
    })

    expect(
      calculateUsFica({
        grossWages: 12000,
        ytdGrossBeforeRun: 195000,
        socialSecurityWageBase: 168600,
        additionalMedicareThreshold: 200000,
      }).additionalMedicare,
    ).toBe(63)
  })

  it("applies India EPF ceiling and ESI threshold", () => {
    expect(
      calculateIndiaStatutory({
        monthlyGrossSalary: 18000,
        basicAndDa: 18000,
        epfWageCeiling: 15000,
        esiMonthlyThreshold: 21000,
      }),
    ).toEqual({
      employeeEpf: 1800,
      employerEpf: 1800,
      employeeEsi: 135,
      employerEsi: 585,
    })

    expect(
      calculateIndiaStatutory({
        monthlyGrossSalary: 22000,
        basicAndDa: 15000,
        epfWageCeiling: 15000,
        esiMonthlyThreshold: 21000,
      }),
    ).toMatchObject({
      employeeEsi: 0,
      employerEsi: 0,
    })
  })
})

describe("INV-PAY-004 withholding forms are versioned", () => {
  it("uses the latest active certificate effective on the pay date", () => {
    expect(
      selectEffectiveWithholdingCertificate(
        [
          {
            id: "W4-OLD",
            formType: "federal-w4",
            submittedAt: "2026-01-01",
            payrollEffectiveAt: "2026-01-15",
            status: "active",
            lockInOverride: false,
          },
          {
            id: "W4-NEW",
            formType: "federal-w4",
            submittedAt: "2026-03-10",
            payrollEffectiveAt: "2026-03-31",
            status: "active",
            lockInOverride: false,
          },
        ],
        "2026-04-15",
      )?.id,
    ).toBe("W4-NEW")
  })

  it("keeps a lock-in override ahead of an employee-submitted change", () => {
    expect(
      selectEffectiveWithholdingCertificate(
        [
          {
            id: "IRS-LOCK-IN",
            formType: "federal-w4",
            submittedAt: "2026-02-01",
            payrollEffectiveAt: "2026-02-15",
            status: "active",
            lockInOverride: true,
          },
          {
            id: "EMPLOYEE-W4-CHANGE",
            formType: "federal-w4",
            submittedAt: "2026-03-10",
            payrollEffectiveAt: "2026-03-31",
            status: "active",
            lockInOverride: false,
          },
        ],
        "2026-04-15",
      )?.id,
    ).toBe("IRS-LOCK-IN")
  })
})

describe("INV-PAY-005 garnishments respect priority and caps", () => {
  it("applies taxes first, then garnishments by order priority, and leaves arrears instead of negative net pay", () => {
    const result = applyDeductionPriority(1000, [
      { id: "voluntary-gym", category: "posttax", amount: 100 },
      {
        id: "creditor-garnishment",
        category: "garnishment",
        amount: 500,
        priority: 2,
      },
      { id: "federal-tax", category: "tax", amount: 220 },
      {
        id: "child-support",
        category: "garnishment",
        amount: 450,
        priority: 1,
      },
    ])

    expect(result.netPay).toBe(0)
    expect(result.applied).toEqual([
      { id: "federal-tax", requested: 220, applied: 220, arrears: 0 },
      { id: "child-support", requested: 450, applied: 450, arrears: 0 },
      {
        id: "creditor-garnishment",
        requested: 500,
        applied: 330,
        arrears: 170,
      },
      { id: "voluntary-gym", requested: 100, applied: 0, arrears: 100 },
    ])
  })
})

describe("INV-PAY-007 custom fields never drive payroll calculations", () => {
  it("ignores custom fields that are named like payroll calculation fields", () => {
    expect(
      calculateGrossPay({
        basePay: 2500,
        overtimePay: 300,
        bonusPay: 200,
        customFields: {
          grossPay: 999999,
          federalTax: -500,
        },
      }),
    ).toBe(3000)
  })
})

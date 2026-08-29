import type { PayrollRunFixture } from "../src/payroll.js"

export const reconciledPayrollRun = {
  id: "PAYRUN-US-2026-03-31",
  sourceRequirements: ["US-PAY-001", "US-PAY-002", "US-PAY-022", "INV-PAY-002"],
  status: "finalized",
  auditEvents: ["payroll.run.calculated", "payroll.run.finalized"],
  employees: [
    {
      employeeId: "EMP-US-NJ-001",
      grossPay: 5000,
      pretaxDeductions: 450,
      taxes: 1180,
      statutoryDeductions: 0,
      posttaxDeductions: 125,
      reimbursements: 72.5,
      netPay: 3317.5,
    },
    {
      employeeId: "EMP-US-CA-001",
      grossPay: 7200,
      pretaxDeductions: 900,
      taxes: 1845.25,
      statutoryDeductions: 78.34,
      posttaxDeductions: 250,
      reimbursements: 0,
      netPay: 4126.41,
    },
  ],
  totals: {
    grossPay: 12200,
    pretaxDeductions: 1350,
    taxes: 3025.25,
    statutoryDeductions: 78.34,
    posttaxDeductions: 375,
    reimbursements: 72.5,
    netPay: 7443.91,
  },
} satisfies PayrollRunFixture

export const negativeNetPayrollRun = {
  ...reconciledPayrollRun,
  id: "PAYRUN-US-NEGATIVE-NET-001",
  employees: [
    {
      employeeId: "EMP-US-GARNISH-001",
      grossPay: 900,
      pretaxDeductions: 100,
      taxes: 250,
      statutoryDeductions: 0,
      posttaxDeductions: 700,
      reimbursements: 0,
      netPay: -150,
    },
  ],
  totals: {
    grossPay: 900,
    pretaxDeductions: 100,
    taxes: 250,
    statutoryDeductions: 0,
    posttaxDeductions: 700,
    reimbursements: 0,
    netPay: -150,
  },
} satisfies PayrollRunFixture

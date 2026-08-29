import { roundCents, withinTolerance } from "./money.js"

export interface PayrollEmployeeLine {
  employeeId: string
  grossPay: number
  pretaxDeductions: number
  taxes: number
  statutoryDeductions: number
  posttaxDeductions: number
  reimbursements: number
  netPay: number
}

export interface PayrollRunFixture {
  id: string
  sourceRequirements: string[]
  status: "preview" | "approved" | "submitted" | "finalized"
  employees: PayrollEmployeeLine[]
  totals: {
    grossPay: number
    pretaxDeductions: number
    taxes: number
    statutoryDeductions: number
    posttaxDeductions: number
    reimbursements: number
    netPay: number
  }
  auditEvents: string[]
}

export interface PayrollMutationAttempt {
  runStatus: PayrollRunFixture["status"]
  method: "ordinary-edit" | "correction" | "void" | "reversal"
  actorPermissions: string[]
  reason?: string
  auditEvents: string[]
}

export interface FicaInput {
  grossWages: number
  ytdGrossBeforeRun: number
  socialSecurityWageBase: number
  additionalMedicareThreshold: number
}

export interface IndiaStatutoryInput {
  monthlyGrossSalary: number
  basicAndDa: number
  epfWageCeiling: number
  esiMonthlyThreshold: number
}

export interface DeductionDemand {
  id: string
  category: "tax" | "garnishment" | "statutory" | "pretax" | "posttax"
  amount: number
  priority?: number
}

export interface AppliedDeduction {
  id: string
  requested: number
  applied: number
  arrears: number
}

export interface WithholdingCertificate {
  id: string
  formType: "federal-w4" | "state-withholding" | "local-withholding"
  submittedAt: string
  payrollEffectiveAt: string
  status: "active" | "superseded"
  lockInOverride: boolean
}

export interface PayrollInput {
  basePay: number
  overtimePay: number
  bonusPay: number
  customFields: Record<string, unknown>
}

export function validatePayrollRun(run: PayrollRunFixture): string[] {
  const failures: string[] = []
  const totals = sumEmployeeLines(run.employees)

  for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
    if (!withinTolerance(totals[key], run.totals[key])) {
      failures.push(`payroll run total ${key} must reconcile to employee lines`)
    }
  }

  for (const employee of run.employees) {
    const expectedNetPay = roundCents(
      employee.grossPay -
        employee.pretaxDeductions -
        employee.taxes -
        employee.statutoryDeductions -
        employee.posttaxDeductions +
        employee.reimbursements,
    )

    if (!withinTolerance(employee.netPay, expectedNetPay)) {
      failures.push(
        `${employee.employeeId} net pay must equal gross minus deductions`,
      )
    }

    if (employee.netPay < 0) {
      failures.push(
        `${employee.employeeId} negative net pay requires arrears workflow`,
      )
    }
  }

  if (!run.auditEvents.includes("payroll.run.calculated")) {
    failures.push("payroll run must include calculation audit event")
  }

  return failures
}

export function canMutatePayrollRun(attempt: PayrollMutationAttempt): boolean {
  if (attempt.runStatus === "preview") {
    return true
  }

  if (attempt.method === "ordinary-edit") {
    return false
  }

  return (
    attempt.actorPermissions.includes("payroll:correct_finalized_run") &&
    attempt.reason !== undefined &&
    attempt.reason.trim().length > 0 &&
    attempt.auditEvents.includes("payroll.correction.created")
  )
}

export function calculateUsFica(input: FicaInput): {
  socialSecurity: number
  medicare: number
  additionalMedicare: number
} {
  const socialSecurityWages = Math.min(
    input.grossWages,
    Math.max(0, input.socialSecurityWageBase - input.ytdGrossBeforeRun),
  )
  const additionalMedicareWages = Math.max(
    0,
    input.ytdGrossBeforeRun +
      input.grossWages -
      input.additionalMedicareThreshold,
  )

  return {
    socialSecurity: roundCents(socialSecurityWages * 0.062),
    medicare: roundCents(input.grossWages * 0.0145),
    additionalMedicare: roundCents(additionalMedicareWages * 0.009),
  }
}

export function calculateIndiaStatutory(input: IndiaStatutoryInput): {
  employeeEpf: number
  employerEpf: number
  employeeEsi: number
  employerEsi: number
} {
  const epfBasis = Math.min(input.basicAndDa, input.epfWageCeiling)
  const esiApplies = input.monthlyGrossSalary <= input.esiMonthlyThreshold

  return {
    employeeEpf: roundCents(epfBasis * 0.12),
    employerEpf: roundCents(epfBasis * 0.12),
    employeeEsi: esiApplies ? roundCents(input.monthlyGrossSalary * 0.0075) : 0,
    employerEsi: esiApplies ? roundCents(input.monthlyGrossSalary * 0.0325) : 0,
  }
}

export function applyDeductionPriority(
  grossPay: number,
  deductions: DeductionDemand[],
): {
  applied: AppliedDeduction[]
  netPay: number
} {
  let remaining = grossPay
  const applied = [...deductions]
    .sort(compareDeductionPriority)
    .map((deduction) => {
      const paid = Math.min(remaining, deduction.amount)
      remaining = roundCents(remaining - paid)

      return {
        id: deduction.id,
        requested: deduction.amount,
        applied: roundCents(paid),
        arrears: roundCents(deduction.amount - paid),
      }
    })

  return {
    applied,
    netPay: roundCents(remaining),
  }
}

export function selectEffectiveWithholdingCertificate(
  certificates: WithholdingCertificate[],
  payDate: string,
): WithholdingCertificate | null {
  const eligible = certificates
    .filter(
      (certificate) =>
        certificate.status === "active" &&
        certificate.payrollEffectiveAt <= payDate,
    )
    .sort((left, right) =>
      right.payrollEffectiveAt.localeCompare(left.payrollEffectiveAt),
    )

  return (
    eligible.find((certificate) => certificate.lockInOverride) ??
    eligible.at(0) ??
    null
  )
}

export function calculateGrossPay(input: PayrollInput): number {
  return roundCents(input.basePay + input.overtimePay + input.bonusPay)
}

function compareDeductionPriority(
  left: DeductionDemand,
  right: DeductionDemand,
): number {
  const categoryDifference =
    deductionCategoryRank(left.category) - deductionCategoryRank(right.category)

  if (categoryDifference !== 0) {
    return categoryDifference
  }

  return (left.priority ?? 999) - (right.priority ?? 999)
}

function deductionCategoryRank(category: DeductionDemand["category"]): number {
  return {
    tax: 1,
    garnishment: 2,
    statutory: 3,
    pretax: 4,
    posttax: 5,
  }[category]
}

function sumEmployeeLines(
  employees: PayrollEmployeeLine[],
): PayrollRunFixture["totals"] {
  return employees.reduce(
    (totals, employee) => ({
      grossPay: roundCents(totals.grossPay + employee.grossPay),
      pretaxDeductions: roundCents(
        totals.pretaxDeductions + employee.pretaxDeductions,
      ),
      taxes: roundCents(totals.taxes + employee.taxes),
      statutoryDeductions: roundCents(
        totals.statutoryDeductions + employee.statutoryDeductions,
      ),
      posttaxDeductions: roundCents(
        totals.posttaxDeductions + employee.posttaxDeductions,
      ),
      reimbursements: roundCents(
        totals.reimbursements + employee.reimbursements,
      ),
      netPay: roundCents(totals.netPay + employee.netPay),
    }),
    {
      grossPay: 0,
      pretaxDeductions: 0,
      taxes: 0,
      statutoryDeductions: 0,
      posttaxDeductions: 0,
      reimbursements: 0,
      netPay: 0,
    },
  )
}

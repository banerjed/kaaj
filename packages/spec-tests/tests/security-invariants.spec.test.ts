import { describe, expect, it } from "vitest"
import {
  authorizeSensitiveRead,
  filterTenantRecords,
  maskBankAccount,
} from "../src/security.js"
import {
  bankAccountResource,
  crossTenantPayrollAdminActor,
  employeeActor,
  managerActor,
  payrollAdminActor,
  salaryResource,
  tenantRecords,
} from "../fixtures/security.js"

describe("INV-SEC-001 tenant isolation holds for every data path", () => {
  it("filters tenant-owned records to the actor tenant", () => {
    expect(filterTenantRecords(employeeActor, tenantRecords)).toEqual([
      { id: "REC-A-001", tenantId: "TENANT-A", ownerEmployeeId: "EMP-A-001" },
      { id: "REC-A-002", tenantId: "TENANT-A", ownerEmployeeId: "EMP-A-002" },
    ])
  })

  it("blocks cross-tenant sensitive reads even for privileged roles", () => {
    expect(
      authorizeSensitiveRead(crossTenantPayrollAdminActor, bankAccountResource),
    ).toMatchObject({
      allowed: false,
      responseValue: null,
      auditEvents: [],
    })
  })
})

describe("INV-SEC-002 sensitive fields require explicit permission", () => {
  it("lets employees read their own payroll-sensitive data after MFA", () => {
    expect(authorizeSensitiveRead(employeeActor, salaryResource)).toMatchObject(
      {
        allowed: true,
        responseValue: "125000.00",
        auditEvents: ["sensitive.payroll.read"],
      },
    )
  })

  it("does not let managers read direct-report bank data", () => {
    expect(
      authorizeSensitiveRead(managerActor, bankAccountResource),
    ).toMatchObject({
      allowed: false,
      responseValue: null,
    })
  })

  it("masks bank account data even for a payroll admin with explicit permission", () => {
    expect(
      authorizeSensitiveRead(payrollAdminActor, bankAccountResource),
    ).toMatchObject({
      allowed: true,
      responseValue: "****9012",
      auditEvents: ["sensitive.bank.read"],
    })
  })

  it("requires MFA for high-sensitivity reads", () => {
    expect(
      authorizeSensitiveRead(
        { ...payrollAdminActor, mfaSatisfied: false },
        bankAccountResource,
      ),
    ).toMatchObject({
      allowed: false,
      responseValue: null,
    })
  })
})

describe("INV-SEC-003 decrypted access is audited", () => {
  it("creates no response body and no decrypted-read audit event when denied", () => {
    const decision = authorizeSensitiveRead(managerActor, bankAccountResource)

    expect(decision.responseValue).toBeNull()
    expect(decision.auditEvents).toEqual([])
  })

  it("uses last-four masking for bank accounts", () => {
    expect(maskBankAccount("000111222333")).toBe("****2333")
  })
})

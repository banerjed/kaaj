import { describe, expect, it } from "vitest"
import {
  authorizeResourceAction,
  authorizeSensitiveRead,
  filterTenantRecords,
  maskBankAccount,
} from "../src/security.js"
import { securityAccessCases } from "../fixtures/security-access-matrix.js"
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

describe("role-based access matrix", () => {
  it("contains a broad set of explicit CI cases", () => {
    expect(securityAccessCases.length).toBeGreaterThanOrEqual(110)
    expect(
      new Set(securityAccessCases.map((testCase) => testCase.id)).size,
    ).toBe(securityAccessCases.length)
  })

  it("covers every critical actor role", () => {
    expect(
      new Set(securityAccessCases.map((testCase) => testCase.actor.role)),
    ).toEqual(
      new Set([
        "accountant",
        "ai_assistant",
        "auditor",
        "compliance_officer",
        "employee",
        "external_client",
        "finance_admin",
        "hr_admin",
        "hr_director",
        "it_admin",
        "manager",
        "marketing_admin",
        "payroll_admin",
        "project_manager",
        "sales_manager",
        "system_job",
      ]),
    )
  })

  it("covers every high-risk resource family", () => {
    const resourceTypes = new Set(
      securityAccessCases.map((testCase) => testCase.resource.resourceType),
    )

    for (const resourceType of [
      "employee_profile",
      "employee_sensitive_field",
      "employee_document",
      "direct_deposit",
      "payroll_run",
      "pay_stub",
      "tax_form",
      "compensation_record",
      "compensation_worksheet",
      "time_off_request",
      "timesheet",
      "change_request",
      "benefit_election",
      "accounting_record",
      "audit_log",
      "data_export",
      "marketing_contact",
      "marketing_campaign",
      "consent_record",
      "crm_record",
      "ticket",
      "client_portal_record",
      "ai_knowledge",
      "user_role",
      "firm_settings",
      "system_job_batch",
    ]) {
      expect(resourceTypes).toContain(resourceType)
    }
  })

  it.each(securityAccessCases)(
    "$id authorizes $actor.role $action on $resource.resourceType",
    (testCase) => {
      const decision = authorizeResourceAction(
        testCase.actor,
        testCase.resource,
        testCase.action,
        testCase.context,
      )

      expect(decision.allowed).toBe(testCase.expected.allowed)

      if (testCase.expected.responseValue !== undefined) {
        expect(decision.responseValue).toBe(testCase.expected.responseValue)
      }

      if (!testCase.expected.allowed) {
        expect(decision.responseValue).toBeNull()
        expect(decision.auditEvents).toEqual([])
      }

      if (testCase.expected.allowed && decision.responseValue !== null) {
        expect(decision.responseValue).not.toMatch(/123-45-6789.*123456789012/)
      }
    },
  )

  it("audits every allowed high-sensitivity read, export, or AI retrieval", () => {
    const sensitiveReads = securityAccessCases.filter(
      (testCase) =>
        testCase.expected.allowed &&
        testCase.resource.sensitivity !== "normal" &&
        testCase.resource.sensitivity !== "marketing" &&
        ["read", "export", "ai_retrieve"].includes(testCase.action),
    )

    expect(sensitiveReads.length).toBeGreaterThan(20)

    for (const testCase of sensitiveReads) {
      const decision = authorizeResourceAction(
        testCase.actor,
        testCase.resource,
        testCase.action,
        testCase.context,
      )

      expect(decision.auditEvents.length).toBeGreaterThan(0)
    }
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

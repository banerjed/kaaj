import type { Actor, SensitiveResource, TenantRecord } from "../src/security.js"

export const tenantRecords = [
  { id: "REC-A-001", tenantId: "TENANT-A", ownerEmployeeId: "EMP-A-001" },
  { id: "REC-A-002", tenantId: "TENANT-A", ownerEmployeeId: "EMP-A-002" },
  { id: "REC-B-001", tenantId: "TENANT-B", ownerEmployeeId: "EMP-B-001" },
] satisfies TenantRecord[]

export const employeeActor = {
  id: "EMP-A-001",
  tenantId: "TENANT-A",
  role: "employee",
  permissions: [],
  mfaSatisfied: true,
} satisfies Actor

export const managerActor = {
  id: "EMP-A-MGR",
  tenantId: "TENANT-A",
  role: "manager",
  permissions: [],
  directReportIds: ["EMP-A-001"],
  mfaSatisfied: true,
} satisfies Actor

export const payrollAdminActor = {
  id: "EMP-A-PAYROLL",
  tenantId: "TENANT-A",
  role: "payroll_admin",
  permissions: ["sensitive:bank:read", "sensitive:payroll:read"],
  mfaSatisfied: true,
} satisfies Actor

export const crossTenantPayrollAdminActor = {
  ...payrollAdminActor,
  tenantId: "TENANT-B",
} satisfies Actor

export const bankAccountResource = {
  id: "BANK-EMP-A-001",
  tenantId: "TENANT-A",
  ownerEmployeeId: "EMP-A-001",
  sensitivity: "bank",
  fieldName: "bank_account_number",
  value: "123456789012",
} satisfies SensitiveResource

export const salaryResource = {
  id: "SAL-EMP-A-001",
  tenantId: "TENANT-A",
  ownerEmployeeId: "EMP-A-001",
  sensitivity: "payroll",
  fieldName: "salary",
  value: "125000.00",
} satisfies SensitiveResource

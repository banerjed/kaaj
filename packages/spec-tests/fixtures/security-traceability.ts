import { securityAccessCases } from "./security-access-matrix.js"
import { operationalSecurityCaseIds } from "./security-operational-cases.js"

export interface SecurityTraceabilityRequirement {
  id: string
  testPlanSection: string
  casePrefixes: string[]
}

export const securityTraceabilityRequirements: SecurityTraceabilityRequirement[] =
  [
    {
      id: "SEC-DOC-TENANT",
      testPlanSection: "Tenant Isolation",
      casePrefixes: ["SEC-TENANT", "SEC-SEARCH", "SEC-CACHE", "SEC-JOB"],
    },
    {
      id: "SEC-DOC-FIELD",
      testPlanSection: "Field-Level Security",
      casePrefixes: ["SEC-EMP", "SEC-MGR", "SEC-HR", "SEC-PAY"],
    },
    {
      id: "SEC-DOC-DOCUMENT",
      testPlanSection: "Document Security",
      casePrefixes: ["SEC-HR", "SEC-AUDIT"],
    },
    {
      id: "SEC-DOC-PAYROLL",
      testPlanSection: "Payroll And Bank Security",
      casePrefixes: ["SEC-PAY", "SEC-DD", "SEC-CREDENTIAL"],
    },
    {
      id: "SEC-DOC-COMPENSATION",
      testPlanSection: "Compensation Security",
      casePrefixes: ["SEC-COMP"],
    },
    {
      id: "SEC-DOC-WORKFLOW",
      testPlanSection: "Workflow And Approval Security",
      casePrefixes: ["SEC-MGR", "SEC-CR", "SEC-CSRF"],
    },
    {
      id: "SEC-DOC-BENEFITS",
      testPlanSection: "Benefits And Medical Security",
      casePrefixes: ["SEC-BEN"],
    },
    {
      id: "SEC-DOC-ACCOUNTING",
      testPlanSection: "Accounting And Finance Security",
      casePrefixes: ["SEC-ACC", "SEC-WEBHOOK"],
    },
    {
      id: "SEC-DOC-AUDIT",
      testPlanSection: "Audit Log Security",
      casePrefixes: ["SEC-AUDIT", "SEC-TELEMETRY"],
    },
    {
      id: "SEC-DOC-EXPORT",
      testPlanSection: "Export And Reporting Security",
      casePrefixes: ["SEC-EXPORT", "SEC-REPORT"],
    },
    {
      id: "SEC-DOC-MARKETING",
      testPlanSection: "Marketing And Consent Security",
      casePrefixes: ["SEC-MKT", "SEC-SALES"],
    },
    {
      id: "SEC-DOC-AI",
      testPlanSection: "AI Assistant Security",
      casePrefixes: ["SEC-AI", "SEC-SEARCH"],
    },
    {
      id: "SEC-DOC-CLIENT",
      testPlanSection: "Client Portal Security",
      casePrefixes: ["SEC-CLIENT"],
    },
    {
      id: "SEC-DOC-ROLE",
      testPlanSection: "Role Management And Session Security",
      casePrefixes: ["SEC-HR", "SEC-FIRM", "SEC-CREDENTIAL"],
    },
    {
      id: "SEC-DOC-FAILURE",
      testPlanSection: "Failure-Mode Checks",
      casePrefixes: [
        "SEC-TENANT",
        "SEC-CACHE",
        "SEC-WEBHOOK",
        "SEC-CSRF",
        "SEC-RATE",
        "SEC-TELEMETRY",
      ],
    },
  ]

export const executableSecurityCaseIds = [
  ...securityAccessCases.map((testCase) => testCase.id),
  ...operationalSecurityCaseIds,
]

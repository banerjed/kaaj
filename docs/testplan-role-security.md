# Role Security And Authorization Test Plan

**Status:** draft, executable coverage annotated
**Created:** August 30, 2026
**Scope:** Exhaustive RBAC, ABAC, tenant isolation, field security, document
security, audit, AI-action, and CI authorization checks.

---

## Purpose

Role-based security is an `R0` product area. A failure can expose SSNs, payroll,
bank accounts, medical records, immigration documents, compensation, client
records, audit logs, or cross-tenant data.

The goal is not merely to test whether buttons are hidden. The system must prove
that unauthorized states cannot be read, written, exported, searched, retrieved
by AI, replayed through webhooks, or leaked through error bodies.

---

## CI Strategy

Every pull request must run:

- `pnpm test:security`: fast, named authorization matrix suite.
- `pnpm test:spec`: full executable spec suite.
- `pnpm turbo run test`: package-level regression suite.
- Database RLS verification through `./check --db` or the database workflow.

Security tests must fail closed:

- New role without explicit matrix rows: fail.
- New sensitive resource type without explicit matrix rows: fail.
- Allowed high-sensitivity read/export/AI retrieval without audit event: fail.
- Denied access returning any response body: fail.
- Cross-tenant access succeeding for any role: fail.
- UI-only authorization with no server/repository/domain guard: fail in review.

---

## Actor Roles To Audit

Every role requires positive and negative tests:

| Role               | Must Be Able To Do                                                                                                                                                     | Must Never Be Able To Do                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee           | Read own profile, own pay stubs, own tax forms, own benefits, own time off, own timesheets, own change requests, own data export                                       | Read peer salary, SSN, reviews, bank data, medical docs, manager-only views, admin reports, audit logs, payroll runs, or accounting data        |
| Manager            | Read direct-report work profile, approve direct-report time off/timesheets/change requests, view team dashboard, access compensation planning only during active cycle | Read direct-report SSN, bank, medical, tax forms, unrelated teams, peer departments, own approvals, salary outside planning cycle               |
| HR Admin           | Manage employee records, documents, benefits, onboarding, HR workflows, non-role employee updates                                                                      | Manage roles, read audit logs without director authority, bypass legal holds, approve own privileged changes                                    |
| HR Director        | Approve terminations, high salary changes, role changes, audit access, high-risk exports                                                                               | Modify own role, approve own salary/role changes, bypass MFA, cross tenant                                                                      |
| Payroll Admin      | Run/finalize payroll, generate tax forms, read payroll/compensation/bank data needed for payroll                                                                       | Edit compensation source records, read HR medical docs, bypass MFA, edit finalized payroll directly, cross tenant                               |
| Finance Admin      | Accounting periods, reports, closed-period overrides with approval, firm finance settings                                                                              | Read HR PII, bank account numbers for employees, medical/immigration docs, payroll self-service docs without payroll role                       |
| Accountant         | Ledger, invoices, bills, bank reconciliation, reports, open-period accounting writes                                                                                   | Mutate closed periods without approval, read HR PII/payroll bank data, manage roles                                                             |
| Compliance Officer | Read compliance evidence, audit logs, sensitive records with reason, export reviewed compliance packets                                                                | Mutate source records, delete audit logs, bypass redaction, bypass tenant boundaries                                                            |
| Auditor            | Read-only audit/accounting/compliance evidence, redacted sensitive evidence                                                                                            | Mutate anything, run payroll, approve workflows, see unredacted secrets                                                                         |
| Marketing Admin    | Marketing contacts, campaigns, lists, consent records, suppression records                                                                                             | HR/payroll/accounting/client secrets, employee PII, ignored suppression/consent blockers                                                        |
| Sales Manager      | CRM/deal/customer pipeline data within tenant and assignment                                                                                                           | HR/payroll/bank/medical/tax/audit data                                                                                                          |
| Project Manager    | Assigned projects, project staffing views allowed by policy, tickets/tasks                                                                                             | Employee sensitive fields, payroll, compensation beyond permitted aggregates                                                                    |
| IT Admin           | Role infrastructure, SSO/security settings, user provisioning with audit                                                                                               | Read payroll/medical/bank contents by default, self-escalate without audit/MFA                                                                  |
| AI Assistant       | Retrieve only tenant data and actions permitted for the invoking user, require confirmation for sensitive actions                                                      | Retrieve cross-tenant context, offer unauthorized tools, include secrets in generated responses, execute sensitive actions without confirmation |
| System Job         | Process only records for explicit tenant context and idempotency key                                                                                                   | Run without tenant context, process cross-tenant batches, bypass audit                                                                          |
| External Client    | Client portal records for its own client account                                                                                                                       | Internal employee, payroll, accounting, ticket, project, or other-client records                                                                |

---

## Resource Families To Audit

Every resource family needs read, create, update, delete, approve, export, and
AI-retrieval checks where applicable:

- Employee profile.
- Employee sensitive fields: SSN, DOB, home address, personal email, personal
  phone, emergency contact, tax ID, passport, driver's license.
- Compensation: salary, hourly rate, job level, bonus, equity, compa-ratio,
  compensation history, compensation worksheet.
- Payroll: payroll run, payroll employee line, payroll register, pay stub,
  direct deposit, tax forms, withholding forms, garnishments, tax deposits.
- Benefits and medical: plan elections, dependents, life events, carrier
  exports, ADA/medical accommodation documents.
- Immigration and statutory employment: I-9, E-Verify, work permit, state
  notices, signed policy acknowledgments.
- Documents: contracts, handbook acknowledgments, certifications, licenses,
  legal holds, document deletion.
- HR workflows: time off, timesheets, change requests, onboarding,
  performance reviews, feedback, surveys.
- Accounting: chart of accounts, journal entries, invoices, bills, payments,
  bank transactions, reconciliation, closed periods, tax reports.
- Firm settings: legal entities, locations, departments, holidays, payroll
  policies, benefit plans, roles, permission sets.
- Client portal: client profile, contracts, invoices, proposals, projects,
  support tickets.
- Marketing: contacts, companies, lists, campaigns, workflows, landing pages,
  forms, consent records, suppression lists, bounces, complaints.
- AI knowledge/action context: product docs, tenant policies, CRM records,
  employee records, financial records, action registry.
- Audit logs, security events, bulk exports, backups, search indexes, caches,
  webhooks, background jobs.

---

## Required Checks

Legend:

- `DONE`: covered by executable spec-level tests in `pnpm test:security`.
- `PARTIAL`: some named sub-cases are covered; uncovered sub-cases are listed
  below the row.
- `REMAINING`: not directly covered yet, or requires production adapter/RLS tests
  once the implementation path exists.

Coverage snapshot: 62 `DONE`, 17 `PARTIAL`, 53 `REMAINING`, 132 listed
checks total.

### Tenant Isolation

- DONE - Employee cannot read same-ID employee record in another tenant.
- DONE - HR Director cannot read another tenant's employee profile.
- DONE - Payroll Admin cannot run payroll for another tenant.
- DONE - Accountant cannot read another tenant's ledger or bank feed.
- REMAINING - Marketing Admin cannot import or export another tenant's audience.
- DONE - External Client cannot read another client's portal record.
- PARTIAL - AI Assistant cannot retrieve another tenant's knowledge, policy, CRM, HR, or
  accounting data.
  DONE: tenant knowledge/search filtering and permission filtering.
  REMAINING: explicit cross-tenant policy, CRM, HR, and accounting AI-context
  cases.
- DONE - Background jobs must require tenant context and process one tenant at a time.
- DONE - Search indexes must include tenant filters and never return cross-tenant hits.
- DONE - Export jobs must include only records owned by the requested tenant.
- DONE - Webhook replay cannot retarget another tenant by changing payload IDs.
- DONE - Error messages must not reveal whether cross-tenant records exist.

### Field-Level Security

- DONE - Employee can update own non-sensitive contact fields only.
- DONE - Employee cannot update own salary, manager, role, hire date, employment
  status, or compensation history directly.
- DONE - Employee can read own salary/pay-stub/tax-form evidence only after the
  required sensitive-session checks.
- DONE - Employee cannot read peer salary, SSN, bank data, tax forms, reviews, medical
  docs, immigration docs, benefits details, or change requests.
- DONE - Manager can read direct-report work fields only.
- PARTIAL - Manager cannot read direct-report SSN, DOB, home address, bank account,
  medical docs, tax forms, immigration docs, or peer salary.
  DONE: SSN, bank account, and tax-form denial.
  REMAINING: DOB, home address, medical document, immigration document, and peer
  salary denial cases.
- PARTIAL - Manager compensation access is limited to active planning cycle, direct
  reports, approved fields, and expiry date.
  DONE: direct-report and active-planning-cycle boundaries.
  REMAINING: approved-field filtering and expiry-date enforcement.
- DONE - HR Admin can read HR-sensitive fields but cannot manage role assignments.
- DONE - Payroll Admin can read payroll/bank/tax data needed for payroll but bank
  account numbers must be masked.
- REMAINING - Finance/Admin accounting roles cannot see HR PII unless explicitly granted for
  a compliance workflow.
- DONE - Auditor and Compliance Officer receive redacted sensitive values by default.
- REMAINING - Denied field reads return no field value, no partial object, and no count
  that reveals sensitive existence.

### Document Security

- REMAINING - Employee can read own allowed documents but not restricted HR/legal documents.
- REMAINING - Manager cannot read direct-report I-9, medical, bank, tax, or legal docs.
- PARTIAL - HR Admin can read and manage employee documents within tenant.
  DONE: read medical document and delete immigration document with reason/audit.
  REMAINING: create/update flows, full document management surface, and
  cross-tenant document adapter/RLS checks.
- DONE - Compliance Officer can read compliance documents with audit.
- DONE - Document deletion requires permission, reason, audit event, and no legal hold.
- DONE - Legal hold blocks purge and deletion even for HR Admin.
- REMAINING - File downloads, previews, thumbnails, and OCR text obey the same checks as the
  original document.
- REMAINING - Virus-scan status, file type whitelist, max file size, and encrypted storage
  are enforced before document visibility.
- REMAINING - Signed document acknowledgments remain reproducible after template updates.

### Payroll And Bank Security

- PARTIAL - Payroll run create/calculate/approve/finalize require payroll permissions.
  DONE: run and finalize require payroll permissions.
  REMAINING: create, calculate, and approve permission cases.
- REMAINING - Finalized payroll cannot be edited through ordinary update paths.
- DONE - Payroll Admin cannot edit compensation source records directly.
- DONE - Employee can read own pay stub and own tax forms only.
- DONE - Manager cannot read direct-report tax forms or bank information.
- DONE - Direct deposit creation/update requires MFA and sensitive-action confirmation.
- PARTIAL - Direct deposit cannot be changed after provider submission except through
  correction/reversal workflow.
  DONE: ordinary post-submission direct-deposit update is denied.
  REMAINING: explicit correction/reversal workflow authorization cases.
- DONE - Historical payment evidence keeps only masked account details.
- REMAINING - Payment files and NACHA/bank exports require payroll permission, approval,
  audit, and secure handling.
- REMAINING - Failed direct deposit, prenote, return, void, and reissue flows are audited.

### Compensation Security

- DONE - Compensation records require HR permission and approval to update.
- PARTIAL - High salary changes require HR Director approval.
  DONE: salary/manager/role sensitive field updates require HR Director approval.
  REMAINING: high-change threshold, salary decrease, and alert escalation cases.
- REMAINING - Salary decreases require alert/reason/additional approval.
- DONE - Managers can edit only assigned worksheet rows during active planning cycle.
- DONE - Managers cannot approve their own compensation.
- DONE - Worksheet access expires after planning cycle end.
- REMAINING - Compensation exports require HR Director or compliance approval.
- REMAINING - Pay equity reports must enforce aggregation thresholds before demographic
  breakdowns are shown.

### Workflow And Approval Security

- PARTIAL - Employee cannot approve own time off, timesheet, benefit, change request, or
  compensation request.
  DONE: own time-off, change-request, and compensation approval denials.
  REMAINING: own timesheet and benefit approval denials.
- PARTIAL - Manager can approve only direct-report workflows where they are current
  approver.
  DONE: direct-report time-off/timesheet approval, non-report denial, and current
  change-request approver cases.
  REMAINING: all workflow families, stale-link behavior, and production approver
  resolution.
- REMAINING - Stale approver links fail after manager changes.
- REMAINING - Approval chain is immutable after submission.
- REMAINING - Approvers are calculated at submission and mismatch requires HR review.
- REMAINING - Approval cannot be applied twice.
- REMAINING - Rejected request cannot later auto-apply.
- DONE - Sensitive change requests for name, SSN, or bank account require supporting
  document.
- DONE - Salary, manager, and role changes are not self-service change-request fields.
- REMAINING - Retroactive changes require configured permission, reason, audit, and date
  threshold checks.

### Benefits And Medical Security

- DONE - Employee can submit own benefit election only during open enrollment or valid
  life event.
- REMAINING - Manager cannot read employee medical plan details, dependents, or life-event
  documents.
- DONE - HR Admin can administer benefits within tenant.
- REMAINING - Carrier exports contain only minimum required fields.
- REMAINING - Carrier export download/upload events are audited.
- REMAINING - Dependent documents and medical evidence are high-sensitivity records.
- REMAINING - Benefit deduction changes that affect payroll require payroll/benefits audit.

### Accounting And Finance Security

- DONE - Accountant and Finance Admin can read/write open-period accounting records.
- DONE - Auditor is read-only.
- DONE - Closed-period mutations require approval, reason, and audit.
- REMAINING - Marketing, HR-only, and external-client roles cannot read ledger records.
- REMAINING - Bank feed imports and reconciliation require accounting permission and tenant
  context.
- REMAINING - Financial report exports respect permissions and tenant boundaries.
- DONE - Payment gateway callbacks are idempotent and tenant scoped.
- REMAINING - Refunds, credit notes, write-offs, tax reports, and period reopen actions
  require elevated permission and audit.

### Audit Log Security

- DONE - HR Director, Compliance Officer, and Auditor can read audit logs with MFA.
- DONE - HR Admin cannot read audit logs unless granted director/compliance authority.
- REMAINING - Audit logs are immutable to ordinary users.
- DONE - No role can delete audit logs through application paths.
- PARTIAL - Sensitive reads produce audit events naming actor, tenant, resource, reason,
  timestamp, and access path.
  DONE: allowed high-sensitivity read/export/AI retrieval creates an audit event.
  REMAINING: audit payload must include actor, tenant, resource, reason,
  timestamp, and access path.
- PARTIAL - Denied sensitive reads are logged in security telemetry without returning
  secret material.
  DONE: denied sensitive reads return no secret material.
  REMAINING: denied sensitive-read telemetry event creation.
- REMAINING - Bulk access alerts fire when record-count thresholds are exceeded.
- REMAINING - Role changes and privilege escalation are always audited and alerted.

### Export And Reporting Security

- DONE - Employee can export own personal data only.
- DONE - Full employee export requires HR Director approval.
- DONE - Bulk exports over threshold require approval and reason.
- REMAINING - Exported fields must be filtered by caller role.
- DONE - Exports must use tenant filters at source query and output packaging.
- DONE - Scheduled report emails must re-check recipient authorization at send time.
- DONE - Download URLs must expire and be single-tenant scoped.
- REMAINING - Export metadata must include actor, tenant, filters, field list, count, and
  generated artifact ID.

### Marketing And Consent Security

- DONE - Marketing Admin can manage marketing contacts and consent records.
- PARTIAL - Marketing roles cannot read HR/payroll/accounting sensitive fields.
  DONE: Marketing Admin salary/accounting denials and Sales Manager
  HR/payroll/accounting/audit denials.
  REMAINING: bank, medical, tax, client-secret, and suppression-bypass denials.
- REMAINING - Suppression, unsubscribe, hard bounce, spam complaint, consent withdrawal, and
  legal-basis expiry block sends across bulk, workflow, A/B, resend, and manual
  paths.
- REMAINING - Contact merge preserves the strongest suppression state.
- REMAINING - Consent snapshots are stored at send time.
- REMAINING - Imported audiences must be consent-validated before activation.
- REMAINING - Preference center changes are audited.
- REMAINING - Data-subject requests preserve historical consent evidence.

### AI Assistant Security

- DONE - AI retrieves only records the invoking user could retrieve directly.
- DONE - AI action registry filters tools by required permissions.
- REMAINING - AI cannot offer unauthorized actions.
- REMAINING - AI cannot execute sensitive actions without confirmation.
- PARTIAL - AI denied actions create audit records but return no sensitive payload.
  DONE: denied AI retrieval returns no sensitive payload.
  REMAINING: denied-action audit event creation.
- REMAINING - AI summaries must not include hidden fields from unauthorized context.
- DONE - AI search over tenant knowledge must apply tenant and permission filters.
- REMAINING - AI cannot use product documentation access to infer tenant secrets.
- REMAINING - AI tool calls that mutate records must go through the same service-layer
  authorization as UI/API calls.

### Client Portal Security

- DONE - External client can read only its own client portal records.
- DONE - External client cannot update internal records unless routed through explicit
  portal action.
- PARTIAL - External client cannot see employee profiles, payroll, HR docs, internal
  accounting notes, or other-client tickets/projects.
  DONE: employee profile and other-client portal-record denial.
  REMAINING: payroll, HR document, internal accounting note, ticket, and project
  denial cases.
- REMAINING - Client download URLs are scoped to client, tenant, expiration, and artifact.
- REMAINING - Staff impersonation of client portal requires elevated permission and audit.

### Role Management And Session Security

- PARTIAL - Role changes require HR Director or IT Admin, MFA, reason, audit, and alert.
  DONE: HR Director/IT Admin authority, MFA, reason, audit, and self-change denial.
  REMAINING: alert generation and production session invalidation.
- DONE - Users cannot change their own role.
- REMAINING - Admin role assignment triggers re-authentication.
- REMAINING - Admin sessions time out faster for sensitive operations.
- REMAINING - Privilege changes invalidate stale sessions and cached permissions.
- DONE - JWT/API permissions are rechecked server-side; client claims are not trusted.
- PARTIAL - API keys are scoped, rotated, audited, and unable to impersonate human-only
  sensitive actions.
  DONE: tenant scope, requested scope, active subject, and rotation age.
  REMAINING: API-key audit records and human-only sensitive-action prevention.

### Failure-Mode Checks

- REMAINING - Hidden buttons are not considered authorization.
- DONE - Direct API call with forged IDs is denied.
- DONE - URL parameter tampering is denied.
- DONE - Form payload includes forbidden hidden field and is denied.
- REMAINING - Bulk mutation includes mixed authorized/unauthorized IDs and unauthorized
  rows fail without partial leakage.
- DONE - Cache lookup does not bypass permissions.
- DONE - Background retry does not execute under stale/incorrect tenant context.
- DONE - Duplicate webhook does not replay state mutation.
- DONE - Deleted or disabled user cannot use old session.
- REMAINING - Permission revoked during session takes effect before next sensitive action.
- PARTIAL - Error, validation, logging, analytics, and telemetry paths never include full
  secrets.
  DONE: structured telemetry/log redaction for SSNs, bank/routing numbers,
  salaries, and bearer tokens.
  REMAINING: production error, validation, analytics, and third-party sink
  adapters.

---

## Executable Coverage

The current executable matrix lives in:

- `packages/spec-tests/fixtures/security-access-matrix.ts`
- `packages/spec-tests/fixtures/security-operational-cases.ts`
- `packages/spec-tests/fixtures/security-traceability.ts`
- `packages/spec-tests/tests/security-invariants.spec.test.ts`
- `packages/spec-tests/tests/security-operational.spec.test.ts`
- `packages/spec-tests/tests/security-traceability.spec.test.ts`

The security gate currently checks:

- Tenant isolation for employee, HR Director, payroll, accounting, and
  cross-tenant privileged access.
- Employee self-service allow/deny cases.
- Manager direct-report and non-report boundaries.
- HR Admin vs HR Director boundaries.
- Payroll Admin payroll/bank/tax boundaries.
- Direct deposit MFA and provider-submission boundaries.
- Compensation planning cycle boundaries.
- Change-request sensitive field and approver boundaries.
- Benefit enrollment/life-event boundaries.
- Accounting, closed-period, auditor, and marketing role boundaries.
- Sales Manager CRM access and HR/payroll/accounting/audit denials.
- Audit log and export boundaries.
- Client portal ownership boundaries.
- AI retrieval permission boundaries.
- Firm settings and role-management boundaries.
- System Job tenant context, idempotency, audit, and cross-tenant denials.
- Denied response-body safety and high-sensitivity audit events.
- Search indexes, AI search, and export search filtering.
- Tenant-scoped cache key validation.
- Webhook signature, duplicate replay, idempotency, and tenant-retargeting
  rejection.
- Scheduled report recipient reauthorization and expiring download URLs.
- JWT/API-key tenant, scope, active-subject, and rotation checks.
- CSRF, SameSite, and rate-limit checks for state-changing requests.
- Telemetry/log redaction for SSNs, bank/routing numbers, salaries, and bearer
  tokens.
- Traceability from each documented security category to executable case IDs.

Every new module, route, repository, action, AI tool, export, webhook, or
background job that touches protected data must add or update matrix rows before
the feature is considered testable.

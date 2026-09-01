# Workflow Templates Specification

**Status:** draft
**Created:** September 1, 2026
**Related:** [challenging-workflows.md](./challenging-workflows.md)

---

## Purpose

Kaaj should make complex cross-module work feel seamless by turning common firm
workflows into reusable templates. A template should compile into a tracked
workflow instance with automatic actions, subtasks, approvals, evidence, due
dates, assignees, blockers, and audit events.

The product goal is to minimize coordination work. Humans should mostly handle
decisions, exceptions, and approvals. The system should handle routing,
prechecks, record creation, reminders, dependency tracking, status rollups, and
safe retries.

---

## Core Idea

Each complex workflow is defined once as a declarative template:

- Trigger: what starts the workflow.
- Applicability: when the workflow applies.
- Steps: the checklist/subtasks required.
- Automation: which steps the system can perform directly.
- Assignees: dynamic rules, not hardcoded people.
- Due dates: formulas based on hire date, pay date, close date, contract date,
  SLA, or effective date.
- Dependencies: which steps block other steps.
- Evidence: documents, records, approvals, files, audit events, or external
  confirmations required.
- Exceptions: conditions that block or escalate the workflow.
- Completion rules: what must be true before the workflow can close.

Example:

```yaml
workflow: new_hire_onboarding
trigger: employee.created
applies_when:
  employment_type: employee
steps:
  - id: generate_statutory_packet
    module: documents
    mode: automatic
    automation: generate_state_employment_packet
    due: hire_date - 7d
    assignee: system
  - id: collect_payroll_info
    module: payroll
    mode: input_required
    assignee: employee
    due: hire_date - 5d
  - id: provision_laptop
    module: ticketing
    mode: ticket
    creates_ticket: true
    assignee: group:it_provisioning
    due: hire_date - 3d
  - id: assign_user_groups
    module: user_groups
    mode: automatic
    automation: sync_department_groups
    assignee: system
  - id: manager_first_week_plan
    module: hr
    mode: review_required
    assignee: employee.manager
    due: hire_date
```

---

## Workflow Instance Model

When a trigger fires, Kaaj creates a workflow instance.

Example:

```text
Workflow: New Hire Onboarding
Subject: Priya Shah
Status: In progress
Progress: 7/10 complete
Blocked: Payroll tax form missing
Risk: Medium
Owner: HR
```

Every instance should show one holistic review surface:

| Step                  | Module    | Status      | Assignee | Due    | Blocker            |
| --------------------- | --------- | ----------- | -------- | ------ | ------------------ |
| Generate state packet | Documents | Done        | System   | Aug 28 | -                  |
| Payroll setup         | Payroll   | Waiting     | Employee | Aug 29 | Missing W-4        |
| Laptop provisioning   | Ticketing | In progress | IT       | Aug 30 | Vendor delay       |
| Benefits enrollment   | Benefits  | Not started | Employee | Sep 5  | Depends on payroll |
| Manager onboarding    | HR        | Done        | Manager  | Sep 1  | -                  |

The user should not need to open five modules to answer "what is left?" The
workflow instance is the operating cockpit.

---

## Step Modes

Each step must have one mode:

- `automatic`: the system can complete the step safely.
- `review_required`: the system prepares the work, but a human must approve.
- `input_required`: a human must provide missing information or a document.
- `ticket`: the step creates or links a ticket/subticket for another department.
- `approval`: the step waits for an explicit approval/rejection.
- `external_wait`: the step waits for a provider, client, bank, carrier, or
  government portal.
- `exception`: the step appears only when a policy, validation, integration, or
  reconciliation rule fails.
- `blocked`: the step cannot proceed because a dependency is incomplete.

Templates should avoid checklist spam. They should create only steps that are
applicable to the subject and current data.

---

## Dynamic Assignment Rules

Assignees should resolve from live data:

- `system`
- `employee`
- `employee.manager`
- `employee.hr_partner`
- `department.manager`
- `department.finance_reviewer`
- `project.project_manager`
- `client.account_owner`
- `group:payroll_admins`
- `group:it_provisioning`
- `group:finance_reviewers`
- `group:benefits_admins`

This avoids stale templates when managers, departments, groups, locations, or
client owners change.

---

## Data Model

Recommended core tables:

- `workflow_templates`
- `workflow_template_steps`
- `workflow_template_dependencies`
- `workflow_template_applicability_rules`
- `workflow_instances`
- `workflow_instance_steps`
- `workflow_instance_step_dependencies`
- `workflow_instance_assignments`
- `workflow_instance_artifacts`
- `workflow_instance_events`
- `workflow_automation_runs`
- `workflow_exceptions`

Recommended important fields:

- `tenant_id`
- `template_id`
- `workflow_key`
- `subject_type`
- `subject_id`
- `trigger_event_id`
- `status`
- `risk_level`
- `owner_assignment_rule`
- `resolved_owner_id`
- `due_at`
- `completed_at`
- `blocked_reason`
- `idempotency_key`
- `source_module`
- `target_module`
- `created_record_type`
- `created_record_id`
- `audit_event_id`

---

## Module Adapter Contract

Each module should expose small workflow-safe actions. The workflow engine should
not reach into module internals directly.

Examples:

- Employee Profile: create employee, update department/location, resolve manager.
- Documents: generate packet, request signature, verify completion.
- Payroll: enroll employee, preview pay impact, add reimbursement, lock pay run.
- Accounting: create journal entry, create invoice, flag close blocker.
- Time Tracking: collect approved time, lock billing period, summarize unbilled
  hours.
- Project Management: create project from template, create task, update
  milestone status.
- Ticketing: create subticket, assign group, track SLA, link related tickets.
- User Groups: add/remove membership, preview access delta.
- Marketing/CRM: link deal, validate consent, attribute campaign.
- AI Assistant: summarize status, detect blockers, suggest next action.

Every adapter call must be:

- Tenant-scoped.
- Idempotent.
- Audited.
- Permission-checked.
- Safe to retry.
- Clear about whether it completed, skipped, blocked, or needs review.

---

## Automation Principles

The ideal workflow result should look like:

```text
System completed 14 steps automatically.
3 steps need employee input.
2 steps need approval.
1 step is blocked because the payroll cutoff has passed.
```

Automation should handle:

- Applicability checks.
- Record creation.
- Due-date calculation.
- Assignee resolution.
- Document generation.
- Policy validation.
- Status rollups.
- Notifications and reminders.
- Retry-safe external calls.
- Exception creation.
- Audit event creation.

Human involvement should be reserved for:

- Required approvals.
- Missing data or documents.
- Sensitive action confirmation.
- Policy exceptions.
- Ambiguous matches.
- Legal/compliance review.
- Client-facing decisions.

---

## Holistic Review UX

Every workflow instance should provide:

- Overall status, owner, risk, progress, due date, and blocked reason.
- Checklist table with step, module, status, assignee, due date, dependency, and
  blocker.
- Timeline of completed steps and audit events.
- Generated records and artifacts.
- Exception panel.
- "Needs my action" filter.
- "System completed" filter.
- "Blocked" filter.
- Department/subticket rollup.
- Permission-filtered detail views.
- AI summary that cites source records and hides unauthorized fields.

For workflows with subtickets, subtickets should be generated from template
steps. The workflow instance remains the single review surface.

---

## First Templates To Build

Start with these because they force the architecture to handle HR, payroll,
accounting, documents, ticketing, approvals, audit, and cross-module status
cleanly:

1. New hire onboarding.
2. Employee location/work-state change.
3. Payroll-to-GL posting.
4. Billable time to invoice.
5. Employee offboarding.

Next wave:

1. Department transfer.
2. Expense claim to reimbursement and GL.
3. Deal-to-project-to-invoice.
4. Benefits life event to payroll deductions and carrier export.
5. Multi-state compliance audit.
6. Access review after role, manager, or department change.
7. Client escalation to change order.
8. Monthly close blockers.
9. Campaign true-ROI analysis.
10. Data-subject/legal request.

---

## Example Template: Employee Location Change

```yaml
workflow: employee_location_change
trigger: change_request.approved
applies_when:
  request_type: work_location
steps:
  - id: preview_tax_jurisdiction
    module: payroll
    mode: automatic
    automation: preview_tax_jurisdiction_change
    assignee: system
  - id: generate_state_packet
    module: documents
    mode: automatic
    automation: generate_state_employment_packet
    assignee: system
  - id: review_local_statutory_docs
    module: hr
    mode: review_required
    assignee: group:hr_compliance
  - id: update_employee_location
    module: employee_profile
    mode: automatic
    automation: apply_effective_dated_location
    depends_on: [review_local_statutory_docs]
  - id: update_payroll_jurisdiction
    module: payroll
    mode: automatic
    automation: apply_payroll_tax_jurisdiction
    depends_on: [update_employee_location]
  - id: review_benefit_eligibility
    module: benefits
    mode: exception
    appears_when: benefits_eligibility_changed
    assignee: group:benefits_admins
```

Expected review output:

- Which jurisdiction changed.
- Which local overlays apply.
- Which documents were generated.
- Whether payroll cutoff is affected.
- Whether benefits eligibility changed.
- Which records will update on the effective date.
- Which steps need human review.

---

## Example Template: Billable Time To Invoice

```yaml
workflow: billable_time_to_invoice
trigger: billing_period.closed
applies_when:
  client.billing_model: time_and_materials
steps:
  - id: collect_approved_time
    module: time_tracking
    mode: automatic
    automation: collect_approved_billable_time
  - id: validate_project_rates
    module: project_management
    mode: automatic
    automation: resolve_project_rate_card
  - id: flag_budget_overruns
    module: project_management
    mode: exception
    appears_when: actual_hours_exceed_budget
    assignee: project.project_manager
  - id: create_invoice_draft
    module: accounting
    mode: automatic
    automation: create_invoice_from_time
    depends_on: [collect_approved_time, validate_project_rates]
  - id: finance_review
    module: accounting
    mode: approval
    assignee: group:finance_reviewers
  - id: publish_to_client_portal
    module: client_portal
    mode: automatic
    automation: publish_invoice_and_time_summary
    depends_on: [finance_review]
```

Expected review output:

- Approved billable hours by client/project/task.
- Rate source and billing rule.
- Unbilled amount.
- Budget variance.
- Draft invoice.
- Client-visible time summary.
- Finance approval status.

---

## Test Requirements

Every workflow template should have spec-level tests for:

- Template applicability.
- Step generation.
- Step omission when not applicable.
- Dependency ordering.
- Dynamic assignee resolution.
- Due-date calculation.
- Automatic action idempotency.
- Human approval gates.
- Exception generation.
- Permission and tenant isolation.
- Audit event completeness.
- Status rollup correctness.
- Retry behavior.
- External callback/webhook replay safety.

Each template should also include negative tests for:

- Wrong tenant.
- Stale manager.
- Revoked permission.
- Missing supporting document.
- Closed payroll period.
- Closed accounting period.
- Expired client approval link.
- Duplicate webhook.
- Provider failure.
- Partial completion followed by retry.

---

## Design Constraints

- The workflow engine should orchestrate; modules should own domain logic.
- Templates should be declarative enough to diff, review, and test.
- Steps should never depend on UI visibility for authorization.
- Every generated subticket should link back to the parent workflow instance.
- Every generated record should link back to the triggering event.
- Every automatic action should be idempotent.
- Every sensitive action should require permission checks and audit.
- Every workflow should be resumable after failure.
- Every blocked step should explain the blocker and owner.
- Every human-facing checklist should stay short by hiding completed automatic
  detail until expanded.

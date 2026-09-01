# Challenging Cross-Module Workflows

**Status:** draft
**Created:** September 1, 2026
**Scope:** Common firm workflows that become difficult when HR, payroll,
accounting, CRM/marketing, project management, ticketing, documents, and AI live
in separate SaaS silos.

---

## Purpose

This document lists high-value workflows where Kaaj's unified data model should
make day-to-day firm operations materially simpler than a stack of separate
tools.

The focus is not exotic edge cases. These are common questions and tasks that
firms ask repeatedly, but that become slow, fragile, or impossible to answer
when the source data is split across HRIS, payroll, accounting, CRM, marketing
automation, project management, help desk, file storage, and spreadsheet tools.

Primary source specs:

- [cross-module-integration-plan.md](./cross-module-integration-plan.md)
- [module-employee-profile.md](./module-employee-profile.md)
- [module-change-requests.md](./module-change-requests.md)
- [module-compensation.md](./module-compensation.md)
- [module-payroll.md](./module-payroll.md)
- [module-accounting.md](./module-accounting.md)
- [module-time-tracking.md](./module-time-tracking.md)
- [module-project-management-v2.md](./module-project-management-v2.md)
- [module-ticketing.md](./module-ticketing.md)
- [module-marketing.md](./module-marketing.md)
- [module-ai-assistant.md](./module-ai-assistant.md)
- [module-firm-profile.md](./module-firm-profile.md)

---

## Ranking Method

Workflows are ranked by:

1. Frequency: how often a normal services firm encounters the workflow.
2. Cross-module breadth: how many systems must agree for the answer to be
   correct.
3. Risk: payroll, accounting, compliance, privacy, or client-impact risk.
4. Silo pain: how much manual reconciliation, spreadsheet work, duplicate entry,
   or "ask three teams" coordination is required in separate SaaS tools.
5. Unified advantage: how naturally Kaaj can answer or execute the workflow
   from shared tenant, employee, client, project, time, payroll, accounting, and
   audit records.

---

## Ranked Workflow Groups

| Rank | Workflow                                                                   | Group                       | Typical Modules                                                                                  |
| ---- | -------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| 1    | New hire onboarding orchestration                                          | Employee lifecycle          | HR, employee profile, payroll, compensation, documents, ticketing, user groups, firm profile, AI |
| 2    | Employee location or work-state change                                     | Employee lifecycle          | Employee profile, payroll, benefits, compliance docs, firm profile, time tracking, accounting    |
| 3    | Payroll run to financial statements                                        | Payroll and finance         | Payroll, compensation, time tracking, benefits, accounting, firm profile                         |
| 4    | Billable time to client invoice                                            | Client delivery and revenue | Time tracking, project management, accounting, client portal, employee profile                   |
| 5    | Unified approval inbox                                                     | Approvals and controls      | HR, change requests, payroll, compensation, accounting, projects, ticketing, audit               |
| 6    | Department transfer with access and cost center updates                    | Employee lifecycle          | Change requests, employee profile, user groups, payroll, accounting, projects, tickets           |
| 7    | Employee expense claim to reimbursement and GL                             | Payroll and finance         | Accounting, payroll, employee profile, HR policy, AI, approvals                                  |
| 8    | Client deal to proposal to project to invoice                              | Client delivery and revenue | CRM/marketing, project management, accounting, client portal, documents                          |
| 9    | Offboarding with access revocation, final pay, asset return, and retention | Employee lifecycle          | HR, payroll, benefits, ticketing, user groups, documents, accounting, audit                      |
| 10   | PTO request impact on project delivery and payroll                         | Workforce planning          | HR, time tracking, project management, payroll, client portal                                    |
| 11   | Compensation change from promotion to payroll and budget                   | Workforce planning          | Employee profile, compensation, payroll, accounting, approvals, audit                            |
| 12   | Contractor onboarding and project-based pay                                | Client delivery and revenue | Employee profile, compensation, projects, time tracking, accounting, payroll/AP                  |
| 13   | Client escalation from support ticket to project change order              | Client delivery and revenue | Ticketing, project management, accounting, client portal, CRM                                    |
| 14   | Marketing campaign ROI by customer, project, and margin                    | Growth and revenue          | Marketing, CRM, accounting, project management, time tracking                                    |
| 15   | Capacity planning against sales pipeline                                   | Workforce planning          | CRM, project management, time tracking, employee profile, hiring/HR, finance                     |
| 16   | Multi-state payroll and statutory employment packet audit                  | Compliance and risk         | Employee profile, payroll, firm profile, documents, audit, state employment rules                |
| 17   | Benefits life event to payroll deductions and carrier export               | Employee lifecycle          | Change requests, benefits, documents, payroll, employee profile, audit                           |
| 18   | Bank feed reconciliation across payroll, invoices, expenses, and deposits  | Payroll and finance         | Accounting, payroll, invoicing, expenses, bank feeds, audit                                      |
| 19   | Access review after role, manager, or department change                    | Compliance and risk         | Employee profile, user groups, projects, tickets, client portal, audit                           |
| 20   | AI answer with permissioned operational context                            | AI and search               | AI assistant, HR, payroll, accounting, projects, tickets, marketing, audit                       |
| 21   | Client-facing delivery status and profitability                            | Client delivery and revenue | Project management, time tracking, accounting, client portal, CRM                                |
| 22   | Policy exception handling across HR, finance, and payroll                  | Approvals and controls      | HR policies, accounting, payroll, compensation, approvals, audit                                 |
| 23   | Employee data correction with downstream payroll and tax effects           | Employee lifecycle          | Change requests, employee profile, payroll, documents, audit                                     |
| 24   | Monthly close with open operational blockers                               | Payroll and finance         | Accounting, payroll, projects, invoicing, expenses, ticketing                                    |
| 25   | Data-subject or legal request across employee, client, and marketing data  | Compliance and risk         | Employee profile, documents, marketing, CRM, accounting, ticketing, audit                        |

---

## Group 1: Employee Lifecycle

### 1. New Hire Onboarding Orchestration

**Common question/task:** "I hired someone. What has to happen before their
first day, and what is still blocked?"

**Modules touched:** Employee profile, HR onboarding, compensation, payroll,
state employment documents, direct deposit, tax forms, benefits, ticketing,
assets, user groups, firm profile, AI assistant.

**Why siloed SaaS struggles:** HR creates the employee, payroll separately asks
for tax/bank setup, IT tracks laptop/access in a help desk, benefits lives in a
provider portal, and state-specific forms are often tracked in spreadsheets or
file storage. Nobody has one live answer for "is this person ready?"

**Unified advantage:** Employee creation can trigger a single onboarding graph:
profile, compensation defaults, payroll enrollment, statutory packet, benefit
eligibility, equipment tickets, group membership, manager tasks, and audit trail.

**Product surface to show:** One onboarding command center with first-day
readiness, blocked tasks, owner, due date, compliance risk, and generated docs.

### 2. Employee Location Or Work-State Change

**Common question/task:** "An employee moved from NJ to NY, or now works partly
in CA. What has to change?"

**Modules touched:** Employee profile, firm locations, payroll tax jurisdiction,
state/local statutory docs, benefits, time tracking, accounting cost centers,
remote-work policy, compliance audit.

**Why siloed SaaS struggles:** HR may update the address, but payroll may not
recalculate work-state withholding, accounting may keep the old department or
location, benefits may not know eligibility changed, and local notice
requirements can be missed.

**Unified advantage:** One approved change can update address, work location,
tax jurisdiction, local document packet, benefit/regulatory eligibility,
payroll schedule impacts, and department/location accounting dimensions.

**Product surface to show:** "Location impact preview" before approval:
tax/locality changes, required documents, effective date, payroll cutoff,
benefit changes, and accounting dimensions.

### 3. Department Transfer With Access And Cost Center Updates

**Common question/task:** "This employee moved from Engineering to Product.
Which approvals, access, budgets, projects, and tickets change?"

**Modules touched:** Change requests, employee profile, user groups, firm
departments, manager hierarchy, payroll cost center, accounting dimensions,
projects, ticketing, audit.

**Why siloed SaaS struggles:** HR, identity, finance, project tools, and help
desk tickets all carry separate manager/department fields. Transfers frequently
leave stale approval routes, wrong payroll allocation, old access groups, and
orphaned tasks.

**Unified advantage:** The approved transfer can atomically update reporting
line, groups, approval routing, cost center, open project ownership, ticket
assignment, and future payroll allocations.

**Product surface to show:** Transfer workflow with before/after org, affected
groups, affected projects/tickets, budget/cost-center preview, and audit.

### 4. Offboarding With Final Pay, Assets, Access, And Retention

**Common question/task:** "Someone is leaving Friday. What has to be revoked,
paid, collected, retained, or anonymized?"

**Modules touched:** Employee profile, HR offboarding, payroll, benefits,
documents, ticketing/assets, user groups/identity, accounting reimbursements,
audit/legal hold.

**Why siloed SaaS struggles:** Final payroll, PTO payout, access revocation,
equipment return, benefits end dates, document retention, and open expense
reimbursements are usually owned by different teams and tools.

**Unified advantage:** One offboarding workflow can sequence termination status,
final pay, reimbursement/AP cleanup, benefits cutoff, access revocation, asset
return tickets, legal hold, retention clock, and anonymization eligibility.

**Product surface to show:** Offboarding risk board grouped by final pay, access,
assets, benefits, documents, and open financial obligations.

### 5. Benefits Life Event To Payroll Deductions And Carrier Export

**Common question/task:** "An employee had a qualifying life event. Did benefits,
documents, payroll deductions, and carrier files all update correctly?"

**Modules touched:** Change requests, employee profile, benefits, documents,
payroll deductions, provider/carrier exports, audit.

**Why siloed SaaS struggles:** The HRIS may store the event, the benefits portal
stores dependents and elections, payroll stores deductions, and documents live
elsewhere. Errors show up as wrong deductions or uncovered dependents.

**Unified advantage:** A life-event request can validate document requirements,
apply elections, calculate deduction changes, schedule payroll effective dates,
prepare carrier export, and audit every step.

**Product surface to show:** Life-event timeline with documents, election
changes, payroll deduction delta, carrier status, and effective dates.

### 6. Employee Data Correction With Downstream Payroll And Tax Effects

**Common question/task:** "An employee corrected their legal name, SSN, address,
or tax withholding. What downstream records are affected?"

**Modules touched:** Change requests, employee profile, documents, payroll, tax
forms, direct deposit, benefits, audit.

**Why siloed SaaS struggles:** The corrected data may not reach payroll, year-end
tax forms, benefit providers, or historical evidence. Retroactive changes can
create legal and payroll errors.

**Unified advantage:** The change request can require supporting documents,
validate effective dates, update encrypted profile fields, propagate payroll/tax
changes, preserve old values for audit, and block retroactive mistakes.

**Product surface to show:** Data correction approval with downstream impact
preview and "will update/will not update" list.

---

## Group 2: Payroll And Finance

### 7. Payroll Run To Financial Statements

**Common question/task:** "Payroll is done. Are wages, employer taxes,
deductions, liabilities, cash, and department expenses posted correctly?"

**Modules touched:** Payroll, compensation, time tracking, benefits, firm
departments/cost centers, accounting general ledger, reporting.

**Why siloed SaaS struggles:** Payroll totals come from one vendor, benefits
from another, department cost centers from HR, and the GL from accounting.
Finance often posts summary journals manually and reconciles variances later.

**Unified advantage:** Payroll can generate balanced journal entries, allocate
costs by department/location/project, post liabilities, update reports, and keep
source drill-through to employees and payroll lines.

**Product surface to show:** Payroll-to-GL preview with debits/credits, variance
warnings, cost-center allocation, and locked source references.

### 8. Employee Expense Claim To Reimbursement And GL

**Common question/task:** "Will this approved expense be reimbursed, booked to
the right account, and cleared when payroll pays it?"

**Modules touched:** Accounting expenses, OCR/AI, HR policy, employee profile,
approval routing, payroll reimbursement, general ledger.

**Why siloed SaaS struggles:** Expense tool, approval system, payroll, and GL may
not share policy, employee manager, reimbursement status, or clearing entries.

**Unified advantage:** Expense submission can extract receipt data, validate
policy, route approval, add reimbursement to payroll, book the original expense,
and clear the payable automatically.

**Product surface to show:** Expense lifecycle showing receipt, policy checks,
approvals, payroll inclusion, journal entries, and payment status.

### 9. Bank Feed Reconciliation Across Payroll, Invoices, Expenses, And Deposits

**Common question/task:** "What does this bank transaction match, and why is cash
off?"

**Modules touched:** Accounting, bank feeds, payroll payments, customer
invoices, vendor bills, employee reimbursements, payment gateway webhooks.

**Why siloed SaaS struggles:** Bank deposits, payroll withdrawals, gateway
payouts, bills, and reimbursements may be split across disconnected systems.
Matching becomes manual, especially when one bank transaction settles many
operational records.

**Unified advantage:** The platform can match bank feed transactions to invoice
payments, payroll disbursements, reimbursements, refunds, fees, and journal
entries using shared source IDs.

**Product surface to show:** Reconciliation assistant with candidate matches,
confidence, source documents, and unreconciled operational blockers.

### 10. Monthly Close With Open Operational Blockers

**Common question/task:** "Can we close the month, and what operational items are
blocking close?"

**Modules touched:** Accounting close, payroll, bank reconciliation, invoices,
bills, expenses, projects/time, ticketing, audit.

**Why siloed SaaS struggles:** Finance must ask project managers for unbilled
time, HR/payroll for final payroll entries, AP for pending bills, and support or
delivery teams for client credits/disputes.

**Unified advantage:** Month-end close can surface all unposted payroll,
unapproved expenses, uninvoiced billable time, unmatched bank transactions,
client credits, and missing approvals in one checklist.

**Product surface to show:** Close checklist with blockers by module, owner,
amount at risk, and one-click drill-through.

### 11. Policy Exception Handling Across HR, Finance, And Payroll

**Common question/task:** "This expense, bonus, retroactive change, or payroll
correction needs an exception. Who approves it and what does it affect?"

**Modules touched:** HR policy, accounting, payroll, compensation, approvals,
audit, documents.

**Why siloed SaaS struggles:** Policy lives outside the transaction system,
approvals are module-specific, and audit evidence is scattered.

**Unified advantage:** Exception rules can combine employee, role, department,
amount, payroll period, accounting period, and supporting-document requirements.

**Product surface to show:** Exception approval packet with policy rule, violated
threshold, downstream postings, payroll period, and audit evidence.

---

## Group 3: Client Delivery And Revenue

### 12. Billable Time To Client Invoice

**Common question/task:** "What time is billable, approved, unbilled, and ready
to invoice?"

**Modules touched:** Time tracking, project management, accounting/invoicing,
employee profile, client portal, firm billing rates.

**Why siloed SaaS struggles:** Time entries live in one tool, project budgets in
another, rates in contracts or spreadsheets, and invoices in accounting. Clients
may dispute hours because they cannot see approved context.

**Unified advantage:** Approved time can inherit project/task/client context,
apply rate rules, flag budget overruns, create invoice line items, and expose
client-visible summaries.

**Product surface to show:** Unbilled time workbench grouped by client/project,
with approval status, rate, margin, invoice preview, and client visibility.

### 13. Client Deal To Proposal To Project To Invoice

**Common question/task:** "We won this deal. Did the proposal become real work,
and will billing match the promise?"

**Modules touched:** CRM/marketing, proposal/documents, project management,
time tracking, accounting, client portal.

**Why siloed SaaS struggles:** Sales promises, proposal scope, delivery tasks,
budgets, rates, and invoices are often copied manually. Scope leakage and missed
billing are common.

**Unified advantage:** A closed-won opportunity can create a project/objective,
import deliverables and budgets, mirror client/rate data, schedule tasks, and
generate invoices against the approved scope.

**Product surface to show:** Deal-to-cash timeline from campaign/deal through
proposal, project, time, invoice, payment, and margin.

### 14. Client Escalation From Support Ticket To Project Change Order

**Common question/task:** "This support issue is really out-of-scope work. Do we
need a project, change order, or invoice?"

**Modules touched:** Ticketing, project management, documents/proposals,
accounting, CRM, client portal.

**Why siloed SaaS struggles:** Support sees the issue, delivery owns the work,
sales owns the commercial relationship, and accounting owns billing. The
decision trail is fragmented.

**Unified advantage:** A ticket can be linked to contract scope, converted into
a project task or change order, routed for client approval, and invoiced with
the original support context.

**Product surface to show:** Ticket escalation panel with scope comparison,
recommended action, client approval, project/task creation, and billing impact.

### 15. Client-Facing Delivery Status And Profitability

**Common question/task:** "What can we show the client, and are we still making
money on this engagement?"

**Modules touched:** Project management, time tracking, accounting, client
portal, CRM, documents.

**Why siloed SaaS struggles:** Client-visible delivery status and internal
profitability usually live in different tools, so teams either overshare or
under-inform clients while finance waits for delayed margin reporting.

**Unified advantage:** The same project facts can drive filtered client portal
views and internal profitability dashboards with role-based field visibility.

**Product surface to show:** Dual-view project dashboard: client-visible
milestones and internal revenue/cost/margin/budget burn.

### 16. Contractor Onboarding And Project-Based Pay

**Common question/task:** "Can this contractor start work, submit time, and get
paid under the project terms?"

**Modules touched:** Employee/worker profile, compensation terms, documents,
project management, time tracking, accounting AP/payroll, client billing.

**Why siloed SaaS struggles:** Contractors often live half in HR, half in vendor
management, half in project tools. Contract terms, bill rates, pay rates,
documents, and approvals are disconnected.

**Unified advantage:** A contractor record can connect eligibility documents,
project assignment, rate card, time approval, invoice generation, and payment
route.

**Product surface to show:** Contractor readiness and payment dashboard with
required docs, project terms, bill/pay rates, approved time, and payable status.

---

## Group 4: Workforce Planning

### 17. PTO Request Impact On Project Delivery And Payroll

**Common question/task:** "If this PTO request is approved, what delivery dates,
staffing, client commitments, and payroll records are affected?"

**Modules touched:** HR time off, time tracking, project management, payroll,
firm holidays, client portal.

**Why siloed SaaS struggles:** PTO approval is often isolated from delivery
capacity. Project managers learn later that critical work is understaffed, and
payroll may receive separate absence data.

**Unified advantage:** PTO approval can show project allocation, deadline risk,
coverage suggestions, payroll coding, and client-visible timeline impacts before
approval.

**Product surface to show:** PTO approval card with balance, team calendar,
project deadlines, substitute coverage, and payroll effect.

### 18. Compensation Change From Promotion To Payroll And Budget

**Common question/task:** "A promotion was approved. When does the new title,
salary, payroll, budget, and org chart change?"

**Modules touched:** Employee profile, compensation, approvals, payroll,
accounting budgets/cost centers, firm profile, audit.

**Why siloed SaaS struggles:** Title and manager may change in HR before salary
changes in payroll, while finance budgets remain stale. Retroactive effective
dates are especially error-prone.

**Unified advantage:** A promotion can update profile, compensation components,
payroll effective dates, budget forecasts, manager hierarchy, access groups, and
audit evidence as one dated change.

**Product surface to show:** Promotion impact preview with compensation delta,
payroll period, budget variance, access changes, and approval chain.

### 19. Capacity Planning Against Sales Pipeline

**Common question/task:** "If these deals close, do we have enough people with
the right skills, and when do we need to hire?"

**Modules touched:** CRM pipeline, project templates, employee profile, skills,
time tracking utilization, recruiting/HR planning, finance forecasts.

**Why siloed SaaS struggles:** Sales forecast, staffing capacity, skills, PTO,
current project commitments, and hiring plans are stored separately.

**Unified advantage:** Pipeline probability can be translated into project
templates, role demand, utilization impact, hiring gaps, and forecasted margin.

**Product surface to show:** Capacity forecast combining weighted pipeline,
project demand, available hours, skills, PTO, and hiring recommendations.

---

## Group 5: Growth And Marketing

### 20. Marketing Campaign ROI By Customer, Project, And Margin

**Common question/task:** "Which campaigns actually produced profitable clients,
not just leads?"

**Modules touched:** Marketing campaigns, CRM contacts/companies/deals,
accounting invoices/payments, project delivery, time tracking margin.

**Why siloed SaaS struggles:** Marketing tools usually stop at lead/deal
attribution. Accounting knows revenue, project tools know delivery cost, and
time tracking knows labor cost. True margin attribution requires stitching.

**Unified advantage:** Campaign attribution can flow through deal, client,
project, invoice, payment, labor cost, and profit margin.

**Product surface to show:** Campaign ROI dashboard with pipeline, booked
revenue, collected revenue, delivery cost, gross margin, and churn/expansion.

### 21. Consent-Safe Campaign Execution With Client And Employee Context

**Common question/task:** "Can we send this campaign, or will it violate consent,
suppression, contract, or relationship rules?"

**Modules touched:** Marketing contacts, consent records, CRM/client account,
contracts/documents, support tickets, account ownership.

**Why siloed SaaS struggles:** Suppression and consent may live in marketing,
contract restrictions in documents, account status in CRM/accounting, and active
support issues in tickets.

**Unified advantage:** Send eligibility can combine consent, suppression,
account status, support escalation, contract restrictions, and relationship
owner approval.

**Product surface to show:** Campaign preflight checklist with blocked
recipients, reason, legal basis, owner, and remediation action.

---

## Group 6: Approvals And Controls

### 22. Unified Approval Inbox

**Common question/task:** "What do I need to approve today across the whole
firm?"

**Modules touched:** HR, change requests, payroll, compensation, accounting,
project/client approvals, ticketing, audit, user groups.

**Why siloed SaaS struggles:** Managers check separate inboxes for PTO, expenses,
bills, payroll runs, salary changes, tickets, and client deliverables.

**Unified advantage:** One approval queue can prioritize by risk, amount, due
date, module, employee/client context, and delegation rules.

**Product surface to show:** Cross-module approval inbox with grouped risk,
bulk-safe actions, policy checks, and complete audit evidence.

### 23. Dynamic Approval Routing After Org Changes

**Common question/task:** "Do approvals route correctly after a manager,
department, finance reviewer, or group changes?"

**Modules touched:** Employee profile, firm profile, user groups, approval
engine, accounting, HR, payroll, projects.

**Why siloed SaaS struggles:** Each SaaS has its own approval routing model. Org
changes require manual reconfiguration in multiple tools, and stale approvers
linger.

**Unified advantage:** Approval rules can resolve against the same live employee
manager, department, cost center, role, and user-group model.

**Product surface to show:** Approval rule simulator with example transactions,
resolved approvers, stale route warnings, and effective dates.

---

## Group 7: Compliance, Risk, And AI

### 24. Multi-State Payroll And Statutory Employment Packet Audit

**Common question/task:** "Are we compliant for employees across NJ, NY, MA, CA,
WA, PA, and the other states where people work?"

**Modules touched:** Employee profile, firm locations, state/local employment
rules, payroll, tax forms, documents, audit.

**Why siloed SaaS struggles:** HR stores addresses, payroll stores tax
jurisdictions, docs may be in file storage, and local notices are often manual.
Multi-state work and residence changes are especially brittle.

**Unified advantage:** A single employee/work-location record can drive
statutory packets, payroll jurisdiction, local overlays, document completion,
and compliance audit.

**Product surface to show:** State compliance matrix by employee, work state,
residence state, locality, missing docs, source-rule version, and payroll impact.

### 25. Access Review After Role, Manager, Or Department Change

**Common question/task:** "Who can now see payroll, client, project, or employee
PII after this org change?"

**Modules touched:** Employee profile, user groups, access control, projects,
tickets, payroll, accounting, client portal, audit.

**Why siloed SaaS struggles:** Permissions are scattered across app-specific
roles and manual groups. A manager change can leave old project, ticket, client,
or payroll visibility behind.

**Unified advantage:** Access review can evaluate all module permissions against
one tenant, employee, department, client, project, and role graph.

**Product surface to show:** Access-delta report showing newly granted,
retained, revoked, and suspicious permissions by module.

### 26. AI Answer With Permissioned Operational Context

**Common question/task:** "Ask the assistant: why is client margin down, who is
blocked, what approvals are late, or what payroll changes affect close?"

**Modules touched:** AI assistant, HR, payroll, accounting, projects, tickets,
marketing/CRM, documents, audit/security.

**Why siloed SaaS struggles:** The AI would need connectors to many systems, each
with different permissions and stale context. Answers either become shallow or
risky.

**Unified advantage:** The assistant can retrieve permission-filtered context
from one model, cite source records, respect field-level security, and execute
approved actions through the same authorization layer.

**Product surface to show:** AI answer card with source records, hidden-field
indicator, allowed actions, required confirmations, and audit trail.

### 27. Data-Subject Or Legal Request Across Employee, Client, And Marketing Data

**Common question/task:** "Show me every place this person appears and what we
can export, retain, delete, or hold."

**Modules touched:** Employee profile, documents, marketing consent, CRM,
client portal, invoices/accounting, tickets, audit/legal hold.

**Why siloed SaaS struggles:** Personal data can appear in HR, support tickets,
marketing contacts, invoices, docs, email logs, and project comments. Retention
and legal holds may conflict.

**Unified advantage:** A single request workflow can discover linked records,
apply access and retention rules, generate export packages, block deletion under
legal hold, and audit the response.

**Product surface to show:** Privacy/legal request workbench with record map,
action eligibility, retention basis, legal holds, and export/delete tasks.

---

## Highest-Priority Mockups

The following mockups would best demonstrate the unified-product advantage:

1. New hire command center.
2. Payroll-to-GL preview and posting.
3. Billable time to invoice workbench.
4. Unified approval inbox.
5. Location/work-state change impact preview.
6. Deal-to-cash timeline.
7. Offboarding risk board.
8. Multi-state compliance matrix.
9. Campaign true-ROI dashboard.
10. AI permissioned answer card.

---

## Test-Plan Implications

Each workflow should become an integration-style spec fixture with:

- A realistic tenant, department, employee, client, project, and accounting
  setup.
- A triggering event, such as hire, transfer, payroll run, approved time,
  campaign, deal win, or client ticket escalation.
- Expected records created or updated in every affected module.
- Authorization checks for every actor that can view or mutate the workflow.
- Audit events proving who did what, when, under which tenant and source record.
- Idempotency/retry checks for generated jobs, webhooks, notifications, and
  background processing.
- Negative cases that reflect the silo failure mode: stale manager, wrong
  tenant, wrong cost center, missing document, wrong payroll period, stale
  consent, closed accounting period, hidden field leakage, duplicate webhook, or
  revoked permission.

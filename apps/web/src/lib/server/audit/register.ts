/**
 * Which writes must record an audit entry (see CLAUDE.md § Tenancy, audit and
 * disclosure). Both lists below are committed literals with reasons; `./check`
 * fails on any action in neither, so adding one forces the decision.
 */

export type AuditedOperation = {
  /** The route file, relative to `src/routes/(app)/`. */
  route: string
  /** The exported action name; "default" for a single unnamed action. */
  action: string
  /** Why it must be recorded. */
  why: string
}

export const AUDITED_OPERATIONS: AuditedOperation[] = [
  // -- Money, employment, rights: not debatable -----------------------------
  {
    route: "compensation/[employeeId]",
    action: "raise",
    why: "A pay change. The example CLAUDE.md names, and the one question an employee is most likely to ask about later.",
  },
  {
    route: "time-off",
    action: "decide",
    why: "An entitlement granted or refused, by a named approver who is not the requester.",
  },
  {
    route: "time-tracking",
    action: "decide",
    why: "Approval snapshots the billable_amount that will become an invoice line — a named approver, not the person who logged the hours, fixing what gets billed.",
  },
  {
    route: "performance",
    action: "submit",
    why: "The moment a manager's assessment becomes visible to its subject. Before it, the subject may not see it at all.",
  },
  {
    route: "performance",
    action: "acknowledge",
    why: "The employee's own record of having seen the assessment — the half that protects them, not the firm.",
  },
  {
    route: "employees/new",
    action: "default",
    why: "The start of an employment relationship, and the creation of a person's record under GDPR.",
  },
  {
    route: "employees/[id]/edit",
    action: "default",
    why: "Job title, manager, department and status are employment history. 'Who moved me under this manager, and when' is a real question.",
  },

  // -- Configuration that decides what people are PAID ----------------------
  {
    route: "settings/payroll/policies",
    action: "save",
    why: "Overtime thresholds, multipliers and rounding. If someone's overtime drops, this is the change that did it.",
  },
  {
    route: "settings/payroll/policies",
    action: "archive",
    why: "Removing a policy changes how a jurisdiction's overtime is computed from that moment on.",
  },
  {
    route: "settings/payroll/schedules",
    action: "save",
    why: "When people are paid. A moved pay date is a question somebody asks the same week.",
  },
  {
    route: "settings/payroll/schedules",
    action: "archive",
    why: "Retiring a schedule leaves the employees on it without one.",
  },
  {
    route: "settings/benefits",
    action: "savePackage",
    why: "Eligibility rules decide who is entitled to what.",
  },
  {
    route: "settings/benefits",
    action: "archivePackage",
    why: "Withdrawing a package withdraws an entitlement.",
  },
  {
    route: "settings/benefits",
    action: "saveItem",
    why: "costs_by_currency is the employer/employee split, which reaches payroll as a deduction.",
  },
  {
    route: "settings/benefits",
    action: "archiveItem",
    why: "Removing an item removes a deduction and a benefit at once.",
  },
  {
    route: "settings/locations",
    action: "save",
    why: "A location's timezone decides which DAY an attendance record belongs to (L35) and which pay period it falls in. Its locale decides how every figure there is formatted.",
  },
  {
    route: "settings/locations",
    action: "archive",
    why: "Closing an office reassigns or strands everyone assigned to it.",
  },

  // -- Recommended and accepted: compliance-adjacent ------------------------
  {
    route: "settings/holidays",
    action: "save",
    why: "A public holiday decides whether a day is paid leave, and whether working it earns a premium.",
  },
  {
    route: "settings/holidays",
    action: "archive",
    why: "Removing a holiday turns a paid day off into an ordinary working day.",
  },
  {
    route: "settings/job-titles",
    action: "saveLevel",
    why: "Levels carry salary_ranges — the PUBLISHED pay bands. Under the EU Pay Transparency Directive those are a disclosure, so changing one is a compliance act.",
  },
  {
    route: "settings/job-titles",
    action: "archiveLevel",
    why: "Retiring a level withdraws the published band that went with it.",
  },
  // -- Receivables: revenue recognised, and cash received ------------------
  {
    route: "accounting/invoices/[id]",
    action: "issue",
    why: "The moment a customer is told they owe money AND the moment revenue enters the general ledger. Both are things somebody is later asked to justify, and the journal it posts can never be deleted.",
  },
  {
    route: "accounting/invoices/[id]",
    action: "recordPayment",
    why: "Cash received against a debt. 'Who marked this paid, for how much, and when' is the question every reconciliation asks.",
  },
  {
    route: "accounting/invoices/[id]",
    action: "voidInvoice",
    why: "A document withdrawn before it was issued. Without a record, an invoice that was raised and then made to disappear leaves no trace it ever existed.",
  },
  {
    route: "accounting/receive-payment",
    action: "allocate",
    why: "Cash received against a debt, same as recordPayment — just applied across several invoices in one deposit instead of one. 'Who allocated this lockbox payment, to which invoices, and for how much' is the same reconciliation question.",
  },

  // -- Payables: the liability recognised, and cash paid out ---------------
  {
    route: "accounting/bills/[id]",
    action: "approve",
    why: "The moment a liability enters the general ledger and someone is named as having authorised it. The journal it posts can never be deleted.",
  },
  {
    route: "accounting/bills/[id]",
    action: "recordPayment",
    why: "Cash leaving the firm against a debt. 'Who paid this, how much, and when' is the question every reconciliation and every vendor dispute asks.",
  },
  {
    route: "accounting/banking",
    action: "match",
    why: "Ties a bank statement line to the firm's own records — the classic reconciliation question is who confirmed that a given deposit or withdrawal was this specific payment.",
  },

  // -- Payroll: the record of money leaving the firm -----------------------
  {
    route: "payroll/runs",
    action: "openRun",
    why: "A pay run is the record of money leaving the firm. 'Who opened this period, and for which dates' is the first question asked when two runs cover the same fortnight.",
  },
  {
    route: "payroll/runs/[id]",
    action: "calculate",
    why: "The moment the header totals become the figures a finance lead reads and reports. What the run claimed before, and what it claims now, is the whole question.",
  },
  {
    route: "payroll/runs/[id]",
    action: "approve",
    why: "The money is committed here, by a named approver who is not the person who calculated it. The clearest case in this register.",
  },
  {
    route: "payroll/runs/[id]",
    action: "finalize",
    why: "The payment file is cut from here. After this the money has left, and the trail is the only account of who authorised it.",
  },
  {
    route: "payroll/runs/[id]",
    action: "cancel",
    why: "A pay period that was opened and then abandoned. Nobody can see it did not happen without a record that it was stopped, and by whom.",
  },

  // -- Project money: what a client is eventually billed against ----------
  {
    route: "projects",
    action: "create",
    why: "budget, hourly_rate and is_billable are the terms work is billed on. 'Who set this project up as billable, and at what rate' is an invoicing question with money behind it.",
  },
  {
    route: "projects/[id]",
    action: "updateProject",
    why: "The same fields, changed. A rate edited mid-project changes every invoice raised after it, and status is what a delivery report counts as done.",
  },

  {
    route: "settings/company",
    action: "update",
    why: "Default currency, timezone and locale. Every figure in the product is formatted against these, and the timezone moves date boundaries.",
  },

  // -- Ticketing: grants that change who may READ a ticket -------------------
  {
    route: "ticketing/[id]",
    action: "saveTicket",
    why: "The unified ticket-edit form (subject/status/due date/summary/parent/comment plus assignees/subscribers/links/private in one submit). Unlike a comment or a status flip, an assignee change, a subscriber change, or flipping `private` all move who staff_ticket_visibility lets read the ticket — a rights change, recorded only when one of those actually moved (audit.diff shape), never for a save that touched none of them.",
  },
  {
    route: "settings/ticketing/[businessAreaId]",
    action: "saveMembers",
    why: "A business area's default-visible list decides who reads every non-private ticket in it — changing it is a bulk rights change.",
  },
]

/** Writes that deliberately do NOT audit, each with a reason — not "not got round to it". */
export const NOT_AUDITED: AuditedOperation[] = [
  {
    route: "settings/departments",
    action: "save",
    why: "Org structure. Politically sensitive, but renaming or re-parenting a department does not retroactively change anyone's pay or entitlement.",
  },
  {
    route: "settings/departments",
    action: "archive",
    why: "Archiving is refused while dependents exist, so it cannot orphan anyone silently.",
  },
  {
    route: "settings/job-titles",
    action: "saveTitle",
    why: "A title is a label; the LEVEL beneath it carries the money, and that is audited.",
  },
  {
    route: "settings/job-titles",
    action: "archiveTitle",
    why: "Same: the band lives on the level, not the title.",
  },
  {
    route: "projects/[id]",
    action: "addTask",
    why: "A task appearing on a board changes nobody's money, employment or rights. The row carries created_by and created_at, and audit_log can never be pruned — a line per task would bury the pay changes the trail exists to make findable.",
  },
  {
    route: "projects/[id]",
    action: "moveTask",
    why: "Board movement, and the highest-frequency write in the product. What must not go wrong here is the project's counters, and that is guarded by staleCounters() rather than by a trail nobody would read.",
  },
  {
    route: "time-tracking",
    action: "create",
    why: "Logging a draft changes nobody's money yet — no rate is billed until decide() approves it. Guarded by staleHours() rather than a trail nobody would read.",
  },
  {
    route: "accounting/invoices/new",
    action: "create",
    why: "A draft invoice changes nobody's money yet — no revenue is recognised until issue() posts the journal, and that is already audited. The row carries created_by/created_at, same reasoning as time-tracking's create.",
  },
  {
    route: "accounting/bills/new",
    action: "create",
    why: "A draft bill recognises no liability yet — nothing is owed until approve() posts the journal, and that is already audited. The row carries created_by/created_at, same reasoning as invoices/new's create.",
  },
  {
    route: "time-tracking",
    action: "submit",
    why: "The logging employee's own status flip, not a decision by anyone else. What decide() does to it is audited; this step just queues it.",
  },
  {
    route: "ticketing/new",
    action: "default",
    why: "Raising a ticket is self-service (see EVERYONE's ticketing.write.own in @kaaj/authz) — same shape as addUpdate. The ticket's own existence is the record; StatusBadge and the list page are what anyone would check.",
  },
  {
    route: "ticketing/[id]",
    action: "loadMoreUpdates",
    why: "A read, not a write — pagination for the updates feed.",
  },
  {
    route: "ticketing/[id]",
    action: "searchTickets",
    why: "A read, not a write — backs the parent/linked-ticket autocomplete pickers.",
  },
  {
    route: "ticketing/[id]",
    action: "addTask",
    why: "A checklist item appearing on a ticket changes nobody's money, employment or rights — same reasoning as projects/[id]::addTask.",
  },
  {
    route: "ticketing/[id]",
    action: "toggleTask",
    why: "Marking a checklist item done/undone, same shape as projects/[id]::moveTask — high-frequency, no trail anyone would read.",
  },
  {
    route: "ticketing/[id]",
    action: "archiveTask",
    why: "Removing a checklist item someone no longer needs — configuration of the ticket's own working list, not a rights or pay change.",
  },
  {
    route: "ticketing/[id]",
    action: "addReferenceLink",
    why: "A pasted URL appearing on a ticket changes nobody's money, employment or rights — same reasoning as addTask.",
  },
  {
    route: "ticketing/[id]",
    action: "archiveReferenceLink",
    why: "Removing a reference link someone no longer needs — same reasoning as archiveTask.",
  },
  {
    route: "settings/ticketing",
    action: "save",
    why: "A business area's name/prefix/description. Renaming it does not retroactively change who could see its tickets.",
  },
  {
    route: "settings/ticketing",
    action: "archive",
    why: "Deactivating a business area stops new tickets, same shape as settings/departments' archive.",
  },
  {
    route: "settings/ticketing/[businessAreaId]",
    action: "addCategory",
    why: "Ticket categories are Tier-1 configuration data (docs/06-customization-model.md), same shape as adding a department.",
  },
  {
    route: "settings/ticketing/[businessAreaId]",
    action: "archiveCategory",
    why: "Same: configuration, not a rights or pay change.",
  },
  {
    route: "settings/ticketing/[businessAreaId]",
    action: "addSubcategory",
    why: "Same as addCategory, one level down.",
  },
  {
    route: "settings/ticketing/[businessAreaId]",
    action: "archiveSubcategory",
    why: "Same as archiveCategory.",
  },
  {
    route: "settings/ticketing/[businessAreaId]",
    action: "addCustomField",
    why: "Tier 2 customization (docs/06-customization-model.md), same shape as addCategory — a field definition, not a value belonging to any person.",
  },
  {
    route: "settings/ticketing/[businessAreaId]",
    action: "archiveCustomField",
    why: "Same: configuration, not a rights or pay change.",
  },
  {
    route: "ticketing/[id]",
    action: "setCustomFields",
    why: "Ticket attributes (asset tag, account tier, ...) — the same category as severity/priority, which already change with no audit entry via addUpdate's status-change path.",
  },
]

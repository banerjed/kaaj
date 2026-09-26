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
    route: "accounting/invoices/[id]",
    action: "recordCredit",
    why: "Revenue reversed without cash changing hands. 'Who reduced what this customer owes, by how much, and why' is exactly the question a customer dispute or an auditor asks later.",
  },
  {
    route: "accounting/invoices/[id]",
    action: "recordWriteOff",
    why: "A receivable declared uncollectible — the business is accepting a loss, not adjusting a bill. 'Who decided this would never be collected, by how much, and why' is exactly what an auditor tests write-offs for.",
  },
  {
    route: "accounting/invoices/[id]",
    action: "emailInvoice",
    why: "A document sent outside the system, to a real customer inbox — 'was this invoice actually delivered, to whom, and when' is a collections question, not just a UI click.",
  },
  {
    route: "accounting/invoices",
    action: "sendReminders",
    why: "A message to a customer about money they owe, sent on someone's decision — the same 'who told the customer what, and when' question a dispute over a reminder (or the lack of one) would ask.",
  },
  {
    route: "accounting/receive-payment",
    action: "allocate",
    why: "Cash received against a debt, same as recordPayment — just applied across several invoices in one deposit instead of one. 'Who allocated this lockbox payment, to which invoices, and for how much' is the same reconciliation question.",
  },
  {
    route: "accounting/journal-entries/new",
    action: "create",
    why: "A manual adjustment posts directly to the general ledger with nobody's invoice or bill behind it — unlike a draft invoice/bill's create, there is no later issue()/approve() step to audit instead. 'Who adjusted the books, by how much, and why' is the first question an auditor asks about a manual entry.",
  },
  {
    route: "accounting/periods",
    action: "close",
    why: "Locks a period against further postings — 'who decided this period was done, and when' is the question a late correction request runs into.",
  },
  {
    route: "accounting/periods",
    action: "reopen",
    why: "INV-ACC-002: reopening a closed period is deliberately rarer and riskier than closing one — it lets new postings land in a period someone already treated as final. The reason field exists because 'why was this reopened' must survive independently of whoever remembers the conversation.",
  },
  {
    route: "accounting/year-end-close",
    action: "close",
    why: "Zeroes every revenue/expense account into retained earnings in one entry — the single largest posting the ledger ever makes in one action, and the one every subsequent year's opening equity depends on.",
  },
  {
    route: "accounting/tax-rates",
    action: "create",
    why: "A new tax rate changes what every invoice and bill created afterward will charge or claim — 'who configured this rate, and when' matters the first time a filed return doesn't match what was collected.",
  },
  {
    route: "accounting/tax-rates",
    action: "deactivate",
    why: "Stops a rate from being offered on new invoices/bills without deleting the history of what it was — the same reason a period is closed rather than erased.",
  },
  {
    route: "accounting/tax-rates",
    action: "activate",
    why: "Reverses a deactivation — same audit need as reopening a period: someone should be able to say why a retired rate came back.",
  },
  {
    route: "accounting/exchange-rates",
    action: "refresh",
    why: "Changes the rate every invoice/bill in a foreign currency converts against from this point on — 'who triggered this, and what did the rate move from/to' matters the first time a conversion looks wrong.",
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
    route: "accounting/bills",
    action: "payBatch",
    why: "Cash leaving the firm against several bills at once, across any number of vendors — same reconciliation need as a single vendor payment, multiplied. 'Who paid this batch, which bills, and how much' is the same question recordPayment's own entry protects.",
  },
  {
    route: "accounting/banking",
    action: "match",
    why: "Ties a bank statement line to the firm's own records — the classic reconciliation question is who confirmed that a given deposit or withdrawal was this specific payment.",
  },
  {
    route: "accounting/banking/rules",
    action: "create",
    why: "A standing rule that will silently recategorize future transactions to a chosen GL account — who set it up, and against which account, matters the same way a new payroll policy does.",
  },
  {
    route: "accounting/banking/rules",
    action: "toggle",
    why: "Deactivating a rule stops future auto-categorization the same way archiving a policy does; reactivating resumes it — both change what happens to money nobody manually reviewed.",
  },
  {
    route: "accounting/banking/rules",
    action: "apply",
    why: "Moves potentially many transactions between GL categories in one run with no per-transaction review — the batch summary (count and rule) is the record of what changed and why, the same trail matchBankTransaction keeps per-transaction.",
  },
  {
    route: "accounting/recurring-invoices",
    action: "create",
    why: "A standing arrangement that will silently bill a named customer on its own schedule — who set it up, for how much, matters the same way a new reconciliation rule does.",
  },
  {
    route: "accounting/recurring-invoices",
    action: "toggle",
    why: "Deactivating a schedule stops future billing the same way deactivating a reconciliation rule stops future auto-categorization; reactivating resumes it.",
  },
  {
    route: "accounting/recurring-invoices",
    action: "generate",
    why: "Creates potentially many draft invoices in one run with no per-invoice review before they exist — the batch summary (count and customers) is the record of what was generated and from which schedules, the same trail the reconciliation rules' apply keeps.",
  },
  {
    route: "accounting/accruals",
    action: "recordAccrual",
    why: "Posts two real journal entries immediately — money moving on the ledger, the same reasoning as the manual journal entry form's own create action.",
  },
  {
    route: "accounting/accruals",
    action: "createSchedule",
    why: "A standing arrangement that will silently post recognition entries on its own schedule — who set it up, for how much, over how many periods, matters the same way a new recurring invoice schedule does.",
  },
  {
    route: "accounting/accruals",
    action: "postDue",
    why: "Posts potentially many recognition entries in one run with no per-entry review before they exist — same trail as recurring invoices' generate and the reconciliation rules' apply.",
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
    route: "objectives",
    action: "create",
    why: "target_revenue is a figure an executive reads as a commitment. 'Who set this target, and how much' is the same shape as a project's own budget.",
  },
  {
    route: "objectives/[id]",
    action: "updateObjective",
    why: "The same figure, changed, plus status and ownership — an objective is the strategic layer projects roll up into; who moved the target or reassigned ownership is the executive-visible half of this module.",
  },
  {
    route: "objectives/[id]",
    action: "addProject",
    why: "Calls the same projects.createProject a /projects create does, which is already audited there — this route's own action is a second call site of the same consequential write, so it is registered here too rather than relying on the other route's entry to cover it.",
  },

  {
    route: "settings/company",
    action: "update",
    why: "Default currency, timezone and locale. Every figure in the product is formatted against these, and the timezone moves date boundaries.",
  },
  {
    route: "settings/company",
    action: "uploadLogo",
    why: "Company branding rendered on customer-facing documents (invoice PDFs) — who set the firm's public identity, and when.",
  },
  {
    route: "settings/company",
    action: "removeLogo",
    why: "The same branding, cleared — an invoice PDF generated afterward silently loses the logo, worth being able to explain.",
  },

  {
    route: "accounting/payment-gateway",
    action: "save",
    why: "Whoever's Stripe account customer payments now flow into — a credential change with real money behind it.",
  },
  {
    route: "accounting/payment-gateway",
    action: "disconnect",
    why: "Invoices issued afterward silently carry no payment link — worth being able to explain why one stopped appearing.",
  },
  {
    route: "accounting/invoices/[id]",
    action: "createPaymentLink",
    why: "Adds a real Stripe Payment Link to a specific invoice after the fact — the same commercial-terms change `issue`'s own payment_url write already gets audited for.",
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

  // -- Documents: grants that change who may READ a folder's contents --------
  {
    route: "documents/[folderId]",
    action: "setVisibility",
    why: "Flipping private/shared/company changes who staff_folder_visibility lets read every file under this folder — a rights change, recorded only when it actually moved.",
  },
  {
    route: "documents/[folderId]",
    action: "share",
    why: "Grants a named person or role read (or edit) access to a shared folder's contents — the folder-level ACL 18§2 describes.",
  },
  {
    route: "documents/[folderId]",
    action: "unshare",
    why: "Revokes access previously granted — the other half of `share`.",
  },

  // -- Team chat: rights changes someone may later ask "why" about (20§9) ----
  {
    route: "chat/[conversationId]",
    action: "archive",
    why: "Archiving a channel ends everyone's access to it — 'why did I lose access to that channel' is the same bar CLAUDE.md already applies to role grants and approvals.",
  },
  {
    route: "chat/[conversationId]",
    action: "removeMember",
    why: "Removing someone from a private channel is a rights change only an owner can make and only re-adding can undo — audited uniformly (public-channel removal is reversible self-service either way, but one action, one classification).",
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
    route: "projects/[id]",
    action: "addDependency",
    why: "A same-project ordering relationship between two tasks changes nobody's money, employment or rights — same reasoning as addTask. Guarded by the cycle check and refreshDependencyIndex rather than a trail.",
  },
  {
    route: "projects/[id]",
    action: "removeDependency",
    why: "The inverse of addDependency, same reasoning.",
  },
  {
    route: "projects/[id]",
    action: "addComment",
    why: "A note on a task changes nobody's money, employment or rights — same reasoning as addTask. Soft-deletable (deleted_at), not permanent the way audit_log is.",
  },
  {
    route: "projects/[id]",
    action: "editComment",
    why: "Same as addComment — editing one's own note.",
  },
  {
    route: "projects/[id]",
    action: "deleteComment",
    why: "Same as addComment — the tombstone (deleted_at) already records that it happened.",
  },
  {
    route: "projects/[id]",
    action: "uploadTaskFile",
    why: "Self-service (document.write is in EVERYONE) — same shape as documents/upload. Filing a file against a task whose visibility (every employee, same as the task itself) is unchanged by the upload.",
  },
  {
    route: "projects/[id]",
    action: "saveAsTemplate",
    why: "A reusable shape (task names, priorities, estimated hours), not a financial or employment commitment — the real project's own budget/hours are what's binding, and those are already audited via updateProject.",
  },
  {
    route: "projects/[id]",
    action: "setTaskCustomFields",
    why: "Tier 2 customization (docs/06-customization-model.md) — a descriptive attribute on a task, not a rights or pay change. The financial-calculation boundary (custom fields never feed real calculations) is precisely what keeps even a money-typed custom field out of needing a trail here.",
  },
  {
    route: "projects/[id]",
    action: "setProjectCustomFields",
    why: "Same as setTaskCustomFields, one level up.",
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
    action: "peopleOptions",
    why: "A read, not a write — backs the assignee/subscriber Combobox's options, fetched only once editing starts.",
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
    route: "settings/project-management",
    action: "addField",
    why: "Tier 2 customization (docs/06-customization-model.md), same shape as ticketing's own addCustomField — a field definition, not a value belonging to any person.",
  },
  {
    route: "settings/project-management",
    action: "archiveField",
    why: "Same: configuration, not a rights or pay change.",
  },
  {
    route: "ticketing/[id]",
    action: "setCustomFields",
    why: "Ticket attributes (asset tag, account tier, ...) — the same category as severity/priority, which already change with no audit entry via addUpdate's status-change path.",
  },
  {
    route: "accounting/ledger",
    action: "checkBalance",
    why: "A read, not a write — the full-ledger integrity scan moved out of load() so it runs on demand instead of on every page view; it changes no row.",
  },

  // -- Documents: self-service organization, no rights or money change --------
  {
    route: "documents",
    action: "createFolder",
    why: "Self-service (document.write is in EVERYONE) — same shape as ticketing/new. A private folder starts visible only to its own creator, so creating one changes nothing about who reads anyone else's data.",
  },
  {
    route: "documents",
    action: "upload",
    why: "Self-service — filing a document into a folder whose visibility (and therefore its readers) is unchanged by the upload itself.",
  },
  {
    route: "documents/[folderId]",
    action: "createFolder",
    why: "Same as documents/createFolder, one level down.",
  },
  {
    route: "documents/[folderId]",
    action: "upload",
    why: "Same as documents/upload.",
  },
  {
    route: "documents/[folderId]",
    action: "rename",
    why: "A label, not a rights or money change — staff_folder_visibility doesn't key on name.",
  },
  {
    route: "documents/[folderId]",
    action: "archive",
    why: "Reversible lifecycle state, same shape as a ticket status transition — visibility (and so who can still see it in the Archived view) is unchanged.",
  },
  {
    route: "documents/[folderId]",
    action: "archiveDocument",
    why: "Same as archive, for one file rather than a folder.",
  },
  {
    route: "documents/archived",
    action: "restoreFolder",
    why: "The reverse of archive — same reasoning.",
  },
  {
    route: "documents/archived",
    action: "restoreDocument",
    why: "The reverse of archiveDocument — same reasoning.",
  },

  // -- Team chat: high-volume, non-transactional, not a business record (20§9) --
  {
    route: "chat",
    action: "createChannel",
    why: "Self-service (team_chat.write is in EVERYONE) — same shape as ticketing/new. A channel starts with its creator as the only member, so creating one changes nothing about who reads anyone else's data.",
  },
  {
    route: "chat",
    action: "startDm",
    why: "Self-service — starting a DM only ever adds the people already named as its fixed participants (20§10.3).",
  },
  {
    route: "chat",
    action: "joinChannel",
    why: "Self-service join to a PUBLIC channel — symmetric with leave, below.",
  },
  {
    route: "chat/[conversationId]",
    action: "send",
    why: "Sending a message — 20§9's own reasoning: high-volume, non-transactional communication, not a business record requiring a justification trail.",
  },
  {
    route: "chat/[conversationId]",
    action: "edit",
    why: "Same as send — editing one's own message.",
  },
  {
    route: "chat/[conversationId]",
    action: "delete",
    why: "Same as send — the tombstone (deleted_at) already records that it happened; nobody needs a second trail for it.",
  },
  {
    route: "chat/[conversationId]",
    action: "loadMore",
    why: "A read, not a write — keyset pagination for the message history (same shape as ticketing/[id]::loadMoreUpdates).",
  },
  {
    route: "chat/[conversationId]",
    action: "markRead",
    why: "The viewer's own read cursor (last_read_at) — private per-viewer state, not a business record.",
  },
  {
    route: "chat/[conversationId]",
    action: "leave",
    why: "Self-service — leaving a conversation removes only the leaver's own access to something they already had.",
  },
  {
    route: "chat/[conversationId]",
    action: "addMember",
    why: "Self-service-shaped invite (symmetric with joinChannel) — the coarse permission plus RLS already gate who may call it; the row it creates is the record.",
  },
]

#!/usr/bin/env node
/**
 * Every table is classified as SCALE_SENSITIVE or NOT_SCALE_SENSITIVE, with a
 * reason — a new migration's table fails this until someone decides which.
 *
 * The distinction: SCALE_SENSITIVE tables accumulate roughly one row per
 * business EVENT that keeps happening for as long as the tenant is a
 * customer — a ticket, a journal entry, a clock-in, an audit entry — with no
 * natural ceiling tied to the size of the organization. NOT_SCALE_SENSITIVE
 * tables are dimensions: one row per employee, per customer, per policy, per
 * configuration choice — the count is bounded by *headcount* or *setup*, not
 * by how long the tenant has been using the product. A ten-person firm using
 * Kaaj for ten years has ten rows of `employees`, however many rows of
 * `ticketing_tickets`.
 *
 * This register is a starting point, not a finished audit: it classifies the
 * schema as it exists today, and this check exists specifically so the NEXT
 * table doesn't get to skip the question. When a classification looks wrong,
 * or a NOT_SCALE_SENSITIVE table's queries later turn out to matter at scale
 * after all, move it — a reviewed edit, not a silent drift.
 *
 * Every table also gets a WHY-BOUNDED line for the not-sensitive side —
 * "small, admin-authored config" and "bounded by employee count" are
 * different claims, and a table that turns out to be neither should not have
 * been easy to wave through with a generic reason.
 */
import { readFileSync } from "node:fs"

const ROOT = new URL("..", import.meta.url).pathname
const SNAPSHOT = "packages/database/snapshot/00-tables.txt"

/**
 * Accumulates without bound as the tenant keeps using the product — one row
 * per event, not per dimension. These are the tables a query harness needs
 * to worry about: a WHERE/JOIN/ORDER BY on one of these without a supporting
 * index is fine on a demo fixture and slow within a year of real use.
 */
const SCALE_SENSITIVE = new Map([
  ["audit_log", "append-only audit trail of every write; never pruned"],
  ["documents", "one row per file uploaded, indefinitely (18§7 says so explicitly)"],
  ["bank_transactions", "one row per bank feed transaction, continuous"],
  ["bill_lines", "line items on vendor bills; grows with billing volume"],
  ["bills", "one row per vendor bill; grows with billing volume"],
  ["expenses", "one row per expense claim submitted"],
  ["hr_attendance", "one row per employee per attendance record, daily"],
  ["hr_change_requests", "one row per HR change request submitted"],
  ["hr_employee_documents", "one row per document uploaded, ongoing"],
  ["hr_feedback", "one row per feedback item given"],
  ["hr_goals", "recurs every review cycle per employee, indefinitely"],
  ["hr_onboarding_tasks", "one row per onboarding task instance per hire"],
  ["hr_reviews", "one row per performance review conducted, every cycle"],
  ["hr_survey_responses", "one row per response submitted"],
  ["hr_time_off_requests", "one row per time-off request filed"],
  [
    "invoice_credits",
    "one row per credit memo issued; grows with billing volume",
  ],
  ["invoice_lines", "line items on invoices; grows with billing volume"],
  ["invoices", "one row per customer invoice; grows with billing volume"],
  ["jobs", "one row per background job enqueued"],
  ["journal_entries", "one row per GL posting; grows with accounting activity"],
  ["journal_entry_lines", "grows with journal entries times lines per entry"],
  ["payment_allocations", "grows with payments applied to invoices/bills"],
  ["payments", "one row per payment recorded"],
  ["custom_field_values", "grows with projects+tasks times custom fields defined, over time"],
  ["pm_automation_executions", "one row per automation run"],
  ["pm_task_attachments", "grows with tasks times attachments over time"],
  ["pm_task_comments", "grows with tasks times comments over time"],
  ["tasks", "one row per PM task created, across every project, ever"],
  ["ticketing_attachments", "grows with tickets times attachments"],
  ["ticketing_ticket_reference_links", "grows with tickets times links"],
  ["ticketing_ticket_tasks", "grows with tickets times checklist items"],
  ["ticketing_tickets", "one row per ticket logged, indefinitely"],
  ["ticketing_updates", "one row per update posted to a ticket"],
  ["team_chat_messages", "one row per message sent, indefinitely (20§7 says so explicitly)"],
  ["time_tracking_billable_expenses", "grows with time entries logged"],
  ["time_tracking_entries", "one row per time entry logged, potentially daily"],
])

/**
 * Bounded by the organization's own size or configuration, not by elapsed
 * usage. Each reason names WHAT it's bounded by — "small, admin-authored
 * config" and "bounded by employee count" are different claims about why a
 * table stays small, and a generic reason should not be enough to pass.
 */
const NOT_SCALE_SENSITIVE = new Map([
  ["accounting_periods", "one row per fiscal period; a handful per year"],
  [
    "document_folders",
    "bounded by how the org organizes its own files, not by upload volume — the UI nudges toward 2-3 levels (18§6)",
  ],
  [
    "document_folder_shares",
    "bounded by folder count times grantees per folder; a handful per shared folder",
  ],
  [
    "team_chat_conversations",
    "bounded by team size times topics created, not by messages sent (20§7)",
  ],
  [
    "team_chat_members",
    "bounded by team size times conversations joined, not by messages sent (20§7)",
  ],
  ["bank_accounts", "one row per bank account on file; small, admin-authored"],
  ["bank_reconciliation_rules", "small, admin-authored config"],
  ["chart_of_accounts", "one row per GL account; small, admin-authored"],
  [
    "clients",
    "the tenant's own client roster; bounded by market size, not usage",
  ],
  [
    "compensation_allowances",
    "bounded by employee count times active allowances",
  ],
  ["compensation_base", "bounded by employee count times comp revisions"],
  ["compensation_equity", "bounded by employee count times grants"],
  ["compensation_premiums", "bounded by employee count times premium types"],
  ["compensation_variable", "bounded by employee count times pay cycles"],
  ["compensation_work_schedules", "bounded by employee count"],
  ["cross_module_links", "bounded by how many records get cross-linked; small"],
  ["custom_field_definitions", "small, admin-authored config"],
  ["customer_contacts", "bounded by customer count times contacts each"],
  ["customers", "the tenant's own customer roster; bounded by market size"],
  ["employee_assets", "bounded by employee count times assets issued"],
  ["employee_bank_accounts", "bounded by employee count"],
  ["employee_certifications", "bounded by employee count times certifications"],
  ["employee_group_members", "bounded by employee count"],
  ["employee_group_roles", "small, admin-authored config"],
  ["employee_training_records", "bounded by employee count times trainings"],
  ["employee_user_groups", "small, admin-authored config"],
  ["employees", "bounded by headcount"],
  ["employment_terms", "bounded by employee count times term revisions"],
  ["exchange_rates", "one row per currency pair per day; small currency set"],
  ["firm_benefit_items", "small, admin-authored config"],
  ["firm_benefits_packages", "small, admin-authored config"],
  ["firm_benefits_plans", "small, admin-authored config"],
  ["firm_departments", "small, admin-authored config"],
  ["firm_holidays", "one row per holiday per location per year; small"],
  ["firm_job_levels", "small, admin-authored config"],
  ["firm_job_titles", "small, admin-authored config"],
  ["firm_locations", "small, admin-authored config"],
  ["firm_payroll_policies", "small, admin-authored config"],
  ["hr_benefits_enrollments", "bounded by employee count times benefit plans"],
  [
    "hr_company_news",
    "admin-authored posts; not a per-employee or per-event log",
  ],
  ["hr_emergency_contacts", "bounded by employee count"],
  [
    "hr_employment_history",
    "bounded by employee count times changes over tenure",
  ],
  [
    "hr_onboarding_template_tasks",
    "template definition; small, admin-authored",
  ],
  ["hr_onboarding_templates", "small, admin-authored config"],
  ["hr_review_cycles", "one row per review period defined; small"],
  ["hr_surveys", "admin-authored survey definitions; small"],
  [
    "hr_time_off_balances",
    "bounded by employee count times policies times years",
  ],
  ["hr_time_off_policies", "small, admin-authored config"],
  ["payroll_deduction_definitions", "small, admin-authored config"],
  ["payroll_employee_deductions", "bounded by employee count times deductions"],
  ["payroll_india_salary_structure", "bounded by employee count"],
  [
    "payroll_india_tax_declarations",
    "bounded by employee count times tax years",
  ],
  ["payroll_pay_schedules", "small, admin-authored config"],
  [
    "payroll_run_employees",
    "bounded by employee count times pay periods elapsed",
  ],
  ["payroll_runs", "bounded by pay periods elapsed; monthly at most"],
  ["payroll_tax_deposits", "bounded by pay periods elapsed"],
  ["payroll_tax_rates", "small, admin-authored config"],
  [
    "payroll_tax_withholding_certificates",
    "bounded by employee count times tax years",
  ],
  ["pii_erasures", "one row per erasure request; rare by construction"],
  ["pii_keys", "bounded by employee count (per-employee encryption key)"],
  ["pm_automations", "automation definitions; small, admin-authored config"],
  ["pm_dashboard_widgets", "bounded by dashboards times widgets; small"],
  ["pm_dashboards", "admin/user-authored; small"],
  ["pm_objectives", "bounded by teams/cycles; small relative to tasks"],
  ["pm_project_templates", "small, admin-authored config"],
  [
    "projects",
    "bounded by how many projects exist, not by activity within them",
  ],
  [
    "recurring_schedules",
    "one row per active subscription-billing arrangement; bounded by customer count",
  ],
  [
    "payment_gateway_settings",
    "at most one row per tenant, bounded by tenant count",
  ],
  [
    "amortization_schedules",
    "one row per deferred-revenue/prepaid arrangement; bounded by how many the tenant runs at once",
  ],
  ["tax_rates", "small, admin-authored config"],
  ["tenant_registry", "one row per tenant, in the control plane"],
  ["tenant_settings", "one row per tenant setting; small, admin-authored"],
  ["tenant_users", "bounded by headcount"],
  ["tenants", "one row per tenant, in the control plane"],
  ["ticketing_business_area_members", "bounded by employee count times areas"],
  ["ticketing_business_areas", "small, admin-authored config"],
  ["ticketing_categories", "small, admin-authored config"],
  ["ticketing_subcategories", "small, admin-authored config"],
  [
    "ticketing_ticket_assignees",
    "grows with tickets, but a handful per ticket",
  ],
  ["ticketing_ticket_links", "grows with tickets, but a handful per ticket"],
  [
    "ticketing_ticket_subscribers",
    "grows with tickets, but a handful per ticket",
  ],
  [
    "time_tracking_hourly_rates",
    "bounded by employee count times rate revisions",
  ],
  [
    "time_tracking_timesheets",
    "bounded by employee count times pay periods elapsed",
  ],
  [
    "translations",
    "bounded by locale count times translatable strings; config",
  ],
  ["vendors", "the tenant's own vendor roster; bounded by market size"],
])

/** Every base table Postgres actually has, from the committed snapshot — not a hand-maintained list, so a new migration's table can't be missed by forgetting to add it here too. */
function schemaTables() {
  const src = readFileSync(join(ROOT, SNAPSHOT), "utf8")
  return src
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("\t")[0])
}
function join(...parts) {
  return parts.join("/").replace(/\/+/g, "/")
}

const tables = schemaTables()
const scaleSensitive = new Set(SCALE_SENSITIVE.keys())
const notScaleSensitive = new Set(NOT_SCALE_SENSITIVE.keys())

const problems = []
for (const t of tables) {
  const inSensitive = scaleSensitive.has(t)
  const inNotSensitive = notScaleSensitive.has(t)
  if (inSensitive && inNotSensitive) {
    problems.push(
      `${t}: listed in BOTH SCALE_SENSITIVE and NOT_SCALE_SENSITIVE`,
    )
  } else if (!inSensitive && !inNotSensitive) {
    problems.push(
      `${t}: not classified — add it to SCALE_SENSITIVE or NOT_SCALE_SENSITIVE`,
    )
  }
}
const known = new Set(tables)
for (const t of scaleSensitive) {
  if (!known.has(t))
    problems.push(
      `${t}: in SCALE_SENSITIVE but no such table (renamed or dropped?)`,
    )
}
for (const t of notScaleSensitive) {
  if (!known.has(t))
    problems.push(
      `${t}: in NOT_SCALE_SENSITIVE but no such table (renamed or dropped?)`,
    )
}

if (problems.length) {
  console.error(`\n  ${problems.length} table classification problem(s):\n`)
  for (const p of problems) console.error(`    ${p}`)
  console.error(
    "\n  Every table in packages/database/snapshot/00-tables.txt must appear in" +
      "\n  exactly one of SCALE_SENSITIVE / NOT_SCALE_SENSITIVE in" +
      "\n  scripts/verify-query-scale.mjs, with a reason.\n",
  )
  process.exit(1)
}
console.log(
  `  every table classified (${SCALE_SENSITIVE.size} scale-sensitive, ${NOT_SCALE_SENSITIVE.size} not)`,
)

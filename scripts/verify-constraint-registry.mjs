#!/usr/bin/env node
/**
 * Every constraint a form can trip has a registered message (constraints.ts),
 * so a UNIQUE/CHECK/FK violation is a field error, not an uncaught 500 (L66).
 * A new constraint on a form-written table fails here until registered. Does
 * not verify the wording, only that a decision was made.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const ROOT = new URL("..", import.meta.url).pathname
const REGISTRY = "apps/web/src/lib/server/db/constraints.ts"

/** Tables a form action writes to. A committed list, not a NOT IN pattern that would silently absorb new cases. */
const FORM_WRITTEN = [
  "employees",
  "firm_locations",
  "firm_departments",
  "firm_holidays",
  "firm_job_titles",
  "firm_job_levels",
  "firm_benefits_packages",
  "firm_benefit_items",
  "firm_payroll_policies",
  "payroll_pay_schedules",
  "tenants",
  "projects",
  "projects_tasks",
  "hr_time_off_requests",
  "hr_time_off_balances",
  "hr_reviews",
  "payroll_runs",
  "payroll_run_employees",
  "compensation_base",
  "invoices",
  "invoice_lines",
  "payments",
  "bills",
  "bill_lines",
  "tax_rates",
  "recurring_schedules",
  "amortization_schedules",
  "documents",
  "document_folders",
  "document_folder_shares",
  "team_chat_conversations",
  "team_chat_members",
  "team_chat_messages",
]

/**
 * Constraints on those tables that a form cannot trip, each with a reason.
 *
 * Removing a justified exemption fails too — both directions need a reviewed
 * edit, which is the point.
 */
const CANNOT_BE_TRIPPED = new Map([
  // `tenant_id` is set by the server from the session, never from the request,
  // so the FK to `tenants` cannot fail on user input.
  [
    "employees_tenant_id_fkey",
    "tenant_id comes from the session, not the form",
  ],
  ["firm_locations_tenant_id_fkey", "tenant_id comes from the session"],
  ["firm_departments_tenant_id_fkey", "tenant_id comes from the session"],
  ["firm_holidays_tenant_id_fkey", "tenant_id comes from the session"],
  ["firm_job_titles_tenant_id_fkey", "tenant_id comes from the session"],
  ["firm_job_levels_tenant_id_fkey", "tenant_id comes from the session"],
  ["firm_benefits_packages_tenant_id_fkey", "tenant_id comes from the session"],
  ["firm_benefit_items_tenant_id_fkey", "tenant_id comes from the session"],
  ["firm_payroll_policies_tenant_id_fkey", "tenant_id comes from the session"],
  ["payroll_pay_schedules_tenant_id_fkey", "tenant_id comes from the session"],
  ["projects_tenant_id_fkey", "tenant_id comes from the session"],

  ["hr_reviews_tenant_id_fkey", "tenant_id comes from the session"],
  ["hr_time_off_requests_tenant_id_fkey", "tenant_id comes from the session"],
  ["hr_time_off_balances_tenant_id_fkey", "tenant_id comes from the session"],
  ["payroll_runs_tenant_id_fkey", "tenant_id comes from the session"],
  ["payroll_run_employees_tenant_id_fkey", "tenant_id comes from the session"],
  ["compensation_base_tenant_id_fkey", "tenant_id comes from the session"],
  ["invoices_tenant_id_fkey", "tenant_id comes from the session"],
  ["payments_tenant_id_fkey", "tenant_id comes from the session"],
  ["bills_tenant_id_fkey", "tenant_id comes from the session"],
  ["bill_lines_tenant_id_fkey", "tenant_id comes from the session"],
  ["tax_rates_tenant_id_fkey", "tenant_id comes from the session"],
  ["recurring_schedules_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "fk_invoices_recurring_schedule_id",
    "set only by generateDueInvoices from a schedule id it just read from the database, never from form input — and schedules are only ever deactivated, never deleted, so the row it points at cannot disappear",
  ],
  ["amortization_schedules_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "tax_rates_rate_check",
    "FormReader's decimal(rate, { min: 0 }) already refuses a negative rate before this is reached",
  ],
  [
    "recurring_schedules_anchor_day_check",
    "anchor_day is never a form field — createRecurringSchedule derives it in SQL with extract(day FROM nextRunDate::date), which can only ever produce 1-31",
  ],
  [
    "amortization_schedules_anchor_day_check",
    "anchor_day is never a form field — createAmortizationSchedule derives it in SQL with extract(day FROM nextRunDate::date), which can only ever produce 1-31",
  ],
  [
    "tax_rates_tax_collected_account_id_fkey",
    "never set by the create form — both account links are configured elsewhere (fixture-seeded today), not by this action",
  ],
  [
    "tax_rates_tax_paid_account_id_fkey",
    "never set by the create form — both account links are configured elsewhere (fixture-seeded today), not by this action",
  ],

  // Answered by the repository, ahead of the constraint, with a domain error.
  [
    "idx_projects_number",
    "projects.repo raises ProjectWriteRefused for this one",
  ],
  ["payroll_runs_status_is_known", "payroll_runs.repo: requireTransition"],
  ["payroll_runs_status_columns_agree", "payroll_runs.repo: requireTransition"],
  ["payroll_runs_stages_have_timestamps", "payroll_runs.repo sets both"],
  [
    "payroll_runs_calculator_is_not_approver",
    "payroll_runs.repo: RunRefused('self_approval') fires first, and covers the NULL case the CHECK misses",
  ],
  [
    "payroll_runs_tenant_id_run_id_key",
    "payroll_runs.repo: RunRefused('number_taken')",
  ],
  [
    "hr_reviews_status_is_known",
    "hr_reviews.repo: ReviewRefused('wrong_status')",
  ],
  [
    "hr_reviews_acknowledged_has_an_assessment",
    "hr_reviews.repo refuses an acknowledgement with no assessment",
  ],

  // Values no form supplies: the server generates the identifier, or the row
  // is written by a calculation rather than by a person filling in fields.
  ["hr_reviews_tenant_id_review_id_key", "review_id is generated, not posted"],
  [
    "hr_time_off_requests_tenant_id_request_id_key",
    "request_id is generated; the only action here decides an existing request",
  ],
  [
    "hr_time_off_balances_tenant_id_employee_id_policy_id_accrua_key",
    "balances are moved by the decision, never keyed from a form",
  ],
  [
    "hr_time_off_balances_unit_check",
    "the unit comes from the policy, not the form",
  ],
  [
    "payroll_run_employees_tenant_id_run_employee_id_key",
    "written by the calculation, not by a form",
  ],
  [
    "fk_payroll_run_employees_payroll_run_id",
    "written by the calculation, from the run it belongs to",
  ],
  [
    "fk_payroll_run_employees_employee_id",
    "written by the calculation, from the roster",
  ],
  ["idx_invoices_number", "invoice numbers are generated"],
  ["idx_payments_number", "payment numbers are generated"],
  ["fk_invoices_journal_entry_id", "set by posting, not by a form"],
  ["fk_payments_journal_entry_id", "set by posting, not by a form"],
  ["fk_payments_customer_id", "copied from the invoice, not posted"],
  ["fk_payments_vendor_id", "copied from the bill, not posted"],
  [
    "ck_invoices_amounts_reconcile",
    "the repository recomputes the totals it checks; no form writes them",
  ],
  [
    "ck_bills_amounts_reconcile",
    "the repository recomputes the totals it checks; no form writes them",
  ],
  [
    "fk_bills_journal_entry_id",
    "set by approveBill's posting step, not by a form",
  ],
  [
    "fk_bill_lines_bill_id",
    "bill_id comes from the bill createBill just inserted, not the form",
  ],
  ["invoice_lines_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "fk_invoice_lines_invoice_id",
    "invoice_id comes from the invoice createInvoice just inserted, not the form",
  ],
  [
    "fk_invoice_lines_revenue_account_id",
    "always the fixed Consulting Revenue account (ACCOUNTS.revenue), never set by the form",
  ],

  // ---- Documents (docs/18-document-management.md) ------------------------
  ["documents_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "documents_visibility_check",
    "the staff upload path hardcodes visibility to 'internal'; it is never read from the form",
  ],
  [
    "documents_uploader_check",
    "uploaded_by_employee_id is set from the authenticated actor, never form input, and uploaded_by_contact_id is never set by this (staff-only) slice",
  ],
  [
    "documents_uploaded_by_contact_id_fkey",
    "never set by the staff upload path — only uploaded_by_employee_id is set",
  ],
  [
    "documents_customer_id_fkey",
    "never set by the staff upload path in this slice",
  ],
  [
    "documents_folder_id_fkey",
    "upload.ts resolves and permission-checks the folder via documents.repo.folderPermission before this insert runs — DocumentsRefused fires first",
  ],
  ["document_folders_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "document_folders_parent_folder_id_fkey",
    "documents.repo.createFolder already resolves the parent via folder() (RLS-gated) and throws DocumentsRefused before this insert runs",
  ],
  [
    "document_folders_owner_employee_id_fkey",
    "set from the authenticated actor, never form input",
  ],
  [
    "document_folders_visibility_check",
    "FormReader's choice(visibility, FOLDER_VISIBILITIES, { fallback: 'private' }) already refuses anything off the list",
  ],
  [
    "document_folder_shares_tenant_id_fkey",
    "tenant_id comes from the session",
  ],
  [
    "document_folder_shares_folder_id_fkey",
    "the share/unshare actions already resolve the folder via requireFolderPermission before this insert runs",
  ],
  [
    "document_folder_shares_target_check",
    "documents.repo.shareFolder checks exactly-one-of-employee-or-role before this insert runs, throwing DocumentsRefused first",
  ],
  [
    "document_folder_shares_permission_check",
    "FormReader's choice(permission, SHARE_PERMISSIONS, { required: true }) already refuses anything off the list",
  ],
  [
    "document_folder_shares_granted_by_fkey",
    "set from the authenticated actor, never form input",
  ],
  [
    "document_folder_shares_unique_share",
    "documents.repo.shareFolder selects the existing grant and UPDATEs it rather than inserting a duplicate, so a normal request never reaches this constraint",
  ],

  // Team chat (docs/20-team-chat.md).
  ["team_chat_conversations_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "team_chat_conversations_created_by_employee_id_fkey",
    "set from the authenticated actor, never form input",
  ],
  [
    "team_chat_conversations_kind_check",
    "kind is hardcoded per action (createChannel/findOrCreateDm), never form input",
  ],
  [
    "team_chat_conversations_visibility_check",
    "FormReader's choice() already restricts to public/private before this is reached",
  ],
  [
    "team_chat_conversations_check",
    "name/visibility come from FormReader before this is reached, and kind is hardcoded per action — the combination this CHECK guards can't be assembled from form input",
  ],
  ["team_chat_members_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "team_chat_members_role_check",
    "role is hardcoded by the action (owner at creation, member otherwise), never form input",
  ],
  [
    "team_chat_members_tenant_id_conversation_id_employee_id_key",
    "team-chat.repo's upsertMembership (joinPublicChannel/addMember) catches this in JS and falls back to an UPDATE — deliberately NOT ON CONFLICT DO UPDATE, which trips team_chat_member_visibility even with no RETURNING (L93)",
  ],
  [
    "idx_team_chat_dm_key",
    "team-chat.repo.findOrCreateDm uses ON CONFLICT ... DO NOTHING and re-selects, so a normal request never reaches this constraint",
  ],
  ["team_chat_messages_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "team_chat_messages_author_employee_id_fkey",
    "set from the authenticated actor, never form input",
  ],
])

const url = process.env.DATABASE_URL
if (!url) {
  console.error("  DATABASE_URL is not set")
  process.exit(1)
}

// Table constraints, plus the partial UNIQUE INDEXes — a unique index
// violation reports the INDEX name, and `idx_firm_locations_hq` is how "one
// headquarters per firm" is enforced.
const sql = `
SELECT c.conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
 WHERE n.nspname = 'public' AND c.contype IN ('u','c','f')
   AND t.relname IN (${FORM_WRITTEN.map((t) => `'${t}'`).join(",")})
UNION
SELECT i.relname
  FROM pg_index x
  JOIN pg_class i ON i.oid = x.indexrelid
  JOIN pg_class t ON t.oid = x.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
 WHERE n.nspname = 'public' AND x.indisunique AND NOT x.indisprimary
   AND t.relname IN (${FORM_WRITTEN.map((t) => `'${t}'`).join(",")})`

const inDatabase = execFileSync("psql", [url, "-X", "-tA", "-c", sql], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean)
  // A `NOT NULL` is reported as a check constraint on some versions and is not
  // something a form can be told about beyond "this field is required", which
  // FormReader already does.
  .filter((name) => !name.endsWith("_not_null"))

const src = readFileSync(ROOT + REGISTRY, "utf8")
const registered = new Set(
  [...src.matchAll(/^\s{2}([a-z_][a-z0-9_]*):\s*\{/gm)].map((m) => m[1]),
)

const unregistered = inDatabase.filter(
  (name) => !registered.has(name) && !CANNOT_BE_TRIPPED.has(name),
)

// A registry entry naming a constraint that no longer exists is dead prose
// that will outlive whoever can explain it.
const stale = [...registered].filter((name) => !inDatabase.includes(name))

if (unregistered.length || stale.length) {
  if (unregistered.length) {
    console.error(
      `\n  ${unregistered.length} constraint(s) a form can trip with no message:\n`,
    )
    for (const c of unregistered) console.error(`    ${c}`)
    console.error(
      '\n  Uncaught, each of these is an "Internal Error" page with the form\'s' +
        "\n  contents gone. Add it to REGISTRY in" +
        `\n  ${REGISTRY} with a sentence a person can act on,` +
        "\n  or to CANNOT_BE_TRIPPED in this file with a reason.\n",
    )
  }
  if (stale.length) {
    console.error(
      `\n  ${stale.length} registered constraint(s) do not exist:\n`,
    )
    for (const c of stale) console.error(`    ${c}`)
    console.error("\n  Remove them, or correct the name.\n")
  }
  process.exit(1)
}

console.log(
  `  ${registered.size} form-reachable constraints all answer with a sentence`,
)

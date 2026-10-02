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
  "payroll_export_settings",
  "payroll_export_codes",
  "payroll_employee_ids",
  "tenants",
  "projects",
  "tasks",
  "hr_time_off_requests",
  "hr_time_off_balances",
  "hr_reviews",
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
  "pm_task_comments",
  "pm_project_templates",
  "custom_field_definitions",
  "custom_field_values",
  // Bank statement import (accounting/banking/import).
  "bank_statement_imports",
  "bank_transactions",
  "bank_accounts",
  "ticketing_tickets",
  // CRM: the client list's save, and the person-account path that writes a
  // customers row and its contact together.
  "customers",
  "customer_contacts",
  // Messaging (docs/38-messaging.md): endpoints and opt-outs from
  // /settings/messaging; conversations and messages from compose/reply.
  "messaging_endpoints",
  "messaging_opt_outs",
  "messaging_conversations",
  "messaging_messages",
]

/**
 * Constraints on those tables that a form cannot trip, each with a reason.
 *
 * Removing a justified exemption fails too — both directions need a reviewed
 * edit, which is the point.
 */
const CANNOT_BE_TRIPPED = new Map([
  // Ticketing — every feature that uses tickets as a backing store writes
  // through createTicket/updateTicketCore, which check first.
  ["ticketing_tickets_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "fk_ticketing_tickets_business_area_id",
    "createTicket takes the area's ticket number first, which refuses an unknown area",
  ],
  [
    "fk_ticketing_tickets_category_in_area",
    "createTicket refuses a category outside the area (no_such_category) before inserting",
  ],
  [
    "fk_ticketing_tickets_subcategory_in_category",
    "createTicket refuses a subcategory outside the category (no_such_subcategory) before inserting",
  ],
  [
    "ticketing_tickets_customer_id_fkey",
    "set from the portal session's customer, never form input",
  ],
  [
    "ticketing_tickets_logger_contact_id_fkey",
    "set from the portal session's contact, never form input",
  ],
  [
    "ticketing_tickets_parent_ticket_id_fkey",
    "parentWouldBeInvalid refuses a parent that does not exist before the update",
  ],
  [
    "ck_ticketing_tickets_one_logger",
    "createTicket sets exactly one of logger_employee_id/logger_contact_id from the session",
  ],
  [
    "ticketing_tickets_tenant_id_ticket_number_key",
    "the number comes from the area's counter, incremented under a row lock; prefixes are unique per tenant",
  ],

  // CRM clients and their contacts.
  ["customers_tenant_id_fkey", "tenant_id comes from the session"],
  ["customer_contacts_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "customers_customer_type_check",
    "f.choice gates it against CUSTOMER_TYPES before the insert; the person path sets 'individual' itself",
  ],
  [
    "customers_relationship_status_check",
    "f.choice gates it against RELATIONSHIP_STATUSES before the insert",
  ],
  [
    "fk_customers_ar_account_id",
    "no form writes ar_account_id — it is not in CustomerInput",
  ],
  [
    "fk_customers_tax_rate_id",
    "no form writes tax_rate_id — it is not in CustomerInput",
  ],
  [
    "idx_customers_number",
    "no form writes customer_number; customers.create omits it, and NULLs do not collide in a unique index",
  ],
  [
    "uq_customers_tenant_id_id",
    "a composite key for other tables' tenant-carrying FKs to target; id is a generated primary key, so the pair cannot collide",
  ],
  [
    "uq_customer_contacts_tenant_id_id",
    "a composite key for other tables' tenant-carrying FKs to target; id is a generated primary key, so the pair cannot collide",
  ],

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
  ["payroll_export_settings_tenant_id_fkey", "tenant_id comes from the session"],
  ["payroll_export_codes_tenant_id_fkey", "tenant_id comes from the session"],
  ["payroll_employee_ids_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "payroll_employee_ids_employee_id_fkey",
    "payroll_export.repo setEmployeeId reads the employee under RLS first and refuses with no_such_employee",
  ],
  [
    "payroll_export_settings_provider_is_known",
    "the provider is read with f.choice over PAYROLL_PROVIDERS",
  ],
  [
    "payroll_export_codes_provider_is_known",
    "the provider is read with f.choice over PAYROLL_PROVIDERS",
  ],
  [
    "payroll_employee_ids_provider_is_known",
    "the provider comes from the saved settings, never from the form",
  ],
  [
    "payroll_export_codes_source_is_known",
    "sources are generated by the page from HOUR_TYPES and the tenant's policies, not posted",
  ],
  [
    "payroll_export_codes_one_per_source",
    "saveCodes upserts ON CONFLICT on exactly this key",
  ],
  [
    "payroll_employee_ids_one_per_employee",
    "setEmployeeId upserts ON CONFLICT on exactly this key",
  ],
  ["projects_tenant_id_fkey", "tenant_id comes from the session"],
  ["tasks_tenant_id_fkey", "tenant_id comes from the session"],

  ["hr_reviews_tenant_id_fkey", "tenant_id comes from the session"],
  ["hr_time_off_requests_tenant_id_fkey", "tenant_id comes from the session"],
  ["hr_time_off_balances_tenant_id_fkey", "tenant_id comes from the session"],
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
  ["document_folder_shares_tenant_id_fkey", "tenant_id comes from the session"],
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
  [
    "team_chat_conversations_tenant_id_fkey",
    "tenant_id comes from the session",
  ],
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

  // Project management Phase 2 (docs/25-project-management-phase2.md).
  ["pm_task_comments_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "fk_pm_task_comments_author_customer_id",
    "comments.repo writes author_type 'employee' only; no form sets author_customer_id",
  ],
  ["pm_project_templates_tenant_id_fkey", "tenant_id comes from the session"],

  // Custom fields (docs/26-project-management-custom-fields.md). Also
  // closes a pre-existing gap: custom_field_definitions was never in
  // FORM_WRITTEN despite ticketing already writing to it — its constraints
  // below cover that existing path too, not just the new project/task one.
  [
    "custom_field_definitions_tenant_id_fkey",
    "tenant_id comes from the session",
  ],
  [
    "ck_custom_field_definitions_category",
    "the form trims the category and sends a blank one as General; its max length matches the CHECK",
  ],
  [
    "ck_custom_field_definitions_entity_type",
    "set from the page's own fixed scope, never form input",
  ],
  [
    "ck_custom_field_definitions_ticket_area",
    "FieldScope carries an area for tickets and none otherwise, by type",
  ],
  [
    "uq_custom_field_definitions_tenant_id_id_entity_type",
    "id is the primary key; this is a foreign-key target",
  ],
  [
    "custom_field_definitions_data_type_check",
    "FormReader's choice(data_type, CUSTOM_FIELD_DATA_TYPES) refuses anything off the list",
  ],
  ["custom_field_values_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "ck_custom_field_values_one_record",
    "saveValues writes exactly one record column, chosen by the scope's entity type",
  ],
  [
    "fk_custom_field_values_definition",
    "saveValues refuses a definition outside the scope (no_such_definition) before inserting",
  ],
  [
    "fk_custom_field_values_project",
    "saveValues refuses a record the person cannot read (no_such_record) before inserting",
  ],
  [
    "fk_custom_field_values_task",
    "saveValues refuses a record the person cannot read (no_such_record) before inserting",
  ],
  [
    "fk_custom_field_values_customer_contact",
    "saveValues refuses a record the person cannot read (no_such_record) before inserting",
  ],
  [
    "fk_custom_field_values_company",
    "saveValues refuses a record the person cannot read (no_such_record) before inserting",
  ],
  [
    "fk_custom_field_values_deal",
    "saveValues refuses a record the person cannot read (no_such_record) before inserting",
  ],
  [
    "fk_custom_field_values_ticket",
    "saveValues refuses a record the person cannot read (no_such_record) before inserting",
  ],
  [
    "uq_projects_tenant_id_id",
    "id is the primary key; this is a foreign-key target",
  ],
  [
    "uq_tasks_tenant_id_id",
    "id is the primary key; this is a foreign-key target",
  ],
  [
    "uq_ticketing_tickets_tenant_id_id",
    "id is the primary key; this is a foreign-key target",
  ],
  [
    "custom_field_values_one_typed_value",
    "setValue always writes through VALUE_COLUMN, a fixed internal map keyed by the definition's own data_type read from the database — never a client-supplied column name; a crafted POST can change the VALUE, never which column it lands in",
  ],
  [
    "custom_field_values_unique",
    "setValue's INSERT ... ON CONFLICT (...) DO UPDATE targets this exact constraint — a concurrent write resolves via the upsert, never raises a unique_violation to the caller",
  ],

  // Bank statement import. Every value below is computed by the importer or
  // taken from the session; the only request-chosen id (the bank account)
  // is looked up under RLS first (L103).
  ["bank_statement_imports_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "fk_bank_statement_imports_bank_account_id",
    "the account is read under RLS before the insert, so an id this tenant cannot see is refused as a field error first",
  ],
  [
    "bank_statement_imports_file_format_check",
    "set by the parser from the file's content ('csv' or 'ofx'), never from the request",
  ],
  [
    "bank_statement_imports_balance_check_check",
    "set by the parser ('passed' or 'unavailable'), never from the request",
  ],
  [
    "bank_statement_imports_counts_check",
    "the counts come from the INSERT's own RETURNING, so imported + duplicates = in file by construction",
  ],
  ["bank_transactions_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "fk_bank_transactions_bank_account_id",
    "the account is read under RLS before the insert (L103); the match action never changes it",
  ],
  [
    "fk_bank_transactions_category_account_id",
    "set only by applying a bank rule, copied from the rule's stored category_account_id — no form submits it",
  ],
  [
    "fk_bank_transactions_import_id",
    "set to the import row inserted earlier in the same transaction",
  ],
  [
    "idx_bank_transactions_external_id",
    "the import's INSERT ... ON CONFLICT ... DO NOTHING absorbs a repeated line and counts it as a duplicate; nothing else writes bank_transaction_id",
  ],
  ["bank_accounts_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "fk_bank_accounts_gl_account_id",
    "no action writes gl_account_id: the only form write to bank_accounts is the import saving statement_import_profile",
  ],

  // Messaging (docs/38-messaging.md).
  ["messaging_endpoints_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "messaging_endpoints_channel_check",
    "channel is hardcoded per action (addEmailAddress writes 'email', registerNumber/orderNumber write 'sms'), never form input",
  ],
  ["messaging_endpoints_provider_check", "a column default; no form writes it"],
  [
    "messaging_endpoints_registration_status_check",
    "FormReader's choice(registration_status, REGISTRATION_STATUSES) refuses anything off the list",
  ],
  [
    "uq_messaging_endpoints_tenant_id_id",
    "id is the primary key; this is a foreign-key target",
  ],
  ["messaging_opt_outs_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "messaging_opt_outs_channel_check",
    "FormReader's choice(channel, CHANNELS) refuses anything off the list",
  ],
  [
    "messaging_opt_outs_reason_check",
    "addOptOut hardcodes 'manual'; the webhook path writes 'stop'/'preference' itself",
  ],
  [
    "messaging_opt_outs_tenant_id_channel_address_key",
    "recordOptOut is INSERT ... ON CONFLICT (tenant_id, channel, address) DO UPDATE, so a repeat re-arms the row instead of colliding",
  ],
  ["messaging_conversations_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "messaging_conversations_channel_check",
    "copied from the endpoint row the repository read under RLS first, never form input",
  ],
  [
    "messaging_conversations_status_check",
    "FormReader's choice(status, CONVERSATION_STATUSES) refuses anything off the list",
  ],
  [
    "messaging_conversations_last_direction_check",
    "set by the repository ('inbound'/'outbound' per write), never form input",
  ],
  [
    "fk_messaging_conversations_endpoint",
    "compose reads the endpoint under RLS (endpointById) and refuses no_such_endpoint before inserting",
  ],
  [
    "fk_messaging_conversations_contact",
    "set from matchContact's own RLS-scoped read of customer_contacts, or from a contact id the action looked up under RLS first; never raw form input",
  ],
  [
    "fk_messaging_conversations_customer",
    "copied from the same customer_contacts row as the contact id",
  ],
  [
    "uq_messaging_conversations_thread",
    "findOrOpenConversation is INSERT ... ON CONFLICT DO NOTHING and re-selects, so a normal request never reaches this constraint",
  ],
  [
    "uq_messaging_conversations_tenant_id_id",
    "id is the primary key; this is a foreign-key target",
  ],
  ["messaging_messages_tenant_id_fkey", "tenant_id comes from the session"],
  [
    "messaging_messages_direction_check",
    "hardcoded per repository write (recordOutbound/recordInbound), never form input",
  ],
  [
    "messaging_messages_status_check",
    "written only by the repository's own transitions, never form input",
  ],
  ["messaging_messages_provider_check", "a column default; no form writes it"],
  [
    "fk_messaging_messages_conversation",
    "reply reads the conversation under RLS (conversationById) and 404s before inserting",
  ],
  [
    "fk_messaging_messages_author",
    "set from the authenticated actor's employee id, never form input",
  ],
  [
    "ck_messaging_messages_direction_fields",
    "recordOutbound sets author + a non-received status, recordInbound sets neither author nor any other status; a form cannot reach the columns the CHECK pairs",
  ],
  [
    "idx_messaging_messages_provider_id",
    "recordInbound is ON CONFLICT DO NOTHING on it; markSent writes the id Bird returned, which Bird's own Idempotency-Key keeps unique per send",
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

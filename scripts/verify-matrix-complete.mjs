#!/usr/bin/env node
/**
 * Every table in the schema is classified — row-scoped (verified against
 * pg_policies), per column in the matrix, TENANT_WIDE, or EXPOSED_PENDING —
 * and every column on a per-column table is in SENSITIVE_FIELDS or
 * NOT_SENSITIVE, with a reason (L47, L103). Enumerates the schema rather than
 * regexing column names, which would miss a rename, a JSONB interior (L41),
 * or innocuously-named PII.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const ROOT = new URL("..", import.meta.url).pathname
const MATRIX = "apps/web/src/lib/server/security/matrix.ts"

/**
 * Columns on covered tables that carry nothing about a person worth
 * restricting. Each needs a reason, and "it looked boring" is not one.
 */
const NOT_SENSITIVE = new Map([
  // Keys, tenancy and bookkeeping.
  ["id", "surrogate key"],
  ["tenant_id", "tenancy discriminator; isolation is a separate concern"],
  [
    "employee_id",
    "the subject's own id — the join key, on rows already policy-scoped",
  ],
  ["created_at", "bookkeeping"],
  ["updated_at", "bookkeeping"],
  ["created_by", "bookkeeping"],
  ["version", "optimistic concurrency"],
  ["status", "lifecycle state, not a personal attribute"],
  [
    "effective_from",
    "when a record applies; the amount beside it is what is protected",
  ],
  ["effective_to", "when a record stops applying"],
  ["currency", "the unit of an amount; discloses a market, not a figure"],

  // Directory data — the firm publishes these internally, by decision.
  ["first_name", "directory"],
  ["last_name", "directory"],
  ["middle_name", "directory"],
  ["preferred_name", "directory"],
  ["pronouns", "directory; the person chooses to publish it"],
  ["email", "directory"],
  ["employee_number", "directory identifier, not a national one"],
  ["job_title", "directory"],
  ["job_level", "directory; the published band for a level is separate"],
  ["department_code", "directory"],
  ["location_code", "directory"],
  ["timezone", "directory; needed to render a colleague's working hours"],
  ["manager_id", "the reporting line is published internally"],
  ["start_date", "directory; tenure is visible to colleagues"],
  ["employment_status", "directory"],
  ["employment_type", "directory"],
  ["is_active", "directory"],
  ["profile_picture", "directory"],
  ["introduction", "the person writes it for colleagues to read"],
  ["hobbies", "the person publishes it"],
  ["social_media_links", "the person publishes it"],
  ["affinity_groups", "the person publishes it"],
  ["celebration_preferences", "how the person wants birthdays marked"],

  // Employment terms whose figures live on policy-scoped tables.
  ["end_date", "leaving date; visible once someone has left"],
  ["fte", "working pattern, published so colleagues know availability"],
  ["overtime_eligible", "a classification, not a figure"],
  ["compensation_type", "salaried vs hourly — a classification, not a figure"],
  ["pay_frequency", "monthly vs fortnightly — a classification, not a figure"],
  ["standard_hours_per_day", "working pattern"],
  ["standard_days_per_week", "working pattern"],
  [
    "pto_balances",
    "the person's own leave, shown to colleagues as availability",
  ],
  [
    "custom_fields",
    "customer-defined; must never feed payroll (see CLAUDE.md)",
  ],
  ["prior_employers", "the person publishes it on their profile"],
  ["prior_education", "the person publishes it on their profile"],
  ["gender", "self-declared, published by the person"],
  ["marital_status", "self-declared, published by the person"],
  ["change_reason", "why a record changed; the figure is what is protected"],
  ["overtime_rules", "policy configuration, not an individual's pay"],
  ["annual_equivalent", "derived from a protected amount; see matrix note"],
])

const matrixSrc = readFileSync(ROOT + MATRIX, "utf8")

/** Per-column declarations: `table.column`. */
const declared = new Set(
  [...matrixSrc.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]),
)

/** Declared `open` — deliberately colleague-readable, so no `_pvt`/`_ct` suffix required. */
const openFields = new Set(
  [...matrixSrc.matchAll(/id:\s*"([^"]+)"[\s\S]{0,400}?defense:\s*"(\w+)"/g)]
    .filter((m) => m[2] === "open")
    .map((m) => m[1]),
)

/** Tables whose whole row is policy-scoped — one declaration classifies every column on it. */
const wholeRow = new Set(
  [...matrixSrc.matchAll(/^ {2}([a-z_]+):\s*\{\n\s*defense:\s*"rls"/gm)].map(
    (m) => m[1],
  ),
)

/** Tables carrying per-column entries — where the row is broadly visible. */
const perColumn = new Set([...declared].map((id) => id.split(".")[0]))
const tables = [...new Set([...wholeRow, ...perColumn])]

if (tables.length === 0) {
  console.error("  could not read the covered tables from the matrix")
  process.exit(1)
}
if (wholeRow.size === 0) {
  console.error("  read no policy-scoped tables from the matrix — parser drift")
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("  DATABASE_URL is not set")
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Every table, not only the ones the matrix already names (L103). A table
// nobody thought to protect is exactly the one this step exists for, and
// starting from the matrix made it unreachable.
// ---------------------------------------------------------------------------

/**
 * A row policy narrows who reads a row. The whole-row entries in the matrix
 * are row-scoped too; this list is every other one. Each claim is checked
 * against pg_policies below, so a table cannot be listed here on intent.
 */
const ROW_SCOPED = new Map([
  [
    "customers",
    "tenant-wide for staff (docs/15 Tier 3); a portal contact reads only their own company and writes none",
  ],
  [
    "crm_deals",
    "tenant-wide for staff, shared with the team working the account; no portal access",
  ],
  [
    "crm_activities",
    "tenant-wide for staff, as its customer is; no portal access",
  ],
  [
    "crm_pipeline_stages",
    "tenant-wide sales configuration for staff; no portal access",
  ],
  [
    "time_tracking_entries",
    "your own, or a time approver, payroll/HR, or finance; hours recompute and numbering run SECURITY DEFINER (L106)",
  ],
  [
    "time_tracking_hourly_rates",
    "your own, or a time approver, payroll/HR, or finance; hours recompute and numbering run SECURITY DEFINER (L106)",
  ],
  [
    "time_tracking_timesheets",
    "your own, or a time approver, payroll/HR, or finance; hours recompute and numbering run SECURITY DEFINER (L106)",
  ],
  [
    "app_error_log",
    "no application reads: `message` echoes submitted values (L69); ops tools connect as owner",
  ],
  [
    "custom_field_values",
    "follows its project or task; any other entity_type is invisible",
  ],
  [
    "hr_benefits_enrollments",
    "the subject and PII readers (GDPR Art. 9), as benefits_elections_pvt on employees",
  ],
  [
    "payroll_runs",
    "payroll readers, and each employee the runs they were paid in (their payslip reads the pay date)",
  ],
  ["payroll_tax_deposits", "payroll readers and the finance function"],
  [
    "ticketing_attachments",
    "follows its ticket, and its update when it has one",
  ],
  [
    "audit_log",
    "HR, payroll, auditor, owner; others see entries about or by themselves (L55)",
  ],
  [
    "contact_requests",
    "no read policy: marketing-site enquiries, service role only",
  ],
  [
    "customer_contacts",
    "a portal contact sees only their own customer's contacts",
  ],
  ["document_folders", "staff see folders shared with them or their role"],
  ["documents", "staff and portal visibility follow folder shares"],
  ["employee_bank_accounts", "the subject and HR/payroll (pii_visibility)"],
  ["employment_terms", "the subject and HR (compensation_visibility)"],
  ["hr_emergency_contacts", "the subject and HR (pii_visibility)"],
  ["hr_employee_documents", "the subject and HR (pii_visibility)"],
  ["hr_employment_history", "carries pay; same policy as compensation_base"],
  ["hr_feedback", "giver, receiver and HR (feedback_visibility)"],
  ["hr_reviews", "the subject, their manager and HR (performance_visibility)"],
  [
    "hr_survey_responses",
    "the respondent and HR; anonymous responses stay anonymous",
  ],
  [
    "payroll_employee_deductions",
    "the subject and payroll (payroll_visibility)",
  ],
  [
    "payroll_india_salary_structure",
    "the subject and payroll (payroll_visibility)",
  ],
  [
    "payroll_india_tax_declarations",
    "the subject and payroll (payroll_visibility)",
  ],
  ["payroll_run_employees", "the subject and payroll (payroll_visibility)"],
  [
    "payroll_tax_withholding_certificates",
    "the subject and payroll (payroll_visibility)",
  ],
  ["profiles", "each user reads their own profile only"],
  [
    "projects",
    "restricted projects: their manager, granted groups, and reads_all_projects",
  ],
  [
    "stripe_customers",
    "no read policy: subscription billing, service role only",
  ],
  ["tax_rates", "finance function only (accounting_read)"],
  ["team_chat_conversations", "members of the conversation only"],
  ["team_chat_members", "members of the conversation only"],
  ["tasks", "follows its project (task_visibility)"],
  ["team_chat_messages", "members of the conversation only"],
  [
    "messaging_endpoints",
    "the firm's admins, sales, marketing and auditor (app.reads_all_messaging); never a portal contact",
  ],
  [
    "messaging_opt_outs",
    "same readers as messaging_endpoints; an outside address that asked not to be contacted",
  ],
  [
    "messaging_conversations",
    "same readers as messaging_endpoints; who the firm is in a thread with",
  ],
  [
    "messaging_messages",
    "same readers as messaging_endpoints; what was said to and by an outside person",
  ],
  ["ticketing_ticket_reference_links", "follows the ticket's staff visibility"],
  ["ticketing_ticket_tasks", "follows the ticket's staff visibility"],
  [
    "ticketing_tickets",
    "staff by business area; portal contacts their own customer's",
  ],
  [
    "ticketing_updates",
    "follows the ticket; internal updates never reach the portal",
  ],
])

/**
 * Readable by everyone in the tenant, deliberately: nothing here says
 * anything about a person that the firm does not publish internally.
 * Classified by TABLE, not per column — a column added to one of these later
 * is caught by the schema snapshot, not here, so classify it when you add it.
 */
const TENANT_WIDE = new Map([
  // docs/15-row-level-visibility.md Tier 2: person-scoped, low harm between
  // colleagues, deferred deliberately.
  [
    "hr_attendance",
    "docs/15 Tier 2: clock-in times judged no harm worth a policy",
  ],
  [
    "hr_change_requests",
    "docs/15 Tier 2; revisit if request_details starts carrying pay",
  ],
  ["hr_goals", "docs/15 Tier 2"],
  ["hr_onboarding_tasks", "docs/15 Tier 2"],
  [
    "hr_time_off_requests",
    "docs/15 Tier 2; dates are availability, and reason is optional free text",
  ],
  // docs/15 "Explicitly excluded, with reasons".
  ["jobs", "docs/15: a work queue, not business data"],
  [
    "pii_erasures",
    "docs/15: proves an erasure happened; scoping it to the subject is backwards",
  ],
  [
    "pii_keys",
    "docs/15: wrapped keys teach nothing without PRIVATE_PII_KEK, and erasure must find them",
  ],
  [
    "compensation_work_schedules",
    "working pattern, published so colleagues know availability",
  ],
  [
    "cross_module_links",
    "ids linking records; each side keeps its own visibility",
  ],
  ["custom_field_definitions", "tenant configuration"],
  [
    "document_folder_shares",
    "who a folder is shared with; the documents stay row-scoped",
  ],
  [
    "employee_assets",
    "which equipment is issued to whom; an operational register",
  ],
  [
    "employee_certifications",
    "professional certifications; the number is encrypted (_ct)",
  ],
  ["employee_group_members", "group membership, a directory fact"],
  ["employee_group_roles", "which role a group carries, configuration"],
  [
    "employee_training_records",
    "training completion, a compliance register colleagues and managers share",
  ],
  ["employee_user_groups", "group definitions, configuration"],
  ["exchange_rates", "global reference data, the same for every tenant"],
  ["feature_flags", "on/off switches, tenant or global; no data"],
  ["firm_benefit_items", "the benefits the firm offers, not who elected them"],
  [
    "firm_benefits_packages",
    "the benefits the firm offers, not who elected them",
  ],
  ["firm_benefits_plans", "plan-level costs the firm publishes at enrolment"],
  ["firm_departments", "organisation structure"],
  ["firm_holidays", "the holiday calendar"],
  [
    "firm_job_levels",
    "published salary bands per level; an individual's band is employees.compensation_band_pvt",
  ],
  ["firm_job_titles", "organisation structure"],
  ["firm_locations", "office directory"],
  ["firm_payroll_policies", "overtime and rounding rules, not anyone's pay"],
  ["hr_company_news", "published to staff by design"],
  ["hr_onboarding_template_tasks", "templates, configuration"],
  ["hr_onboarding_templates", "templates, configuration"],
  ["hr_review_cycles", "review calendar; the reviews are row-scoped"],
  ["hr_surveys", "survey definitions and aggregates; responses are row-scoped"],
  [
    "hr_time_off_balances",
    "leave balance shown to colleagues as availability (see employees.pto_balances)",
  ],
  ["hr_time_off_policies", "leave rules, configuration"],
  ["payroll_deduction_definitions", "deduction types, not who takes them"],
  ["payroll_pay_schedules", "pay calendar, configuration"],
  ["payroll_tax_rates", "statutory rate tables, public information"],
  ["pm_automation_executions", "project workflow log"],
  ["pm_automations", "project workflow configuration"],
  ["pm_dashboard_widgets", "project dashboards"],
  ["pm_dashboards", "project dashboards"],
  [
    "pm_objectives",
    "revenue targets are the firm's own plan, shared with delivery staff",
  ],
  ["pm_project_templates", "templates, configuration"],
  [
    "project_group_grants",
    "ids only: which group may see which restricted project",
  ],
  ["pm_task_attachments", "project delivery files"],
  ["pm_task_comments", "project discussion"],
  [
    "tenant_registry",
    "the tenant's own routing row; connection_secret_ref names a secret, never holds it",
  ],
  [
    "tenant_settings",
    "workflow switches (thresholds, SLA hours); no credentials",
  ],
  ["tenant_users", "who holds which role, a directory fact"],
  ["tenants", "the tenant's own company profile"],
  ["ticketing_business_area_members", "who staffs which service desk"],
  [
    "ticketing_business_area_group_grants",
    "ids only: which group staffs which service desk",
  ],
  ["ticketing_business_areas", "service desk configuration"],
  ["ticketing_categories", "service desk configuration"],
  ["ticketing_subcategories", "service desk configuration"],
  ["ticketing_ticket_assignees", "ids only; the ticket itself is row-scoped"],
  ["ticketing_ticket_links", "ids only; the ticket itself is row-scoped"],
  ["ticketing_ticket_subscribers", "ids only; the ticket itself is row-scoped"],
  ["translations", "UI strings"],
])

/**
 * Readable by everyone in the tenant, where another committed rule says it
 * should not be — each reason names the rule it contradicts. Listed so
 * ./check stays green without pretending otherwise. Fixing one moves it to
 * ROW_SCOPED; the check fails until it is moved, so this list cannot quietly
 * outlive the fix. A table the team decided is fine tenant-wide belongs in
 * TENANT_WIDE with that decision cited, not here.
 */
const EXPOSED_PENDING = new Map([])

/**
 * Every condition a PERMISSIVE read policy uses, sorted by whether it admits
 * the whole tenant. Permissive policies are OR-ed, so one tenant-wide policy
 * undoes any narrower one beside it — only a RESTRICTIVE policy narrows then.
 * A condition on neither list fails the check: assuming either answer for an
 * unread condition is how a claim gets believed rather than verified.
 */
const TENANT_WIDE_CONDITIONS = new Set([
  "(tenant_id = app.current_tenant_id())",
  "((tenant_id IS NULL) OR (tenant_id = app.current_tenant_id()))",
  "((app.current_tenant_id() IS NOT NULL) AND ((tenant_id IS NULL) OR (tenant_id = app.current_tenant_id())))",
  "(id = app.current_tenant_id())",
  "true",
])
const NARROWING_CONDITIONS = new Set(["(auth.uid() = id)"])

/** Roles a policy must name to govern what the application reads. */
const APP_ROLES = new Set(["public", "app_user", "authenticated"])

const dbTables = new Set(
  execFileSync(
    "psql",
    [
      url,
      "-X",
      "-tA",
      "-c",
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`,
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean),
)

const readPolicies = JSON.parse(
  execFileSync(
    "psql",
    [
      url,
      "-X",
      "-tA",
      "-c",
      `SELECT coalesce(json_agg(json_build_object(
                'table', tablename, 'name', policyname, 'roles', roles,
                'restrictive', permissive = 'RESTRICTIVE', 'qual', qual)), '[]')
         FROM pg_policies
        WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL')`,
    ],
    { encoding: "utf8" },
  ),
).filter((p) => p.roles.some((r) => APP_ROLES.has(r)))

const collapse = (q) => (q ?? "true").replace(/\s+/g, " ").trim()
const unknownConditions = [
  ...new Set(
    readPolicies
      .filter((p) => !p.restrictive)
      .map((p) => collapse(p.qual))
      .filter(
        (q) => !TENANT_WIDE_CONDITIONS.has(q) && !NARROWING_CONDITIONS.has(q),
      ),
  ),
]
if (unknownConditions.length) {
  console.error(
    `\n  ${unknownConditions.length} permissive read condition(s) are on neither list:\n`,
  )
  for (const q of unknownConditions) console.error(`    ${q}`)
  console.error(
    "\n  Add each to TENANT_WIDE_CONDITIONS or NARROWING_CONDITIONS in this" +
      "\n  file, having read what it admits.\n",
  )
  process.exit(1)
}

const rlsOn = new Set(
  execFileSync(
    "psql",
    [
      url,
      "-X",
      "-tA",
      "-c",
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relrowsecurity`,
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean),
)

/** Does some policy make this table narrower than "anyone in the tenant"? */
function narrowed(table) {
  if (!rlsOn.has(table)) return false
  const mine = readPolicies.filter((p) => p.table === table)
  if (mine.some((p) => p.restrictive && p.name !== "tenant_isolation")) {
    return true
  }
  return !mine.some(
    (p) => !p.restrictive && TENANT_WIDE_CONDITIONS.has(collapse(p.qual)),
  )
}

const classes = [
  ["the matrix (whole row)", wholeRow],
  ["the matrix (per column)", perColumn],
  ["ROW_SCOPED", new Set(ROW_SCOPED.keys())],
  ["TENANT_WIDE", new Set(TENANT_WIDE.keys())],
  ["EXPOSED_PENDING", new Set(EXPOSED_PENDING.keys())],
]
const tableProblems = []

for (const table of dbTables) {
  const inClasses = classes.filter(([, set]) => set.has(table)).map(([n]) => n)
  if (inClasses.length === 0) {
    tableProblems.push(`${table} is unclassified`)
  } else if (inClasses.length > 1) {
    tableProblems.push(`${table} is in ${inClasses.join(" and ")} — pick one`)
  }
}
for (const [name, set] of classes) {
  for (const table of set) {
    if (!dbTables.has(table)) {
      tableProblems.push(`${name} lists ${table}, which is not in the schema`)
    }
  }
}
for (const table of [...wholeRow, ...ROW_SCOPED.keys()]) {
  if (dbTables.has(table) && !narrowed(table)) {
    tableProblems.push(
      `${table} is classified row-scoped, but no policy narrows it below the whole tenant`,
    )
  }
}
for (const [name, map] of [
  ["TENANT_WIDE", TENANT_WIDE],
  ["EXPOSED_PENDING", EXPOSED_PENDING],
]) {
  for (const table of map.keys()) {
    if (dbTables.has(table) && narrowed(table)) {
      tableProblems.push(
        `${table} is listed in ${name}, but a policy now narrows it — move it to ROW_SCOPED`,
      )
    }
  }
}

if (tableProblems.length) {
  console.error(
    `\n  ${tableProblems.length} table classification problem(s):\n`,
  )
  for (const p of tableProblems) console.error(`    ${p}`)
  console.error(
    "\n  Every table is row-scoped (a policy narrows it — verified here), per" +
      "\n  column in the matrix, TENANT_WIDE with a reason, or EXPOSED_PENDING" +
      "\n  with what it discloses. Decide, do not default: a table no list" +
      "\n  named is how customers.tax_number sat readable by every employee (L103).\n",
  )
  process.exit(1)
}

const rows = execFileSync(
  "psql",
  [
    url,
    "-X",
    "-tA",
    "-F",
    "\t",
    "-c",
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN (${tables.map((t) => `'${t}'`).join(",")})
      ORDER BY table_name, ordinal_position`,
  ],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"))

/**
 * `_ct` (ciphertext) / `_pvt` (restricted plaintext) suffix must agree with
 * the matrix's classification, in both directions — a column with neither
 * suffix is directory data, by construction.
 */
const SUFFIXED = /_(pvt|ct)$/
const mismatched = []

for (const [table, column] of rows) {
  if (wholeRow.has(table)) continue // marked by the table, not the column
  const id = `${table}.${column}`
  const restricted = declared.has(id) && !openFields.has(id)
  const suffixed = SUFFIXED.test(column)
  if (restricted && !suffixed) {
    mismatched.push(
      `${id} is restricted in the matrix but its name does not say so — add _pvt (or _ct if encrypted)`,
    )
  }
  if (suffixed && !restricted) {
    mismatched.push(
      `${id} is named as restricted but the matrix does not restrict it — classify it, or drop the suffix`,
    )
  }
}

if (mismatched.length) {
  console.error(`\n  ${mismatched.length} name/classification mismatch(es):\n`)
  for (const m of mismatched) console.error(`    ${m}`)
  console.error(
    "\n  On a broadly-visible row the column name is the only warning a" +
      "\n  reviewer gets in a diff. `COALESCE(cp.amount, e.base_amount_pvt)`" +
      "\n  shows the problem; `e.base_amount` showed nothing (L47).\n",
  )
  process.exit(1)
}

const unclassified = []
for (const [table, column] of rows) {
  if (wholeRow.has(table)) continue // the row policy classifies every column
  if (declared.has(`${table}.${column}`)) continue
  if (NOT_SENSITIVE.has(column)) continue
  unclassified.push(`${table}.${column}`)
}

if (unclassified.length) {
  console.error(
    `\n  ${unclassified.length} column(s) on covered tables are unclassified:\n`,
  )
  for (const c of unclassified) console.error(`    ${c}`)
  console.error(
    "\n  Decide, do not default. Either add it to SENSITIVE_FIELDS in" +
      `\n  ${MATRIX} with the audience and the` +
      "\n  mechanism that holds it, or to NOT_SENSITIVE in this file with a" +
      "\n  reason. Every disclosure bug here so far was an UNCLASSIFIED" +
      "\n  column, not a mis-classified one.\n",
  )
  process.exit(1)
}
console.log(
  `  every table is classified (${dbTables.size}; ${EXPOSED_PENDING.size} exposed, pending a policy)` +
    ` and every sensitive column (${rows.length} checked)`,
)

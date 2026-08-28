#!/usr/bin/env node
/**
 * gen-api-surface.mjs — derive the API surface from schema.sql + the module specs.
 *
 * Two surfaces are emitted, because this repository has two and they are not
 * interchangeable (05-architecture-decisions.md, ADR-004 and ADR-008):
 *
 *   A. The Supabase Data API (PostgREST) reflected from the schema.
 *      Mechanically complete: whatever is in the schema is the whole surface.
 *      ADR-008 scopes it to "simple administrative reads only."
 *
 *   B. The SvelteKit route surface — +page.server.ts loads/actions and
 *      +server.ts endpoints — which is what application code actually calls.
 *      Derived here as one canonical route per table, plus every operation
 *      harvested from the module specifications that is not plain CRUD.
 *
 * Usage:  node scripts/gen-api-surface.mjs [--out docs/api-surface.md]
 *
 * Re-run this after any schema change. Do not hand-edit the generated file.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const SCHEMA = join(DOCS, 'data-models', 'schema.sql');

const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? join(ROOT, process.argv[outArg + 1]) : join(DOCS, 'api-surface.md');

const sql = readFileSync(SCHEMA, 'utf8');

// ---------------------------------------------------------------------------
// 1. Parse the schema
// ---------------------------------------------------------------------------

function parseTables(src) {
  const out = [];
  const re = /^CREATE TABLE (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)^\);/gm;
  let m;
  while ((m = re.exec(src))) {
    const [, name, body] = m;
    const cols = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--')) continue;
      // skip table-level constraints
      if (/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT|EXCLUDE)\b/i.test(line)) continue;
      const cm = line.match(/^([a-z_][a-z0-9_]*)\s+(.+?),?$/i);
      if (cm) cols.push({ name: cm[1], type: cm[2].replace(/,$/, '') });
    }
    out.push({
      name,
      columns: cols,
      hasTenantId: cols.some((c) => c.name === 'tenant_id'),
      pk: cols.find((c) => /PRIMARY KEY/i.test(c.type))?.name ?? null,
      // business key used for human-readable lookups, if the table has one
      code: cols.find((c) => /^(code|slug|number|.*_code|.*_number)$/.test(c.name))?.name ?? null,
      softDelete: cols.some((c) => /^(is_active|deleted_at|is_archived)$/.test(c.name)),
    });
  }
  return out;
}

function parseViews(src) {
  const out = [];
  const re = /^CREATE (?:OR REPLACE )?(MATERIALIZED )?VIEW ([a-z_][a-z0-9_]*)([\s\S]*?);\s*$/gm;
  let m;
  while ((m = re.exec(src))) {
    out.push({
      name: m[2],
      materialized: Boolean(m[1]),
      securityInvoker: /security_invoker/i.test(m[0]),
      // a view is tenant-safe over the Data API only if it both selects
      // tenant_id and runs with invoker rights
      selectsTenantId: /\btenant_id\b/.test(m[0]),
    });
  }
  return out;
}

function parseFunctions(src) {
  const out = [];
  // RETURNS may be followed on the same line by LANGUAGE/AS, so stop at the
  // first token — but keep SETOF/TABLE qualifiers, which are part of the type.
  const re = /^CREATE (?:OR REPLACE )?FUNCTION\s+(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*\n?\s*RETURNS\s+((?:SETOF\s+|TABLE\s*\([^)]*\)|)[A-Za-z_][A-Za-z0-9_]*|TABLE\s*\([^)]*\))/gim;
  let m;
  while ((m = re.exec(src))) {
    const [, schema, name, args, ret] = m;
    out.push({
      schema: schema ?? 'public',
      name,
      args: args.trim(),
      returns: ret.trim(),
      isTrigger: /^trigger$/i.test(ret.trim()),
    });
  }
  return out;
}

function parseEnums(src) {
  const out = [];
  const re = /^CREATE TYPE ([a-z_][a-z0-9_]*) AS ENUM \(([\s\S]*?)\);/gm;
  let m;
  while ((m = re.exec(src))) {
    out.push({ name: m[1], values: (m[2].match(/'[^']*'/g) ?? []).map((v) => v.slice(1, -1)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1b. Derive the Auth and Storage surfaces from the repository
// ---------------------------------------------------------------------------
// ADR-008 adopted three Supabase capabilities: Postgres, Auth and Storage. The
// Data API is the one it rejected. Auth and Storage are therefore where the
// SvelteKit code will actually spend its Supabase calls, so they are derived
// here rather than recited from memory: the auth methods come from calls that
// already exist in app/src, the buckets from columns that hold file references.

const APP_SRC = join(ROOT, 'app', 'src');

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const appFiles = walk(APP_SRC).filter((f) => /\.(ts|js|svelte)$/.test(f));

function deriveAuthCalls() {
  const calls = new Map();
  for (const f of appFiles) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/supabase\.auth\.((?:[a-zA-Z]+\.)?[a-zA-Z]+)\s*\(/g)) {
      if (!calls.has(m[1])) calls.set(m[1], new Set());
      calls.get(m[1]).add(f.slice(APP_SRC.length + 1));
    }
  }
  return calls;
}

function deriveAuthRoutes() {
  return walk(join(APP_SRC, 'routes'))
    .filter((f) => /\+(page|server|layout)\.(ts|svelte)$/.test(f))
    .map((f) => dirname(f).slice(join(APP_SRC, 'routes').length))
    .filter((r) => /(login|auth|account\/\(menu\)\/settings)/.test(r))
    .map((r) => r.replace(/\/\([a-z]+\)/g, '') || '/')
    .filter((r, i, a) => a.indexOf(r) === i)
    .sort();
}

const authCalls = deriveAuthCalls();
const authRoutes = deriveAuthRoutes();

// A column that stores a URL, path or filename is a Storage object reference.
// `payment_url` is a Stripe payment link (stripe is in app/package.json), not an object.
const FILE_COL = /^(profile_picture|.*_url|.*file_path|.*storage_path|file_name|attachments?|attached_documents|documents)$/;
const NOT_A_FILE = new Set(['payment_url', 'verification_url']);

const tables = parseTables(sql);
const views = parseViews(sql);
const functions = parseFunctions(sql);
const enums = parseEnums(sql);

const storageTables = tables
  .map((t) => ({
    table: t.name,
    cols: t.columns.filter((c) => FILE_COL.test(c.name) && !NOT_A_FILE.has(c.name)).map((c) => c.name),
  }))
  .filter((t) => t.cols.length);

const hookPresent = /custom_access_token_hook/.test(sql);

// Findings are reported against the migrations too, not just schema.sql: a
// defect fixed in a migration is no longer open, and saying otherwise sends
// someone to fix it twice.
const MIGRATIONS_DIR = join(ROOT, 'app', 'supabase', 'migrations');
let migrationSql = '';
let migrationFiles = [];
try {
  migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  migrationSql = migrationFiles.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')).join('\n');
} catch { /* not initialised yet */ }

const schemaShipped = migrationFiles.some((f) => /initial_schema/.test(f));
// Match only executable SQL. schema.sql documents the app_user GRANTs in a
// SECTION 5 comment, which would otherwise read as "already fixed".
const stripComments = (t) => t.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const fixedBy = (re) => {
  const f = migrationFiles.find((n) => re.test(stripComments(readFileSync(join(MIGRATIONS_DIR, n), 'utf8'))));
  return f ?? null;
};
const fix = {
  hook:     migrationSql ? fixedBy(/CREATE OR REPLACE FUNCTION public\.custom_access_token_hook/) : null,
  grants:   migrationSql ? fixedBy(/GRANT[\s\S]*?ON ALL TABLES IN SCHEMA public TO app_user/) : null,
  schemaUsage: migrationSql ? fixedBy(/GRANT USAGE ON SCHEMA app\s+TO app_user/) : null,
  authAdmin: migrationSql ? fixedBy(/CREATE POLICY auth_admin_reads_memberships/) : null,
  invoker:  migrationSql ? fixedBy(/security_invoker = on/) : null,
  force:    migrationSql ? fixedBy(/ALTER TABLE exchange_rates FORCE ROW LEVEL SECURITY/) : null,
  defaults: migrationSql ? fixedBy(/SET DEFAULT now\(\)/) : null,
  harden:   migrationSql ? fixedBy(/RETURN NULL;\s+-- malformed claims/) : null,
};
const status = (f) => (f ? `**addressed** by \`${f}\`` : '**OPEN**');

// Security posture — computed, never assumed. These three facts decide whether
// surface A is reachable at all.
const grants = (sql.match(/^\s*GRANT\b/gm) ?? []).length;
const policies = (sql.match(/^CREATE POLICY\b/gm) ?? []).length;
const rlsEnabled = new Set((sql.match(/^ALTER TABLE ([a-z_]+) ENABLE ROW LEVEL SECURITY/gm) ?? []).map((s) => s.split(' ')[2]));
const rlsForced = new Set((sql.match(/^ALTER TABLE ([a-z_]+) FORCE ROW LEVEL SECURITY/gm) ?? []).map((s) => s.split(' ')[2]));
const missingForce = [...rlsEnabled].filter((t) => !rlsForced.has(t));
const missingRls = tables.filter((t) => t.hasTenantId && !rlsEnabled.has(t.name)).map((t) => t.name);
const callableRpc = functions.filter((f) => !f.isTrigger && f.schema === 'public');

// ---------------------------------------------------------------------------
// 2. Group tables into modules
// ---------------------------------------------------------------------------
// Ordered: first rule that matches wins. Exact names beat prefixes.

const MODULES = [
  ['Platform & tenancy',   ['=tenants', '=tenant_users', '=tenant_settings', '=custom_field_definitions', '=jobs', '=audit_log', '=translations', '=cross_module_links']],
  ['Firm profile',         ['firm_']],
  ['Employee profile',     ['=employees', 'employee_', '=employment_terms']],
  ['User groups',          ['=employee_user_groups', '=employee_group_members', '=employee_group_roles']],
  ['Compensation',         ['compensation_']],
  ['Payroll',              ['payroll_']],
  ['HR',                   ['hr_']],
  ['Time tracking',        ['time_tracking_']],
  ['Project management',   ['pm_', '=projects', '=tasks']],
  ['Ticketing',            ['ticketing_']],
  ['Accounting',           ['=accounting_periods', 'bank_', 'bill', '=chart_of_accounts', '=invoices', '=invoice_lines',
                            '=journal_entries', '=journal_entry_lines', '=payments', '=payment_allocations',
                            '=expenses', '=exchange_rates', '=vendors', '=customers', '=clients']],
];

function moduleOf(name) {
  for (const [mod, rules] of MODULES) {
    for (const rule of rules) {
      if (rule.startsWith('=') ? name === rule.slice(1) : name.startsWith(rule)) return mod;
    }
  }
  return 'Unassigned';
}

const byModule = new Map(MODULES.map(([m]) => [m, []]));
byModule.set('Unassigned', []);
for (const t of tables) byModule.get(moduleOf(t.name)).push(t);

// ---------------------------------------------------------------------------
// 3. Harvest declared endpoints from the module specifications
// ---------------------------------------------------------------------------
// The specs use two conventions (`/api/v1/x/{id}` and `/api/x/:id`). Normalise
// to one so that duplicates across specs collapse.

function normalisePath(p) {
  return p
    .replace(/^\/api\/v1\//, '/api/')
    .replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')
    .replace(/\/:(\w*[Ii])d\b/g, '/:id')   // :employeeId, :ticketId -> :id
    .replace(/\/$/, '');
}

function harvestEndpoints() {
  const found = new Map(); // "METHOD path" -> Set(source files)
  // Every markdown file in docs/, not a curated subset: accounting-gap-analysis.md
  // and architecture-technical.md carry endpoint declarations too, and a name-prefix
  // filter silently understates the surface. PLACEHOLDERS/NON_TABLE below do the
  // real filtering, on the endpoints themselves rather than on filenames.
  const files = readdirSync(DOCS)
    .filter((f) => /\.md$/.test(f))
    .filter((f) => join(DOCS, f) !== OUT);   // never harvest our own output
  for (const f of files) {
    const text = readFileSync(join(DOCS, f), 'utf8');
    const re = /^\s*(GET|POST|PATCH|PUT|DELETE)\s+(\/[A-Za-z0-9/_{}:.\-]+)/gm;
    let m;
    while ((m = re.exec(text))) {
      const key = `${m[1]} ${normalisePath(m[2])}`;
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(f);
    }
  }
  return found;
}

const harvested = harvestEndpoints();

// Which harvested operations are plain CRUD on a known table, and which are
// genuine domain operations that need hand-written server code?
const tableNames = new Set(tables.map((t) => t.name));
const RESOURCE_ALIAS = {
  'tickets': 'ticketing_tickets', 'updates': 'ticketing_updates',
  'attachments': 'ticketing_attachments', 'business-areas': 'ticketing_business_areas',
  'time-entries': 'time_tracking_entries', 'timesheets': 'time_tracking_timesheets',
  'billable-expenses': 'time_tracking_billable_expenses', 'hourly-rates': 'time_tracking_hourly_rates',
  'change-requests': 'hr_change_requests', 'objectives': 'pm_objectives',
  'automations': 'pm_automations', 'dashboards': 'pm_dashboards', 'widgets': 'pm_dashboard_widgets',
  'project-templates': 'pm_project_templates', 'comments': 'pm_task_comments',
  'employees': 'employees', 'projects': 'projects', 'tasks': 'tasks',
  'invoices': 'invoices', 'payments': 'payments', 'bills': 'bills', 'expenses': 'expenses',
  'accounts': 'chart_of_accounts', 'vendors': 'vendors', 'customers': 'customers',
  'automation-executions': 'pm_automation_executions', 'departments': 'firm_departments',
  'custom-fields': 'custom_field_definitions', 'organizations': 'tenants', 'organization': 'tenants',
  'bank-accounts': 'bank_accounts', 'bank-transactions': 'bank_transactions',
  'equity': 'compensation_equity',
};

// Some specs namespace a path under its module (`/api/v1/accounting/invoices`).
// The resource is the segment after the module, not the module itself.
const MODULE_PREFIXES = new Set([
  'accounting', 'compensation', 'hr', 'payroll', 'marketing', 'ticketing', 'pm',
  'time-tracking', 'project-management',
]);

// Namespaces that intentionally have no backing table: derived reads, not resources.
const NON_TABLE = new Set([
  'reports', 'search', 'exports', 'dashboard',
  'cash-flow',   // derived analytics over bank_transactions / invoices / bills
  'ai',          // AI assistant; ADR-008 keeps model credentials server-side
]);

// `/api/v1/resource` is a placeholder in the spec prose, not a real endpoint.
const PLACEHOLDERS = new Set(['resource', 'endpoint', 'example']);

function classify(key) {
  const [method, path] = key.split(' ');
  // paths appear as `/api/v1/x`, `/api/x` and bare `/x` — strip any leading
  // slash and `api/` prefix, then drop empty segments
  let segs = path.replace(/^\/+/, '').replace(/^api\//, '').split('/').filter(Boolean);
  // drop a leading module namespace so the resource is the real one
  if (segs.length > 1 && MODULE_PREFIXES.has(segs[0])) segs = segs.slice(1);
  const resource = segs[0];
  const table = RESOURCE_ALIAS[resource] ?? resource.replace(/-/g, '_');
  const known = tableNames.has(table) ? table : null;
  // plain CRUD == /resource or /resource/:id with a CRUD verb, nothing deeper
  const depth = segs.filter((s) => !s.startsWith(':')).length;
  const isCrud = known && depth === 1;
  return {
    method, path, resource, table: known, isCrud,
    placeholder: PLACEHOLDERS.has(resource),
    derived: NON_TABLE.has(resource),
  };
}

const classified = [...harvested.keys()].map(classify).filter((c) => !c.placeholder);
const domainOps = classified.filter((c) => !c.isCrud);
const crudOps = classified.filter((c) => c.isCrud);
const derivedResources = [...new Set(classified.filter((c) => c.derived).map((c) => c.resource))].sort();
const unbackedResources = [...new Set(
  classified.filter((c) => !c.table && !c.derived).map((c) => c.resource),
)].sort();
const coveredTables = new Set(classified.map((c) => c.table).filter(Boolean));
const uncoveredTables = tables.filter((t) => !coveredTables.has(t.name));

// ---------------------------------------------------------------------------
// 4. Emit
// ---------------------------------------------------------------------------

const L = [];
const w = (s = '') => L.push(s);

const today = new Date().toISOString().slice(0, 10);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

w('# API Surface');
w();
w('**Generated** by `scripts/gen-api-surface.mjs` from `docs/data-models/schema.sql`');
w(`and the module specifications. **Do not hand-edit** — re-run the script.`);
w();
w(`**Generated:** ${today}`);
w(`**Schema:** ${plural(tables.length, 'table')}, ${plural(views.length, 'view')}, ` +
  `${plural(functions.length, 'function')}, ${plural(enums.length, 'enum type')}`);
w();
w('**Supersedes** `api-endpoints.md` v1.0, which specified a standalone REST service at');
w('`https://api.jhiri.com/v1` — a design ADR-004 reversed by making SvelteKit the backend.');
w('That file is retained because ADR-004 cites its endpoint count as evidence; treat it as');
w('a historical requirements source, not as the interface contract.');
w();
w('---');
w();

// -- Preamble: the two surfaces -------------------------------------------
w('## Four surfaces, and they are not interchangeable');
w();
w('ADR-008 adopted three Supabase capabilities — Postgres, Auth and Storage — and *rejected*');
w('the Data API as the primary interface. So the surface your SvelteKit code will lean on hardest');
w('is not A; it is B, C and D. A is enumerated for completeness.');
w();
w('| | A — Data API | B — Server data layer | C — Auth | D — Storage |');
w('|---|---|---|---|---|');
w('| Generated by | PostgREST, from the schema | us, hand-written | Supabase GoTrue | Supabase Storage |');
w('| Reached via | `/rest/v1/*` | `load` / `actions` / `+server.ts` | `supabase.auth.*` | `supabase.storage.*` |');
w('| Called from | browser via `supabase-js` | SvelteKit server | browser + server (`@supabase/ssr`) | server |');
w('| Credential | user JWT + `apikey` | session cookie | — | user JWT |');
w('| Tenant isolation | RLS via `request.jwt.claims` | RLS **plus** per-request `SET LOCAL` | n/a — auth is central (ADR-009) | bucket path + RLS |');
w('| ADR-008 stance | *"administrative reads only"* | **primary** | adopted | adopted |');
w();
w('ADR-008 rejected PostgREST as the primary API for four reasons that still hold:');
w('transactional business operations (a payroll run) span many tables; the 33 validators in');
w('`validation-utils.js` must be the server-side authority; UC-1.1 writes eight modules in one');
w('transaction; secrets need a server-side home. ADR-009 adds a fifth — a PostgREST URL is bound');
w('to one Supabase project, so it cannot serve tier-B or tier-C customers whose database is');
w('elsewhere. **Surface A is therefore enumerated below for completeness, not as a recommendation.**');
w();

// -- Gating facts ---------------------------------------------------------
w('### Prerequisites — verified by running them, not by reading');
w();
w('Everything below was found by applying the schema to a real PostgreSQL 17 and trying to use');
w('it as a non-owner role. None of it is visible in the DDL. `scripts/verify-migrations.sh`');
w('re-checks all of it from a clean database in about twenty seconds.');
w();
w('| # | Finding | Gates | Status |');
w('|---|---|---|---|');
w(`| 1 | \`custom_access_token_hook\` absent from schema.sql — the claim all 98 policies read is never written | A + B | ${status(fix.hook)} |`);
w(`| 2 | \`tenant_users\` RLS blocks the hook's own SELECT at token issue — stamps nothing, silently | A + B | ${status(fix.authAdmin)} |`);
w(`| 3 | Zero \`GRANT\`s — no role can read any table | A + B | ${status(fix.grants)} |`);
w(`| 4 | No \`GRANT USAGE ON SCHEMA app\` — every policy call fails before RLS evaluates | A + B | ${status(fix.schemaUsage)} |`);
w(`| 5 | \`app.current_tenant_id()\` raises on an empty or malformed claim instead of returning no rows | A + B | ${status(fix.harden)} |`);
w(`| 6 | 33 tables declare \`created_at\`/\`updated_at\` NOT NULL with no default — every INSERT fails | A + B | ${status(fix.defaults)} |`);
w(`| 7 | \`app.set_updated_at()\` defined but attached to no table | B | ${status(fix.defaults)} |`);
w(`| 8 | \`v_upcoming_celebrations\` has no \`security_invoker\` — returns every tenant's rows | A | ${status(fix.invoker)} |`);
w(`| 9 | \`exchange_rates\` enables RLS without FORCE, alone among the 98 | A + B | ${status(fix.force)} |`);
w();
w('Two of these deserve emphasis, because both fail *silently* rather than loudly:');
w();
w('- **#2** is a deadlock. The hook reads `tenant_users` to find the membership, but');
w('  `tenant_users` carries `tenant_isolation` with no `TO` clause, so the policy applies to');
w('  `supabase_auth_admin` too — and at token issue there is no claim yet. The hook finds nothing,');
w('  stamps nothing, and login *succeeds*. Every query afterwards returns zero rows.');
w('  `SECURITY DEFINER` does not fix it: under `FORCE ROW LEVEL SECURITY` the owner is subject to');
w('  policies as well. It needs an explicit permissive policy for that one role.');
w('- **#5** turns a missing tenant into a database error rather than an empty result. Under');
w('  ADR-009\'s long-lived pools, a cleared setting is reachable, and the difference between');
w('  "no rows" and "500" is the difference between isolation and an outage.');
w();
if (schemaShipped) {
  w(`The schema ships as \`${migrationFiles.filter((f) => /^2026/.test(f)).join('`, `')}\`.`);
  w('Once applied to your Supabase project, verify this document against the live database:');
} else {
  w('The schema is **not deployed** — `app/supabase/migrations/` holds only the CMSaasStarter');
  w('migrations. Until it ships, this document derived from the file is the only list there is.');
}
w();
w('```bash');
w('# prove the tenancy guarantees locally first — no cloud project needed');
w('./scripts/verify-migrations.sh --with-mock-data');
w();
w('# then confirm the same things on the live database (read-only, safe on prod)');
w('./scripts/verify-remote.sh "$SUPABASE_DB_URL"');
w();
w('# no database password? paste this into the dashboard SQL Editor instead');
w('cat scripts/verify-remote.sql');
w();
w('# the exact reflected surface, as OpenAPI');
w('curl -s "https://<project-ref>.supabase.co/rest/v1/" \\');
w('  -H "apikey: <anon-key>" | jq \'.paths | keys\'');
w();
w('# typed client for surface A');
w('npx supabase gen types typescript --project-id <project-ref> \\');
w('  --schema public > app/src/DatabaseDefinitions.ts   # the name this repo already uses');
w('```');
w();
w('---');
w();

// -- Surface A ------------------------------------------------------------
w('## Surface A — Supabase Data API (reflected)');
w();
w('Every table below yields the same six operations. This is the complete pattern; it is not');
w('repeated per table because PostgREST generates it uniformly.');
w();
w('```http');
w('GET    /rest/v1/<table>?select=*&<col>=eq.<val>&order=<col>&limit=&offset=   # list / filter');
w('GET    /rest/v1/<table>?id=eq.<uuid>&select=*                               # single row');
w('POST   /rest/v1/<table>                      Prefer: return=representation  # insert');
w('PATCH  /rest/v1/<table>?id=eq.<uuid>                                        # update');
w('DELETE /rest/v1/<table>?id=eq.<uuid>                                        # delete');
w('POST   /rest/v1/<table>                      Prefer: resolution=merge-duplicates  # upsert');
w('```');
w();
w('Embedded resources traverse the declared foreign keys, e.g.');
w('`GET /rest/v1/employees?select=*,firm_departments(name),compensation_base(*)`.');
w();
w(`### Tables by module (${tables.length})`);
w();
for (const [mod] of [...MODULES, ['Unassigned']]) {
  const ts = byModule.get(mod);
  if (!ts?.length) continue;
  w(`**${mod}** (${ts.length})`);
  w();
  w('| Table | Cols | tenant_id | RLS | Business key |');
  w('|---|---:|---|---|---|');
  for (const t of ts.sort((a, b) => a.name.localeCompare(b.name))) {
    const rls = rlsForced.has(t.name) ? 'forced' : rlsEnabled.has(t.name) ? 'enabled' : '—';
    w(`| \`${t.name}\` | ${t.columns.length} | ${t.hasTenantId ? 'yes' : '—'} | ${rls} | ${t.code ? `\`${t.code}\`` : '—'} |`);
  }
  w();
}
w('### Views');
w();
for (const v of views) {
  w(`- \`GET /rest/v1/${v.name}\` — ${v.materialized ? 'materialized' : 'view'}; ` +
    `security_invoker: **${v.securityInvoker ? 'on' : 'off (unsafe to expose)'}**`);
}
w();
w('### RPC');
w();
if (callableRpc.length === 0) {
  w('None. See the gating facts above.');
} else {
  for (const f of callableRpc) w(`- \`POST /rest/v1/rpc/${f.name}\` → ${f.returns}`);
}
w();
w('---');
w();

// -- Surface B ------------------------------------------------------------
w('## Surface B — the server data layer (what you are about to build)');
w();
w('ADR-004 fixes the shape: `+page.server.ts` `load` for reads, form `actions` for writes,');
w('`+server.ts` only where a non-page consumer needs JSON, and `$lib/server/` for the SQL —');
w('a boundary SvelteKit enforces at build time.');
w();
w('**Routes are not one-per-table, and the inventory below is not a route list.** A `load` runs');
w('in the same process as the Postgres client, so ADR-004\'s rule is *one page, one query*: the');
w('employee directory joins `employees`, `firm_departments` and `compensation_base` in a single');
w('`load`. Pages are defined by `02-ux-design-specification.md` and the mockups in');
w('`html-mockups/` — ground the route tree there when you build it.');
w();
w('What *is* one-per-table is the repository layer. Each table below needs exactly one');
w('`$lib/server/<module>/<resource>.repo.ts` owning its SQL, and that is mechanically derivable,');
w('so it is what this section enumerates.');
w();
w('```');
w('src/lib/server/<module>/<resource>.repo.ts     SQL, the only place it lives   <- one per table');
w('src/routes/(app)/<page>/+page.server.ts        load + actions                 <- one per PAGE');
w('src/routes/api/<module>/<resource>/+server.ts  GET/POST/PATCH                 <- JSON consumers only');
w('```');
w();
w('Each repository gets the canonical operations below unless a domain operation in the next');
w('section overrides it.');
w();
for (const [mod] of [...MODULES, ['Unassigned']]) {
  const ts = byModule.get(mod);
  if (!ts?.length) continue;
  const slug = mod.toLowerCase().replace(/[^a-z]+/g, '-');
  w(`### ${mod}`);
  w();
  w('| Table | Repository | Canonical operations |');
  w('|---|---|---|');
  for (const t of ts.sort((a, b) => a.name.localeCompare(b.name))) {
    const ops = ['`list`', '`getById`', '`create`', '`update`',
      t.softDelete ? '`archive`' : '`remove`'].join(', ');
    w(`| \`${t.name}\` | \`$lib/server/${slug}/${t.name}.repo.ts\` | ${ops} |`);
  }
  w();
}
w('---');
w();

// -- Domain operations ----------------------------------------------------
w('## Domain operations harvested from the module specifications');
w();
w(`${harvested.size} distinct endpoint declarations were found across **every** \`.md\` in`);
w('`docs/` — not a curated subset, because `accounting-gap-analysis.md` carries ten that a');
w('`module-*` filter would have missed. They arrive in two');
w('conventions (`/api/v1/x/{id}` and `/api/x/:id`) which are normalised here to one.');
w(`${crudOps.length} collapse into the plain CRUD above. The **${domainOps.length}** below do not —`);
w('these are the operations that need hand-written server code, and they are the reason ADR-008');
w('kept the SvelteKit server.');
w();
const byResource = new Map();
for (const c of domainOps) {
  if (!byResource.has(c.resource)) byResource.set(c.resource, []);
  byResource.get(c.resource).push(c);
}
w('| Operation | Backing table | Declared in |');
w('|---|---|---|');
for (const res of [...byResource.keys()].sort()) {
  for (const c of byResource.get(res).sort((a, b) => a.path.localeCompare(b.path))) {
    const srcs = [...(harvested.get(`${c.method} ${c.path}`) ?? [])]
      .map((f) => basename(f, '.md')).join(', ');
    w(`| \`${c.method} ${c.path}\` | ${c.table ? `\`${c.table}\`` : '**none**'} | ${srcs} |`);
  }
}
w();
w('---');
w();

// -- Surface C: Auth ------------------------------------------------------
w('## Surface C — Supabase Auth');
w();
w('ADR-008: *"Auth is the decisive reason for this choice."* Unlike the Data API, this surface is');
w('certain to be used — `@supabase/ssr` and `@supabase/auth-ui-svelte` are already dependencies and');
w('the CMSaasStarter routes below already call it. Call it through the `supabase-js` client, not by');
w('URL; `@supabase/ssr` handles the cookie plumbing.');
w();
w(`### Methods already used in \`app/src\` (${authCalls.size})`);
w();
if (authCalls.size === 0) {
  w('None found.');
} else {
  w('| Method | Used in |');
  w('|---|---|');
  for (const [m, files] of [...authCalls].sort()) {
    w(`| \`supabase.auth.${m}()\` | ${[...files].sort().map((f) => `\`${f}\``).join(', ')} |`);
  }
}
w();
w(`### Auth routes already scaffolded (${authRoutes.length})`);
w();
for (const r of authRoutes) w(`- \`${r}\``);
w();
w('### What this product adds on top');
w();
w('These are ours to build; the template does not have them.');
w();
w('| Concern | Where it lives | Reference |');
w('|---|---|---|');
w('| Stamp `app_metadata.tenant_id` at token issue | `custom_access_token_hook` — **missing, see above** | ADR-008 |');
w('| Multi-tenant membership | `tenant_users` table | ADR-008 |');
w('| Tenant switching (re-issues the token) | server action + hook | ADR-008 |');
w('| Subdomain → tenant resolution | `hooks.server.ts` + control plane | ADR-009 |');
w('| Enterprise SSO for dedicated tenants | deferred | ADR-010 |');
w('| MFA | `supabase.auth.mfa.*` | present in template |');
w();
w('Note ADR-009\'s accepted trade: business data may sit in a customer\'s own database, but user');
w('identities stay in our Supabase project. Auth is centralised even where data is not.');
w();
w('---');
w();

// -- Surface D: Storage ---------------------------------------------------
w('## Surface D — Supabase Storage');
w();
w('ADR-008 adopts Storage for *"documents, attachments, exports."* No `supabase.storage` call');
w('exists in `app/src` yet, so this surface is entirely ahead of you. It is derived from the');
w('columns that hold file references — every one of them implies an object somewhere.');
w();
w('The client shape is the same everywhere:');
w();
w('```ts');
w('supabase.storage.from(bucket).upload(path, file)   // also: download, remove,');
w('                                                   // createSignedUrl, list');
w('```');
w();
w(`### Tables holding file references (${storageTables.length})`);
w();
w('| Table | Columns |');
w('|---|---|');
for (const t of storageTables.sort((a, b) => a.table.localeCompare(b.table))) {
  w(`| \`${t.table}\` | ${t.cols.map((c) => `\`${c}\``).join(', ')} |`);
}
w();
w('### Two decisions to make before uploading anything');
w();
w('1. **Bucket layout.** Prefix every object path with `tenant_id` — `<bucket>/<tenant_id>/<...>` —');
w('   so a Storage RLS policy can enforce the same isolation the tables have. Private buckets and');
w('   signed URLs for anything employee-related; a public bucket only for logos and avatars.');
w('2. **What the `*_url` columns store.** A signed URL expires, so persisting one gives a column');
w('   that silently rots. Store the object *path* and mint a signed URL per request. The column');
w('   names above say `url`, which is the wrong contract — worth correcting in the schema before');
w('   code depends on it.');
w();
w('Under ADR-009, tier-B and tier-C customers have their own database but share this Storage');
w('project. The `tenant_id` path prefix is what keeps their objects apart.');
w();
w('---');
w();

// -- Coverage -------------------------------------------------------------
w('## Coverage — how you know this list is complete');
w();
w('Completeness is not a claim, it is these two reconciliations. Both should trend to empty.');
w();
w(`### Declared operations with no backing table (${unbackedResources.length})`);
w();
w('Either the schema is missing something, or the spec describes an endpoint we dropped.');
w('Each one needs a decision.');
w();
for (const r of unbackedResources) {
  const ops = classified.filter((c) => c.resource === r);
  w(`- \`${r}\` — ${plural(ops.length, 'operation')}: ` + ops.map((c) => `\`${c.method} ${c.path}\``).join(', '));
}
w();
w(`Separately, ${plural(derivedResources.length, 'namespace')} ` +
  `${derivedResources.length === 1 ? 'has' : 'have'} no table **by design** — ` +
  `${derivedResources.length === 1 ? 'it is a derived read' : 'they are derived reads'}, ` +
  'not resources: ' + derivedResources.map((r) => `\`/${r}/*\``).join(', ') + '.');
w('These belong in `+server.ts` or a `load`, backed by hand-written SQL.');
w();
w(`### Tables with no declared operation (${uncoveredTables.length} of ${tables.length})`);
w();
w('These get the canonical CRUD from surface B and nothing more. Where that is wrong, the module');
w('spec is silent and needs writing — note that the specs for HR, payroll, accounting, marketing,');
w('firm profile and the AI assistant declare **no** endpoints at all, so their tables all land here.');
w();
const uncoveredByModule = new Map();
for (const t of uncoveredTables) {
  const m = moduleOf(t.name);
  if (!uncoveredByModule.has(m)) uncoveredByModule.set(m, []);
  uncoveredByModule.get(m).push(t.name);
}
for (const [m, ts] of [...uncoveredByModule].sort()) {
  w(`- **${m}** (${ts.length}): \`${ts.sort().join('`, `')}\``);
}
w();
w('---');
w();
w('## Enum types');
w();
w(`${enums.length} native enum types constrain request payloads on both surfaces. Generate the`);
w('TypeScript union for each from `docs/enumerations.json` rather than retyping them.');
w();
w('| Type | Values |');
w('|---|---|');
for (const e of enums.sort((a, b) => a.name.localeCompare(b.name))) {
  const vals = e.values.length > 8
    ? e.values.slice(0, 8).map((v) => `\`${v}\``).join(', ') + `, … (${e.values.length} total)`
    : e.values.map((v) => `\`${v}\``).join(', ');
  w(`| \`${e.name}\` | ${vals} |`);
}
w();

writeFileSync(OUT, L.join('\n'));

console.error(`wrote ${OUT}`);
console.error(`  tables=${tables.length} views=${views.length} functions=${functions.length} enums=${enums.length}`);
console.error(`  grants=${grants} policies=${policies} callable-rpc=${callableRpc.length}`);
console.error(`  harvested=${harvested.size} crud=${crudOps.length} domain=${domainOps.length}`);
console.error(`  unbacked-resources=${unbackedResources.length} uncovered-tables=${uncoveredTables.length}`);

#!/usr/bin/env node
/**
 * Every column on a personal-data table carries real fixture data.
 *
 * An empty column is a column nothing tests. `compensation_premiums` held zero
 * rows and every "a colleague cannot read this" assertion against it passed
 * with nothing to hide; the five JSONB compensation columns on `employees`
 * were `{}`, so any visibility assertion over them would have passed while
 * they were protected by nothing at all (L48). The same shape produced L41 —
 * a guard that could not see inside JSONB, over columns that happened to be
 * empty.
 *
 * A test whose subject is NULL does not fail. It passes, and it reports the
 * absence of data as the absence of a problem. That is the single most common
 * way a check in this repository has stopped testing anything.
 *
 * So: on the tables below, every column must have at least one row with a
 * non-empty value, or sit on EXPECTED_SPARSE with a reason.
 *
 * SCOPE, deliberately. These are the tables holding data ABOUT A PERSON, where
 * an empty column means an untested disclosure rule. The rest of the schema
 * has 485 further never-filled columns across accounting, projects and
 * ticketing — a real backlog, recorded in docs/10-lessons-learned.md (L48),
 * but not a security hole, and enforcing everywhere at once would produce an
 * exemption list nobody reads.
 */
import { execFileSync } from "node:child_process"

const TABLES = [
  "employees",
  "employment_terms",
  "compensation_base",
  "compensation_allowances",
  "compensation_variable",
  "compensation_premiums",
  "compensation_equity",
  "employee_bank_accounts",
  "hr_emergency_contacts",
  "hr_employment_history",
  "hr_reviews",
  "hr_feedback",
  "payroll_run_employees",
  "payroll_india_salary_structure",
  "payroll_india_tax_declarations",
  "payroll_tax_withholding_certificates",
  "payroll_employee_deductions",
  "tenant_users",
]

/**
 * `table.column` -> why NULL is the only sensible value across every fixture
 * row. A committed literal with a reason, like every exemption here: adding
 * one and removing one both require a reviewed edit.
 *
 * "We did not get round to it" is not a reason. If a value is meaningful for
 * any row, seed that row instead — that is the entire point of this check.
 */
const EXPECTED_SPARSE = new Map([
  [
    "employees.end_date",
    "every fixture employee is currently employed; a leaver would set it",
  ],
  [
    "tenant_users.invited_at",
    "the fixture's members were seeded directly rather than invited",
  ],
  [
    "payroll_run_employees.notes",
    "a free-text exception note; the fixture's runs are all unexceptional",
  ],
  [
    "profiles.id",
    "the CMSaasStarter profile table is not part of the product's data model",
  ],
])

const url = process.env.DATABASE_URL
if (!url) {
  console.error("  DATABASE_URL is not set")
  process.exit(1)
}

/**
 * Non-empty means: not NULL, not the empty string, and not an empty JSON
 * document. A numeric `0` and a `false` ARE data — a zero deduction is a real
 * fact and hiding it here would recreate the blind spot.
 */
const sql = `
DO $$
DECLARE r record; n bigint; f bigint;
BEGIN
  CREATE TEMP TABLE _cov(tbl text, col text, filled bigint, total bigint);
  FOR r IN
    SELECT c.table_name t, c.column_name k, c.data_type d
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.table_name = ANY(ARRAY[${TABLES.map((t) => `'${t}'`).join(",")}])
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.t) INTO n;
    IF n = 0 THEN INSERT INTO _cov VALUES (r.t, r.k, 0, 0); CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM %I WHERE %I IS NOT NULL%s', r.t, r.k,
      CASE WHEN r.d = 'jsonb'
             THEN format(' AND %I::text NOT IN (''{}'',''[]'',''null'')', r.k)
           WHEN r.d IN ('text','character varying')
             THEN format(' AND %I <> ''''', r.k)
           ELSE '' END) INTO f;
    INSERT INTO _cov VALUES (r.t, r.k, f, n);
  END LOOP;
END $$;
SELECT tbl || '.' || col || E'\t' || total FROM _cov WHERE filled = 0 ORDER BY tbl, col;
`

const out = execFileSync("psql", [url, "-X", "-q", "-tA", "-c", sql], {
  encoding: "utf8",
}).trim()

const empty = []
const emptyTables = new Set()
for (const line of out.split("\n").filter(Boolean)) {
  const [id, total] = line.split("\t")
  if (EXPECTED_SPARSE.has(id)) continue
  if (total === "0") emptyTables.add(id.split(".")[0])
  empty.push(id)
}

if (empty.length) {
  console.error(`\n  ${empty.length} column(s) carry no fixture data:\n`)
  for (const c of empty) console.error(`    ${c}`)
  if (emptyTables.size) {
    console.error(
      `\n  ${[...emptyTables].join(", ")} has NO ROWS AT ALL — every assertion` +
        "\n  about it passes with nothing to hide.",
    )
  }
  console.error(
    "\n  Seed a row in packages/database/fixtures/mock-data.sql. A test whose" +
      "\n  subject is NULL does not fail — it reports the absence of data as" +
      "\n  the absence of a problem, which is how a check quietly stops testing" +
      "\n  anything (L48). If NULL really is the only sensible value for every" +
      "\n  row, add it to EXPECTED_SPARSE in this file WITH A REASON.\n",
  )
  process.exit(1)
}
console.log("  every personal-data column carries fixture data")

#!/usr/bin/env node
/**
 * Every base-table column must have at least one fixture row with a
 * non-empty value, or sit on EXPECTED_SPARSE with a reason (L48). An empty
 * column is untested — a visibility assertion over `{}` passes vacuously.
 */
import { execFileSync } from "node:child_process"


/** `table.column` -> why NULL is the only sensible value. "Not got round to it" is not a reason. */
const EXPECTED_SPARSE = new Map([
  // Columns referencing a module that has not been built. There is no row to
  // point at, and inventing a uuid would satisfy the type while describing
  // nothing. Delete these entries when the module lands — a stale exemption is
  // as much a problem as a missing one.
  ["projects.contract_id", "no `contracts` table yet"],
  ["projects.proposal_id", "no `proposals` table yet"],
  ["tasks.assigned_team_id", "no `teams` table yet"],

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
       AND EXISTS (SELECT 1 FROM information_schema.tables x
                    WHERE x.table_name = c.table_name
                      AND x.table_schema = c.table_schema
                      AND x.table_type = 'BASE TABLE')
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
console.log(`  every column carries fixture data (${empty.length === 0 ? "0" : ""} gaps)`)

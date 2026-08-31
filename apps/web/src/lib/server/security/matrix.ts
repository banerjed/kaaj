/**
 * The disclosure matrix — every sensitive value, and what actually holds it.
 *
 * Written after a plain employee turned out to be able to read every
 * colleague's salary from the directory page (L47). The bug was not a missing
 * check; it was that the codebase had no place where the question "who may
 * read THIS VALUE, and by what mechanism" was written down. Protection was
 * applied per mechanism — a policy on a table, `can()` on an action — while
 * disclosure happens per value, and nothing compared the two.
 *
 * **`defense` is the spine, not `audience`.** For a row that must be broadly
 * visible — `employees` is a staff directory, so every colleague can read the
 * row — RLS *cannot* hide a column, and "the test saw NULL" proves nothing
 * when the fixture happens to be empty. That is the vacuous pass this codebase
 * keeps rediscovering (L41, and five empty JSONB columns on `employees` this
 * morning). So each field declares the mechanism that holds it, and
 * `disclosure.test.ts` asserts THAT MECHANISM IS IN FORCE.
 *
 * Adding a sensitive column means adding a row here. `./check` runs
 * `verify-matrix-complete.mjs`, which fails when a column in the schema is
 * neither listed here nor in its committed not-sensitive list — so a value
 * nobody classified cannot ship.
 */

/** How a value is actually held away from someone who may not read it. */
export type Defense =
  /** A row-visibility policy makes the whole row invisible. */
  | "rls"
  /** Ciphertext at rest; only `$lib/server/pii` opens it. */
  | "encrypted"
  /**
   * The row is visible but the value must never reach a projection. Enforced
   * by `verify-no-unprotected-fallback.mjs`, which fails on any qualified read.
   * This is the only defense available on a broadly-visible row short of a
   * column-level REVOKE.
   */
  | "projection"
  /** Deliberately readable by colleagues. Requires a reason, like any exemption. */
  | "open"

/** Who may read a value ABOUT AN EMPLOYEE, expressed against the subject. */
export type Audience =
  /** Anyone in the tenant. Directory data. */
  | "colleagues"
  /** The subject, their management chain, and HR/payroll. */
  | "self+manager+hr"
  /** The subject and HR/payroll. A manager is NOT entitled. */
  | "self+hr"
  /** HR and payroll only — not even the subject, until released. */
  | "hr+payroll"

/**
 * Tables whose ENTIRE ROW is scoped by a row-visibility policy.
 *
 * The defense here is row-level, so it applies uniformly to every column: if
 * the policy refuses you the row, it refuses you all thirty of its columns at
 * once. Declaring those columns one by one would be thirty restatements of a
 * single fact, and thirty places to get it wrong.
 *
 * **Per-column declarations are only needed where the row is broadly
 * visible** — which, today, means `employees` and nothing else. That is the
 * whole asymmetry: a staff directory row must be readable by colleagues, so
 * RLS cannot defend any column on it, and each value has to name its own
 * mechanism. Everywhere else the row policy is the mechanism.
 */
export const PROTECTED_TABLES: Record<
  string,
  { defense: Extract<Defense, "rls">; audience: Audience; why: string }
> = {
  compensation_base: {
    defense: "rls",
    audience: "self+hr",
    why: "Salary. The authoritative figure in the system; employees.base_amount is a cache of it, and reading that cache instead is L47.",
  },
  compensation_allowances: {
    defense: "rls",
    audience: "self+hr",
    why: "Allowances are pay by another name — a housing or travel allowance is part of what someone earns, and disclosing it discloses their package.",
  },
  compensation_variable: {
    defense: "rls",
    audience: "self+hr",
    why: "Bonus and commission targets disclose both earnings and the performance expectation attached to them; the quota and commission structures alongside them are the same disclosure in more detail.",
  },
  compensation_premiums: {
    defense: "rls",
    audience: "self+hr",
    why: "Shift, on-call and hazard premiums are pay, and they also reveal working patterns a colleague has no business knowing.",
  },
  compensation_equity: {
    defense: "rls",
    audience: "self+hr",
    why: "Equity grants are material non-public information about an individual: share counts, strike price, vesting and fair market value together are the entire grant.",
  },
}

export type SensitiveField = {
  /** `table.column`, or `table.column.jsonPath` for a value inside JSONB. */
  id: string
  table: string
  column: string
  defense: Defense
  audience: Audience
  /** Why this audience — the compliance or product reason, not the mechanism. */
  why: string
}

/**
 * First cut: `employees` and the five `compensation_*` tables.
 *
 * Deliberately not the whole schema. 130 columns match a sensitive-shaped name
 * and most are firm business data (invoices, journal entries, the firm's own
 * bank accounts) whose audience is a functional role rather than a
 * relationship to a subject — a different axis, and a second matrix. Proving
 * the harness on the six tables where a live exposure was measured comes
 * first; a 130-row matrix built in one pass would have holes indistinguishable
 * from correct entries.
 */
export const SENSITIVE_FIELDS: SensitiveField[] = [
  // -- employees: one row, broadly visible, carrying values of three kinds ---
  {
    id: "employees.birth_date",
    table: "employees",
    column: "birth_date",
    defense: "open",
    audience: "colleagues",
    why: "Product decision: birthdays are a colleague-visible social feature. Revisit if the directory is ever exposed outside the firm — a full DOB is an identity-theft input, and GDPR Art. 4 personal data.",
  },
  {
    id: "employees.phone",
    table: "employees",
    column: "phone",
    defense: "open",
    audience: "colleagues",
    why: "Product decision: a work contact number is directory data, and colleagues need to reach each other.",
  },
  {
    id: "employees.base_amount",
    table: "employees",
    column: "base_amount",
    defense: "projection",
    audience: "self+hr",
    why: "A denormalised cache of compensation_base.amount, on a row every colleague can read. Reading it bypasses the row policy on the authoritative table — this is L47, and it disclosed every salary in the firm.",
  },
  {
    id: "employees.salary_structure",
    table: "employees",
    column: "salary_structure",
    defense: "projection",
    audience: "self+hr",
    why: "Compensation. Empty in the fixture, which is why every existing guard passes on it — the leak arrives the day it is populated.",
  },
  {
    id: "employees.variable_compensation",
    table: "employees",
    column: "variable_compensation",
    defense: "projection",
    audience: "self+hr",
    why: "Compensation. Empty in the fixture (L41's shape: a guard reading information_schema cannot see inside JSONB).",
  },
  {
    id: "employees.compensation_band",
    table: "employees",
    column: "compensation_band",
    defense: "projection",
    audience: "self+manager+hr",
    why: "A person's own band, distinct from the published range for their level. A manager needs it to plan; a colleague does not.",
  },
  {
    id: "employees.default_hourly_rate",
    table: "employees",
    column: "default_hourly_rate",
    defense: "projection",
    audience: "self+manager+hr",
    why: "An internal cost rate divides out to an annual salary with one multiplication.",
  },
  {
    id: "employees.default_billable_rate",
    table: "employees",
    column: "default_billable_rate",
    defense: "projection",
    audience: "self+manager+hr",
    why: "What the firm charges for this person. Commercially sensitive, and it correlates with seniority.",
  },
  {
    id: "employees.tax_withholding",
    table: "employees",
    column: "tax_withholding",
    defense: "projection",
    audience: "self+hr",
    why: "Withholding elections disclose marital status and dependants — special-category-adjacent, and payroll data under GDPR Art. 9 in several member states.",
  },
  {
    id: "employees.benefits_elections",
    table: "employees",
    column: "benefits_elections",
    defense: "projection",
    audience: "self+hr",
    why: "Health and insurance elections. GDPR Art. 9 special category data.",
  },
  {
    id: "employees.ssn_tax_id_ct",
    table: "employees",
    column: "ssn_tax_id_ct",
    defense: "encrypted",
    audience: "self+hr",
    why: "National identifier. Per-employee key, so erasure is answerable (GDPR Art. 17). Never indexed — a btree keeps every value readable in its pages.",
  },
]

/** Everything the matrix covers: the policy-scoped tables, plus employees. */
export const COVERED_TABLES = [
  ...Object.keys(PROTECTED_TABLES),
  ...new Set(SENSITIVE_FIELDS.map((f) => f.table)),
]

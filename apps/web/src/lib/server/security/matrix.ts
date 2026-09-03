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
    why: "Salary. The authoritative figure in the system; employees.base_amount_pvt is a cache of it, and reading that cache instead is L47.",
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

/**
 * Who may read a value about the FIRM's own business — a functional role,
 * not a relationship to an employee. `Audience` above answers "is this person
 * the subject, their manager, or HR"; that question does not apply to an
 * invoice. This is the different axis the top of this file used to defer.
 */
export type FunctionalAudience =
  /**
   * `finance_admin` and `auditor` read; `finance_admin` and the base admin
   * roles (`owner`, `firm_admin`) write, `auditor` does not. Mirrors
   * `app.reads_all_accounting()` / `app.writes_accounting()` exactly —
   * `supabase/migrations/20260903045821_accounting_row_visibility.sql`.
   */
  "finance"

/**
 * The fifteen accounting tables, table-level, the same way `PROTECTED_TABLES`
 * covers `compensation_*` — the row is finance-function-only, so the policy
 * defends every column on it at once.
 *
 * Deliberately NOT a 130-row per-column matrix. `disclosure.test.ts`'s
 * generated-case model is built against `Audience` (self/manager/colleague/
 * hr/payroll) — a subject's relationship to their OWN data — which has no
 * meaning for a bank account or a journal entry, so reusing it here would be
 * the wrong tool wearing the right shape. The mechanism itself is measured
 * directly, both halves, in `row-visibility.test.ts`'s "accounting is visible
 * to the finance function, and to nobody else" — this declaration is what
 * lets `verify-matrix-complete.mjs` hold every column on these tables to
 * having been decided, the same guarantee `employees` gets.
 */
export const PROTECTED_BUSINESS_TABLES: Record<
  string,
  {
    defense: Extract<Defense, "rls">
    audience: FunctionalAudience
    why: string
  }
> = {
  invoices: {
    defense: "rls",
    audience: "finance",
    why: "What the firm bills, and to whom — commercial terms, not directory data.",
  },
  invoice_lines: {
    defense: "rls",
    audience: "finance",
    why: "Line-item detail behind an invoice total.",
  },
  bills: {
    defense: "rls",
    audience: "finance",
    why: "What the firm owes, and to whom.",
  },
  bill_lines: {
    defense: "rls",
    audience: "finance",
    why: "Line-item detail behind a bill total.",
  },
  payments: {
    defense: "rls",
    audience: "finance",
    why: "Money actually moving, in either direction.",
  },
  payment_allocations: {
    defense: "rls",
    audience: "finance",
    why: "Which invoice or bill a payment settles.",
  },
  bank_accounts: {
    defense: "rls",
    audience: "finance",
    why: "The firm's own account numbers — a direct fraud target if read by anyone outside finance.",
  },
  bank_transactions: {
    defense: "rls",
    audience: "finance",
    why: "The firm's real cash movements, ahead of reconciliation.",
  },
  bank_reconciliation_rules: {
    defense: "rls",
    audience: "finance",
    why: "How incoming transactions map to the ledger — read together with bank_transactions, it explains the firm's banking relationships.",
  },
  journal_entries: {
    defense: "rls",
    audience: "finance",
    why: "The general ledger. Every other accounting table ultimately posts here.",
  },
  journal_entry_lines: {
    defense: "rls",
    audience: "finance",
    why: "The debits and credits behind a journal entry.",
  },
  chart_of_accounts: {
    defense: "rls",
    audience: "finance",
    why: "The firm's account structure — not a figure by itself, but the map every figure above is filed under.",
  },
  accounting_periods: {
    defense: "rls",
    audience: "finance",
    why: "Which periods are open or closed governs which of the above can still be written.",
  },
  vendors: {
    defense: "rls",
    audience: "finance",
    why: "Who the firm pays, and the banking and tax detail attached to that relationship.",
  },
  expenses: {
    defense: "rls",
    audience: "finance",
    why: "What was spent, by whom, and reimbursed how — financial detail about a person, filed as a business record rather than under `employees`.",
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
 * `employees` and the five `compensation_*` tables, per column — the subject
 * relationship (self/manager/colleague/hr/payroll) that `Audience` encodes.
 *
 * Firm business data (invoices, journal entries, the firm's own bank
 * accounts) is `PROTECTED_BUSINESS_TABLES` above instead of more entries
 * here: its audience is a functional role, not a relationship to a subject —
 * a different axis, declared table-level rather than as a 130-row per-column
 * matrix that would have holes indistinguishable from correct entries.
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
    id: "employees.base_amount_pvt",
    table: "employees",
    column: "base_amount_pvt",
    defense: "projection",
    audience: "self+hr",
    why: "A denormalised cache of compensation_base.amount, on a row every colleague can read. Reading it bypasses the row policy on the authoritative table — this is L47, and it disclosed every salary in the firm.",
  },
  {
    id: "employees.salary_structure_pvt",
    table: "employees",
    column: "salary_structure_pvt",
    defense: "projection",
    audience: "self+hr",
    why: "Compensation. Empty in the fixture, which is why every existing guard passes on it — the leak arrives the day it is populated.",
  },
  {
    id: "employees.variable_compensation_pvt",
    table: "employees",
    column: "variable_compensation_pvt",
    defense: "projection",
    audience: "self+hr",
    why: "Compensation. Empty in the fixture (L41's shape: a guard reading information_schema cannot see inside JSONB).",
  },
  {
    id: "employees.compensation_band_pvt",
    table: "employees",
    column: "compensation_band_pvt",
    defense: "projection",
    audience: "self+manager+hr",
    why: "A person's own band, distinct from the published range for their level. A manager needs it to plan; a colleague does not.",
  },
  {
    id: "employees.default_hourly_rate_pvt",
    table: "employees",
    column: "default_hourly_rate_pvt",
    defense: "projection",
    audience: "self+manager+hr",
    why: "An internal cost rate divides out to an annual salary with one multiplication.",
  },
  {
    id: "employees.default_billable_rate_pvt",
    table: "employees",
    column: "default_billable_rate_pvt",
    defense: "projection",
    audience: "self+manager+hr",
    why: "What the firm charges for this person. Commercially sensitive, and it correlates with seniority.",
  },
  {
    id: "employees.tax_withholding_pvt",
    table: "employees",
    column: "tax_withholding_pvt",
    defense: "projection",
    audience: "self+hr",
    why: "Withholding elections disclose marital status and dependants — special-category-adjacent, and payroll data under GDPR Art. 9 in several member states.",
  },
  {
    id: "employees.benefits_elections_pvt",
    table: "employees",
    column: "benefits_elections_pvt",
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
  ...Object.keys(PROTECTED_BUSINESS_TABLES),
  ...new Set(SENSITIVE_FIELDS.map((f) => f.table)),
]

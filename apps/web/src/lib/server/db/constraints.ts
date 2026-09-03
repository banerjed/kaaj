import { fail } from "@sveltejs/kit"

/**
 * Database refusals, turned into a sentence the person who submitted the form
 * can act on.
 *
 * `FormReader` is the first line and it catches the shape of a value. It
 * cannot catch what only the database knows: that this office code is already
 * taken, that the package this benefit points at was archived a moment ago,
 * that this firm already has a headquarters. Those arrive as a `PostgresError`
 * from inside the transaction, and an uncaught one is an "Internal Error"
 * crash page with the form's contents gone — measured, not assumed: a
 * duplicate `location_code` answered HTTP 500 with no field named and nothing
 * the user could do about it.
 *
 * **Keyed on `constraint_name`, never on the message text.** The message is
 * prose Postgres composes and is free to change; the constraint name is in the
 * migration. It is also the only thing that says WHICH field to put the cursor
 * on — SQLSTATE 23505 alone means "something was duplicate".
 *
 * **The registry is a committed literal, like every other list here.** A new
 * UNIQUE or CHECK reachable from a form is a deliberate line in this file with
 * a sentence a person can read. `./check` fails on one that is missing, so a
 * new constraint forces the decision rather than defaulting to a 500.
 */

type Refusal = { errorFields: string[]; message: string }

/**
 * Constraint name → what to tell the person, and where to put the cursor.
 *
 * A message says what is wrong AND what to do about it. "Duplicate key value"
 * is neither.
 */
const REGISTRY: Record<string, Refusal> = {
  // ---- Business keys: UNIQUE (tenant_id, <code>) ------------------------
  firm_locations_tenant_id_location_code_key: {
    errorFields: ["location_code"],
    message:
      "Another office already uses that code. Office codes must be unique — pick a different one.",
  },
  firm_departments_tenant_id_department_code_key: {
    errorFields: ["department_code"],
    message:
      "Another department already uses that code. Department codes must be unique — pick a different one.",
  },
  firm_holidays_tenant_id_holiday_id_key: {
    errorFields: ["holiday_id"],
    message:
      "Another holiday already uses that reference. Holiday references must be unique — pick a different one, or leave it blank.",
  },
  employees_tenant_id_employee_id_key: {
    errorFields: ["employee_id"],
    message:
      "Someone already has that employee ID. Employee IDs must be unique — pick a different one.",
  },
  projects_tenant_id_project_id_key: {
    errorFields: ["project_id"],
    message:
      "Another project already uses that reference. Pick a different one.",
  },
  tenants_subdomain_key: {
    errorFields: ["subdomain"],
    message: "That subdomain is already taken. Pick a different one.",
  },

  // A partial unique index rather than a constraint, so the name is the
  // INDEX name. One headquarters per firm.
  idx_firm_locations_hq: {
    errorFields: ["is_headquarters"],
    message:
      "This firm already has a headquarters. Clear the flag on the current one first.",
  },

  // ---- CHECK constraints -----------------------------------------------
  tenants_company_size_check: {
    errorFields: ["company_size"],
    message: "Pick a company size from the list.",
  },
  firm_payroll_policies_workweek_start_day_check: {
    errorFields: ["workweek_start_day"],
    message: "The week has to start on a real day.",
  },
  payroll_pay_schedules_frequency_check: {
    errorFields: ["frequency"],
    message: "Pick a pay frequency from the list.",
  },
  payroll_pay_schedules_pay_day_of_month_check: {
    errorFields: ["pay_day_of_month"],
    message: "The pay day has to be a real day of the month.",
  },
  payroll_pay_schedules_pay_day_of_week_check: {
    errorFields: ["pay_day_of_week"],
    message: "The pay day has to be a real day of the week.",
  },
  payroll_pay_schedules_holiday_adjustment_check: {
    errorFields: ["holiday_adjustment"],
    message: "Pick a holiday adjustment from the list.",
  },

  ck_payments_positive_amounts: {
    errorFields: ["amount"],
    message: "A payment has to be more than zero.",
  },

  // ---- Foreign keys ----------------------------------------------------
  // These fire when the row a form points at was archived or deleted between
  // the page rendering and the form being submitted — a stale tab, which is
  // ordinary rather than exotic.
  fk_firm_benefit_items_benefits_package_id: {
    errorFields: ["benefits_package_id"],
    message:
      "That benefits package no longer exists. Reload the page and pick one from the current list.",
  },
  fk_firm_job_levels_job_title_id: {
    errorFields: ["job_title_id"],
    message:
      "That job title no longer exists. Reload the page and pick one from the current list.",
  },
  fk_firm_departments_parent_department_id: {
    errorFields: ["parent_department_code"],
    message:
      "That parent department no longer exists. Reload the page and pick one from the current list.",
  },
  fk_firm_departments_location_id: {
    errorFields: ["location_code"],
    message:
      "That office no longer exists. Reload the page and pick one from the current list.",
  },
  fk_firm_holidays_location_id: {
    errorFields: ["location_code"],
    message:
      "That office no longer exists. Reload the page and pick one from the current list.",
  },
  fk_firm_payroll_policies_location_id: {
    errorFields: ["location_code"],
    message:
      "That office no longer exists. Reload the page and pick one from the current list.",
  },
  fk_payroll_runs_pay_schedule_id: {
    errorFields: ["pay_schedule_id"],
    message:
      "That pay schedule no longer exists. Reload the page and pick one from the current list.",
  },
  fk_payments_bank_account_id: {
    errorFields: ["bank_account_id"],
    message:
      "That bank account no longer exists. Reload the page and pick one from the current list.",
  },
  fk_compensation_base_employee_id: {
    errorFields: ["employee_id"],
    message: "That person no longer has a record. Reload the page.",
  },
}

/** Every constraint this file answers for. `./check` compares it to the schema. */
export const registeredConstraints = Object.keys(REGISTRY)

/**
 * The SQLSTATEs a form can provoke that this file is the answer to.
 *
 * Deliberately narrow. A `22P02` (bad uuid text) or `22001` (value too long)
 * is a `FormReader` gap, not a database refusal to translate — those get
 * fixed at the reader, so they are NOT listed here and keep failing loudly.
 */
const REFUSAL_CODES = new Set([
  "23505", // unique_violation
  "23514", // check_violation
  "23503", // foreign_key_violation
])

function constraintNameOf(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null
  const err = e as { code?: unknown; constraint_name?: unknown }
  if (typeof err.code !== "string" || !REFUSAL_CODES.has(err.code)) return null
  return typeof err.constraint_name === "string" ? err.constraint_name : null
}

/**
 * `fail(400, …)` for a registered refusal, or `null` for anything else.
 *
 * Returning null rather than a generic message is the point: an unregistered
 * constraint keeps crashing loudly, in development and in the logs, where
 * somebody adds it to the registry. Swallowing it into "something went wrong"
 * would hide the next one forever.
 *
 * ```ts
 * try {
 *   return await withTenant(actorFrom(locals), async (tx) => { … })
 * } catch (e) {
 *   const refused = constraintFailure(e)
 *   if (refused) return refused
 *   throw e
 * }
 * ```
 */
export function constraintFailure(e: unknown) {
  const name = constraintNameOf(e)
  if (!name) return null
  const refusal = REGISTRY[name]
  if (!refusal) return null
  return fail(400, refusal)
}

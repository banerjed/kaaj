/**
 * Which writes must record an audit entry.
 *
 * CLAUDE.md says "a write that someone may later be asked to justify records an
 * audit entry in the SAME transaction". That was prose with nothing enforcing
 * it, and it showed: of 26 actions, 3 audited — including neither hiring
 * someone nor editing their employment record.
 *
 * The test applied to each: **would someone, months later, ask "who changed
 * this, when, and what was it before?" — and would the answer affect a person's
 * money, employment, rights, or a regulator's question?**
 *
 * Both lists are committed literals with reasons, and `./check` fails on an
 * action that appears in neither. Adding an action therefore forces the
 * decision rather than defaulting to silence.
 *
 * `audit_log` can never be deleted from, so over-auditing is permanent noise
 * that buries the entries that matter. That is why a line exists at all.
 */

export type AuditedOperation = {
  /** The route file, relative to `src/routes/(app)/`. */
  route: string
  /** The exported action name; "default" for a single unnamed action. */
  action: string
  /** Why it must be recorded. */
  why: string
}

export const AUDITED_OPERATIONS: AuditedOperation[] = [
  // -- Money, employment, rights: not debatable -----------------------------
  {
    route: "compensation/[employeeId]",
    action: "raise",
    why: "A pay change. The example CLAUDE.md names, and the one question an employee is most likely to ask about later.",
  },
  {
    route: "time-off",
    action: "decide",
    why: "An entitlement granted or refused, by a named approver who is not the requester.",
  },
  {
    route: "performance",
    action: "submit",
    why: "The moment a manager's assessment becomes visible to its subject. Before it, the subject may not see it at all.",
  },
  {
    route: "performance",
    action: "acknowledge",
    why: "The employee's own record of having seen the assessment — the half that protects them, not the firm.",
  },
  {
    route: "employees/new",
    action: "default",
    why: "The start of an employment relationship, and the creation of a person's record under GDPR.",
  },
  {
    route: "employees/[id]/edit",
    action: "default",
    why: "Job title, manager, department and status are employment history. 'Who moved me under this manager, and when' is a real question.",
  },

  // -- Configuration that decides what people are PAID ----------------------
  {
    route: "settings/payroll/policies",
    action: "save",
    why: "Overtime thresholds, multipliers and rounding. If someone's overtime drops, this is the change that did it.",
  },
  {
    route: "settings/payroll/policies",
    action: "archive",
    why: "Removing a policy changes how a jurisdiction's overtime is computed from that moment on.",
  },
  {
    route: "settings/payroll/schedules",
    action: "save",
    why: "When people are paid. A moved pay date is a question somebody asks the same week.",
  },
  {
    route: "settings/payroll/schedules",
    action: "archive",
    why: "Retiring a schedule leaves the employees on it without one.",
  },
  {
    route: "settings/benefits",
    action: "savePackage",
    why: "Eligibility rules decide who is entitled to what.",
  },
  {
    route: "settings/benefits",
    action: "archivePackage",
    why: "Withdrawing a package withdraws an entitlement.",
  },
  {
    route: "settings/benefits",
    action: "saveItem",
    why: "costs_by_currency is the employer/employee split, which reaches payroll as a deduction.",
  },
  {
    route: "settings/benefits",
    action: "archiveItem",
    why: "Removing an item removes a deduction and a benefit at once.",
  },
  {
    route: "settings/locations",
    action: "save",
    why: "A location's timezone decides which DAY an attendance record belongs to (L35) and which pay period it falls in. Its locale decides how every figure there is formatted.",
  },
  {
    route: "settings/locations",
    action: "archive",
    why: "Closing an office reassigns or strands everyone assigned to it.",
  },

  // -- Recommended and accepted: compliance-adjacent ------------------------
  {
    route: "settings/holidays",
    action: "save",
    why: "A public holiday decides whether a day is paid leave, and whether working it earns a premium.",
  },
  {
    route: "settings/holidays",
    action: "archive",
    why: "Removing a holiday turns a paid day off into an ordinary working day.",
  },
  {
    route: "settings/job-titles",
    action: "saveLevel",
    why: "Levels carry salary_ranges — the PUBLISHED pay bands. Under the EU Pay Transparency Directive those are a disclosure, so changing one is a compliance act.",
  },
  {
    route: "settings/job-titles",
    action: "archiveLevel",
    why: "Retiring a level withdraws the published band that went with it.",
  },
  {
    route: "settings/company",
    action: "update",
    why: "Default currency, timezone and locale. Every figure in the product is formatted against these, and the timezone moves date boundaries.",
  },
]

/**
 * Writes that deliberately do NOT audit, with the reason.
 *
 * Not "we did not get round to it" — that is what the register exists to
 * prevent. Each of these changes a label rather than an outcome, and the row
 * itself carries `updated_at` and `updated_by` for the rare case someone asks.
 */
export const NOT_AUDITED: AuditedOperation[] = [
  {
    route: "settings/departments",
    action: "save",
    why: "Org structure. Politically sensitive, but renaming or re-parenting a department does not retroactively change anyone's pay or entitlement.",
  },
  {
    route: "settings/departments",
    action: "archive",
    why: "Archiving is refused while dependents exist, so it cannot orphan anyone silently.",
  },
  {
    route: "settings/job-titles",
    action: "saveTitle",
    why: "A title is a label; the LEVEL beneath it carries the money, and that is audited.",
  },
  {
    route: "settings/job-titles",
    action: "archiveTitle",
    why: "Same: the band lives on the level, not the title.",
  },
]

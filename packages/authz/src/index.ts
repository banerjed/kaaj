/**
 * The authorization vocabulary, and which role bundles grant what.
 *
 * A WORKSPACE PACKAGE, not application code, and deliberately so. Two suites
 * assert authorization: `apps/web` tests the deployed enforcement, and
 * `packages/spec-tests` tests the spec-derived requirement matrix. They were
 * each carrying their OWN implementation and disagreed on live rules while
 * both stayed green — a payroll admin could read a full bank number in one and
 * a masked one in the other. Both now evaluate against this file, so a
 * divergence is a type error rather than two passing suites.
 *
 * Framework-agnostic per CLAUDE.md: plain TS, no Svelte, no database.
 *
 * `resource.verb`, so a role is a BUNDLE rather than a column, and adding a
 * role does not mean adding a boolean to every table.
 *
 * Client-safe: no database, no environment. `can.ts` uses it on the server and
 * a page can use it to decide whether to render a control.
 */

export const PERMISSIONS = [
  "employee.read.self",
  "employee.read.reports",
  "employee.read.all",
  "employee.write",
  "employee.create",
  "employee.archive",
  "compensation.read.self",
  "compensation.read.reports",
  "compensation.read.all",
  "compensation.write",
  "payroll.approve",
  "payroll.run",
  "timeoff.request",
  "timeoff.approve",
  "timeoff.read.all",
  "attendance.read.self",
  "attendance.read.reports",
  "attendance.read.all",
  "attendance.approve",
  "firm.settings.read",
  "firm.settings.write",
  "accounting.read",
  "accounting.write",
  "crm.read",
  "crm.write",
  "marketing.read",
  "marketing.write",
  "it.assets.write",
  "it.groups.write",
  "it.integrations.write",
  "legal.documents.write",
  "projects.write",
  "performance.read.self",
  "performance.read.reports",
  "performance.read.all",
  "performance.write",
  // Two levels, because "may see that an account exists" and "may read the
  // number" are different questions. `pii.read` returns the MASKED form —
  // **** 9012 — which is what a person needs to recognise an account.
  // `pii.reveal` returns the value itself.
  "pii.read",
  "pii.reveal",
  "pii.erase",
  "tenant.settings.write",
  "tenant.members.manage",
  "tenant.billing",
  "audit.read.all",
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const BASE_ROLES = [
  "owner",
  "firm_admin",
  "employee",
  "contractor",
] as const
export type BaseRole = (typeof BASE_ROLES)[number]

export const FUNCTIONAL_ROLES = [
  "hr_admin",
  "payroll_admin",
  "finance_admin",
  "sales_admin",
  "marketing_admin",
  "it_admin",
  "legal_admin",
  "project_manager",
  "auditor",
] as const
export type FunctionalRole = (typeof FUNCTIONAL_ROLES)[number]

/** What everyone gets, whatever their base role. */
const EVERYONE: Permission[] = [
  "employee.read.self",
  "compensation.read.self",
  "attendance.read.self",
  "timeoff.request",
  "performance.read.self",
]

const BASE: Record<BaseRole, Permission[]> = {
  // Everything, and the only role that may bill, transfer ownership or erase.
  owner: [...PERMISSIONS] as Permission[],
  firm_admin: (PERMISSIONS as readonly Permission[]).filter(
    (p) =>
      p !== "tenant.billing" &&
      p !== "tenant.members.manage" &&
      p !== "pii.erase",
  ),
  employee: [...EVERYONE],
  // Engaged, not employed. Identical to `employee` today; separate because the
  // directory and colleague profiles are gated on the base role rather than on
  // a permission, and that is where the two will diverge.
  contractor: [...EVERYONE],
}

const FUNCTIONAL: Record<FunctionalRole, Permission[]> = {
  hr_admin: [
    "employee.read.all",
    "employee.write",
    "employee.create",
    "employee.archive",
    "compensation.read.all",
    "compensation.write",
    "timeoff.approve",
    "timeoff.read.all",
    "performance.read.all",
    "performance.write",
    "attendance.read.all",
    "attendance.approve",
    "firm.settings.read",
    "firm.settings.write",
    "legal.documents.write",
    // Reveals, because HR is who corrects a mistyped account at onboarding.
    "pii.read",
    "pii.reveal",
    // Deliberately NOT payroll.approve — see the separation rule below.
  ],
  payroll_admin: [
    "employee.read.all",
    "compensation.read.all",
    "payroll.approve",
    "payroll.run",
    "attendance.read.all",
    "attendance.approve",
    "firm.settings.read",
    // MASKED only. The payment run uses the full number; no screen shows it to
    // a person. Verifying an account is recognising it, not reading it.
    "pii.read",
    // Deliberately NOT compensation.write, and NOT pii.reveal.
  ],
  finance_admin: ["accounting.read", "accounting.write", "firm.settings.read"],
  sales_admin: ["crm.read", "crm.write"],
  marketing_admin: ["marketing.read", "marketing.write"],
  // No pii.read. IT issues laptops; it does not need a tax identifier.
  it_admin: [
    "it.assets.write",
    "it.groups.write",
    "it.integrations.write",
    "employee.read.all",
  ],
  legal_admin: ["legal.documents.write", "audit.read.all", "employee.read.all"],
  project_manager: ["projects.write", "attendance.approve"],
  // Reads everything, writes nothing. The DB refuses combining it with a
  // writing role, so this bundle never widens anything.
  auditor: (PERMISSIONS as readonly Permission[]).filter(
    (p) => p.includes(".read") || p === "audit.read.all",
  ),
}

/**
 * Two pairs the database also refuses (`tenant_users` CHECK constraints).
 * Duplicated here so a grant UI can explain the refusal before submitting, and
 * so the rule is visible where the bundles are.
 */
export const FORBIDDEN_COMBINATIONS: {
  roles: FunctionalRole[]
  because: string
}[] = [
  {
    roles: ["hr_admin", "payroll_admin"],
    because:
      "Whoever sets pay must not approve the run that pays it — otherwise one " +
      "person can raise their own salary and approve their own payment.",
  },
  {
    roles: ["auditor"],
    because:
      "An auditor who can change things is not an auditor. Auditor cannot be " +
      "combined with any role that writes.",
  },
]

export function permissionsFor(
  base: BaseRole,
  functional: readonly string[],
): Set<Permission> {
  const out = new Set<Permission>(BASE[base] ?? EVERYONE)
  for (const role of functional) {
    for (const p of FUNCTIONAL[role as FunctionalRole] ?? []) out.add(p)
  }
  return out
}

export const isBaseRole = (v: string): v is BaseRole =>
  (BASE_ROLES as readonly string[]).includes(v)

/**
 * The masked form of an account number or identifier: last four, nothing else.
 *
 * What `pii.read` returns. Enough to recognise an account, useless to anyone
 * who steals a session. Lives here rather than in a formatter because it is an
 * authorization outcome, not a presentation choice — a caller that formats the
 * full value itself has bypassed the permission.
 */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "—"
  const trimmed = value.replace(/\s+/g, "")
  // Fewer than five characters cannot be masked without revealing most of it.
  if (trimmed.length < 5) return "••••"
  return `•••• ${trimmed.slice(-4)}`
}

/** What a holder of `permission` should see for a sensitive value. */
export function revealOrMask(
  permissions: Set<Permission>,
  value: string | null | undefined,
): { value: string; revealed: boolean } {
  if (permissions.has("pii.reveal") && value) {
    return { value, revealed: true }
  }
  if (permissions.has("pii.read")) {
    return { value: maskIdentifier(value), revealed: false }
  }
  return { value: "—", revealed: false }
}

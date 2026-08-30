/**
 * The permission vocabulary, and which role bundles grant what.
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
  "pii.read",
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
    "attendance.read.all",
    "attendance.approve",
    "firm.settings.read",
    "firm.settings.write",
    "legal.documents.write",
    "pii.read",
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
    "pii.read",
    // Deliberately NOT compensation.write.
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

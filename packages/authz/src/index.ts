/**
 * Authorization vocabulary: which role bundles grant what.
 * Framework-agnostic (plain TS, no Svelte, no DB), so also client-safe.
 * `resource.verb` permissions, so a role is a bundle, not a per-table column.
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
  "time_entries.write",
  "time_entries.approve",
  "performance.read.self",
  "performance.read.reports",
  "performance.read.all",
  "performance.write",
  // pii.read: masked form (**** 9012). pii.reveal: the value itself.
  "pii.read",
  "pii.reveal",
  "pii.erase",
  "tenant.settings.write",
  "tenant.members.manage",
  "tenant.billing",
  "audit.read.all",
  // Staff-side ticketing — self/all split, same shape as
  // compensation.read.self/.read.all. Deliberately NOT ticket.* (below) —
  // that namespace is the portal contact's, this one is staff's, and the
  // two must never be confused for each other.
  "ticketing.read.own",
  "ticketing.write.own",
  "ticketing.read.all",
  "ticketing.write.all",
  // Customer-portal permissions — a separate namespace on purpose, so a
  // portal contact is never one missing `if` away from an internal one.
  // See docs/17-customer-portal.md.
  "ticket.submit",
  "ticket.read.own",
  "document.read.own",
  "document.upload.own",
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const BASE_ROLES = [
  "owner",
  "firm_admin",
  "employee",
  "contractor",
  // A customer's own contact, not a member of the firm. See
  // docs/17-customer-portal.md §1.
  "customer",
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
  // Logging your own hours is self-service, like requesting time off.
  "time_entries.write",
  // Raising an IT/facilities request, or replying to one of your own
  // tickets, is self-service the same way.
  "ticketing.read.own",
  "ticketing.write.own",
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
  // Same grants as employee today; kept separate because directory/profile
  // gating uses base role, not a permission, and that's where they'll diverge.
  contractor: [...EVERYONE],
  // Deliberately NOT built on EVERYONE — a portal contact gets none of
  // employee.read.self/compensation.read.self/etc, which mean nothing for
  // someone who isn't an employee.
  customer: [
    "ticket.submit",
    "ticket.read.own",
    "document.read.own",
    "document.upload.own",
  ],
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
    // HR reveals: they correct a mistyped account at onboarding.
    "pii.read",
    "pii.reveal",
    // No payroll.approve — see FORBIDDEN_COMBINATIONS below.
  ],
  payroll_admin: [
    "employee.read.all",
    "compensation.read.all",
    "payroll.approve",
    "payroll.run",
    "attendance.read.all",
    "attendance.approve",
    "firm.settings.read",
    // Masked only — the payment run itself uses the full number, no screen does.
    "pii.read",
    // No compensation.write, no pii.reveal.
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
    // The one reasonable default for this slice — full per-business-area
    // role assignment (ticketing_business_areas.roles) is real Tier-1
    // config, not built yet.
    "ticketing.read.all",
    "ticketing.write.all",
  ],
  legal_admin: ["legal.documents.write", "audit.read.all", "employee.read.all"],
  project_manager: [
    "projects.write",
    "attendance.approve",
    "time_entries.approve",
  ],
  // Reads everything, writes nothing. The DB refuses combining it with a
  // writing role, so this bundle never widens anything.
  auditor: (PERMISSIONS as readonly Permission[]).filter(
    (p) => p.includes(".read") || p === "audit.read.all",
  ),
}

/** Mirrors the `tenant_users` CHECK constraints, so a grant UI can explain the refusal before submitting. */
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
 * Masks to last-four. Lives here, not in a formatter — masking is an
 * authorization outcome, not a presentation choice.
 */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "—"
  const trimmed = value.replace(/\s+/g, "")
  // 4 chars or fewer: slice(-4) would reveal the whole value.
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

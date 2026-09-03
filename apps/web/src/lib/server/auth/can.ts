import { error } from "@sveltejs/kit"
import type { Tx } from "../db/tenant"
import {
  isBaseRole,
  permissionsFor,
  type BaseRole,
  type Permission,
} from "@kaaj/authz"

/**
 * The authorization check every write action calls. RLS answers "do these
 * rows exist for me"; this answers "may I do this to this row" — see
 * docs/14-access-control.md. `./check` fails any write action that skips it.
 */

export type AuthContext = {
  tenantId: string
  userId: string
  /** NULL for a tenant member who is not an employee. */
  employeeId: string | null
  role: BaseRole
  functionalRoles: string[]
}

/** Built once per request in `+layout.server.ts` / an action, from locals. */
export function contextFrom(locals: App.Locals): AuthContext | null {
  if (!locals.tenantId || !locals.user?.id) return null
  const role = locals.tenantRole ?? "employee"
  return {
    tenantId: locals.tenantId,
    userId: locals.user.id,
    employeeId: locals.employeeId ?? null,
    // An unrecognised claim reads as the floor, never as an escalation.
    role: isBaseRole(role) ? role : "employee",
    functionalRoles: locals.functionalRoles ?? [],
  }
}

export function can(ctx: AuthContext | null, permission: Permission): boolean {
  if (!ctx) return false
  return permissionsFor(ctx.role, ctx.functionalRoles).has(permission)
}

/**
 * Throws a 403 rather than returning a boolean, for the common case where the
 * action has nothing useful to say beyond "no".
 */
export function requireCan(
  ctx: AuthContext | null,
  permission: Permission,
  message?: string,
): asserts ctx is AuthContext {
  if (!can(ctx, permission)) {
    error(
      403,
      message ?? DENIALS[permission] ?? "You do not have access to do that.",
    )
  }
}

/** Written for the person reading them, not for the log. */
const DENIALS: Partial<Record<Permission, string>> = {
  "compensation.write": "Only HR can record a pay change.",
  "payroll.approve": "Only payroll can approve a run.",
  "employee.write": "Only HR can edit an employee record.",
  "employee.create": "Only HR can add someone to the firm.",
  "employee.archive": "Only HR can offboard someone.",
  "firm.settings.write":
    "Only HR or an administrator can change firm settings.",
  // firm_admin holds this too — doc 14's matrix, and action-authz.test.ts
  // asserts it. The message said owner-only until that test caught it.
  "tenant.settings.write":
    "Only an account owner or firm administrator can change company settings.",
  "tenant.members.manage": "Only the account owner can change who has access.",
  "pii.erase": "Only the account owner can erase someone's data.",
  "timeoff.approve": "You cannot decide this request.",
}

/**
 * Whether `employeeId` is somewhere below the actor in the reporting chain.
 *
 * A manager is not a granted role: someone manages the people whose
 * `manager_id` chain reaches them. Recursive, because a skip-level manager is
 * still a manager.
 */
export async function managesEmployee(
  tx: Tx,
  ctx: AuthContext,
  employeeId: string,
): Promise<boolean> {
  if (!ctx.employeeId || ctx.employeeId === employeeId) return false
  const [row] = await tx<{ manages: boolean }[]>`
    WITH RECURSIVE chain AS (
      SELECT id, manager_id FROM employees WHERE id = ${employeeId}
      UNION ALL
      SELECT e.id, e.manager_id
        FROM employees e JOIN chain c ON e.id = c.manager_id
    )
    SELECT EXISTS (
      SELECT 1 FROM chain WHERE manager_id = ${ctx.employeeId}
    ) AS manages
  `
  return row?.manages ?? false
}

/**
 * Read a colleague's record: allowed outright, or because they report to you.
 * The two are different permissions on purpose — `employee.read.all` is a
 * grant, "my reports" is a shape.
 */
export async function canReadEmployee(
  tx: Tx,
  ctx: AuthContext | null,
  employeeId: string,
): Promise<boolean> {
  if (!ctx) return false
  if (ctx.employeeId === employeeId) return true
  if (can(ctx, "employee.read.all")) return true
  if (can(ctx, "employee.read.reports")) {
    return managesEmployee(tx, ctx, employeeId)
  }
  return false
}

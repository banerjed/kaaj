import type { Tx } from "../db/tenant"

/**
 * User groups (docs/28-user-groups.md) — the general permissioning
 * primitive: a named collection of employees, used to grant access to a
 * ticketing business area or a restricted project without adding people one
 * at a time. Tier 1 customization (docs/06-customization-model.md): plain
 * tenant-scoped rows, no per-tenant schema.
 *
 * Deliberately narrower than `employee_user_groups`' own scaffolded columns:
 * no nested hierarchy (`parent_group_name`), no approval workflow
 * (`approver_id`/`backup_approver_id`, now nullable), no department/location
 * binding — a small organization's groups are just named lists of people.
 */

export type GroupRow = {
  id: string
  display_name: string
  description: string | null
}

export type GroupMemberRow = { employee_id: string; name: string }

export async function listGroups(tx: Tx): Promise<GroupRow[]> {
  return tx<GroupRow[]>`
    SELECT id, display_name, description
      FROM employee_user_groups
     WHERE is_active
     ORDER BY display_name
  `
}

export async function groupById(tx: Tx, id: string): Promise<GroupRow | null> {
  const [row] = await tx<GroupRow[]>`
    SELECT id, display_name, description
      FROM employee_user_groups
     WHERE id = ${id}::uuid AND is_active
  `
  return row ?? null
}

export async function createGroup(
  tx: Tx,
  tenantId: string,
  input: { displayName: string; description: string | null },
  actorId: string,
): Promise<{ id: string }> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO employee_user_groups
      (tenant_id, display_name, description, is_active, created_at, updated_at, created_by)
    VALUES
      (${tenantId}::uuid, ${input.displayName}, ${input.description}, TRUE, now(), now(), ${actorId})
    RETURNING id
  `
  return row
}

export async function archiveGroup(tx: Tx, id: string): Promise<boolean> {
  const [row] = await tx<{ id: string }[]>`
    UPDATE employee_user_groups SET is_active = FALSE, updated_at = now()
     WHERE id = ${id}::uuid
    RETURNING id
  `
  return !!row
}

/** One page of a group's current members, by name; `total` counts all of them. */
export async function membersFor(
  tx: Tx,
  groupId: string,
  { limit, offset }: { limit: number; offset: number },
): Promise<{ rows: GroupMemberRow[]; total: number }> {
  const rows = await tx<(GroupMemberRow & { total: string })[]>`
    SELECT m.employee_id, e.first_name || ' ' || e.last_name AS name,
           count(*) OVER ()::text AS total
      FROM employee_group_members m
      JOIN employees e ON e.id = m.employee_id
     WHERE m.group_id = ${groupId}::uuid AND m.is_active
     ORDER BY name, m.employee_id
     LIMIT ${limit} OFFSET ${offset}
  `
  return {
    rows: rows.map(({ total: _total, ...row }) => row),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  }
}

/**
 * One person into a group — or back into it: no DELETE
 * (20260830120000_append_only.sql), so a former member's row is reactivated.
 * The employee is read under RLS, never trusted from the request (a foreign
 * key does not check the tenant). False when nothing changed: unknown
 * person, or already a member.
 */
export async function addMember(
  tx: Tx,
  tenantId: string,
  groupId: string,
  employeeId: string,
  actorId: string,
): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    INSERT INTO employee_group_members (tenant_id, group_id, employee_id, joined_at, joined_by)
    SELECT ${tenantId}::uuid, ${groupId}::uuid, e.id, now(), ${actorId}
      FROM employees e
     WHERE e.id = ${employeeId}::uuid
    ON CONFLICT (tenant_id, group_id, employee_id)
    DO UPDATE SET is_active = TRUE, joined_at = now(), joined_by = EXCLUDED.joined_by
     WHERE NOT employee_group_members.is_active
    RETURNING id
  `
  return rows.length > 0
}

/** Deactivates one membership. False when there was none to end. */
export async function removeMember(
  tx: Tx,
  groupId: string,
  employeeId: string,
): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE employee_group_members
       SET is_active = FALSE
     WHERE group_id = ${groupId}::uuid
       AND employee_id = ${employeeId}::uuid
       AND is_active
    RETURNING id
  `
  return rows.length > 0
}

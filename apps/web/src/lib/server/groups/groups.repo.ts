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

export async function membersFor(
  tx: Tx,
  groupId: string,
): Promise<GroupMemberRow[]> {
  return tx<GroupMemberRow[]>`
    SELECT m.employee_id, e.first_name || ' ' || e.last_name AS name
      FROM employee_group_members m
      JOIN employees e ON e.id = m.employee_id
     WHERE m.group_id = ${groupId}::uuid AND m.is_active
     ORDER BY name
  `
}

/**
 * Replaces the whole membership list in one go — the settings page submits
 * a checkbox list, not one grant at a time. No DELETE
 * (20260830120000_append_only.sql): anyone dropped from the list is
 * deactivated, anyone re-added reactivates their existing row. Same shape
 * as ticketing.repo.ts's setBusinessAreaMembers.
 */
export async function setMembers(
  tx: Tx,
  tenantId: string,
  groupId: string,
  employeeIds: string[],
  actorId: string,
): Promise<void> {
  await tx`
    UPDATE employee_group_members
       SET is_active = FALSE
     WHERE group_id = ${groupId}::uuid
       AND is_active
       AND NOT (employee_id = ANY(${employeeIds}::uuid[]))
  `
  if (employeeIds.length === 0) return
  await tx`
    INSERT INTO employee_group_members (tenant_id, group_id, employee_id, joined_at, joined_by)
    SELECT ${tenantId}::uuid, ${groupId}::uuid, unnest(${employeeIds}::uuid[]), now(), ${actorId}
    ON CONFLICT (tenant_id, group_id, employee_id)
    DO UPDATE SET is_active = TRUE, joined_at = now(), joined_by = EXCLUDED.joined_by
  `
}

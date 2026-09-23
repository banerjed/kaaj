import { error } from "@sveltejs/kit"
import type { LayoutServerLoad } from "./$types"
import * as chat from "$lib/server/team-chat/team-chat.repo"
import * as employees from "$lib/server/employee-profile/employees.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"

/** /chat — the sidebar (Direct Messages + Channels) every /chat/* page shares. */
export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  requireCan(ctx, "team_chat.read")
  if (!locals.employeeId)
    error(403, "Chat is for employees, not this kind of account.")

  return withTenant(actorFrom(locals), async (tx) => {
    const [conversations, browsableChannels, people] = await Promise.all([
      chat.listConversations(tx, locals.employeeId!),
      chat.browsablePublicChannels(tx, locals.employeeId!),
      employees.managerOptions(tx, locals.employeeId!),
    ])
    return { conversations, browsableChannels, people }
  })
}

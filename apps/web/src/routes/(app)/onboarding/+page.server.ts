import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as onboarding from "$lib/server/hr/hr_onboarding.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

import { pageParam } from "$lib/server/db/paged"
const PAGE_SIZE = 20

/**
 * /onboarding — module-hr.md § Onboarding. Read-only for now; generating a plan
 * is a future write and must record which template was chosen.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const readsAll = can(ctx, "employee.read.all")
  const me = ctx?.employeeId ?? null
  const page = pageParam(url)

  return withTenant(actorFrom(locals), async (tx) => {
    if (readsAll) {
      const [tasks, total] = await Promise.all([
        onboarding.tasks(tx, {
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        onboarding.countTasks(tx),
      ])
      return {
        tasks,
        total,
        page,
        pageSize: PAGE_SIZE,
        templates: await onboarding.templates(tx),
        readsAll,
        me,
      }
    }

    // Everyone else sees their own tasks and the ones they have been asked
    // to do — paged too: a manager onboarding a team is assigned many.
    if (!me) {
      return {
        tasks: [],
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        templates: [],
        readsAll,
        me,
      }
    }
    const [tasks, total] = await Promise.all([
      onboarding.tasks(tx, {
        involving: me,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      onboarding.countTasks(tx, { involving: me }),
    ])
    return {
      tasks,
      total,
      page,
      pageSize: PAGE_SIZE,
      templates: [],
      readsAll,
      me,
    }
  })
}

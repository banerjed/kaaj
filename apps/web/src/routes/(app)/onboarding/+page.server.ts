import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as onboarding from "$lib/server/hr/hr_onboarding.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

const PAGE_SIZE = 20

/**
 * Everyone else's own tasks are bounded by their own onboarding, not by
 * tenure — a hard cap here is defense against a pathological row (a bad
 * import, a bug elsewhere), not a real business limit. No page control:
 * tripping this is not an expected case, unlike the HR-wide list below.
 */
const OWN_TASKS_CAP = 500

/**
 * /onboarding — module-hr.md § Onboarding. Read-only for now; generating a plan
 * is a future write and must record which template was chosen.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  const readsAll = can(ctx, "employee.read.all")
  const me = ctx?.employeeId ?? null
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

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
    // to do — no HR-wide fan-out, so no page control.
    const tasks = [
      ...(await onboarding.tasks(tx, {
        employeeId: me ?? undefined,
        limit: OWN_TASKS_CAP,
      })),
      ...(await onboarding.tasks(tx, {
        assignedTo: me ?? undefined,
        limit: OWN_TASKS_CAP,
      })),
    ].filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i)
    return {
      tasks,
      total: tasks.length,
      page: 1,
      pageSize: tasks.length,
      templates: [],
      readsAll,
      me,
    }
  })
}

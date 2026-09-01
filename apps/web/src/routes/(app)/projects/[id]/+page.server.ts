import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import * as projects from "$lib/server/projects/projects.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"

/** /projects/[id] — a project and its tasks. */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  return withTenant(actorFrom(locals), async (tx) => {
    const project = await projects.byId(tx, params.id)
    if (!project) error(404, "No such project")
    return { project, tasks: await projects.tasksFor(tx, project.id) }
  })
}

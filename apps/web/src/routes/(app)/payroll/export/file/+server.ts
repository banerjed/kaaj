import { error, type RequestHandler } from "@sveltejs/kit"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import * as exp from "$lib/server/payroll/payroll_export.repo"
import { readPeriod } from "$lib/server/payroll/export-request"
import { writeExport, type ExportEmployee } from "$lib/payroll/export-formats"

/**
 * The file a customer uploads in its payroll provider. `./check`'s
 * authorization and audit steps read only `+page.server.ts` actions, so this
 * route's guard and its audit entry are asserted by its own test
 * (payroll-export-file.test.ts), as the refused actor and the permitted one.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  // Every employee's hours: only a role that may read all of them, or the
  // file would hold just the rows RLS lets a narrower role see.
  requireCan(ctx, "payroll.run")

  return withTenant(actorFrom(locals), async (tx) => {
    const settings = await exp.settings(tx)
    if (!settings)
      error(409, "Choose a payroll provider in Payroll export settings first.")

    const read = readPeriod(url.searchParams, settings.provider)
    if (!read.ok) error(400, read.message)
    const period = read.period

    const lines = await exp.periodLines(tx, settings.provider, period)
    const problems = exp.problems(settings.provider, lines)
    // A file that leaves someone out pays them nothing, with no error.
    if (exp.refuses(problems))
      error(
        409,
        "The file would be incomplete. Fix the problems listed on the export page first.",
      )

    const employees = new Map<string, ExportEmployee>()
    for (const l of lines) {
      if (l.code === null) continue // mapped to "not exported"
      const e = employees.get(l.employee_id) ?? {
        externalId: l.external_id,
        firstName: l.first_name,
        lastName: l.last_name,
        lines: [],
      }
      e.lines.push({ source: l.source, code: l.code, hours: l.hours })
      employees.set(l.employee_id, e)
    }
    if (employees.size === 0)
      error(409, "No approved hours or time off to export in this period.")

    const file = writeExport({
      provider: settings.provider,
      companyCode: settings.company_code,
      from: period.from,
      to: period.to,
      frequency: period.frequency,
      employees: [...employees.values()],
    })

    // In the transaction that read the hours: who exported what, for when.
    await audit.record(tx, ctx!, {
      action: "export",
      entityType: "payroll_export_settings",
      module: "payroll",
      changes: {
        provider: { from: null, to: settings.provider },
        period: { from: period.from, to: period.to },
        frequency: { from: null, to: period.frequency ?? "all" },
        employees: { from: null, to: String(employees.size) },
      },
    })

    return new Response(file.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
      },
    })
  })
}

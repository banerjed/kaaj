import { error } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as exp from "$lib/server/payroll/payroll_export.repo"
import { readPeriod, MAX_PERIOD_DAYS } from "$lib/server/payroll/export-request"

const PAGE_SIZE = 50

function firstTen<T>(all: T[]): { first: T[]; total: number } {
  return { first: all.slice(0, 10), total: all.length }
}

type ReviewRow = {
  employee_id: string
  name: string
  employee_code: string
  external_id: string | null
  hours: Record<string, string>
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "payroll.run")
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)

  return withTenant(actorFrom(locals), async (tx) => {
    const settings = await exp.settings(tx)
    const [{ from, to }] = await tx<{ from: string; to: string }[]>`
      SELECT (current_date - 14)::text AS from, (current_date - 1)::text AS to`
    const defaults = { from, to }
    if (!settings)
      return { settings, defaults, maxDays: MAX_PERIOD_DAYS, review: null }

    // Nothing submitted yet: show the form, with the last two weeks filled in.
    if (!url.searchParams.has("from"))
      return { settings, defaults, maxDays: MAX_PERIOD_DAYS, review: null }

    const read = readPeriod(url.searchParams, settings.provider)
    if (!read.ok)
      return {
        settings,
        defaults,
        maxDays: MAX_PERIOD_DAYS,
        review: null,
        invalid: { message: read.message, errorFields: read.errorFields },
      }
    const period = read.period

    // The whole period, because every problem must be found before the file
    // is offered; the period is at most MAX_PERIOD_DAYS, and only one page of
    // employees goes to the browser.
    const lines = await exp.periodLines(tx, settings.provider, period)
    const notes = await exp.periodNotes(tx, period)
    const problems = exp.problems(settings.provider, lines, notes)

    const byEmployee = new Map<string, ReviewRow>()
    const totals: Record<string, string> = {}
    for (const l of lines) {
      const row = byEmployee.get(l.employee_id) ?? {
        employee_id: l.employee_id,
        name: `${l.first_name} ${l.last_name}`,
        employee_code: l.employee_code,
        external_id: l.external_id,
        hours: {},
      }
      row.hours[l.source] = l.hours
      byEmployee.set(l.employee_id, row)
      totals[l.source] = l.source_total
    }
    const rows = [...byEmployee.values()]
    const sources = Object.keys(totals)

    return {
      settings,
      defaults,
      maxDays: MAX_PERIOD_DAYS,
      review: {
        period,
        sources,
        totals,
        employeeCount: rows.length,
        rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        page,
        pageSize: PAGE_SIZE,
        // A count and the first ten of each: a tenant's first export, before
        // any id is entered, would otherwise send its whole roster here.
        problems: {
          missing_ids: firstTen(problems.missing_ids),
          no_overtime_rule: firstTen(problems.no_overtime_rule),
          no_pay_record: firstTen(problems.no_pay_record),
          duplicate_names: firstTen(problems.duplicate_names),
          unmapped_sources: problems.unmapped_sources,
        },
        refused: exp.refuses(problems),
        notes: {
          unapproved_entries: notes.unapproved_entries,
          prorated: notes.prorated,
          prorated_total: notes.prorated_total,
        },
        mappings: await exp.codes(tx, settings.provider),
      },
    }
  })
}

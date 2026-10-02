import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { contextFrom, requireCan } from "$lib/server/auth/can"
import * as audit from "$lib/server/audit/audit.repo"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"
import * as exp from "$lib/server/payroll/payroll_export.repo"
import {
  FIXED_CODES,
  HOUR_TYPES,
  PAYROLL_PROVIDERS,
  validCode,
  validCompanyCode,
  type PayrollProvider,
} from "$lib/payroll/export-formats"

/** Every source a mapping can exist for: the hour types and each time-off policy. */
async function sources(tx: Parameters<typeof exp.timeOffPolicies>[0]) {
  const policies = await exp.timeOffPolicies(tx)
  return [
    ...HOUR_TYPES.map((h) => ({ source: h as string, policy: null })),
    ...policies.map((p) => ({
      source: `time_off:${p.policy_code}`,
      policy: p,
    })),
  ]
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  requireCan(contextFrom(locals), "payroll.run")

  return withTenant(actorFrom(locals), async (tx) => {
    const settings = await exp.settings(tx)
    // Another provider's codes can be viewed before switching to it.
    const asked = url.searchParams.get("provider")
    const provider: PayrollProvider = PAYROLL_PROVIDERS.includes(
      asked as PayrollProvider,
    )
      ? (asked as PayrollProvider)
      : (settings?.provider ?? "adp_run")
    return {
      settings,
      provider,
      sources: await sources(tx),
      codes: await exp.codes(tx, provider),
    }
  })
}

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    requireCan(contextFrom(locals), "payroll.run")
    const ctx = contextFrom(locals)!

    const f = new FormReader(await request.formData())
    const provider = f.choice("provider", PAYROLL_PROVIDERS, { required: true })
    const companyCode = f.text("company_code", { max: 20 })
    if (
      provider &&
      provider !== "gusto" &&
      (!companyCode || !validCompanyCode(provider, companyCode))
    )
      f.reject("company_code")

    // Read every code before the gate (L33); a blank keeps the source unmapped.
    const posted: { source: string; code: string | null; field: string }[] = []
    const all = await withTenant(actorFrom(locals), (tx) => sources(tx))
    for (const { source, policy } of all) {
      const field = `code:${source}`
      const fixed = provider ? FIXED_CODES[provider]?.[source] : undefined
      if (fixed) {
        posted.push({ source, code: fixed, field })
        continue
      }
      const skip = policy !== null && f.bool(`skip:${source}`)
      const code = f.text(field, { max: 50 })
      if (skip) posted.push({ source, code: null, field })
      else if (code !== null) {
        if (provider && !validCode(provider, code)) f.reject(field)
        posted.push({ source, code, field })
      }
    }

    if (!f.ok)
      return fail(
        400,
        f.problem(
          f.errorFields.includes("company_code")
            ? "Enter the company code your provider uses, in the form shown under the field."
            : undefined,
        ),
      )

    const input = {
      provider: provider!,
      company_code: provider === "gusto" ? null : companyCode,
    }
    try {
      await withTenant(actorFrom(locals), async (tx) => {
        const before = await exp.settings(tx)
        const beforeCodes = new Map(
          (await exp.codes(tx, input.provider)).map((c) => [c.source, c.code]),
        )
        await exp.saveSettings(tx, input, ctx.userId)
        await exp.saveCodes(
          tx,
          input.provider,
          posted.map(({ source, code }) => ({ source, code })),
          ctx.userId,
        )
        const changes = audit.diff(before, input, ["provider", "company_code"])
        for (const p of posted) {
          const was = beforeCodes.has(p.source)
            ? beforeCodes.get(p.source)!
            : undefined
          if (was !== p.code)
            changes[p.field] = { from: was ?? null, to: p.code }
        }
        // Same transaction: a code change moves whose hours go under what pay.
        await audit.record(tx, ctx, {
          action: before ? "update" : "create",
          entityType: "payroll_export_settings",
          module: "payroll",
          changes,
        })
      })
    } catch (e) {
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
    return { saved: true }
  },
}

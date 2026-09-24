import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as pay from "$lib/server/accounting/payables.repo"
import { RECONCILIATION_TRANSACTION_TYPES } from "$lib/server/accounting/payables.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"
import { constraintFailure } from "$lib/server/db/constraints"

/** /accounting/banking/rules — define categorization rules and run them. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see banking.")
  }

  return withTenant(actorFrom(locals), async (tx) => {
    return {
      rules: await pay.listReconciliationRules(tx),
      bankAccounts: await pay.bankAccounts(tx),
      categoryAccounts: await pay.categoryAccountsForPicker(tx),
      transactionTypes: RECONCILIATION_TRANSACTION_TYPES,
      mayWrite: can(ctx, "accounting.write"),
    }
  })
}

function refusal(e: AccountingRefused) {
  switch (e.reason) {
    case "no_criteria":
      return {
        message:
          "A rule needs at least one of: description contains, description matches, or an amount condition — otherwise it would match every transaction.",
        errorFields: ["description_contains"],
      }
    case "invalid_regex":
      return {
        message: "That is not a valid pattern.",
        errorFields: ["description_regex"],
      }
    case "no_such_account":
      return {
        message: "Choose a category account.",
        errorFields: ["category_account_id"],
      }
    case "no_such_bank_account":
      return {
        message: "That bank account no longer exists.",
        errorFields: ["bank_account_id"],
      }
    case "no_such_rule":
      return { message: "That rule no longer exists.", errorFields: [] }
    default:
      return { message: "That rule could not be saved.", errorFields: [] }
  }
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const ruleName = f.text("rule_name", { required: true, max: 255 })
    const bankAccountId = f.uuid("bank_account_id")
    const descriptionContains = f.text("description_contains", { max: 255 })
    const descriptionRegex = f.text("description_regex", { max: 500 })
    const amountEquals = f.decimal("amount_equals", { scale: 2, min: 0 })
    const amountTolerance = f.decimal("amount_tolerance", {
      scale: 2,
      min: 0,
    })
    const amountMin = f.decimal("amount_min", { scale: 2, min: 0 })
    const amountMax = f.decimal("amount_max", { scale: 2, min: 0 })
    const transactionType = f.choice(
      "transaction_type",
      RECONCILIATION_TRANSACTION_TYPES,
    )
    const categoryAccountId = f.uuid("category_account_id", {
      required: true,
    })
    const priority = f.integer("priority", { min: 0, max: 1000 }) ?? 0
    if (!f.ok) return fail(400, f.problem("Check the highlighted fields."))

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { id } = await pay.createReconciliationRule(
          tx,
          locals.tenantId!,
          {
            ruleName: ruleName!,
            bankAccountId,
            descriptionContains,
            descriptionRegex,
            amountEquals,
            amountTolerance,
            amountMin,
            amountMax,
            transactionType,
            categoryAccountId: categoryAccountId!,
            priority,
          },
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "create",
          entityType: "bank_reconciliation_rules",
          entityId: id,
          module: "accounting",
          changes: {
            rule_name: { from: null, to: ruleName },
            category_account_id: { from: null, to: categoryAccountId },
          },
        })
        return { created: true }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      const refused = constraintFailure(e)
      if (refused) return refused
      throw e
    }
  },

  toggle: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const ruleId = f.uuid("rule_id", { required: true })
    if (!f.ok) return fail(400, f.problem())

    try {
      return await withTenant(actorFrom(locals), async (tx) => {
        const { from, to } = await pay.toggleReconciliationRule(
          tx,
          ruleId!,
          ctx!.employeeId ?? ctx!.userId,
        )
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "bank_reconciliation_rules",
          entityId: ruleId!,
          module: "accounting",
          changes: { is_active: { from: String(from), to: String(to) } },
        })
        return { toggled: true }
      })
    } catch (e) {
      if (e instanceof AccountingRefused) return fail(400, refusal(e))
      throw e
    }
  },

  /** Runs every active rule against unmatched transactions once, on demand
   *  — there is no scheduler in this codebase to run it automatically. */
  apply: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const f = new FormReader(await request.formData())
    const bankAccountId = f.uuid("apply_bank_account_id")
    if (!f.ok) return fail(400, f.problem())

    return await withTenant(actorFrom(locals), async (tx) => {
      const { categorized, byRule } = await pay.applyReconciliationRules(
        tx,
        locals.tenantId!,
        bankAccountId,
      )
      if (categorized > 0) {
        await audit.record(tx, ctx!, {
          action: "update",
          entityType: "bank_transactions",
          module: "accounting",
          changes: {
            transactions_categorized: {
              from: null,
              to: String(categorized),
            },
            rules_applied: {
              from: null,
              to: byRule.map((r) => `${r.ruleName} (${r.count})`).join(", "),
            },
          },
        })
      }
      return { applied: { categorized, byRule } }
    })
  },
}

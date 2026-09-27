import { createHash } from "node:crypto"
import { error, fail } from "@sveltejs/kit"
import type { Actions, PageServerLoad } from "./$types"
import * as imports from "$lib/server/accounting/statement-import.repo"
import {
  analyseStatement,
  canonicalMapping,
  ROLES,
  type Analysis,
  type CsvMapping,
} from "$lib/server/accounting/statement-import/analyse"
import { DATE_FORMATS } from "$lib/server/accounting/statement-import/values"
import * as locationsRepo from "$lib/server/firm-profile/firm_locations.repo"
import { withTenant, actorFrom, type Tx } from "$lib/server/db/tenant"
import * as audit from "$lib/server/audit/audit.repo"
import { can, contextFrom, requireCan } from "$lib/server/auth/can"
import { FormReader } from "$lib/server/forms"

/**
 * adapter-node refuses a request body over its BODY_SIZE_LIMIT before this
 * code runs (512 KB unless the deployment raises it — docs/12-beta-deployment.md).
 * This is the importer's own ceiling beneath that.
 */
const MAX_BYTES = 5 * 1024 * 1024
const PREVIEW_ROWS = 25

const DELIMITER_NAMES = {
  comma: ",",
  semicolon: ";",
  tab: "\t",
  pipe: "|",
} as const
type DelimiterName = keyof typeof DELIMITER_NAMES
const DELIMITER_KEYS = Object.keys(DELIMITER_NAMES) as DelimiterName[]
const nameOf = (d: string): DelimiterName =>
  DELIMITER_KEYS.find((k) => DELIMITER_NAMES[k] === d) ?? "comma"

/** /accounting/banking/import — upload a statement, preview it, import it. */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.write")) {
    error(403, "Only finance can import bank statements.")
  }
  const params = new FormData()
  params.append("account", url.searchParams.get("account") ?? "")
  const f = new FormReader(params)
  const accountId = f.uuid("account")
  if (!f.ok) error(400, "That is not a valid account.")

  return withTenant(actorFrom(locals), async (tx) => ({
    accounts: await imports.importableAccounts(tx),
    recent: await imports.recentImports(tx),
    selectedAccount: accountId ?? "",
    roles: ROLES,
    dateFormats: DATE_FORMATS,
    delimiters: DELIMITER_KEYS,
    maxMegabytes: MAX_BYTES / 1024 / 1024,
    locations: await locationsRepo.list(tx),
  }))
}

type Read =
  | { refused: { errorFields: string[]; message: string } }
  | {
      account: imports.ImportAccount
      bytes: Uint8Array
      fileName: string
      analysis: Analysis
      token: string
      linesInFile: number
    }

/**
 * Both actions read the form the same way and analyse the file the same way,
 * so what `import` writes is exactly what `preview` showed — and the token
 * proves it (the same file bytes, mapping and account).
 */
async function readAndAnalyse(tx: Tx, data: FormData): Promise<Read> {
  const f = new FormReader(data)
  // Every reader above the gate (L33).
  const accountId = f.uuid("account", { required: true })
  const useMapping = f.bool("use_mapping")
  const delimiter = f.choice("delimiter", DELIMITER_KEYS)
  const headerSignature = f.text("header_signature", { max: 4000 })
  const dateFormat = f.choice("date_format", DATE_FORMATS)
  const decimal = f.choice("decimal", [".", ","] as const)
  const invertSign = f.bool("invert_sign")
  const confirmed = f.bool("confirmed")
  const columnCount = f.integer("column_count", { min: 0, max: 200 })
  const columns = useMapping
    ? Array.from({ length: columnCount ?? 0 }, (_, i) =>
        f.choice(`column_${i}`, ROLES, { required: true }),
      )
    : []

  const file = data.get("file")
  if (!(file instanceof File) || file.size === 0) f.reject("file")
  if (!f.ok) {
    return {
      refused: f.problem(
        file instanceof File && file.size > 0
          ? undefined
          : "Choose a statement file to upload.",
      ),
    }
  }
  const upload = file as File
  if (upload.size > MAX_BYTES) {
    return {
      refused: {
        errorFields: ["file"],
        message: `That file is larger than ${MAX_BYTES / 1024 / 1024} MB. Import a shorter date range.`,
      },
    }
  }

  const account = await imports.accountForImport(tx, accountId!)
  if (!account) {
    return {
      refused: {
        errorFields: ["account"],
        message: "That bank account no longer exists.",
      },
    }
  }

  let explicit: CsvMapping | null = null
  if (useMapping && delimiter && dateFormat && decimal) {
    explicit = {
      delimiter: DELIMITER_NAMES[delimiter] as CsvMapping["delimiter"],
      headerSignature: headerSignature || null,
      columns: columns as CsvMapping["columns"],
      dateFormat,
      decimal,
      invertSign,
    }
    // The saved profile, resubmitted unchanged, is still the saved profile.
    if (
      canonicalMapping(explicit) ===
      canonicalMapping(account.statement_import_profile)
    )
      explicit = null
  }

  const bytes = new Uint8Array(await upload.arrayBuffer())
  const result = analyseStatement(bytes, {
    accountCurrency: account.currency,
    mapping: explicit,
    profile: account.statement_import_profile,
    confirmed,
  })
  if ("fatal" in result) {
    return {
      refused: { errorFields: ["file"], message: result.fatal },
    }
  }
  const fileSha = sha256(bytes)
  return {
    account,
    bytes,
    fileName: upload.name.slice(0, 255),
    analysis: result,
    token: sha256(
      `${fileSha}|${canonicalMapping(result.mapping)}|${account.id}`,
    ),
    linesInFile: countLines(bytes),
  }
}

export const actions: Actions = {
  /** Read the file and show what an import would do. Writes nothing. */
  preview: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const data = await request.formData()
    return withTenant(actorFrom(locals), async (tx) => {
      const read = await readAndAnalyse(tx, data)
      if ("refused" in read) return fail(400, read.refused)
      const a = read.analysis
      const existing = await imports.existingMatches(
        tx,
        read.account.id,
        a.transactions,
      )
      const duplicates = a.transactions.filter((t) =>
        existing.alreadyImported.has(t.externalId),
      ).length
      return {
        preview: {
          token: read.token,
          accountId: read.account.id,
          accountName: read.account.account_name,
          currency: read.account.currency,
          fileName: read.fileName,
          format: a.format,
          headers: a.headers,
          firstRow: a.firstRow,
          columnCount: a.columnCount,
          sample: a.sample,
          mapping: a.mapping
            ? { ...a.mapping, delimiter: nameOf(a.mapping.delimiter) }
            : null,
          mappingSource: a.mappingSource,
          dateFormatChoices: a.dateFormatChoices,
          decimalChoices: a.decimalChoices,
          problems: a.problems,
          warnings: a.warnings,
          skipped: a.skipped.length,
          balanceCheck: a.balanceCheck,
          needsConfirmation: a.needsConfirmation,
          period: a.period,
          totals: a.totals,
          transactionCount: a.transactions.length,
          newCount: a.transactions.length - duplicates,
          duplicateCount: duplicates,
          possibleDuplicateLines: existing.possibleDuplicateLines,
          rows: a.transactions.slice(0, PREVIEW_ROWS).map((t) => ({
            line: t.line,
            date: t.date,
            description: t.description,
            reference: t.reference,
            amount: t.amount,
            balance: t.balance,
            duplicate: existing.alreadyImported.has(t.externalId),
          })),
        },
      }
    })
  },

  /** Import exactly what the preview showed. Audited, in the same transaction. */
  import: async ({ request, locals }) => {
    if (!locals.tenantId) error(403, "No tenant")
    const ctx = contextFrom(locals)
    requireCan(ctx, "accounting.write")

    const data = await request.formData()
    const f = new FormReader(data)
    const token = f.text("token", { max: 64, required: true })
    if (!f.ok)
      return fail(400, {
        errorFields: ["file"],
        message: "Preview the file before importing it.",
      })

    return withTenant(actorFrom(locals), async (tx) => {
      const read = await readAndAnalyse(tx, data)
      if ("refused" in read) return fail(400, read.refused)
      const a = read.analysis
      if (read.token !== token) {
        return fail(400, {
          errorFields: ["file"],
          message:
            "The file or the column choices changed since the preview. Preview it again, then import.",
        })
      }
      if (a.problems.length > 0) {
        return fail(400, {
          errorFields: ["file"],
          message: "Fix the problems in the preview first.",
        })
      }
      if (a.needsConfirmation) {
        return fail(400, {
          errorFields: ["confirmed"],
          message:
            "Check the preview and confirm money in shows as positive and money out as negative.",
        })
      }

      const actorId = ctx!.employeeId ?? ctx!.userId
      const result = await imports.importStatement(tx, {
        tenantId: locals.tenantId!,
        account: read.account,
        fileName: read.fileName,
        format: a.format,
        fileSha256: sha256(read.bytes),
        mapping: a.mapping,
        linesInFile: read.linesInFile,
        transactions: a.transactions,
        period: a.period,
        balanceCheck: a.balanceCheck,
        actorId,
      })
      await audit.record(tx, ctx!, {
        action: "create",
        entityType: "bank_statement_imports",
        entityId: result.importId,
        module: "accounting",
        changes: {
          bank_account_id: { from: null, to: read.account.id },
          transactions_imported: { from: null, to: String(result.imported) },
          duplicates_skipped: { from: null, to: String(result.duplicates) },
        },
      })
      return {
        imported: {
          accountId: read.account.id,
          accountName: read.account.account_name,
          count: result.imported,
          duplicates: result.duplicates,
        },
      }
    })
  },
}

const sha256 = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex")

function countLines(bytes: Uint8Array): number {
  let n = 0
  for (const b of bytes) if (b === 0x0a) n++
  return bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a ? n + 1 : n
}

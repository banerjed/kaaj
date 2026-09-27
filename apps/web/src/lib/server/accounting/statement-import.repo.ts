import type { Tx } from "../db/tenant"
import type { CsvMapping, ParsedTransaction } from "./statement-import/analyse"

/**
 * The database half of bank statement import. The parser
 * (`statement-import/analyse.ts`) decides what a file says; this decides
 * what is already on the books, and writes the rest in one statement.
 */

export type ImportAccount = {
  id: string
  account_name: string
  bank_name: string
  currency: string
  statement_import_profile: CsvMapping | null
}

/** Read under RLS, so an account this tenant or role cannot see is simply absent (L103). */
export async function accountForImport(
  tx: Tx,
  id: string,
): Promise<ImportAccount | null> {
  const [row] = await tx<ImportAccount[]>`
    SELECT id, account_name, bank_name, currency, statement_import_profile
      FROM bank_accounts
     WHERE id = ${id}::uuid AND is_active
  `
  return row ?? null
}

export async function importableAccounts(
  tx: Tx,
): Promise<
  (Omit<ImportAccount, "statement_import_profile"> & { has_profile: boolean })[]
> {
  return tx`
    SELECT id, account_name, bank_name, currency,
           statement_import_profile IS NOT NULL AS has_profile
      FROM bank_accounts
     WHERE is_active
     ORDER BY account_name
  `
}

/**
 * For the preview: which lines are already imported (same statement id), and
 * which look like a transaction already on the books by another route —
 * same date and amount, different id (a manual entry, or the same statement
 * once imported as OFX and once as CSV). The first are skipped; the second
 * are only flagged, because two genuine same-day payments of the same
 * amount are common.
 */
export async function existingMatches(
  tx: Tx,
  accountId: string,
  transactions: ParsedTransaction[],
): Promise<{ alreadyImported: Set<string>; possibleDuplicateLines: number[] }> {
  if (transactions.length === 0)
    return { alreadyImported: new Set(), possibleDuplicateLines: [] }
  const rows = transactions.map((t) => ({
    line: t.line,
    date: t.date,
    amount: t.amount,
    external_id: t.externalId,
  }))
  const found = await tx<
    { line: number; imported: boolean; lookalike: boolean }[]
  >`
    SELECT r.line,
           EXISTS (SELECT 1 FROM bank_transactions b
                    WHERE b.bank_account_id = ${accountId}::uuid
                      AND b.bank_transaction_id = r.external_id) AS imported,
           EXISTS (SELECT 1 FROM bank_transactions b
                    WHERE b.bank_account_id = ${accountId}::uuid
                      AND b.transaction_date = r.date
                      AND b.amount = r.amount
                      AND b.bank_transaction_id IS DISTINCT FROM r.external_id) AS lookalike
      FROM jsonb_to_recordset(${tx.json(rows as never)}) AS r(line int, date date, amount numeric, external_id text)
  `
  const byLine = new Map(transactions.map((t) => [t.line, t.externalId]))
  return {
    alreadyImported: new Set(
      found.filter((f) => f.imported).map((f) => byLine.get(f.line)!),
    ),
    possibleDuplicateLines: found
      .filter((f) => !f.imported && f.lookalike)
      .map((f) => f.line),
  }
}

export type ImportInput = {
  tenantId: string
  account: ImportAccount
  fileName: string
  format: "csv" | "ofx"
  fileSha256: string
  mapping: CsvMapping | null
  linesInFile: number
  transactions: ParsedTransaction[]
  period: { from: string; to: string } | null
  balanceCheck: "passed" | "unavailable"
  actorId: string
}

/**
 * One import, all or nothing: the import record, then every line in ONE
 * insert that skips what is already there, then the mapping saved for next
 * time. The counts written are the counts the INSERT returned — a write
 * reports what it did (L68), including a line a concurrent import got to
 * first.
 */
export async function importStatement(
  tx: Tx,
  input: ImportInput,
): Promise<{ importId: string; imported: number; duplicates: number }> {
  const total = input.transactions.length
  const [record] = await tx<{ id: string }[]>`
    INSERT INTO bank_statement_imports (
      tenant_id, bank_account_id, file_name, file_format, file_sha256, mapping,
      lines_in_file, transactions_in_file, transactions_imported, duplicates_skipped,
      period_start, period_end, balance_check, created_by
    ) VALUES (
      ${input.tenantId}::uuid, ${input.account.id}::uuid, ${input.fileName}, ${input.format},
      ${input.fileSha256}, ${input.mapping ? tx.json(input.mapping as never) : null},
      ${input.linesInFile}, ${total}, ${total}, 0,
      ${input.period?.from ?? null}::date, ${input.period?.to ?? null}::date,
      ${input.balanceCheck}, ${input.actorId}::uuid
    )
    RETURNING id
  `

  // Money travels as JSON STRINGS and is cast in SQL: a JSON number would
  // pass through a float (L41).
  const rows = input.transactions.map((t) => ({
    transaction_date: t.date,
    value_date: t.valueDate,
    description: t.description,
    reference: t.reference,
    amount: t.amount,
    balance: t.balance,
    transaction_type: t.amount.startsWith("-") ? "debit" : "credit",
    bank_transaction_id: t.externalId,
    statement_sequence: t.sequence,
  }))
  const inserted = await tx<{ id: string }[]>`
    INSERT INTO bank_transactions (
      tenant_id, bank_account_id, transaction_date, value_date, description,
      reference, amount, balance, transaction_type, status, imported_at,
      bank_transaction_id, import_id, statement_sequence
    )
    SELECT ${input.tenantId}::uuid, ${input.account.id}::uuid, r.transaction_date,
           r.value_date, r.description, r.reference, r.amount, r.balance,
           r.transaction_type, 'unmatched', now(), r.bank_transaction_id, ${record.id}::uuid,
           r.statement_sequence
      FROM jsonb_to_recordset(${tx.json(rows as never)}) AS r(
             transaction_date date, value_date date, description text,
             reference varchar(100), amount numeric(15,2), balance numeric(15,2),
             transaction_type varchar(50), bank_transaction_id varchar(255),
             statement_sequence int)
    ON CONFLICT (tenant_id, bank_account_id, bank_transaction_id)
       WHERE bank_transaction_id IS NOT NULL
    DO NOTHING
    RETURNING id
  `
  const imported = inserted.length
  const duplicates = total - imported
  if (duplicates > 0) {
    await tx`
      UPDATE bank_statement_imports
         SET transactions_imported = ${imported}, duplicates_skipped = ${duplicates}
       WHERE id = ${record.id}::uuid
    `
  }

  if (input.format === "csv" && input.mapping) {
    await tx`
      UPDATE bank_accounts
         SET statement_import_profile = ${tx.json(input.mapping as never)},
             updated_at = now(), updated_by = ${input.actorId}::uuid
       WHERE id = ${input.account.id}::uuid
    `
  }
  return { importId: record.id, imported, duplicates }
}

export type RecentImport = {
  id: string
  account_name: string
  currency: string
  file_name: string
  file_format: string
  transactions_imported: number
  duplicates_skipped: number
  period_start: string | null
  period_end: string | null
  created_at: Date
}

export async function recentImports(
  tx: Tx,
  limit = 10,
): Promise<RecentImport[]> {
  return tx<RecentImport[]>`
    SELECT i.id, a.account_name, a.currency, i.file_name, i.file_format,
           i.transactions_imported, i.duplicates_skipped,
           to_char(i.period_start, 'YYYY-MM-DD') AS period_start,
           to_char(i.period_end, 'YYYY-MM-DD') AS period_end,
           i.created_at
      FROM bank_statement_imports i
      JOIN bank_accounts a ON a.id = i.bank_account_id
     ORDER BY i.created_at DESC
     LIMIT ${limit}
  `
}

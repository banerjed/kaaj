import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { REPORT_ROW_CAP } from "$lib/server/accounting/accounting.repo"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"
import { parseLedgerFilters } from "$lib/server/accounting/report_filters"
import { toCsv, csvResponse, type CsvColumn } from "$lib/server/accounting/csv"

type Row = {
  entry_number: string
  entry_date: string
  status: string | null
  reference: string | null
  entry_description: string | null
  account_code: string | null
  account_name: string | null
  line_description: string | null
  debit: string | null
  credit: string | null
  currency: string | null
}

const columns: CsvColumn<Row>[] = [
  { header: "Entry Number", value: (r) => r.entry_number },
  { header: "Date", value: (r) => r.entry_date },
  { header: "Status", value: (r) => r.status ?? "" },
  { header: "Reference", value: (r) => r.reference ?? "" },
  { header: "Entry Description", value: (r) => r.entry_description ?? "" },
  { header: "Account Code", value: (r) => r.account_code ?? "" },
  { header: "Account Name", value: (r) => r.account_name ?? "" },
  { header: "Line Description", value: (r) => r.line_description ?? "" },
  { header: "Debit", value: (r) => r.debit ?? "" },
  { header: "Credit", value: (r) => r.credit ?? "" },
  { header: "Currency", value: (r) => r.currency ?? "" },
]

/**
 * Same filter parsing as the ledger's own `load()`, minus `page`/`limit` —
 * this exports the full filtered range rather than one screen's page, and
 * the same hand-verified `can()` gate note as trial-balance/export/+server.ts.
 *
 * Flattened to one row per journal entry LINE, not per entry — a real GL
 * export. Row-capped on the LINE count, not the entry count: each entry can
 * carry up to `DOCUMENT_CHILD_CAP` (500) lines of its own, so a cap on
 * entries alone would let a 5,000-entry cap produce a 2.5M-row file.
 * `countLedgerLines` counts before fetching, the same "one bounded file"
 * shape `DOCUMENT_CHILD_CAP` uses for a single PDF — unlike ap-due-soon's
 * export, which has no cheap pre-count and refuses only after fetching.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see the general ledger.")
  }

  const filters = parseLedgerFilters(url)

  // The cap refusal happens OUTSIDE the transaction — same convention as
  // ap-due-soon's export — rather than throwing SvelteKit's error() from
  // inside a withTenant callback, which is untested territory here. This
  // means the count and the fetch below are two separate transactions, not
  // one consistent read — a line posted between them isn't reflected in
  // either the cap check or the export.
  const totalLines = await withTenant(actorFrom(locals), (tx) =>
    acc.countLedgerLines(tx, filters),
  )
  if (totalLines > REPORT_ROW_CAP) {
    error(
      400,
      `This range has ${totalLines} ledger lines — too many for a single export. Narrow the date range and try again.`,
    )
  }

  const rows = await withTenant(actorFrom(locals), async (tx) => {
    // Entry count is always <= line count, so REPORT_ROW_CAP is also a safe
    // upper bound on entries here — it never truncates a within-cap result.
    const entries = await acc.ledger(tx, { ...filters, limit: REPORT_ROW_CAP })
    const lines = await acc.ledgerLinesForEntries(
      tx,
      entries.map((e) => e.id),
    )
    const rows: Row[] = []
    for (const e of entries) {
      for (const l of lines[e.id] ?? []) {
        rows.push({
          entry_number: e.entry_number,
          entry_date: e.entry_date,
          status: e.status,
          reference: e.reference,
          entry_description: e.description,
          account_code: l.account_code,
          account_name: l.account_name,
          line_description: l.description,
          debit: l.debit_amount,
          credit: l.credit_amount,
          currency: l.currency,
        })
      }
    }
    return rows
  })

  const { from, to } = filters
  const range = from || to ? `-${from || "start"}-to-${to || "now"}` : ""
  return csvResponse(`general-ledger${range}.csv`, toCsv(columns, rows))
}

import { error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import * as acc from "$lib/server/accounting/accounting.repo"
import { AccountingRefused } from "$lib/server/accounting/accounting.repo"
import { renderInvoicePdf } from "$lib/server/accounting/invoice_pdf"
import { withTenant, actorFrom } from "$lib/server/db/tenant"
import { can, contextFrom } from "$lib/server/auth/can"

/**
 * Renders the invoice fresh on every request, from the ledger's own current
 * figures — never a stored file. A stored PDF would go stale the moment a
 * payment or credit posts against the invoice (the same reasoning L58 gives
 * for a recomputed counter over an incremented one), and this route is
 * cheap enough to regenerate: formatting numbers already computed in SQL,
 * not doing new accounting work.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.tenantId) error(403, "No tenant")
  const ctx = contextFrom(locals)
  if (!can(ctx, "accounting.read")) {
    error(403, "Only finance can see invoices.")
  }

  let data
  try {
    data = await withTenant(actorFrom(locals), (tx) =>
      acc.invoiceForPdf(tx, params.id),
    )
  } catch (e) {
    if (e instanceof AccountingRefused && e.reason === "no_such_invoice") {
      error(404, "No such invoice")
    }
    if (e instanceof AccountingRefused && e.reason === "too_many_lines") {
      error(400, `This invoice has ${e.detail} lines — too many for a PDF.`)
    }
    throw e
  }

  let logoBytes: Buffer | null = null
  if (data.company_logo_storage_key) {
    const { data: logo } = await locals.supabase.storage
      .from("tenant-logos")
      .download(data.company_logo_storage_key)
    if (logo) logoBytes = Buffer.from(await logo.arrayBuffer())
  }

  const pdf = await renderInvoicePdf(data, logoBytes)

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${data.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}

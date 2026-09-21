import PDFDocument from "pdfkit"
import type { InvoiceForPdf } from "./accounting.repo"

/**
 * Renders one invoice as a PDF, from data already computed elsewhere —
 * arithmetic (subtotal/tax/total) happens in SQL (`invoiceForPdf`), never
 * here. `logoBytes` is passed in rather than fetched by this function: a
 * Storage download needs the request's own authenticated client, which a
 * pure renderer should not own.
 *
 * `compress` defaults to true (a real invoice PDF, possibly emailed) and is
 * set false only by tests, where the content stream needs to stay
 * plain-text-searchable to assert against.
 */
export function renderInvoicePdf(
  data: InvoiceForPdf,
  logoBytes: Buffer | null,
  opts: { compress?: boolean } = {},
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    compress: opts.compress ?? true,
  })

  const chunks: Buffer[] = []
  doc.on("data", (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
  })

  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right

  // -- Header: company on the left, logo on the right ----------------------
  const headerTop = doc.y
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .text(data.company_name, { width: 300 })
  doc.font("Helvetica").fontSize(9)
  for (const line of companyAddressLines(data)) {
    doc.text(line, { width: 300 })
  }

  if (logoBytes) {
    try {
      doc.image(
        logoBytes,
        doc.page.width - doc.page.margins.right - 100,
        headerTop,
        {
          fit: [100, 60],
        },
      )
    } catch {
      // A corrupted/unreadable logo degrades to no logo, never a failed PDF —
      // the invoice itself is the thing that must always render.
    }
  }

  doc.moveDown(2)

  // -- Invoice title and dates ----------------------------------------------
  doc.fontSize(20).font("Helvetica-Bold").text("INVOICE")
  doc.fontSize(10).font("Helvetica")
  doc.text(`Invoice #: ${data.invoice_number}`)
  if (data.reference) doc.text(`Reference: ${data.reference}`)
  doc.text(`Invoice date: ${data.invoice_date}`)
  if (data.due_date) doc.text(`Due date: ${data.due_date}`)
  if (data.payment_terms) doc.text(`Payment terms: ${data.payment_terms}`)

  doc.moveDown(1)

  // -- Bill to ---------------------------------------------------------------
  doc.font("Helvetica-Bold").text("Bill to")
  doc.font("Helvetica")
  doc.text(data.customer_name)
  if (data.customer_billing_address) {
    for (const line of addressLines(data.customer_billing_address)) {
      doc.text(line)
    }
  }
  if (data.customer_email) doc.text(data.customer_email)
  if (data.customer_tax_number) doc.text(`Tax ID: ${data.customer_tax_number}`)

  doc.moveDown(1.5)

  // -- Line items table --------------------------------------------------
  const colDescription = doc.page.margins.left
  const colQty = colDescription + pageWidth * 0.5
  const colPrice = colDescription + pageWidth * 0.65
  const colAmount = colDescription + pageWidth * 0.82

  doc.font("Helvetica-Bold").fontSize(9)
  const tableTop = doc.y
  doc.text("Description", colDescription, tableTop, { width: pageWidth * 0.5 })
  doc.text("Qty", colQty, tableTop, { width: pageWidth * 0.15, align: "right" })
  doc.text("Unit price", colPrice, tableTop, {
    width: pageWidth * 0.17,
    align: "right",
  })
  doc.text("Amount", colAmount, tableTop, {
    width: pageWidth * 0.18,
    align: "right",
  })
  doc.moveDown(0.5)
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
  doc.moveDown(0.3)

  doc.font("Helvetica").fontSize(9)
  for (const line of data.lines) {
    const rowTop = doc.y
    doc.text(line.description ?? "", colDescription, rowTop, {
      width: pageWidth * 0.5,
    })
    doc.text(line.quantity ?? "", colQty, rowTop, {
      width: pageWidth * 0.15,
      align: "right",
    })
    doc.text(line.unit_price ?? "", colPrice, rowTop, {
      width: pageWidth * 0.17,
      align: "right",
    })
    doc.text(line.amount ?? "", colAmount, rowTop, {
      width: pageWidth * 0.18,
      align: "right",
    })
    doc.moveDown(0.4)
  }

  doc.moveDown(0.5)
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
  doc.moveDown(0.5)

  // -- Totals -----------------------------------------------------------
  const totalsLabelX = colPrice
  const totalsValueX = colAmount
  const totalsWidth = pageWidth * 0.18

  const totalRow = (label: string, amount: string, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
    const y = doc.y
    doc.text(label, totalsLabelX, y, {
      width: pageWidth * 0.17,
      align: "right",
    })
    doc.text(`${data.currency} ${amount}`, totalsValueX, y, {
      width: totalsWidth,
      align: "right",
    })
    doc.moveDown(0.4)
  }

  totalRow("Subtotal", data.subtotal)
  if (Number(data.tax_total) !== 0) totalRow("Tax", data.tax_total)
  totalRow("Total", data.total, true)
  if (Number(data.amount_paid) !== 0) totalRow("Paid", data.amount_paid)
  if (Number(data.amount_credited) !== 0)
    totalRow("Credited", data.amount_credited)
  totalRow("Amount due", data.amount_due, true)

  // -- Notes and footer -----------------------------------------------------
  if (data.notes) {
    doc.moveDown(1)
    // Explicit x: `totalRow`'s own explicit-x calls above leave the
    // "cursor" wherever the totals column was, not the left margin —
    // an unpositioned .text() after that renders sitting under Amount due.
    const notesX = doc.page.margins.left
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("Notes", notesX, doc.y, { width: pageWidth })
    doc.font("Helvetica").text(data.notes, notesX, doc.y, { width: pageWidth })
  }

  if (data.footer_text) {
    doc
      .fontSize(8)
      .font("Helvetica")
      .text(data.footer_text, doc.page.margins.left, doc.page.height - 70, {
        width: pageWidth,
        align: "center",
      })
  }

  doc.end()
  return done
}

function companyAddressLines(data: InvoiceForPdf): string[] {
  const lines: string[] = []
  if (data.company_address_line1) lines.push(data.company_address_line1)
  if (data.company_address_line2) lines.push(data.company_address_line2)
  const cityLine = [
    data.company_city,
    data.company_state,
    data.company_postal_code,
  ]
    .filter(Boolean)
    .join(", ")
  if (cityLine) lines.push(cityLine)
  if (data.company_country) lines.push(data.company_country)
  if (data.company_phone) lines.push(data.company_phone)
  if (data.company_email) lines.push(data.company_email)
  return lines
}

function addressLines(address: Record<string, string>): string[] {
  const lines: string[] = []
  if (address.street) lines.push(address.street)
  const cityLine = [address.city, address.state, address.postal_code]
    .filter(Boolean)
    .join(", ")
  if (cityLine) lines.push(cityLine)
  if (address.country) lines.push(address.country)
  return lines
}

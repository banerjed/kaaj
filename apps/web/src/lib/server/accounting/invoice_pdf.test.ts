import { describe, expect, it } from "vitest"
import { renderInvoicePdf } from "./invoice_pdf"
import type { InvoiceForPdf } from "./accounting.repo"

/**
 * `compress: false` keeps the content stream plain text — but pdfkit still
 * shows text as hex-encoded glyph codes inside `Tj`/`TJ` operators
 * (`<4e6f72>` for "Nor"), split into several `<...>` runs around each
 * kerning adjustment, never as a literal ASCII string. Concatenating every
 * hex run in document order and decoding it reconstructs the rendered text
 * (kerning numbers move the cursor; they never drop a character), which is
 * what makes a real content assertion possible here instead of "did not
 * throw." A real invoice PDF stays compressed (the default); `compress:
 * false` is a test-only override.
 */
function decodedText(pdf: Buffer): string {
  const hex = [...pdf.toString("latin1").matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => m[1])
    .join("")
  return Buffer.from(hex, "hex").toString("latin1")
}
function sample(overrides: Partial<InvoiceForPdf> = {}): InvoiceForPdf {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    invoice_number: "INV-2026-999",
    reference: null,
    invoice_date: "2026-03-10",
    due_date: "2026-04-10",
    currency: "USD",
    subtotal: "1000.00",
    tax_total: "0.00",
    total: "1000.00",
    amount_paid: "0.00",
    amount_credited: "0.00",
    amount_due: "1000.00",
    status: "sent",
    payment_terms: "Net 30",
    notes: null,
    footer_text: null,
    customer_name: "Acme Manufacturing",
    customer_email: "ap@acme.example",
    customer_billing_address: { city: "New York", state: "NY", country: "US" },
    customer_tax_number: null,
    company_name: "Northwind Consulting",
    company_logo_storage_key: null,
    company_address_line1: "120 Madison Avenue",
    company_address_line2: null,
    company_city: "New York",
    company_state: "NY",
    company_postal_code: "10016",
    company_country: "US",
    company_phone: null,
    company_email: null,
    lines: [
      {
        id: "l1",
        line_number: 1,
        description: "Consulting services",
        quantity: "10",
        unit_price: "100.00",
        amount: "1000.00",
        tax_amount: "0.00",
        account_name: "Consulting Revenue",
      },
    ],
    ...overrides,
  }
}

describe("renderInvoicePdf (US-ACC-001)", () => {
  it("produces a real PDF starting with the format's magic bytes", async () => {
    const pdf = await renderInvoicePdf(sample(), null, { compress: false })
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  })

  it("renders the invoice number, customer and line data into the content stream", async () => {
    const pdf = await renderInvoicePdf(sample(), null, { compress: false })
    const text = decodedText(pdf)
    expect(text).toContain("INV-2026-999")
    expect(text).toContain("Acme Manufacturing")
    expect(text).toContain("Northwind Consulting")
    expect(text).toContain("Consulting services")
  })

  it("renders the footer text when set", async () => {
    const pdf = await renderInvoicePdf(
      sample({ footer_text: "Thank you for your business." }),
      null,
      { compress: false },
    )
    expect(decodedText(pdf)).toContain("Thank you for your business.")
  })

  it("degrades to no logo, rather than a failed PDF, when the logo bytes are unreadable", async () => {
    const garbage = Buffer.from("not an image")
    const pdf = await renderInvoicePdf(sample(), garbage, { compress: false })
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(decodedText(pdf)).toContain("INV-2026-999")
  })

  it("defaults to a compressed content stream when compress is not set", async () => {
    const compressed = await renderInvoicePdf(sample(), null)
    const uncompressed = await renderInvoicePdf(sample(), null, {
      compress: false,
    })
    // Not a content assertion (compressed bytes decode to different
    // filtered text) — just confirms the default actually differs from the
    // test override, so the override is proven to be doing something.
    expect(decodedText(compressed)).not.toContain("Acme Manufacturing")
    expect(decodedText(uncompressed)).toContain("Acme Manufacturing")
  })
})

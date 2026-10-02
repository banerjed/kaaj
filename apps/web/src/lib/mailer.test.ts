import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"

vi.mock("$env/dynamic/private")

// vi.mock factories are hoisted above top-level declarations, so the mock
// object itself must be too.
const { mockSupabaseClient } = vi.hoisted(() => ({
  mockSupabaseClient: {
    auth: {
      admin: {
        getUserById: vi.fn(),
      },
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  },
}))
// mailer.ts imports the shared singleton rather than constructing its own
// client (verify-service-role.mjs quarantines who may build one at all), so
// the mock replaces that singleton, not @supabase/supabase-js.
vi.mock("$lib/server/supabase_service_role", () => ({
  supabaseServiceRole: mockSupabaseClient,
}))

import type { User } from "@supabase/supabase-js"
import type { MessagingProvider } from "$lib/server/messaging/bird"
import * as mailer from "./mailer"

/** The Bird provider, replaced wholesale: these tests are about what the mailer hands it, never about the wire. */
const mockSend = vi.fn()
const fakeProvider: MessagingProvider = {
  sendEmail: mockSend,
  sendSms: vi.fn(),
  inboundEmailBody: vi.fn(),
  searchNumbers: vi.fn(),
  orderNumber: vi.fn(),
}

describe("mailer", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ sent: true, providerMessageId: "em_mock" })
    const { env } = await import("$env/dynamic/private")
    env.PRIVATE_BIRD_API_KEY = "mock_bird_api_key"
    mailer.useProvider(() => fakeProvider)
  })
  afterEach(() => mailer.useProvider(null))

  describe("sendUserEmail", () => {
    const mockUser = { id: "user123", email: "user@example.com" }

    it("sends welcome email", async () => {
      mockSupabaseClient.auth.admin.getUserById.mockResolvedValue({
        data: { user: { email_confirmed_at: new Date().toISOString() } },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: { unsubscribed: false },
        error: null,
      })

      await mailer.sendUserEmail({
        user: mockUser as User,
        subject: "Test",
        from_email: "test@example.com",
        template_name: "welcome_email",
        template_properties: {
          companyName: "Test Company",
          WebsiteBaseUrl: "https://test.com",
        },
      })

      expect(mockSend).toHaveBeenCalled()
      const email = mockSend.mock.calls[0][0]
      expect(email.to).toEqual("user@example.com")
    })

    it("should not send email if user is unsubscribed", async () => {
      const originalConsoleLog = console.log
      console.log = vi.fn()

      mockSupabaseClient.auth.admin.getUserById.mockResolvedValue({
        data: { user: { email_confirmed_at: new Date().toISOString() } },
        error: null,
      })

      mockSupabaseClient.single.mockResolvedValue({
        data: { unsubscribed: true },
        error: null,
      })

      await mailer.sendUserEmail({
        user: mockUser as User,
        subject: "Test",
        from_email: "test@example.com",
        template_name: "welcome_email",
        template_properties: {},
      })

      expect(mockSend).not.toHaveBeenCalled()

      expect(console.log).toHaveBeenCalledWith(
        "User unsubscribed. Aborting email. ",
        mockUser.id,
        mockUser.email,
      )

      console.log = originalConsoleLog
    })
  })

  describe("sendTemplatedEmail", () => {
    it("sends templated email, tagged as the mailer's and never a tenant's", async () => {
      const result = await mailer.sendTemplatedEmail({
        subject: "Test subject",
        from_email: "Test Co <from@example.com>",
        to_emails: ["to@example.com"],
        template_name: "welcome_email",
        template_properties: {
          companyName: "Test Company",
          WebsiteBaseUrl: "https://test.com",
        },
      })

      expect(result).toEqual({ sent: true })
      expect(mockSend).toHaveBeenCalledTimes(1)
      const email = mockSend.mock.calls[0][0]
      expect(email.from).toEqual({ email: "from@example.com", name: "Test Co" })
      expect(email.to).toEqual("to@example.com")
      expect(email.subject).toEqual("Test subject")
      expect(email.text).toContain("This is a quick sample of a welcome email")
      expect(email.html).toContain("This is a quick sample of a welcome email")
      expect(email.html).toContain("<html")
      expect(email.html).toContain("https://test.com")
      expect(email.html).toContain("Test Company")
      expect(email.text).toContain("https://test.com")
      expect(email.text).toContain("Test Company")
      expect(email.attachments).toBeUndefined()
      expect(email.metadata).toEqual({
        source: "mailer",
        template: "welcome_email",
      })
      expect(email.metadata.tenant_id).toBeUndefined()
    })

    it("sends one message per recipient", async () => {
      await mailer.sendTemplatedEmail({
        subject: "Test subject",
        from_email: "from@example.com",
        to_emails: ["a@example.com", "b@example.com"],
        template_name: "welcome_email",
        template_properties: {},
      })
      expect(mockSend.mock.calls.map((c) => c[0].to)).toEqual([
        "a@example.com",
        "b@example.com",
      ])
    })

    it("attaches a file when attachments are given, and never adds the key otherwise", async () => {
      const pdfBytes = Buffer.from("%PDF-1.3 fake pdf bytes")
      const result = await mailer.sendTemplatedEmail({
        subject: "Invoice INV-2026-001",
        from_email: "from@example.com",
        to_emails: ["to@example.com"],
        template_name: "invoice_email",
        template_properties: {
          invoiceNumber: "INV-2026-001",
          firmName: "Test Company",
          amountDue: "$100.00",
          dueDate: "March 10, 2026",
        },
        attachments: [{ filename: "INV-2026-001.pdf", content: pdfBytes }],
      })

      expect(result).toEqual({ sent: true })
      const email = mockSend.mock.calls[0][0]
      expect(email.attachments).toEqual([
        { filename: "INV-2026-001.pdf", content: pdfBytes },
      ])
    })

    it("reports not_configured, and never calls Bird, with no API key", async () => {
      const { env } = await import("$env/dynamic/private")
      env.PRIVATE_BIRD_API_KEY = ""

      const result = await mailer.sendTemplatedEmail({
        subject: "Test subject",
        from_email: "from@example.com",
        to_emails: ["to@example.com"],
        template_name: "welcome_email",
        template_properties: {},
      })

      expect(result).toEqual({ sent: false, reason: "not_configured" })
      expect(mockSend).not.toHaveBeenCalled()
    })

    it("reports send_failed when Bird itself rejects the send", async () => {
      mockSend.mockResolvedValueOnce({
        sent: false,
        reason: "send_failed",
        detail: "invalid `from` address",
      })

      const result = await mailer.sendTemplatedEmail({
        subject: "Test subject",
        from_email: "from@example.com",
        to_emails: ["to@example.com"],
        template_name: "welcome_email",
        template_properties: {},
      })

      expect(result).toEqual({ sent: false, reason: "send_failed" })
    })
  })

  describe("sendAdminEmail", () => {
    it("sends to the admin address from the configured sender, and nothing with no admin address", async () => {
      const { env } = await import("$env/dynamic/private")
      env.PRIVATE_ADMIN_EMAIL = "ops@example.com"
      env.PRIVATE_FROM_ADMIN_EMAIL = "Ops Desk <noreply@example.com>"
      await mailer.sendAdminEmail({ subject: "Signup", body: "hello" })
      const email = mockSend.mock.calls[0][0]
      expect(email.to).toBe("ops@example.com")
      expect(email.from).toEqual({
        email: "noreply@example.com",
        name: "Ops Desk",
      })
      expect(email.subject).toBe("ADMIN_MAIL: Signup")

      mockSend.mockClear()
      env.PRIVATE_ADMIN_EMAIL = ""
      await mailer.sendAdminEmail({ subject: "Signup", body: "hello" })
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe("payment_reminder template", () => {
    it("renders the invoice, amount and firm name into both bodies", async () => {
      const result = await mailer.sendTemplatedEmail({
        subject: "Payment reminder: Invoice INV-2026-002",
        from_email: "Northwind Consulting <reminders@example.com>",
        to_emails: ["ap@britco.example"],
        template_name: "payment_reminder",
        template_properties: {
          invoiceNumber: "INV-2026-002",
          firmName: "Northwind Consulting",
          amountDue: "$18,860.00",
          dueDate: "Feb 20, 2026",
        },
      })

      expect(result).toEqual({ sent: true })
      const email = mockSend.mock.calls[0][0]
      expect(email.from).toEqual({
        email: "reminders@example.com",
        name: "Northwind Consulting",
      })
      for (const body of [email.text, email.html]) {
        expect(body).toContain("INV-2026-002")
        expect(body).toContain("Northwind Consulting")
        expect(body).toContain("$18,860.00")
        expect(body).toContain("Feb 20, 2026")
      }
    })
  })
})

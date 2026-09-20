import { vi, describe, it, expect, beforeEach } from "vitest"

vi.mock("$env/dynamic/private")
vi.mock("resend")

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
import { Resend } from "resend"
import * as mailer from "./mailer"

describe("mailer", () => {
  const mockSend = vi.fn().mockResolvedValue({ id: "mock-email-id" })

  beforeEach(async () => {
    vi.clearAllMocks()
    const { env } = await import("$env/dynamic/private")
    env.PRIVATE_RESEND_API_KEY = "mock_resend_api_key"

    vi.mocked(Resend).mockImplementation(
      () =>
        ({
          emails: {
            send: mockSend,
          },
        }) as unknown as Resend,
    )
  })

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
      expect(email.to).toEqual(["user@example.com"])
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
    it("sends templated email", async () => {
      const result = await mailer.sendTemplatedEmail({
        subject: "Test subject",
        from_email: "from@example.com",
        to_emails: ["to@example.com"],
        template_name: "welcome_email",
        template_properties: {
          companyName: "Test Company",
          WebsiteBaseUrl: "https://test.com",
        },
      })

      expect(result).toEqual({ sent: true })
      expect(mockSend).toHaveBeenCalled()
      const email = mockSend.mock.calls[0][0]
      expect(email.from).toEqual("from@example.com")
      expect(email.to).toEqual(["to@example.com"])
      expect(email.subject).toEqual("Test subject")
      expect(email.text).toContain("This is a quick sample of a welcome email")
      expect(email.html).toContain("This is a quick sample of a welcome email")
      expect(email.html).toContain("<html")
      expect(email.html).toContain("https://test.com")
      expect(email.html).toContain("Test Company")
      expect(email.text).toContain("https://test.com")
      expect(email.text).toContain("Test Company")
    })

    it("reports not_configured, and never calls Resend, with no API key", async () => {
      const { env } = await import("$env/dynamic/private")
      env.PRIVATE_RESEND_API_KEY = ""

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

    it("reports send_failed when Resend itself rejects the send", async () => {
      mockSend.mockResolvedValueOnce({
        error: { message: "invalid `from` address" },
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
      for (const body of [email.text, email.html]) {
        expect(body).toContain("INV-2026-002")
        expect(body).toContain("Northwind Consulting")
        expect(body).toContain("$18,860.00")
        expect(body).toContain("Feb 20, 2026")
      }
    })
  })
})

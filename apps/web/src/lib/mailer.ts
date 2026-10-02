import { env } from "$env/dynamic/private"
import type { User } from "@supabase/supabase-js"
import { supabaseServiceRole } from "$lib/server/supabase_service_role"
import handlebars from "handlebars"
import {
  birdConfig,
  birdProvider,
  parseSender,
  type EmailAttachment,
  type MessagingProvider,
} from "$lib/server/messaging/bird"

/**
 * The product's own transactional email — invoices, payment reminders, the
 * welcome mail, admin notifications — sent through the same Bird workspace
 * that carries customer messaging (docs/37-messaging.md). Every send is
 * tagged `metadata.source = "mailer"` and carries no tenant: nothing in
 * Kaaj tracks these rows, so the webhook ignores their status events.
 *
 * The sender must be at a domain verified in the Bird workspace; a bounce
 * for anything else is Bird's answer, reported here as `send_failed`.
 */

export type { EmailAttachment }

/** The provider is a parameter so a test can hand in a fake; pages use the default. */
let providerFactory: () => MessagingProvider = () => birdProvider()

/** Test seam only. */
export function useProvider(factory: (() => MessagingProvider) | null): void {
  providerFactory = factory ?? (() => birdProvider())
}

const configured = () => !!birdConfig().apiKey

// Sends to the admin email address. Logs errors rather than throwing.
export const sendAdminEmail = async ({
  subject,
  body,
}: {
  subject: string
  body: string
}) => {
  if (!env.PRIVATE_ADMIN_EMAIL || !configured()) {
    return
  }

  try {
    const result = await providerFactory().sendEmail({
      from: parseSender(
        env.PRIVATE_FROM_ADMIN_EMAIL || env.PRIVATE_ADMIN_EMAIL,
      ),
      to: env.PRIVATE_ADMIN_EMAIL,
      subject: "ADMIN_MAIL: " + subject,
      text: body,
      idempotencyKey: `admin-${crypto.randomUUID()}`,
      metadata: { source: "mailer" },
    })
    if (!result.sent) {
      console.log("Failed to send admin email, error:", result.reason)
    }
  } catch (e) {
    console.log("Failed to send admin email, error:", e)
  }
}

export const sendUserEmail = async ({
  user,
  subject,
  from_email,
  template_name,
  template_properties,
}: {
  user: User
  subject: string
  from_email: string
  template_name: string
  template_properties: Record<string, string>
}) => {
  const email = user.email
  if (!email) {
    console.log("No email for user. Aborting email. ", user.id)
    return
  }

  // OAuth uses email_verified; email auth uses email_confirmed_at.
  const { data: serviceUserData } =
    await supabaseServiceRole.auth.admin.getUserById(user.id)
  const emailVerified =
    serviceUserData.user?.email_confirmed_at ||
    serviceUserData.user?.user_metadata?.email_verified

  if (!emailVerified) {
    console.log("User email not verified. Aborting email. ", user.id, email)
    return
  }

  const { data: profile, error: profileError } = await supabaseServiceRole
    .from("profiles")
    .select("unsubscribed")
    .eq("id", user.id)
    .single()

  if (profileError) {
    console.log("Error fetching user profile. Aborting email. ", user.id, email)
    return
  }

  if (profile?.unsubscribed) {
    console.log("User unsubscribed. Aborting email. ", user.id, email)
    return
  }

  await sendTemplatedEmail({
    subject,
    to_emails: [email],
    from_email,
    template_name,
    template_properties,
  })
}

/**
 * `sent: false` distinguishes WHY, rather than collapsing every non-send
 * into one falsy value — a caller that needs to know whether an email
 * actually went out (rather than fire-and-forget) cannot tell "Bird
 * rejected it" from "no API key in this environment" from a bare boolean,
 * and the two call for very different messages to whoever triggered the send.
 */
export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "no_body" | "send_failed" }

export const sendTemplatedEmail = async ({
  subject,
  to_emails,
  from_email,
  template_name,
  template_properties,
  attachments,
}: {
  subject: string
  to_emails: string[]
  from_email: string
  template_name: string
  template_properties: Record<string, string>
  attachments?: EmailAttachment[]
}): Promise<SendEmailResult> => {
  if (!configured()) {
    // Email is optional; no error if unconfigured.
    return { sent: false, reason: "not_configured" }
  }

  let plaintextBody: string | undefined = undefined
  try {
    const textTemplate = await import(
      `./emails/${template_name}_text.hbs?raw`
    ).then((mod) => mod.default)
    const template = handlebars.compile(textTemplate)
    plaintextBody = template(template_properties)
  } catch {
    // ignore, plaintextBody is optional
    plaintextBody = undefined
  }

  let htmlBody: string | undefined = undefined
  try {
    const htmlTemplate = await import(
      `./emails/${template_name}_html.hbs?raw`
    ).then((mod) => mod.default)
    const template = handlebars.compile(htmlTemplate)
    htmlBody = template(template_properties)
  } catch {
    // ignore, htmlBody is optional
    htmlBody = undefined
  }

  if (!plaintextBody && !htmlBody) {
    console.log(
      "No email body: requires plaintextBody or htmlBody. Template: ",
      template_name,
    )
    return { sent: false, reason: "no_body" }
  }

  // One Bird message per recipient: a shared message id across several
  // recipients would make a bounce for one indistinguishable from the rest.
  const provider = providerFactory()
  const from = parseSender(from_email)
  let failed = false
  for (const to of to_emails) {
    const result = await provider.sendEmail({
      from,
      to,
      subject,
      text: plaintextBody,
      html: htmlBody,
      attachments,
      idempotencyKey: `mail-${crypto.randomUUID()}`,
      metadata: { source: "mailer", template: template_name },
    })
    if (!result.sent) {
      console.log("Failed to send email, error:", result.reason, result.detail)
      failed = true
    }
  }
  return failed ? { sent: false, reason: "send_failed" } : { sent: true }
}

import { Resend } from "resend"
import { env } from "$env/dynamic/private"
import type { User } from "@supabase/supabase-js"
import { supabaseServiceRole } from "$lib/server/supabase_service_role"
import handlebars from "handlebars"

// Sends to the admin email address. Logs errors rather than throwing.
export const sendAdminEmail = async ({
  subject,
  body,
}: {
  subject: string
  body: string
}) => {
  if (!env.PRIVATE_ADMIN_EMAIL) {
    return
  }

  try {
    const resend = new Resend(env.PRIVATE_RESEND_API_KEY)
    const resp = await resend.emails.send({
      from: env.PRIVATE_FROM_ADMIN_EMAIL || env.PRIVATE_ADMIN_EMAIL,
      to: [env.PRIVATE_ADMIN_EMAIL],
      subject: "ADMIN_MAIL: " + subject,
      text: body,
    })

    if (resp.error) {
      console.log("Failed to send admin email, error:", resp.error)
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
 * actually went out (rather than fire-and-forget) cannot tell "Resend
 * rejected it" from "no API key in this environment" from a bare boolean,
 * and the two call for very different messages to whoever triggered the send.
 */
export type SendEmailResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "no_body" | "send_failed" }

export type EmailAttachment = {
  filename: string
  content: Buffer
}

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
  if (!env.PRIVATE_RESEND_API_KEY) {
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

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const email: any = {
      from: from_email,
      to: to_emails,
      subject: subject,
    }
    if (plaintextBody) {
      email.text = plaintextBody
    }
    if (htmlBody) {
      email.html = htmlBody
    }
    if (attachments && attachments.length > 0) {
      email.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      }))
    }
    const resend = new Resend(env.PRIVATE_RESEND_API_KEY)
    const resp = await resend.emails.send(email)

    if (resp.error) {
      console.log("Failed to send email, error:", resp.error)
      return { sent: false, reason: "send_failed" }
    }
    return { sent: true }
  } catch (e) {
    console.log("Failed to send email, error:", e)
    return { sent: false, reason: "send_failed" }
  }
}

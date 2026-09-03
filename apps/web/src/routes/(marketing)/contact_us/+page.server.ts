import { fail } from "@sveltejs/kit"
import { sendAdminEmail } from "$lib/mailer.js"
import { formString } from "$lib/server/forms"
import { supabaseServiceRole } from "$lib/server/supabase_service_role"

/** @type {import('./$types').Actions} */
export const actions = {
  submitContactUs: async ({ request }) => {
    const formData = await request.formData()
    const errors: { [fieldName: string]: string } = {}

    const firstName = formString(formData, "first_name")
    if (firstName.length < 2) {
      errors["first_name"] = "First name is required"
    }
    if (firstName.length > 500) {
      errors["first_name"] = "First name too long"
    }

    const lastName = formString(formData, "last_name")
    if (lastName.length < 2) {
      errors["last_name"] = "Last name is required"
    }
    if (lastName.length > 500) {
      errors["last_name"] = "Last name too long"
    }

    const email = formString(formData, "email")
    if (email.length < 6) {
      errors["email"] = "Email is required"
    } else if (email.length > 500) {
      errors["email"] = "Email too long"
    } else if (!email.includes("@") || !email.includes(".")) {
      errors["email"] = "Invalid email"
    }

    const company = formString(formData, "company")
    if (company.length > 500) {
      errors["company"] = "Company too long"
    }

    const phone = formString(formData, "phone")
    if (phone.length > 100) {
      errors["phone"] = "Phone number too long"
    }

    const message = formString(formData, "message")
    if (message.length > 2000) {
      errors["message"] = "Message too long (" + message.length + " of 2000)"
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, { errors })
    }

    // Save to database
    const { error: insertError } = await supabaseServiceRole
      .from("contact_requests")
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        company_name: company,
        phone,
        message_body: message,
        updated_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error("Error saving contact request", insertError)
      return fail(500, { errors: { _: "Error saving" } })
    }

    // Send email to admin
    await sendAdminEmail({
      subject: "New contact request",
      body: `New contact request from ${firstName} ${lastName}.\n\nEmail: ${email}\n\nPhone: ${phone}\n\nCompany: ${company}\n\nMessage: ${message}`,
    })
  },
}

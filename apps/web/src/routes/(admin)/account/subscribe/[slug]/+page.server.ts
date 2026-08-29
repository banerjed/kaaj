import { PRIVATE_STRIPE_API_KEY } from "$env/static/private"
import { error, redirect } from "@sveltejs/kit"
import Stripe from "stripe"
import {
  fetchSubscription,
  getOrCreateCustomerId,
} from "../../subscription_helpers.server"
import { pricingPlans } from "../../../../(marketing)/pricing/pricing_plans"
import type { PageServerLoad } from "./$types"
const stripe = new Stripe(PRIVATE_STRIPE_API_KEY, { apiVersion: "2023-08-16" })

export const load: PageServerLoad = async ({
  params,
  url,
  locals: { session, user, supabaseServiceRole },
}) => {
  if (!session || !user) {
    redirect(303, "/login")
  }

  const plan = pricingPlans.find((candidate) => candidate.stripe_price_id === params.slug)
  if (!plan?.stripe_price_id) {
    // plan with no stripe_price_id. Redirect to account home
    redirect(303, "/account")
  }

  const { error: idError, customerId } = await getOrCreateCustomerId({
    supabaseServiceRole,
    user,
  })
  if (idError || !customerId) {
    console.error("Error creating customer id", idError)
    error(500, {
      message: "Unknown error. If issue persists, please contact us.",
    })
  }

  const { primarySubscription } = await fetchSubscription({
    customerId,
  })
  if (primarySubscription) {
    // User already has plan, we shouldn't let them buy another
    redirect(303, "/account/billing")
  }

  let checkoutUrl
  try {
    const stripeSession = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      customer: customerId,
      mode: "subscription",
      success_url: `${url.origin}/account`,
      cancel_url: `${url.origin}/account/billing`,
    })
    checkoutUrl = stripeSession.url
  } catch (e) {
    console.error("Error creating checkout session", e)
    error(500, "Unknown Error (SSE): If issue persists please contact us.")
  }

  redirect(303, checkoutUrl ?? "/pricing")
}

import { getPayPalPlanId, isPayPalSubscriptionEnabledForEmail } from "@/lib/billing/paypal"
import { listBillingPlans } from "@/lib/billing/plans"
import { getStripePriceId, isStripeSubscriptionEnabledForEmail } from "@/lib/billing/stripe"

export function listCheckoutPlansForEmail(email: string | null | undefined) {
  const paypalEnabled = isPayPalSubscriptionEnabledForEmail(email)
  const stripeEnabled = isStripeSubscriptionEnabledForEmail(email)

  return listBillingPlans().map((plan) => ({
    ...plan,
    checkoutProviders: {
      stripe: plan.checkoutEnabled && stripeEnabled ? { priceId: getStripePriceId(plan.code) || null } : null,
      paypal: plan.checkoutEnabled && paypalEnabled ? { planId: getPayPalPlanId(plan.code) || null } : null,
    },
    stripePriceId: plan.checkoutEnabled && stripeEnabled ? getStripePriceId(plan.code) || null : null,
    paypalPlanId: plan.checkoutEnabled && paypalEnabled ? getPayPalPlanId(plan.code) || null : null,
  }))
}

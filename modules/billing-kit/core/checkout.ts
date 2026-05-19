import { createPayPalSubscription, isPayPalSubscriptionEnabledForEmail, revisePayPalSubscription } from "@/lib/billing/paypal"
import { getBillingPlan } from "@/lib/billing/plans"
import {
  blocksBillingProviderSwitch,
  blocksDuplicatePlanSubscription,
  detectBillingProvider,
  normalizeBillingProvider,
  type BillingProvider,
} from "@/lib/billing/provider"
import {
  createStripeCheckoutSession,
  isStripeSubscriptionEnabledForEmail,
  updateStripeSubscriptionPlan,
} from "@/lib/billing/stripe"
import {
  getLatestBillingSubscription,
  savePendingStripeCheckoutSession,
  scheduleSubscriptionPlanChange,
  type BillingSubscriptionRecord,
} from "@/lib/billing/subscription-store"
import type { AuthUserPayload } from "@/modules/billing-kit/host/enterprise"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

export async function getCheckoutContext(user: Pick<AuthUserPayload, "enterpriseId" | "id">) {
  return getLatestBillingSubscription(user)
}

export function validateCheckoutProviderAvailability(provider: BillingProvider, email: string) {
  if (provider === "stripe") {
    return isStripeSubscriptionEnabledForEmail(email)
  }
  return isPayPalSubscriptionEnabledForEmail(email)
}

export async function beginProviderCheckout(input: {
  provider: BillingProvider
  user: AuthUserPayload
  planCode: string
  returnUrl: string | null
  cancelUrl: string | null
  origin: string
  existingSubscription?: BillingSubscriptionRecord | null
}) {
  const provider = normalizeBillingProvider(input.provider)
  if (!provider) {
    throw new Error("billing_provider_not_supported")
  }

  if (!validateCheckoutProviderAvailability(provider, input.user.email)) {
    throw new Error(`${provider}_subscriptions_disabled`)
  }

  const plan = getBillingPlan(input.planCode)
  if (!plan) throw new Error("billing_plan_not_found")
  if (!plan.checkoutEnabled) throw new Error("billing_plan_checkout_disabled")

  const existingSubscription =
    input.existingSubscription === undefined ? await getLatestBillingSubscription(input.user) : input.existingSubscription

  if (blocksBillingProviderSwitch(existingSubscription, provider)) {
    throw new Error("billing_provider_switch_requires_cancellation")
  }
  if (blocksDuplicatePlanSubscription(existingSubscription, plan.code)) {
    throw new Error("billing_plan_already_subscribed")
  }

  const existingProvider = detectBillingProvider(existingSubscription)
  const existingStatus = normalizeText(existingSubscription?.status).toLowerCase()
  const existingPlanCode = normalizeText(existingSubscription?.plan_code).toLowerCase()

  if (existingProvider === provider && existingStatus === "pending" && existingPlanCode !== plan.code) {
    throw new Error("billing_subscription_pending_approval")
  }

  if (provider === "paypal") {
    const existingPayPalSubscriptionId = normalizeText(existingSubscription?.paypal_subscription_id)
    const canReviseExistingSubscription =
      existingProvider === "paypal" &&
      existingPayPalSubscriptionId &&
      existingPlanCode !== plan.code &&
      ["active", "suspended"].includes(existingStatus)

    if (canReviseExistingSubscription) {
      const subscription = await revisePayPalSubscription({
        paypalSubscriptionId: existingPayPalSubscriptionId,
        planCode: plan.code,
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
      })
      return { provider, operation: "revise" as const, subscription }
    }

    const customId = `enterprise:${input.user.enterpriseId || "personal"}:user:${input.user.id}:plan:${plan.code}`
    const subscription = await createPayPalSubscription({
      planCode: plan.code,
      customId,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    })
    return { provider, operation: "create" as const, subscription }
  }

  const successUrl = new URL(`${input.origin}/dashboard/billing`)
  successUrl.searchParams.set("stripe", "approved")
  successUrl.searchParams.set("planCode", plan.code)
  const successUrlString = `${successUrl.toString()}&session_id={CHECKOUT_SESSION_ID}`

  const cancelUrl = new URL(`${input.origin}/dashboard/billing`)
  cancelUrl.searchParams.set("stripe", "cancelled")
  cancelUrl.searchParams.set("planCode", plan.code)

  const existingStripeSubscriptionId = normalizeText(existingSubscription?.stripe_subscription_id)
  const canReviseExistingStripeSubscription =
    existingProvider === "stripe" &&
    existingStripeSubscriptionId &&
    existingPlanCode !== plan.code &&
    ["active", "suspended"].includes(existingStatus)

  if (canReviseExistingStripeSubscription && existingSubscription?.id) {
    const stripeSubscription = await updateStripeSubscriptionPlan({
      stripeSubscriptionId: existingStripeSubscriptionId,
      planCode: plan.code,
    })
    const subscription = await scheduleSubscriptionPlanChange(existingSubscription.id, plan.code)
    return {
      provider,
      operation: "revise" as const,
      stripeSubscription,
      subscription,
      subscriptionId: existingSubscription.id,
      nextPlanCode: plan.code,
    }
  }

  const session = await createStripeCheckoutSession({
    planCode: plan.code,
    userEmail: input.user.email,
    enterpriseId: input.user.enterpriseId,
    userId: input.user.id,
    successUrl: successUrlString,
    cancelUrl: cancelUrl.toString(),
  })

  const saved = await savePendingStripeCheckoutSession({
    enterpriseId: input.user.enterpriseId,
    userId: input.user.id,
    planCode: plan.code,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
    stripeCheckoutSessionId: session.id,
  })

  return {
    provider,
    operation: "checkout" as const,
    session,
    subscription: saved,
  }
}

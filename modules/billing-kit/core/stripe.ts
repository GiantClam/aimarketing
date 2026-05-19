import Stripe from "stripe"

import { getBillingPlan, type BillingPlanCode } from "@/lib/billing/plans"

import type { BillingProvider } from "./provider"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function normalizeEmail(raw: unknown) {
  return normalizeText(raw).toLowerCase()
}

let stripeClient: Stripe | null = null

function getStripeSecretKey() {
  return normalizeText(process.env.STRIPE_SECRET_KEY)
}

export function isStripeSubscriptionEnabled() {
  return process.env.BILLING_STRIPE_SUBSCRIPTIONS_ENABLED === "true"
}

export function getStripeAllowedEmails() {
  return String(process.env.BILLING_STRIPE_ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
}

export function isStripeSubscriptionEnabledForEmail(email: string | null | undefined) {
  if (!isStripeSubscriptionEnabled()) return false
  const allowedEmails = getStripeAllowedEmails()
  if (allowedEmails.length === 0) return true
  return allowedEmails.includes(normalizeEmail(email))
}

export function getStripePriceId(planCode: BillingPlanCode) {
  return normalizeText(process.env[`STRIPE_${planCode.toUpperCase()}_PRICE_ID`])
}

export function getPlanCodeForStripePriceId(priceId: string | null | undefined): BillingPlanCode | null {
  const normalizedPriceId = normalizeText(priceId)
  if (!normalizedPriceId) return null

  for (const planCode of ["starter", "creator", "studio"] as const) {
    if (getStripePriceId(planCode) === normalizedPriceId) {
      return planCode
    }
  }
  return null
}

export function getStripeClient() {
  if (stripeClient) return stripeClient

  const secretKey = getStripeSecretKey()
  if (!secretKey) throw new Error("stripe_secret_key_missing")

  stripeClient = new Stripe(secretKey)
  return stripeClient
}

export function getStripeWebhookSecret() {
  const secret = normalizeText(process.env.STRIPE_WEBHOOK_SECRET)
  if (!secret) throw new Error("stripe_webhook_secret_missing")
  return secret
}

export function buildStripeGrantIdempotencyKey(
  stripeSubscriptionId: string,
  invoiceId: string | null | undefined,
  periodEnd: string | null | undefined,
) {
  return `stripe-grant:${normalizeText(stripeSubscriptionId)}:${normalizeText(invoiceId) || normalizeText(periodEnd) || "fallback"}`
}

export function parseStripeClientReferenceId(raw: string | null | undefined) {
  const normalized = normalizeText(raw)
  return {
    enterpriseId: Number.parseInt(/enterprise:(\d+)/i.exec(normalized)?.[1] || "", 10) || null,
    userId: Number.parseInt(/user:(\d+)/i.exec(normalized)?.[1] || "", 10) || null,
    planCode: (normalizeText(/plan:([a-z]+)/i.exec(normalized)?.[1] || "").toLowerCase() || null) as BillingPlanCode | null,
    provider: (normalizeText(/provider:([a-z]+)/i.exec(normalized)?.[1] || "").toLowerCase() || null) as BillingProvider | null,
  }
}

export async function createStripeCheckoutSession(input: {
  planCode: BillingPlanCode
  userEmail: string
  enterpriseId: number | null
  userId: number
  successUrl: string
  cancelUrl: string
}) {
  const plan = getBillingPlan(input.planCode)
  if (!plan) throw new Error("billing_plan_not_found")
  const priceId = getStripePriceId(plan.code)
  if (!priceId) throw new Error("stripe_price_id_missing")

  const stripe = getStripeClient()
  return stripe.checkout.sessions.create({
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.userEmail,
    client_reference_id: `enterprise:${input.enterpriseId || "personal"}:user:${input.userId}:plan:${plan.code}:provider:stripe`,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      enterpriseId: String(input.enterpriseId || ""),
      userId: String(input.userId),
      planCode: plan.code,
      provider: "stripe",
    },
    subscription_data: {
      metadata: {
        enterpriseId: String(input.enterpriseId || ""),
        userId: String(input.userId),
        planCode: plan.code,
        provider: "stripe",
      },
    },
  })
}

export async function getStripeCheckoutSession(sessionId: string) {
  const normalizedSessionId = normalizeText(sessionId)
  if (!normalizedSessionId) throw new Error("stripe_checkout_session_id_missing")
  return getStripeClient().checkout.sessions.retrieve(normalizedSessionId)
}

export async function getStripeSubscriptionDetails(subscriptionId: string) {
  const normalizedSubscriptionId = normalizeText(subscriptionId)
  if (!normalizedSubscriptionId) throw new Error("stripe_subscription_id_missing")
  return getStripeClient().subscriptions.retrieve(normalizedSubscriptionId)
}

export async function updateStripeSubscriptionPlan(input: {
  stripeSubscriptionId: string
  planCode: BillingPlanCode
}) {
  const plan = getBillingPlan(input.planCode)
  if (!plan) throw new Error("billing_plan_not_found")
  const priceId = getStripePriceId(plan.code)
  if (!priceId) throw new Error("stripe_price_id_missing")

  const stripe = getStripeClient()
  const subscription = await stripe.subscriptions.retrieve(input.stripeSubscriptionId)
  const currentItem = subscription.items.data[0]
  if (!currentItem?.id) throw new Error("stripe_subscription_item_missing")

  return stripe.subscriptions.update(input.stripeSubscriptionId, {
    items: [{ id: currentItem.id, price: priceId, quantity: currentItem.quantity || 1 }],
    proration_behavior: "none",
  })
}

export async function createStripeBillingPortalSession(input: {
  customerId: string
  returnUrl: string
}) {
  const customerId = normalizeText(input.customerId)
  const returnUrl = normalizeText(input.returnUrl)
  if (!customerId) throw new Error("stripe_customer_id_missing")
  if (!returnUrl) throw new Error("stripe_billing_portal_return_url_missing")

  return getStripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}

export function inferStripePlanCode(subscription: Stripe.Subscription | null | undefined) {
  const firstItem = subscription?.items?.data?.[0]
  return (
    getPlanCodeForStripePriceId(firstItem?.price?.id) ||
    (normalizeText(subscription?.metadata?.planCode).toLowerCase() as BillingPlanCode | "") ||
    null
  )
}

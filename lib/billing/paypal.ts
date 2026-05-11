import { getBillingPlan, type BillingPlanCode } from "@/lib/billing/plans"

export type PayPalEnv = "sandbox" | "live"

export type PayPalWebhookEvent = {
  id: string
  event_type: string
  resource?: Record<string, unknown> | null
}

export type PayPalWebhookProcessingState = {
  processedEventIds: Set<string>
  subscriptions: Map<
    string,
    {
      status: "pending" | "active" | "suspended" | "cancelled" | "expired"
      planCode?: BillingPlanCode | null
      enterpriseId?: number | null
      currentPeriodStart?: string | null
      currentPeriodEnd?: string | null
      cancelAtPeriodEnd?: boolean
    }
  >
  grants: Array<{
    paypalSubscriptionId: string
    planCode: BillingPlanCode
    credits: number
    idempotencyKey: string
  }>
}

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

export function isPayPalSubscriptionEnabled() {
  return process.env.BILLING_PAYPAL_SUBSCRIPTIONS_ENABLED === "true"
}

export function getPayPalEnv(): PayPalEnv {
  return process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"
}

export function getPayPalApiBase(env: PayPalEnv = getPayPalEnv()) {
  return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
}

export function getPayPalPlanId(planCode: BillingPlanCode) {
  const envName = `PAYPAL_${planCode.toUpperCase()}_PLAN_ID`
  return normalizeText(process.env[envName])
}

async function getPayPalAccessToken() {
  const clientId = normalizeText(process.env.PAYPAL_CLIENT_ID)
  const clientSecret = normalizeText(process.env.PAYPAL_CLIENT_SECRET)
  if (!clientId || !clientSecret) {
    throw new Error("paypal_credentials_missing")
  }

  const response = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    throw new Error(`paypal_token_http_${response.status}`)
  }
  const accessToken = normalizeText(payload?.access_token)
  if (!accessToken) {
    throw new Error("paypal_access_token_missing")
  }
  return accessToken
}

export async function createPayPalSubscription(input: {
  planCode: BillingPlanCode
  customId?: string | null
  returnUrl?: string | null
  cancelUrl?: string | null
}) {
  const plan = getBillingPlan(input.planCode)
  if (!plan) throw new Error("billing_plan_not_found")
  const paypalPlanId = getPayPalPlanId(plan.code)
  if (!paypalPlanId) throw new Error("paypal_plan_id_missing")

  const accessToken = await getPayPalAccessToken()
  const response = await fetch(`${getPayPalApiBase()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: paypalPlanId,
      custom_id: input.customId || undefined,
      application_context: {
        brand_name: "AI Marketing",
        user_action: "SUBSCRIBE_NOW",
        return_url: input.returnUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL,
        cancel_url: input.cancelUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL,
      },
    }),
  })
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    throw new Error(`paypal_create_subscription_http_${response.status}`)
  }
  return payload
}

export async function verifyPayPalWebhookSignature(input: {
  headers: Headers
  rawBody: string
}) {
  const webhookId = normalizeText(process.env.PAYPAL_WEBHOOK_ID)
  if (!webhookId) throw new Error("paypal_webhook_id_missing")
  const accessToken = await getPayPalAccessToken()
  const transmissionId = input.headers.get("paypal-transmission-id")
  const transmissionTime = input.headers.get("paypal-transmission-time")
  const certUrl = input.headers.get("paypal-cert-url")
  const authAlgo = input.headers.get("paypal-auth-algo")
  const transmissionSig = input.headers.get("paypal-transmission-sig")

  const response = await fetch(`${getPayPalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: JSON.parse(input.rawBody),
    }),
  })
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    throw new Error(`paypal_webhook_verify_http_${response.status}`)
  }
  return payload?.verification_status === "SUCCESS"
}

function getSubscriptionId(resource: Record<string, unknown> | null | undefined) {
  return (
    normalizeText(resource?.id) ||
    normalizeText(resource?.billing_agreement_id) ||
    normalizeText(resource?.subscription_id)
  )
}

function inferPlanCode(resource: Record<string, unknown> | null | undefined): BillingPlanCode | null {
  const raw = normalizeText(resource?.plan_code || resource?.custom_id)
  if (raw.includes("starter")) return "starter"
  if (raw.includes("creator")) return "creator"
  if (raw.includes("studio")) return "studio"
  const planId = normalizeText(resource?.plan_id)
  for (const planCode of ["starter", "creator", "studio"] as const) {
    if (planId && planId === getPayPalPlanId(planCode)) return planCode
  }
  return null
}

function grantSubscriptionCredits(
  state: PayPalWebhookProcessingState,
  paypalSubscriptionId: string,
  eventId: string,
  planCode: BillingPlanCode,
) {
  const plan = getBillingPlan(planCode)
  if (!plan) return
  const idempotencyKey = `paypal-grant:${paypalSubscriptionId}:${eventId}`
  if (state.grants.some((grant) => grant.idempotencyKey === idempotencyKey)) return
  state.grants.push({
    paypalSubscriptionId,
    planCode,
    credits: plan.monthlyCredits,
    idempotencyKey,
  })
}

export function processPayPalWebhookEventState(
  state: PayPalWebhookProcessingState,
  event: PayPalWebhookEvent,
) {
  if (state.processedEventIds.has(event.id)) {
    return { state, processed: false, duplicate: true }
  }

  const resource = event.resource || null
  const subscriptionId = getSubscriptionId(resource)
  const planCode = inferPlanCode(resource)
  const nextState: PayPalWebhookProcessingState = {
    processedEventIds: new Set(state.processedEventIds).add(event.id),
    subscriptions: new Map(state.subscriptions),
    grants: [...state.grants],
  }

  if (subscriptionId) {
    const current = nextState.subscriptions.get(subscriptionId) || { status: "pending" as const }
    if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED") {
      nextState.subscriptions.set(subscriptionId, {
        ...current,
        status: "active",
        planCode: planCode || current.planCode || null,
        currentPeriodStart: normalizeText(resource?.start_time) || current.currentPeriodStart || null,
        currentPeriodEnd: normalizeText(resource?.billing_info && (resource.billing_info as Record<string, unknown>).next_billing_time) ||
          current.currentPeriodEnd ||
          null,
      })
      if (planCode) grantSubscriptionCredits(nextState, subscriptionId, event.id, planCode)
    } else if (event.event_type === "PAYMENT.SALE.COMPLETED") {
      const effectivePlanCode = planCode || current.planCode || null
      if (effectivePlanCode) grantSubscriptionCredits(nextState, subscriptionId, event.id, effectivePlanCode)
    } else if (event.event_type === "BILLING.SUBSCRIPTION.CANCELLED") {
      nextState.subscriptions.set(subscriptionId, {
        ...current,
        status: "cancelled",
        cancelAtPeriodEnd: true,
      })
    } else if (event.event_type === "BILLING.SUBSCRIPTION.SUSPENDED") {
      nextState.subscriptions.set(subscriptionId, {
        ...current,
        status: "suspended",
      })
    } else if (event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED") {
      nextState.subscriptions.set(subscriptionId, {
        ...current,
        status: "suspended",
      })
    }
  }

  return { state: nextState, processed: true, duplicate: false }
}

export function createEmptyPayPalWebhookProcessingState(): PayPalWebhookProcessingState {
  return {
    processedEventIds: new Set(),
    subscriptions: new Map(),
    grants: [],
  }
}

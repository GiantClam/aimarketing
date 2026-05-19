export type BillingProvider = "paypal" | "stripe"

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

export function normalizeBillingProvider(raw: unknown): BillingProvider | null {
  const value = normalizeText(raw).toLowerCase()
  if (value === "paypal" || value === "stripe") return value
  return null
}

export function hasFuturePeriodEnd(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) return false
  const time = Date.parse(normalized)
  return Number.isFinite(time) && time > Date.now()
}

export function detectBillingProvider(subscription: Record<string, unknown> | null | undefined): BillingProvider | null {
  const explicitProvider = normalizeBillingProvider(subscription?.payment_provider)
  if (explicitProvider) return explicitProvider
  if (normalizeText(subscription?.stripe_subscription_id)) return "stripe"
  if (normalizeText(subscription?.paypal_subscription_id)) return "paypal"
  return null
}

export function blocksDuplicatePlanSubscription(subscription: Record<string, unknown> | null, planCode: string) {
  if (!subscription) return false
  const normalizedPlanCode = planCode.toLowerCase()
  const currentPlanCode = normalizeText(subscription.plan_code).toLowerCase()
  const nextPlanCode = normalizeText(subscription.next_plan_code).toLowerCase()
  if (currentPlanCode !== normalizedPlanCode && nextPlanCode !== normalizedPlanCode) return false

  const status = normalizeText(subscription.status).toLowerCase()
  if (["active", "pending", "suspended"].includes(status)) return true
  if (status === "cancelled" && hasFuturePeriodEnd(subscription.current_period_end)) return true
  return false
}

export function blocksBillingProviderSwitch(
  subscription: Record<string, unknown> | null,
  nextProvider: BillingProvider,
) {
  if (!subscription) return false

  const currentProvider = detectBillingProvider(subscription)
  if (!currentProvider || currentProvider === nextProvider) return false

  const status = normalizeText(subscription.status).toLowerCase()
  if (["active", "pending", "suspended"].includes(status)) return true
  if (status === "cancelled" && hasFuturePeriodEnd(subscription.current_period_end)) return true
  return false
}

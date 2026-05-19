export type BillingPlanCode = "free" | "starter" | "creator" | "studio"

export type BillingPlan = {
  code: BillingPlanCode
  name: string
  priceUsdCents: number
  monthlyCredits: number
  sharedMemberLimit: number
  trialDays: number | null
  trialCredits: number
  checkoutEnabled: boolean
  features: Record<string, unknown>
}

const BILLING_PLAN_ORDER: BillingPlanCode[] = ["free", "starter", "creator", "studio"]

const DEFAULT_FREE_TRIAL_DAYS = 30
const DEFAULT_FREE_TRIAL_CREDITS = 300

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = Number.parseInt(String(process.env[name] || ""), 10)
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

export function getDefaultFreeTrialDays() {
  return readPositiveIntegerEnv("BILLING_FREE_PLAN_TRIAL_DAYS", DEFAULT_FREE_TRIAL_DAYS)
}

export function getDefaultFreeTrialCredits() {
  return readPositiveIntegerEnv("BILLING_FREE_PLAN_TRIAL_CREDITS", DEFAULT_FREE_TRIAL_CREDITS)
}

export function isPaidPlanCheckoutEnabled() {
  return process.env.BILLING_PAID_PLANS_ENABLED === "true"
}

export const BILLING_PLANS: Record<BillingPlanCode, BillingPlan> = {
  free: {
    code: "free",
    name: "Free",
    priceUsdCents: 0,
    monthlyCredits: 0,
    sharedMemberLimit: 1,
    trialDays: getDefaultFreeTrialDays(),
    trialCredits: getDefaultFreeTrialCredits(),
    checkoutEnabled: false,
    features: {
      imageQuality: ["low"],
      gptImage2: true,
      maskEdit: "trial",
      videoGeneration: "trial",
    },
  },
  starter: {
    code: "starter",
    name: "Starter",
    priceUsdCents: 990,
    monthlyCredits: 3_000,
    sharedMemberLimit: 2,
    trialDays: null,
    trialCredits: 0,
    checkoutEnabled: isPaidPlanCheckoutEnabled(),
    features: {
      imageQuality: ["low", "medium"],
      gptImage2: true,
      maskEdit: "limited",
      videoGeneration: "trial",
    },
  },
  creator: {
    code: "creator",
    name: "Creator",
    priceUsdCents: 1_990,
    monthlyCredits: 10_000,
    sharedMemberLimit: 5,
    trialDays: null,
    trialCredits: 0,
    checkoutEnabled: isPaidPlanCheckoutEnabled(),
    features: {
      imageQuality: ["low", "medium", "high"],
      gptImage2: true,
      maskEdit: "standard",
      videoGeneration: "limited",
    },
  },
  studio: {
    code: "studio",
    name: "Studio",
    priceUsdCents: 5_990,
    monthlyCredits: 35_000,
    sharedMemberLimit: 10,
    trialDays: null,
    trialCredits: 0,
    checkoutEnabled: isPaidPlanCheckoutEnabled(),
    features: {
      imageQuality: ["low", "medium", "high"],
      gptImage2: true,
      priorityQueue: true,
      maskEdit: "high",
      videoGeneration: "standard",
    },
  },
}

export function listBillingPlans() {
  return Object.values(BILLING_PLANS)
}

export function getBillingPlan(code: string | null | undefined) {
  const normalized = String(code || "").trim().toLowerCase() as BillingPlanCode
  return BILLING_PLANS[normalized] || null
}

export function isFreeBillingPlanCode(code: string | null | undefined) {
  return String(code || "").trim().toLowerCase() === "free"
}

export function getBillingPlanRank(code: string | null | undefined) {
  const normalized = String(code || "").trim().toLowerCase() as BillingPlanCode
  const index = BILLING_PLAN_ORDER.indexOf(normalized)
  return index >= 0 ? index : 0
}

export function isPlanUpgrade(currentPlanCode: string | null | undefined, nextPlanCode: string | null | undefined) {
  return getBillingPlanRank(nextPlanCode) > getBillingPlanRank(currentPlanCode)
}

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let capturedStripeCheckoutInput: Record<string, unknown> | null = null

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/billing/plans") {
    return {
      getBillingPlan: (code: string) =>
        code === "starter" ? { code: "starter", checkoutEnabled: true } : null,
    }
  }
  if (request === "@/lib/billing/provider") {
    return {
      normalizeBillingProvider: (provider: string) => provider,
      blocksBillingProviderSwitch: () => false,
      blocksDuplicatePlanSubscription: () => false,
      detectBillingProvider: () => null,
    }
  }
  if (request === "@/lib/billing/paypal") {
    return {
      isPayPalSubscriptionEnabledForEmail: () => false,
      createPayPalSubscription: async () => {
        throw new Error("unexpected_paypal_path")
      },
      revisePayPalSubscription: async () => {
        throw new Error("unexpected_paypal_path")
      },
    }
  }
  if (request === "@/lib/billing/stripe") {
    return {
      isStripeSubscriptionEnabledForEmail: () => true,
      createStripeCheckoutSession: async (input: Record<string, unknown>) => {
        capturedStripeCheckoutInput = input
        return { id: "cs_test_123", customer: "cus_123", url: "https://checkout.stripe.test/session" }
      },
      updateStripeSubscriptionPlan: async () => {
        throw new Error("unexpected_revise_path")
      },
    }
  }
  if (request === "@/lib/billing/subscription-store") {
    return {
      getLatestBillingSubscription: async () => null,
      savePendingStripeCheckoutSession: async () => ({ id: 9, status: "pending", plan_code: "starter" }),
      scheduleSubscriptionPlanChange: async () => ({ id: 10, next_plan_code: "starter" }),
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let beginProviderCheckout!: typeof import("./checkout").beginProviderCheckout

test.before(async () => {
  const checkoutModule = await import("./checkout")
  beginProviderCheckout = checkoutModule.beginProviderCheckout
})

test.beforeEach(() => {
  capturedStripeCheckoutInput = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("stripe checkout success URL keeps the raw Checkout Session placeholder", async () => {
  await beginProviderCheckout({
    provider: "stripe",
    user: {
      id: 7,
      email: "liulanggoukk@gmail.com",
      enterpriseId: 11,
    } as any,
    planCode: "starter",
    returnUrl: null,
    cancelUrl: null,
    origin: "https://www.aimarketingsite.com",
    existingSubscription: null,
  })

  assert.equal(
    capturedStripeCheckoutInput?.successUrl,
    "https://www.aimarketingsite.com/dashboard/billing?stripe=approved&planCode=starter&session_id={CHECKOUT_SESSION_ID}",
  )
})

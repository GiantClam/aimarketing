import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

class FakeStripe {
  static lastSecretKey: string | null = null
  static lastCheckoutParams: Record<string, unknown> | null = null
  static lastSubscriptionUpdate: { id: string; params: Record<string, unknown> } | null = null

  checkout = {
    sessions: {
      create: async (params: Record<string, unknown>) => {
        FakeStripe.lastCheckoutParams = params
        return { id: "cs_test_123", url: "https://checkout.stripe.test/session" }
      },
    },
  }

  subscriptions = {
    retrieve: async () => ({
      items: { data: [{ id: "si_123", quantity: 1 }] },
    }),
    update: async (id: string, params: Record<string, unknown>) => {
      FakeStripe.lastSubscriptionUpdate = { id, params }
      return { id, ...params }
    },
  }

  billingPortal = {
    sessions: {
      create: async () => ({ url: "https://billing.stripe.test/session" }),
    },
  }

  webhooks = {
    constructEvent: () => {
      throw new Error("not_implemented")
    },
  }

  constructor(secretKey: string) {
    FakeStripe.lastSecretKey = secretKey
  }
}

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "stripe") {
    return { default: FakeStripe, __esModule: true }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let createStripeCheckoutSession!: typeof import("./stripe").createStripeCheckoutSession
let updateStripeSubscriptionPlan!: typeof import("./stripe").updateStripeSubscriptionPlan

test.before(async () => {
  const stripeModule = await import("./stripe")
  createStripeCheckoutSession = stripeModule.createStripeCheckoutSession
  updateStripeSubscriptionPlan = stripeModule.updateStripeSubscriptionPlan
})

test.beforeEach(() => {
  FakeStripe.lastSecretKey = null
  FakeStripe.lastCheckoutParams = null
  FakeStripe.lastSubscriptionUpdate = null
  process.env.STRIPE_SECRET_KEY = "sk_test_fake"
  process.env.STRIPE_STARTER_PRICE_ID = "price_starter"
  process.env.STRIPE_CREATOR_PRICE_ID = "price_creator"
  process.env.STRIPE_STUDIO_PRICE_ID = "price_studio"
})

test.after(() => {
  nodeModule._load = originalLoad
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_STARTER_PRICE_ID
  delete process.env.STRIPE_CREATOR_PRICE_ID
  delete process.env.STRIPE_STUDIO_PRICE_ID
})

test("stripe checkout session omits proration behavior for new subscriptions", async () => {
  await createStripeCheckoutSession({
    planCode: "starter",
    userEmail: "liulanggoukk@gmail.com",
    enterpriseId: 11,
    userId: 7,
    successUrl: "https://www.aimarketingsite.com/dashboard/billing?stripe=approved",
    cancelUrl: "https://www.aimarketingsite.com/dashboard/billing?stripe=cancelled",
  })

  assert.equal(FakeStripe.lastSecretKey, "sk_test_fake")
  assert.equal(FakeStripe.lastCheckoutParams?.mode, "subscription")
  assert.equal(
    (FakeStripe.lastCheckoutParams?.subscription_data as Record<string, unknown>)?.proration_behavior,
    undefined,
  )
})

test("stripe subscription revise keeps explicit no-proration updates", async () => {
  await updateStripeSubscriptionPlan({
    stripeSubscriptionId: "sub_123",
    planCode: "creator",
  })

  assert.equal(FakeStripe.lastSubscriptionUpdate?.id, "sub_123")
  assert.equal(FakeStripe.lastSubscriptionUpdate?.params?.proration_behavior, "none")
})

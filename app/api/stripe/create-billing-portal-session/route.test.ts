import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let requireSessionUserResult: { user?: Record<string, unknown>; response?: { status: number; body: any } } = {
  user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 11 },
}
let latestSubscription: any = {
  id: 15,
  payment_provider: "stripe",
  stripe_customer_id: "cus_123",
  stripe_subscription_id: "sub_123",
}
let portalCalls: any[] = []
let subscriptionLookupCalls = 0

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          status: init?.status || 200,
          body,
        }),
      },
    }
  }
  if (request === "@/lib/auth/guards") {
    return {
      requireSessionUser: async () =>
        requireSessionUserResult.response ? requireSessionUserResult : { user: requireSessionUserResult.user },
    }
  }
  if (request === "@/lib/billing/subscription-store") {
    return {
      getLatestBillingSubscription: async () => {
        subscriptionLookupCalls += 1
        return latestSubscription
      },
    }
  }
  if (request === "@/lib/billing/stripe") {
    return {
      isStripeSubscriptionEnabledForEmail: (email: string) => email === "liulanggoukk@gmail.com",
      getStripeSubscriptionDetails: async () => ({
        customer: "cus_remote_123",
      }),
      createStripeBillingPortalSession: async (input: any) => {
        portalCalls.push(input)
        return { url: "https://billing.stripe.test/session" }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST!: typeof import("./route").POST

test.before(async () => {
  const route = await import("./route")
  POST = route.POST
})

test.beforeEach(() => {
  requireSessionUserResult = { user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 11 } }
  latestSubscription = {
    id: 15,
    payment_provider: "stripe",
    stripe_customer_id: "cus_123",
    stripe_subscription_id: "sub_123",
  }
  portalCalls = []
  subscriptionLookupCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("stripe billing portal route creates a portal session", async () => {
  const response = (await POST({
    json: async () => ({ returnUrl: "https://www.aimarketingsite.com/dashboard/billing" }),
    nextUrl: { origin: "https://www.aimarketingsite.com" },
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.url, "https://billing.stripe.test/session")
  assert.equal(subscriptionLookupCalls, 1)
  assert.equal(portalCalls.length, 1)
  assert.equal(portalCalls[0]?.customerId, "cus_123")
})

test("stripe billing portal route rejects non-stripe subscriptions", async () => {
  latestSubscription = {
    id: 15,
    payment_provider: "paypal",
  }

  const response = (await POST({
    json: async () => ({}),
    nextUrl: { origin: "https://www.aimarketingsite.com" },
  } as any)) as any

  assert.equal(response.status, 404)
  assert.equal(response.body?.error, "stripe_subscription_not_found")
})

test("stripe billing portal route falls back to remote customer lookup", async () => {
  latestSubscription = {
    id: 15,
    payment_provider: "stripe",
    stripe_customer_id: null,
    stripe_subscription_id: "sub_123",
  }

  const response = (await POST({
    json: async () => ({}),
    nextUrl: { origin: "https://www.aimarketingsite.com" },
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(portalCalls[0]?.customerId, "cus_remote_123")
  assert.equal(
    portalCalls[0]?.returnUrl,
    "https://www.aimarketingsite.com/dashboard/billing",
  )
})

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let requireSessionUserResult: { user?: { id: number; enterpriseId: number | null }; response?: { status: number; body: any } } = {
  user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 11 } as any,
}
let checkoutContext: any = null
let beginProviderCheckoutArgs: any[] = []
let beginProviderCheckoutImpl: ((input: any) => Promise<any>) | null = null

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
      requireSessionUser: async () => requireSessionUserResult.response ? requireSessionUserResult : { user: requireSessionUserResult.user },
    }
  }
  if (request === "@/lib/billing/checkout") {
    return {
      getCheckoutContext: async () => checkoutContext,
      beginProviderCheckout: async (input: any) => {
        beginProviderCheckoutArgs.push(input)
        return beginProviderCheckoutImpl
          ? beginProviderCheckoutImpl(input)
          : { provider: "paypal", operation: "create", subscription: { id: "I-SUB-123", links: [] } }
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
  requireSessionUserResult = { user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 11 } as any }
  checkoutContext = null
  beginProviderCheckoutArgs = []
  beginProviderCheckoutImpl = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("paypal create-subscription route rejects unknown plans", async () => {
  beginProviderCheckoutImpl = async () => {
    throw new Error("billing_plan_not_found")
  }

  const response = (await POST({
    json: async () => ({
      planCode: "unknown",
    }),
  } as any)) as any

  assert.equal(response.status, 400)
  assert.equal(response.body?.error, "billing_plan_not_found")
})

test("paypal create-subscription route delegates provider checkout", async () => {
  const response = (await POST({
    json: async () => ({
      planCode: "creator",
      returnUrl: "https://aimarketingsite.com/dashboard/billing?paypal=approved",
      cancelUrl: "https://aimarketingsite.com/dashboard/billing?paypal=cancelled",
    }),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.id, "I-SUB-123")
  assert.equal(beginProviderCheckoutArgs.length, 1)
  assert.deepEqual(beginProviderCheckoutArgs[0], {
    provider: "paypal",
    user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 11 },
    planCode: "creator",
    returnUrl: "https://aimarketingsite.com/dashboard/billing?paypal=approved",
    cancelUrl: "https://aimarketingsite.com/dashboard/billing?paypal=cancelled",
    origin: "",
    existingSubscription: null,
  })
})

test("paypal create-subscription route blocks non-allowlisted users", async () => {
  requireSessionUserResult = { user: { id: 8, email: "other@example.com", enterpriseId: 11 } as any }
  beginProviderCheckoutImpl = async () => {
    throw new Error("paypal_subscriptions_disabled")
  }

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
    }),
  } as any)) as any

  assert.equal(response.status, 503)
  assert.equal(response.body?.error, "paypal_subscriptions_disabled")
  assert.equal(beginProviderCheckoutArgs.length, 1)
})

test("paypal create-subscription route blocks duplicate subscriptions for the current plan", async () => {
  checkoutContext = { plan_code: "creator", status: "active", current_period_end: null }
  beginProviderCheckoutImpl = async () => {
    throw new Error("billing_plan_already_subscribed")
  }

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
    }),
  } as any)) as any

  assert.equal(response.status, 409)
  assert.equal(response.body?.error, "billing_plan_already_subscribed")
})

test("paypal create-subscription route revises the current subscription when switching plans", async () => {
  checkoutContext = {
    plan_code: "starter",
    status: "active",
    current_period_end: "2026-06-01T00:00:00Z",
    paypal_subscription_id: "I-SUB-123",
    next_plan_code: null,
  }
  beginProviderCheckoutImpl = async () => ({ provider: "paypal", operation: "revise", subscription: { id: "I-SUB-123", links: [] } })

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
      returnUrl: "https://aimarketingsite.com/dashboard/billing?paypal=approved&planCode=creator",
      cancelUrl: "https://aimarketingsite.com/dashboard/billing?paypal=cancelled&planCode=creator",
    }),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.operation, "revise")
  assert.equal(beginProviderCheckoutArgs.length, 1)
})

test("paypal create-subscription route blocks plan changes while a subscription is still pending", async () => {
  checkoutContext = {
    plan_code: "starter",
    status: "pending",
    current_period_end: null,
    paypal_subscription_id: "I-SUB-123",
    next_plan_code: null,
  }
  beginProviderCheckoutImpl = async () => {
    throw new Error("billing_subscription_pending_approval")
  }

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
    }),
  } as any)) as any

  assert.equal(response.status, 409)
  assert.equal(response.body?.error, "billing_subscription_pending_approval")
  assert.equal(beginProviderCheckoutArgs.length, 1)
})

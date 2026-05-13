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
let createSubscriptionCalls: any[] = []

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
  if (request === "@/lib/billing/plans") {
    return {
      getBillingPlan: (code: string) =>
        code === "creator" ? { code: "creator", name: "Creator", checkoutEnabled: true } : null,
    }
  }
  if (request === "@/lib/billing/paypal") {
    return {
      isPayPalSubscriptionEnabledForEmail: (email: string) => email === "liulanggoukk@gmail.com",
      createPayPalSubscription: async (input: any) => {
        createSubscriptionCalls.push(input)
        return { id: "I-SUB-123", links: [] }
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
  createSubscriptionCalls = []
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("paypal create-subscription route rejects unknown plans", async () => {
  const response = (await POST({
    json: async () => ({
      planCode: "unknown",
    }),
  } as any)) as any

  assert.equal(response.status, 400)
  assert.equal(response.body?.error, "billing_plan_not_found")
})

test("paypal create-subscription route forwards plan and custom id", async () => {
  const response = (await POST({
    json: async () => ({
      planCode: "creator",
      returnUrl: "https://aimarketingsite.com/dashboard/billing?paypal=approved",
      cancelUrl: "https://aimarketingsite.com/dashboard/billing?paypal=cancelled",
    }),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.id, "I-SUB-123")
  assert.equal(createSubscriptionCalls.length, 1)
  assert.deepEqual(createSubscriptionCalls[0], {
    planCode: "creator",
    customId: "enterprise:11:user:7:plan:creator",
    returnUrl: "https://aimarketingsite.com/dashboard/billing?paypal=approved",
    cancelUrl: "https://aimarketingsite.com/dashboard/billing?paypal=cancelled",
  })
})

test("paypal create-subscription route blocks non-allowlisted users", async () => {
  requireSessionUserResult = { user: { id: 8, email: "other@example.com", enterpriseId: 11 } as any }

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
    }),
  } as any)) as any

  assert.equal(response.status, 503)
  assert.equal(response.body?.error, "paypal_subscriptions_disabled")
  assert.equal(createSubscriptionCalls.length, 0)
})

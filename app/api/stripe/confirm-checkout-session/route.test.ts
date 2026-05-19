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
let checkoutSession: any = {
  id: "cs_test_123",
  subscription: "sub_123",
  client_reference_id: "enterprise:11:user:7:plan:creator:provider:stripe",
}
let stripeSubscription: any = {
  id: "sub_123",
  customer: "cus_123",
  current_period_start: 1770000000,
  current_period_end: 1772600000,
  metadata: { planCode: "creator" },
  items: { data: [{ price: { id: "price_creator" } }] },
}
let upsertArgs: any[] = []

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
      requireSessionUser: async () => (requireSessionUserResult.response ? requireSessionUserResult : { user: requireSessionUserResult.user }),
    }
  }
  if (request === "@/lib/billing/stripe") {
    return {
      isStripeSubscriptionEnabledForEmail: (email: string) => email === "liulanggoukk@gmail.com",
      getStripeCheckoutSession: async () => checkoutSession,
      getStripeSubscriptionDetails: async () => stripeSubscription,
      parseStripeClientReferenceId: (raw: string) => {
        const match = /user:(\d+)/.exec(raw)
        return { userId: match ? Number(match[1]) : null, enterpriseId: 11, planCode: "creator", provider: "stripe" }
      },
      inferStripePlanCode: () => "creator",
    }
  }
  if (request === "@/lib/billing/subscription-store") {
    return {
      upsertActiveStripeSubscription: async (input: any) => {
        upsertArgs.push(input)
        return { id: 15, plan_code: input.planCode, status: "active", stripe_subscription_id: input.stripeSubscriptionId }
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
  checkoutSession = {
    id: "cs_test_123",
    subscription: "sub_123",
    client_reference_id: "enterprise:11:user:7:plan:creator:provider:stripe",
  }
  stripeSubscription = {
    id: "sub_123",
    customer: "cus_123",
    current_period_start: 1770000000,
    current_period_end: 1772600000,
    metadata: { planCode: "creator" },
    items: { data: [{ price: { id: "price_creator" } }] },
  }
  upsertArgs = []
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("stripe confirm-checkout-session route stores active subscription", async () => {
  const response = (await POST({
    json: async () => ({ sessionId: "cs_test_123" }),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.id, 15)
  assert.equal(upsertArgs.length, 1)
  assert.equal(upsertArgs[0]?.planCode, "creator")
  assert.equal(upsertArgs[0]?.stripeSubscriptionId, "sub_123")
})

test("stripe confirm-checkout-session route rejects mismatched users", async () => {
  checkoutSession.client_reference_id = "enterprise:11:user:99:plan:creator:provider:stripe"

  const response = (await POST({
    json: async () => ({ sessionId: "cs_test_123" }),
  } as any)) as any

  assert.equal(response.status, 403)
  assert.equal(response.body?.error, "stripe_checkout_session_user_mismatch")
})

test("stripe confirm-checkout-session route validates session id", async () => {
  const response = (await POST({
    json: async () => ({}),
  } as any)) as any

  assert.equal(response.status, 400)
  assert.equal(response.body?.error, "stripe_checkout_session_id_missing")
})

test("stripe confirm-checkout-session route falls back to subscription item periods", async () => {
  stripeSubscription = {
    id: "sub_123",
    customer: "cus_123",
    metadata: { planCode: "creator" },
    items: { data: [{ price: { id: "price_creator" }, current_period_start: 1770000000, current_period_end: 1772600000 }] },
  }

  const response = (await POST({
    json: async () => ({ sessionId: "cs_test_123" }),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(upsertArgs[0]?.currentPeriodStart, "2026-02-02T02:40:00.000Z")
  assert.equal(upsertArgs[0]?.currentPeriodEnd, "2026-03-04T04:53:20.000Z")
})

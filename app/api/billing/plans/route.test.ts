import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let requireSessionUserResult: { user?: Record<string, unknown>; response?: { status: number; body: any } } = {
  user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 1 },
}
let paypalEnabled = false

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
      listBillingPlans: () => [
        { code: "free", name: "Free", priceUsdCents: 0, monthlyCredits: 0, sharedMemberLimit: 1, trialDays: 30, trialCredits: 300, checkoutEnabled: false, features: {} },
        { code: "starter", name: "Starter", priceUsdCents: 990, monthlyCredits: 3000, sharedMemberLimit: 2, trialDays: null, trialCredits: 0, checkoutEnabled: false, features: {} },
        { code: "creator", name: "Creator", priceUsdCents: 1990, monthlyCredits: 10000, sharedMemberLimit: 5, trialDays: null, trialCredits: 0, checkoutEnabled: true, features: {} },
      ],
    }
  }
  if (request === "@/lib/billing/paypal") {
    return {
      isPayPalSubscriptionEnabledForEmail: (email: string) => paypalEnabled && email === "liulanggoukk@gmail.com",
      getPayPalPlanId: (code: string) => (code === "creator" ? "P-CREATOR" : null),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: (request: unknown) => Promise<{ status: number; body: any }>

test.before(async () => {
  const route = await import("./route")
  GET = route.GET as typeof GET
})

test.beforeEach(() => {
  requireSessionUserResult = { user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 1 } }
  paypalEnabled = false
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("billing plans route returns plans with paypal ids hidden while subscriptions are disabled", async () => {
  const response = await GET({})

  assert.equal(response.status, 200)
  assert.equal(response.body?.plans?.length, 3)
  assert.equal(response.body?.plans?.[0]?.code, "free")
  assert.equal(response.body?.plans?.[0]?.paypalPlanId, null)
  assert.equal(response.body?.plans?.[1]?.paypalPlanId, null)
  assert.equal(response.body?.plans?.[2]?.paypalPlanId, null)
})

test("billing plans route returns auth response when unauthenticated", async () => {
  requireSessionUserResult = { response: { status: 401, body: { error: "Authentication required" } } }

  const response = await GET({})

  assert.equal(response.status, 401)
  assert.equal(response.body?.error, "Authentication required")
})

test("billing plans route exposes paypal ids for enabled paid plans", async () => {
  paypalEnabled = true

  const response = await GET({})

  assert.equal(response.status, 200)
  assert.equal(response.body?.plans?.[1]?.paypalPlanId, null)
  assert.equal(response.body?.plans?.[2]?.paypalPlanId, "P-CREATOR")
})

test("billing plans route hides paypal ids for non-allowlisted users", async () => {
  paypalEnabled = true
  requireSessionUserResult = { user: { id: 8, email: "other@example.com", enterpriseId: 1 } }

  const response = await GET({})

  assert.equal(response.status, 200)
  assert.equal(response.body?.plans?.[2]?.paypalPlanId, null)
})

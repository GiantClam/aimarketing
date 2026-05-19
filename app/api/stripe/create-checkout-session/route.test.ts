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
      requireSessionUser: async () => (requireSessionUserResult.response ? requireSessionUserResult : { user: requireSessionUserResult.user }),
    }
  }
  if (request === "@/lib/billing/checkout") {
    return {
      getCheckoutContext: async () => checkoutContext,
      beginProviderCheckout: async (input: any) => {
        beginProviderCheckoutArgs.push(input)
        return beginProviderCheckoutImpl
          ? beginProviderCheckoutImpl(input)
          : { provider: "stripe", operation: "checkout", session: { id: "cs_test_123", url: "https://checkout.stripe.test/session" }, subscription: { id: 91 } }
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
  checkoutContext = null
  beginProviderCheckoutArgs = []
  beginProviderCheckoutImpl = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("stripe create-checkout-session route delegates to checkout abstraction", async () => {
  const response = (await POST({
    json: async () => ({ planCode: "creator" }),
    nextUrl: { origin: "https://www.aimarketingsite.com" },
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.operation, "checkout")
  assert.equal(response.body?.sessionId, "cs_test_123")
  assert.equal(beginProviderCheckoutArgs.length, 1)
  assert.equal(beginProviderCheckoutArgs[0]?.provider, "stripe")
  assert.equal(beginProviderCheckoutArgs[0]?.planCode, "creator")
})

test("stripe create-checkout-session route maps abstraction conflicts to 409", async () => {
  beginProviderCheckoutImpl = async () => {
    throw new Error("billing_provider_switch_requires_cancellation")
  }

  const response = (await POST({
    json: async () => ({ planCode: "creator" }),
    nextUrl: { origin: "https://www.aimarketingsite.com" },
  } as any)) as any

  assert.equal(response.status, 409)
  assert.equal(response.body?.error, "billing_provider_switch_requires_cancellation")
})

test("stripe create-checkout-session route returns revise payload", async () => {
  beginProviderCheckoutImpl = async () => ({
    provider: "stripe",
    operation: "revise",
    stripeSubscription: { id: "sub_123" },
    subscriptionId: 10,
    nextPlanCode: "creator",
  })

  const response = (await POST({
    json: async () => ({ planCode: "creator" }),
    nextUrl: { origin: "https://www.aimarketingsite.com" },
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.operation, "revise")
  assert.equal(response.body?.subscriptionId, 10)
  assert.equal(response.body?.nextPlanCode, "creator")
})

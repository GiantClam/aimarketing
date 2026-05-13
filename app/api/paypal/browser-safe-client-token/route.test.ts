import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let requireSessionUserResult: { user?: { email: string }; response?: { status: number; body: any } } = {
  user: { email: "liulanggoukk@gmail.com" },
}
let createClientTokenCalls = 0

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
  if (request === "@/lib/billing/paypal") {
    return {
      isPayPalSubscriptionEnabledForEmail: (email: string) => email === "liulanggoukk@gmail.com",
      createPayPalBrowserSafeClientToken: async () => {
        createClientTokenCalls += 1
        return "client-token-123"
      },
      getPayPalEnv: () => "sandbox",
      getPayPalWebSdkBase: () => "https://sandbox.paypal.com",
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
  requireSessionUserResult = { user: { email: "liulanggoukk@gmail.com" } }
  createClientTokenCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("paypal browser-safe-client-token route returns token and sdk base", async () => {
  const response = (await POST({} as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.clientToken, "client-token-123")
  assert.equal(response.body?.sdkBaseUrl, "https://sandbox.paypal.com")
  assert.equal(response.body?.env, "sandbox")
  assert.equal(createClientTokenCalls, 1)
})

test("paypal browser-safe-client-token route blocks non-allowlisted users", async () => {
  requireSessionUserResult = { user: { email: "other@example.com" } }

  const response = (await POST({} as any)) as any

  assert.equal(response.status, 503)
  assert.equal(response.body?.error, "paypal_subscriptions_disabled")
  assert.equal(createClientTokenCalls, 0)
})

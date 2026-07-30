import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

const queryCalls: Array<{ sql: string; params: unknown[] }> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({ status: init?.status || 200, body }),
      },
    }
  }
  if (request === "@/modules/billing-kit/host/auth") {
    return {
      requireSessionUser: async () => ({ user: { id: 7, email: "user@example.com", enterpriseId: 11 } }),
    }
  }
  if (request === "@/modules/billing-kit/core/credit-products") {
    return {
      getCreditProduct: () => ({
        code: "credits_1000",
        name: "1000 积分包",
        creditAmount: 1000,
        priceCnyFen: 1990,
        currency: "CNY",
        expiresAt: null,
      }),
      isCreditProductAvailable: () => true,
    }
  }
  if (request === "@/modules/billing-kit/core/zpay") {
    return { isZPayConfigured: () => false, buildZPayPaymentUrl: () => "https://z-pay.test" }
  }
  if (request === "@/modules/billing-kit/core/stripe") {
    return {
      isStripeCreditPaymentEnabled: () => true,
      getStripeCreditPrice: async () => ({ id: "price_credit_1000", type: "one_time", unit_amount: 1990, currency: "usd" }),
      createStripeCreditCheckoutSession: async () => ({ id: "cs_credit_123", url: "https://checkout.stripe.test/credit" }),
    }
  }
  if (request === "@/modules/billing-kit/host/db") {
    return {
      pool: {
        query: async (sql: string, params: unknown[] = []) => {
          queryCalls.push({ sql, params })
          if (sql.includes("INSERT INTO \"AI_MARKETING_payment_orders\"")) {
            return { rows: [{ order_no: "stripe_123", status: "pending", expires_at: "2026-07-30T00:30:00.000Z", product_code: "credits_1000", provider: "stripe" }] }
          }
          return { rows: [] }
        },
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
  queryCalls.length = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("credit order route creates a Stripe one-time checkout order", async () => {
  const response = (await POST({
    json: async () => ({ productCode: "credits_1000", provider: "stripe", paymentMethod: "card", idempotencyKey: "key-1" }),
    nextUrl: { origin: "https://www.aimarketingsite.com" },
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.provider, "stripe")
  assert.equal(response.body?.paymentMethod, "card")
  assert.equal(response.body?.paymentUrl, "https://checkout.stripe.test/credit")
  assert.equal(response.body?.currency, "USD")
  assert.equal(response.body?.amountMinor, 1990)
  assert.equal(queryCalls.some((entry) => entry.sql.includes("provider_payload")), true)
})

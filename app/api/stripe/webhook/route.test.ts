import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let insertedEvent = true
const subscriptionDetails: any = {
  id: "sub_123",
  status: "active",
  customer: "cus_123",
  metadata: { client_reference_id: "enterprise:11:user:7:plan:creator:provider:stripe", planCode: "creator" },
  current_period_start: 1770000000,
  current_period_end: 1772600000,
  items: { data: [{ price: { id: "price_creator" } }] },
}
const queryCalls: Array<{ sql: string; params: any[] }> = []

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
  if (request === "@/lib/billing/stripe") {
    return {
      getStripeClient: () => ({
        webhooks: {
          constructEvent: () => ({
            id: "evt_123",
            type: "invoice.paid",
            data: { object: { id: "in_123", subscription: "sub_123" } },
          }),
        },
      }),
      getStripeWebhookSecret: () => "whsec_test",
      getStripeSubscriptionDetails: async () => subscriptionDetails,
      parseStripeClientReferenceId: () => ({ enterpriseId: 11, userId: 7, planCode: "creator", provider: "stripe" }),
      inferStripePlanCode: () => "creator",
      buildStripeGrantIdempotencyKey: () => "stripe-grant:sub_123:in_123",
    }
  }
  if (request === "@/lib/billing/plans") {
    return {
      getBillingPlan: (code: string) => (code === "creator" ? { code: "creator", monthlyCredits: 10000 } : null),
    }
  }
  if (request === "@/lib/db") {
    const mockClient = {
      query: async (sql: string, params: any[] = []) => {
        queryCalls.push({ sql, params })
        if (sql.includes('SELECT id FROM "AI_MARKETING_credit_accounts"')) return { rows: [{ id: 5 }] }
        if (sql.includes('SELECT balance, reserved_balance FROM "AI_MARKETING_credit_accounts"')) return { rows: [{ balance: 0, reserved_balance: 0 }] }
        if (sql.includes('INSERT INTO "AI_MARKETING_credit_ledger"')) return { rows: [{ id: 6 }] }
        if (sql.includes('INSERT INTO "AI_MARKETING_user_subscriptions"')) return { rows: [{ id: 12, enterprise_id: 11, subscribed_by_user_id: 7 }] }
        return { rows: [] }
      },
      release: () => {},
    }
    return {
      pool: {
        query: async (sql: string, params: any[] = []) => {
          queryCalls.push({ sql, params })
          if (sql.includes('INSERT INTO "AI_MARKETING_stripe_webhook_events"')) {
            return { rows: insertedEvent ? [{ id: 1 }] : [] }
          }
          return { rows: [] }
        },
        connect: async () => mockClient,
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
  insertedEvent = true
  queryCalls.length = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("stripe webhook processes invoice.paid", async () => {
  const response = (await POST({
    text: async () => JSON.stringify({ id: "evt_123" }),
    headers: { get: (name: string) => (name === "stripe-signature" ? "sig_test" : null) },
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.ok, true)
  assert.equal(queryCalls.some((entry) => entry.sql.includes('INSERT INTO "AI_MARKETING_credit_ledger"')), true)
})

test("stripe webhook returns duplicate=true when event already exists", async () => {
  insertedEvent = false

  const response = (await POST({
    text: async () => JSON.stringify({ id: "evt_123" }),
    headers: { get: (name: string) => (name === "stripe-signature" ? "sig_test" : null) },
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.duplicate, true)
})

test("stripe webhook validates signature presence", async () => {
  const response = (await POST({
    text: async () => JSON.stringify({ id: "evt_123" }),
    headers: { get: () => null },
  } as any)) as any

  assert.equal(response.status, 400)
  assert.equal(response.body?.error, "stripe_signature_missing")
})

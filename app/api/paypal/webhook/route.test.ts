import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let verifyResult = true
let topLevelQueryCalls: Array<{ sql: string; params: any[] }> = []
let clientQueryCalls: Array<{ sql: string; params: any[] }> = []
let duplicateEvent = false

const mockClient = {
  query: async (sql: string, params: any[] = []) => {
    clientQueryCalls.push({ sql, params })
    if (sql.includes('FROM "AI_MARKETING_user_subscriptions"')) {
      return { rows: [] }
    }
    if (sql.includes('INSERT INTO "AI_MARKETING_user_subscriptions"')) {
      return { rows: [{ id: 9 }] }
    }
    if (sql.includes('SELECT id FROM "AI_MARKETING_credit_accounts"')) {
      return { rows: [{ id: 5 }] }
    }
    if (sql.includes('SELECT balance, reserved_balance FROM "AI_MARKETING_credit_accounts"')) {
      return { rows: [{ balance: 0, reserved_balance: 0 }] }
    }
    if (sql.includes('INSERT INTO "AI_MARKETING_credit_ledger"')) {
      return { rows: [{ id: 12 }] }
    }
    return { rows: [] }
  },
  release: () => {},
}

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
  if (request === "@/lib/billing/paypal") {
    return {
      verifyPayPalWebhookSignature: async () => verifyResult,
    }
  }
  if (request === "@/lib/billing/plans") {
    return {
      getBillingPlan: (code: string) =>
        code === "creator" ? { code: "creator", monthlyCredits: 10000 } : null,
    }
  }
  if (request === "@/lib/db") {
    return {
      pool: {
        query: async (sql: string, params: any[] = []) => {
          topLevelQueryCalls.push({ sql, params })
          if (sql.includes('INSERT INTO "AI_MARKETING_paypal_webhook_events"')) {
            return { rows: duplicateEvent ? [] : [{ id: 1 }] }
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
  verifyResult = true
  topLevelQueryCalls = []
  clientQueryCalls = []
  duplicateEvent = false
  process.env.PAYPAL_SKIP_WEBHOOK_VERIFICATION = "false"
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("paypal webhook route rejects invalid signatures", async () => {
  verifyResult = false
  const response = (await POST({
    text: async () => JSON.stringify({ id: "EVT-1", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: {} }),
    headers: new Headers(),
  } as any)) as any

  assert.equal(response.status, 401)
  assert.equal(response.body?.error, "paypal_webhook_signature_invalid")
})

test("paypal webhook route short-circuits duplicate events", async () => {
  duplicateEvent = true
  const response = (await POST({
    text: async () => JSON.stringify({ id: "EVT-2", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: { id: "I-SUB-1" } }),
    headers: new Headers(),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.duplicate, true)
  assert.equal(clientQueryCalls.length, 0)
})

test("paypal webhook route processes activation events", async () => {
  const response = (await POST({
    text: async () =>
      JSON.stringify({
        id: "EVT-3",
        event_type: "BILLING.SUBSCRIPTION.ACTIVATED",
        resource: {
          id: "I-SUB-3",
          custom_id: "enterprise:11:user:7:plan:creator",
          start_time: "2026-05-07T00:00:00Z",
        },
      }),
    headers: new Headers(),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.ok, true)
  assert.equal(
    clientQueryCalls.some((entry) => entry.sql.includes('INSERT INTO "AI_MARKETING_user_subscriptions"')),
    true,
  )
  assert.equal(
    topLevelQueryCalls.some((entry) => entry.sql.includes('UPDATE "AI_MARKETING_paypal_webhook_events" SET processed_at')),
    true,
  )
})

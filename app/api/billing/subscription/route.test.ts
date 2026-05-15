import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let requireSessionUserResult: { user?: { id: number; email: string; enterpriseId: number | null }; response?: { status: number; body: any } } = {
  user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 11 },
}
let subscriptionRows: any[] = []
let lastInsertParams: any[] | null = null
let lastUpdateParams: any[] | null = null
let ensureDefaultFreeBillingCalls = 0
let clientQueryCalls: Array<{ sql: string; params: any[] }> = []
let paypalRemoteSubscription: Record<string, unknown> | null = null
let existingSubscriptionRows: any[] = []
let workspaceSnapshot = {
  activeMemberCount: 3,
  seatLimit: 5,
  seatsRemaining: 2,
}

const mockClient = {
  query: async (sql: string, params: any[] = []) => {
    clientQueryCalls.push({ sql, params })
    if (sql.includes('UPDATE "AI_MARKETING_user_subscriptions"')) {
      return {
        rows: [
          {
            id: subscriptionRows[0]?.id || 10,
            enterprise_id: 11,
            subscribed_by_user_id: 7,
            plan_code: "creator",
            status: "active",
            paypal_subscription_id: "I-SUB-123",
            next_plan_code: null,
            current_period_start: "2026-05-07T00:00:00Z",
            current_period_end: "2026-06-07T00:00:00Z",
            cancel_at_period_end: false,
            created_at: "2026-05-07T00:00:00Z",
            updated_at: "2026-05-07T00:00:00Z",
          },
        ],
      }
    }
    if (sql.includes('SELECT id FROM "AI_MARKETING_credit_accounts"')) {
      return { rows: [{ id: 5 }] }
    }
    if (sql.includes('SELECT balance, reserved_balance FROM "AI_MARKETING_credit_accounts"')) {
      return { rows: [{ balance: 0, reserved_balance: 0 }] }
    }
    if (sql.includes('INSERT INTO "AI_MARKETING_credit_ledger"')) {
      return { rows: [{ id: 22 }] }
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
  if (request === "@/lib/auth/guards") {
    return {
      requireSessionUser: async () => requireSessionUserResult.response ? requireSessionUserResult : { user: requireSessionUserResult.user },
    }
  }
  if (request === "@/lib/billing/plans") {
    return {
      getBillingPlan: (code: string) =>
        code === "creator"
          ? { code: "creator", name: "Creator", monthlyCredits: 10000 }
          : code === "starter"
            ? { code: "starter", name: "Starter", monthlyCredits: 3000 }
            : null,
    }
  }
  if (request === "@/lib/billing/paypal") {
    return {
      isPayPalSubscriptionEnabledForEmail: (email: string) => email === "liulanggoukk@gmail.com",
      getPayPalSubscriptionDetails: async () => paypalRemoteSubscription || {},
      buildPayPalGrantIdempotencyKey: () => "paypal-grant:I-SUB-123:2026-05-07T00:00:00Z",
      getPlanCodeForPayPalPlanId: (planId: string) => {
        if (planId === "P-CREATOR") return "creator"
        if (planId === "P-STARTER") return "starter"
        return null
      },
    }
  }
  if (request === "@/lib/billing/default-free-plan") {
    return {
      ensureDefaultFreeBillingForUser: async () => {
        ensureDefaultFreeBillingCalls += 1
        return {
          subscription: {
            id: 1,
            planCode: "free",
            status: "active",
            currentPeriodStart: "2026-05-11T00:00:00.000Z",
            currentPeriodEnd: "2026-06-10T00:00:00.000Z",
            cancelAtPeriodEnd: false,
          },
        }
      },
    }
  }
  if (request === "@/lib/billing/workspace") {
    return {
      getWorkspaceBillingSnapshot: async () => workspaceSnapshot,
    }
  }
  if (request === "@/lib/db") {
    return {
      pool: {
        query: async (sql: string, params: any[]) => {
          if (sql.includes('INSERT INTO "AI_MARKETING_user_subscriptions"')) {
            lastInsertParams = params
            return { rows: subscriptionRows }
          }
          if (sql.includes('UPDATE "AI_MARKETING_user_subscriptions"')) {
            lastUpdateParams = params
            return { rows: subscriptionRows }
          }
          if (sql.includes('SELECT id, plan_code, status, current_period_end, paypal_subscription_id, next_plan_code')) {
            return { rows: existingSubscriptionRows }
          }
          return { rows: subscriptionRows }
        },
        connect: async () => mockClient,
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET!: typeof import("./route").GET
let POST!: typeof import("./route").POST

test.before(async () => {
  const route = await import("./route")
  GET = route.GET
  POST = route.POST
})

test.beforeEach(() => {
  requireSessionUserResult = { user: { id: 7, email: "liulanggoukk@gmail.com", enterpriseId: 11 } }
  subscriptionRows = []
  lastInsertParams = null
  lastUpdateParams = null
  ensureDefaultFreeBillingCalls = 0
  clientQueryCalls = []
  paypalRemoteSubscription = null
  existingSubscriptionRows = []
  workspaceSnapshot = {
    activeMemberCount: 3,
    seatLimit: 5,
    seatsRemaining: 2,
  }
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("billing subscription route returns latest subscription", async () => {
  subscriptionRows = [{ id: 8, plan_code: "creator", status: "active" }]

  const response = (await GET({} as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.id, 8)
  assert.equal(response.body?.subscription?.plan_code, "creator")
  assert.equal(response.body?.subscription?.seat_limit, 5)
  assert.equal(response.body?.subscription?.active_member_count, 3)
  assert.equal(response.body?.subscription?.seats_remaining, 2)
})

test("billing subscription route reconciles pending PayPal subscriptions that are already active remotely", async () => {
  subscriptionRows = [
    {
      id: 10,
      enterprise_id: 11,
      subscribed_by_user_id: 7,
      plan_code: "creator",
      status: "pending",
      paypal_subscription_id: "I-SUB-123",
      next_plan_code: null,
    },
  ]
  paypalRemoteSubscription = {
    id: "I-SUB-123",
    status: "ACTIVE",
    custom_id: "enterprise:11:user:7:plan:creator",
    start_time: "2026-05-07T00:00:00Z",
    billing_info: {
      next_billing_time: "2026-06-07T00:00:00Z",
      last_payment: { time: "2026-05-07T00:00:00Z" },
    },
  }

  const response = (await GET({} as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.status, "active")
  assert.equal(response.body?.subscription?.plan_code, "creator")
  assert.equal(
    clientQueryCalls.some((entry) => entry.sql.includes('UPDATE "AI_MARKETING_user_subscriptions"')),
    true,
  )
  assert.equal(
    clientQueryCalls.some((entry) => entry.sql.includes('INSERT INTO "AI_MARKETING_credit_ledger"')),
    true,
  )
})

test("billing subscription route initializes default free subscription when none exists", async () => {
  const response = (await GET({} as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.plan_code, "free")
  assert.equal(response.body?.subscription?.status, "active")
  assert.equal(ensureDefaultFreeBillingCalls, 1)
  assert.equal(response.body?.subscription?.seat_limit, 5)
  assert.equal(response.body?.subscription?.active_member_count, 3)
  assert.equal(response.body?.subscription?.seats_remaining, 2)
})

test("billing subscription route validates required fields", async () => {
  const response = (await POST({
    json: async () => ({
      planCode: "starter",
    }),
  } as any)) as any

  assert.equal(response.status, 400)
  assert.equal(response.body?.error, "planCode and paypalSubscriptionId are required")
})

test("billing subscription route stores a pending subscription", async () => {
  subscriptionRows = [
    {
      id: 9,
      enterprise_id: 11,
      subscribed_by_user_id: 7,
      plan_code: "creator",
      status: "pending",
      paypal_subscription_id: "I-SUB-123",
      next_plan_code: null,
    },
  ]

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
      paypalSubscriptionId: "I-SUB-123",
    }),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.paypal_subscription_id, "I-SUB-123")
  assert.deepEqual(lastInsertParams, [11, 7, "creator", "I-SUB-123"])
})

test("billing subscription route blocks pending sandbox records for non-allowlisted users", async () => {
  requireSessionUserResult = { user: { id: 8, email: "other@example.com", enterpriseId: 11 } }

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
      paypalSubscriptionId: "I-SUB-999",
    }),
  } as any)) as any

  assert.equal(response.status, 403)
  assert.equal(response.body?.error, "paypal_subscriptions_disabled")
  assert.equal(lastInsertParams, null)
})

test("billing subscription route blocks saving a duplicate current plan subscription", async () => {
  existingSubscriptionRows = [{ id: 10, plan_code: "creator", status: "active", current_period_end: null, next_plan_code: null }]

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
      paypalSubscriptionId: "I-SUB-456",
    }),
  } as any)) as any

  assert.equal(response.status, 409)
  assert.equal(response.body?.error, "billing_plan_already_subscribed")
})

test("billing subscription route schedules a revised plan on the current subscription", async () => {
  existingSubscriptionRows = [
    {
      id: 10,
      plan_code: "starter",
      status: "active",
      current_period_end: "2026-06-01T00:00:00Z",
      paypal_subscription_id: "I-SUB-123",
      next_plan_code: null,
    },
  ]
  subscriptionRows = [
    {
      id: 10,
      enterprise_id: 11,
      subscribed_by_user_id: 7,
      plan_code: "starter",
      status: "active",
      paypal_subscription_id: "I-SUB-123",
      next_plan_code: "creator",
    },
  ]

  const response = (await POST({
    json: async () => ({
      planCode: "creator",
      paypalSubscriptionId: "I-SUB-123",
    }),
  } as any)) as any

  assert.equal(response.status, 200)
  assert.equal(response.body?.subscription?.next_plan_code, "creator")
  assert.deepEqual(lastUpdateParams, [10, "creator"])
})

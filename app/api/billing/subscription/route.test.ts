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
let ensureDefaultFreeBillingCalls = 0
let workspaceSnapshot = {
  activeMemberCount: 3,
  seatLimit: 5,
  seatsRemaining: 2,
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
        code === "creator" ? { code: "creator", name: "Creator", monthlyCredits: 10000 } : null,
    }
  }
  if (request === "@/lib/billing/paypal") {
    return {
      isPayPalSubscriptionEnabledForEmail: (email: string) => email === "liulanggoukk@gmail.com",
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
        query: async (_sql: string, params: any[]) => {
          lastInsertParams = params
          return { rows: subscriptionRows }
        },
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
  ensureDefaultFreeBillingCalls = 0
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

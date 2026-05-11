import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let requireSessionUserResult: { user?: { id: number; enterpriseId: number | null }; response?: { status: number; body: any } } = {
  user: { id: 7, enterpriseId: 11 },
}
let queryResultRows: any[] = []
let ensureDefaultFreeBillingCalls = 0

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
  if (request === "@/lib/db") {
    return {
      pool: {
        query: async () => ({
          rows: queryResultRows,
        }),
      },
    }
  }
  if (request === "@/lib/billing/default-free-plan") {
    return {
      ensureDefaultFreeBillingForUser: async () => {
        ensureDefaultFreeBillingCalls += 1
        return {
          subscription: {
            currentPeriodStart: "2026-05-11T00:00:00.000Z",
            currentPeriodEnd: "2026-06-10T00:00:00.000Z",
          },
          creditAccount: {
            id: 99,
            balance: 300,
            reservedBalance: 0,
            availableCredits: 300,
          },
        }
      },
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
  requireSessionUserResult = { user: { id: 7, enterpriseId: 11 } }
  queryResultRows = []
  ensureDefaultFreeBillingCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("billing credits route computes available shared credits", async () => {
  queryResultRows = [
    {
      id: 5,
      account_type: "enterprise",
      enterprise_id: 11,
      owner_user_id: null,
      balance: 1000,
      reserved_balance: 120,
      monthly_grant_balance: 500,
      purchased_balance: 500,
    },
  ]

  const response = await GET({})

  assert.equal(response.status, 200)
  assert.equal(response.body?.balance, 1000)
  assert.equal(response.body?.reservedBalance, 120)
  assert.equal(response.body?.availableCredits, 880)
  assert.equal(response.body?.account?.id, 5)
})

test("billing credits route returns zero values when no account exists", async () => {
  const response = await GET({})

  assert.equal(response.status, 200)
  assert.equal(response.body?.account?.id, 99)
  assert.equal(response.body?.availableCredits, 300)
  assert.equal(ensureDefaultFreeBillingCalls, 1)
})

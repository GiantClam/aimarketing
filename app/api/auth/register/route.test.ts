import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let selectQueue: unknown[][] = []
let insertReturningQueue: unknown[][] = []
let insertCalls: Array<{ table: unknown; values: unknown }> = []
let updateCalls: Array<{ table: unknown; values: unknown }> = []
let ensurePermissionsCalls: Array<{ userId: number; enabled: boolean }> = []
let provisionCalls: number[] = []
let resendEmailCalls: Array<Record<string, unknown>> = []
let generatedCode = "new-enterprise"

const schemaTables = {
  enterprises: { table: "enterprises", id: "enterprise.id", enterpriseCode: "enterprise.enterpriseCode" },
  enterpriseJoinRequests: { table: "enterpriseJoinRequests", userId: "join.userId" },
  userFeaturePermissions: { table: "userFeaturePermissions", userId: "permissions.userId" },
  users: { table: "users", id: "user.id", email: "user.email" },
}

function buildDbMock() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectQueue.shift() || [],
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        insertCalls.push({ table, values })
        return {
          returning: async () => insertReturningQueue.shift() || [],
        }
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => {
        updateCalls.push({ table, values })
        return {
          where: async () => [],
        }
      },
    }),
    delete: () => ({
      where: async () => [],
    }),
  }
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
  if (request === "drizzle-orm") {
    return {
      eq: (left: unknown, right: unknown) => ({ left, right }),
    }
  }
  if (request === "@/lib/db") {
    return {
      db: buildDbMock(),
    }
  }
  if (request === "@/lib/db/schema") {
    return schemaTables
  }
  if (request === "@/lib/billing/provision") {
    return {
      provisionDefaultBillingForUserId: async (userId: number) => {
        provisionCalls.push(userId)
      },
    }
  }
  if (request === "@/lib/enterprise/server") {
    return {
      ensureEnterpriseAuthTables: async () => {},
      ensurePermissions: async (userId: number, enabled: boolean) => {
        ensurePermissionsCalls.push({ userId, enabled })
      },
      generateEnterpriseCode: () => generatedCode,
      hashPassword: (password: string) => `hashed:${password}`,
    }
  }
  if (request === "@/lib/server/audit") {
    return {
      logAuditEvent: () => {},
    }
  }
  if (request === "@/lib/auth/email-verification") {
    return {
      buildEmailVerificationUrl: () => "https://example.com/verify/token",
      resendEmailVerification: async (payload: Record<string, unknown>) => {
        resendEmailCalls.push(payload)
      },
    }
  }
  if (request === "@/lib/server/rate-limit") {
    return {
      checkRateLimit: async () => ({ ok: true, remaining: 5, resetAt: Date.now() + 60_000 }),
      createRateLimitResponse: () => ({
        status: 429,
        body: { error: "rate_limited" },
      }),
      getRequestIp: () => "127.0.0.1",
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

function buildRequest(body: Record<string, unknown>) {
  return {
    method: "POST",
    nextUrl: { pathname: "/api/auth/register" },
    headers: {
      get: () => null,
    },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0]
}

test.before(async () => {
  const route = await import("./route")
  POST = route.POST
})

test.beforeEach(() => {
  selectQueue = []
  insertReturningQueue = []
  insertCalls = []
  updateCalls = []
  ensurePermissionsCalls = []
  provisionCalls = []
  resendEmailCalls = []
  generatedCode = "new-enterprise"
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("register create provisions default billing for the new enterprise admin", async () => {
  selectQueue = [
    [],
    [],
  ]
  insertReturningQueue = [
    [{ id: 101, enterpriseCode: "new-enterprise" }],
    [{ id: 202 }],
  ]

  const response = await POST(buildRequest({
    name: "Alice",
    email: " Alice@Example.com ",
    password: "secret",
    enterpriseAction: "create",
    enterpriseName: "New Enterprise",
  }))

  assert.equal(response.status, 200)
  assert.equal(response.body?.requiresEmailVerification, true)
  assert.equal(response.body?.email, "alice@example.com")
  assert.deepEqual(ensurePermissionsCalls, [{ userId: 202, enabled: true }])
  assert.deepEqual(provisionCalls, [202])
  assert.equal(resendEmailCalls.length, 1)
  assert.equal(insertCalls.length >= 2, true)
  assert.deepEqual(insertCalls[0], {
    table: schemaTables.enterprises,
    values: {
      enterpriseCode: "new-enterprise",
      name: "New Enterprise",
      createdAt: insertCalls[0]?.values && (insertCalls[0].values as Record<string, unknown>).createdAt,
      updatedAt: insertCalls[0]?.values && (insertCalls[0].values as Record<string, unknown>).updatedAt,
    },
  })
})

test("register join provisions default billing for the new member", async () => {
  selectQueue = [
    [],
    [{ id: 301, enterpriseCode: "vbuy" }],
  ]
  insertReturningQueue = [
    [{ id: 404 }],
  ]

  const response = await POST(buildRequest({
    name: "Bob",
    email: "bob@example.com",
    password: "secret",
    enterpriseAction: "join",
    enterpriseCode: "VBUY",
    joinNote: "Please approve",
  }))

  assert.equal(response.status, 200)
  assert.equal(response.body?.requiresEmailVerification, true)
  assert.equal(response.body?.email, "bob@example.com")
  assert.deepEqual(ensurePermissionsCalls, [{ userId: 404, enabled: false }])
  assert.deepEqual(provisionCalls, [404])
  assert.equal(resendEmailCalls.length, 1)
  assert.equal(insertCalls.length >= 2, true)
  assert.deepEqual(insertCalls[1], {
    table: schemaTables.enterpriseJoinRequests,
    values: {
      userId: 404,
      enterpriseId: 301,
      status: "pending",
      note: "Please approve",
      createdAt: insertCalls[1]?.values && (insertCalls[1].values as Record<string, unknown>).createdAt,
      updatedAt: insertCalls[1]?.values && (insertCalls[1].values as Record<string, unknown>).updatedAt,
    },
  })
})

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let enterpriseRows: Array<{ id: number; enterpriseCode: string }> = []
let userRows: Array<{ id: number }> = []
let insertReturningQueue: unknown[][] = []
let updateCalls = 0
let ensurePermissionsCalls: Array<{ userId: number; enabled: boolean }> = []
let ensureDemoBillingCreditFloorCalls: Array<Record<string, unknown>> = []
let shouldEnableDemoLogin = true
let currentPayload: Record<string, unknown> | null = null

const schemaTables = {
  enterprises: { table: "enterprises", id: "enterprise.id", enterpriseCode: "enterprise.enterpriseCode" },
  users: { table: "users", id: "user.id", email: "user.email" },
}

function buildDbMock() {
  return {
    select: (selection: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === schemaTables.enterprises) return enterpriseRows
            if (table === schemaTables.users) {
              if ("email" in selection) return userRows
              if ("id" in selection) return userRows
            }
            return []
          },
        }),
      }),
    }),
    insert: (_table: unknown) => ({
      values: (_values: unknown) => ({
        returning: async () => insertReturningQueue.shift() || [],
      }),
    }),
    update: (_table: unknown) => ({
      set: (_values: unknown) => ({
        where: async () => {
          updateCalls += 1
          return []
        },
      }),
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
  if (request === "@/lib/auth/session") {
    return {
      applyDemoSessionCookie: (response: { status: number; body: unknown }) => ({
        ...response,
        demoSessionCookieApplied: true,
      }),
      createDemoAuthPayload: () => ({
        id: 1,
        email: "demo@example.com",
        name: "体验用户",
        isDemo: true,
        enterpriseId: null,
        enterpriseCode: "experience-enterprise",
        enterpriseName: "体验企业",
        enterpriseRole: "admin",
        enterpriseStatus: "active",
        permissions: {},
      }),
      isDemoLoginEnabled: () => shouldEnableDemoLogin,
      withSessionDbRetry: async (_label: string, operation: () => Promise<unknown>) => operation(),
    }
  }
  if (request === "@/lib/billing/default-free-plan") {
    return {
      ensureDemoBillingCreditFloor: async (payload: Record<string, unknown>) => {
        ensureDemoBillingCreditFloorCalls.push(payload)
      },
    }
  }
  if (request === "@/lib/enterprise/server") {
    return {
      ensurePermissions: async (userId: number, enabled: boolean) => {
        ensurePermissionsCalls.push({ userId, enabled })
      },
      getUserAuthPayload: async () => currentPayload,
      hashPassword: (password: string) => `hashed:${password}`,
    }
  }
  if (request === "@/lib/server/audit") {
    return {
      logAuditEvent: () => {},
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

function buildRequest() {
  return {
    method: "POST",
    nextUrl: { pathname: "/api/auth/demo" },
    headers: {
      get: () => null,
    },
  } as unknown as Parameters<typeof POST>[0]
}

test.before(async () => {
  const route = await import("./route")
  POST = route.POST
})

test.beforeEach(() => {
  enterpriseRows = [{ id: 11, enterpriseCode: "experience-enterprise" }]
  userRows = [{ id: 7 }]
  insertReturningQueue = []
  updateCalls = 0
  ensurePermissionsCalls = []
  ensureDemoBillingCreditFloorCalls = []
  shouldEnableDemoLogin = true
  currentPayload = {
    id: 7,
    email: "demo@example.com",
    name: "体验用户",
    isDemo: true,
    enterpriseId: 11,
    enterpriseCode: "experience-enterprise",
    enterpriseName: "体验企业",
    enterpriseRole: "admin",
    enterpriseStatus: "active",
    permissions: {},
  }
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("demo login provisions free billing for the hydrated demo enterprise user", async () => {
  const response = await POST(buildRequest()) as {
    status: number
    body: { user?: { email?: string; enterpriseId?: number } }
    demoSessionCookieApplied?: boolean
  }

  assert.equal(response.status, 200)
  assert.equal(response.body?.user?.email, "demo@example.com")
  assert.equal(response.body?.user?.enterpriseId, 11)
  assert.deepEqual(ensurePermissionsCalls, [{ userId: 7, enabled: true }])
  assert.deepEqual(ensureDemoBillingCreditFloorCalls, [currentPayload])
  assert.equal(updateCalls, 1)
  assert.equal(response.demoSessionCookieApplied, true)
})

test("demo login blocks when demo access is disabled", async () => {
  shouldEnableDemoLogin = false

  const response = await POST(buildRequest()) as {
    status: number
    body: { error?: string }
  }

  assert.equal(response.status, 403)
  assert.equal(response.body?.error, "demo login is disabled")
  assert.equal(ensureDemoBillingCreditFloorCalls.length, 0)
})

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUserRows: Array<{ id: number; password: string | null; emailVerified: boolean }> = []
let loginPayload: Record<string, unknown> | null = null
let verifyPasswordCalls = 0
let createUserSessionCalls = 0
let ensureDemoBillingCreditFloorCalls = 0
let shouldThrowSessionDbError = false
let shouldThrowEnterpriseAuthTableError = false

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
  if (request === "@/lib/db") {
    return {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => currentUserRows,
            }),
          }),
        }),
      },
    }
  }
  if (request === "@/lib/db/schema") {
    return {
      users: {
        id: "id",
        password: "password",
        emailVerified: "emailVerified",
        email: "email",
      },
    }
  }
  if (request === "@/lib/auth/session") {
    return {
      applyDemoSessionCookie: (response: { status: number; body: unknown }) => ({
        ...response,
        demoSessionCookieApplied: true,
      }),
      applySessionCookie: (response: { status: number; body: unknown }) => ({
        ...response,
        sessionCookieApplied: true,
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
      createUserSession: async () => {
        createUserSessionCalls += 1
        return {
          sessionToken: "session-token",
          expiresAt: new Date(),
        }
      },
      isDemoLoginEnabled: () => true,
      isSessionDbUnavailableError: (error: unknown) =>
        error instanceof Error && error.message === "auth_session_retry_exhausted: db unavailable",
      withSessionDbRetry: async (_label: string, operation: () => Promise<unknown>) => {
        if (shouldThrowSessionDbError) {
          throw new Error("auth_session_retry_exhausted: db unavailable")
        }
        return operation()
      },
    }
  }
  if (request === "@/lib/billing/default-free-plan") {
    return {
      ensureDemoBillingCreditFloor: async () => {
        ensureDemoBillingCreditFloorCalls += 1
      },
    }
  }
  if (request === "@/lib/enterprise/server") {
    return {
      ensureEnterpriseAuthTables: async () => {
        if (shouldThrowEnterpriseAuthTableError) {
          throw new Error("auth_session_retry_exhausted: db unavailable")
        }
      },
      getUserAuthPayload: async () => loginPayload,
      verifyPassword: (input: string, hashed?: string | null) => {
        verifyPasswordCalls += 1
        return input === "correct-password" && hashed === "hashed-password"
      },
    }
  }
  if (request === "@/lib/server/rate-limit") {
    return {
      checkRateLimit: async () => ({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 }),
      createRateLimitResponse: () => ({
        status: 429,
        body: { error: "rate_limited" },
      }),
      getRequestIp: () => "127.0.0.1",
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: (req: { json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any; sessionCookieApplied?: boolean }>

function buildRequest(body: Record<string, unknown>) {
  return {
    method: "POST",
    nextUrl: { pathname: "/api/auth/login" },
    headers: {
      get: (name: string) => (name.toLowerCase() === "user-agent" ? "test-agent" : null),
    },
    json: async () => body,
  }
}

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as unknown as (req: { json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any; sessionCookieApplied?: boolean }>
})

test.beforeEach(() => {
  currentUserRows = []
  loginPayload = null
  verifyPasswordCalls = 0
  createUserSessionCalls = 0
  ensureDemoBillingCreditFloorCalls = 0
  shouldThrowSessionDbError = false
  shouldThrowEnterpriseAuthTableError = false
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("login blocks password-correct users whose email is not verified", async () => {
  currentUserRows = [{ id: 7, password: "hashed-password", emailVerified: false }]
  loginPayload = {
    id: 7,
    email: "cf_x@qq.com",
    name: "User",
    enterpriseId: 1,
    enterpriseCode: "enterprise",
    enterpriseName: "Enterprise",
    enterpriseRole: "admin",
    enterpriseStatus: "active",
    permissions: {},
  }

  const response = await POST(buildRequest({
    email: "cf_x@qq.com",
    password: "correct-password",
  }) as Parameters<typeof POST>[0])

  assert.equal(response.status, 403)
  assert.equal(response.body?.error, "email_not_verified")
  assert.equal(verifyPasswordCalls, 1)
  assert.equal(createUserSessionCalls, 0)
  assert.equal(response.sessionCookieApplied, undefined)
})

test("login allows verified users to create a session", async () => {
  currentUserRows = [{ id: 7, password: "hashed-password", emailVerified: true }]
  loginPayload = {
    id: 7,
    email: "cf_x@qq.com",
    name: "User",
    enterpriseId: 1,
    enterpriseCode: "enterprise",
    enterpriseName: "Enterprise",
    enterpriseRole: "admin",
    enterpriseStatus: "active",
    permissions: {},
  }

  const response = await POST(buildRequest({
    email: "cf_x@qq.com",
    password: "correct-password",
  }) as Parameters<typeof POST>[0])

  assert.equal(response.status, 200)
  assert.equal(response.body?.user?.email, "cf_x@qq.com")
  assert.equal(verifyPasswordCalls, 1)
  assert.equal(createUserSessionCalls, 1)
  assert.equal(ensureDemoBillingCreditFloorCalls, 1)
  assert.equal(response.sessionCookieApplied, true)
})

test("login falls back to demo session when the database is unavailable for demo credentials", async () => {
  shouldThrowSessionDbError = true

  const response = await POST(buildRequest({
    email: "demo@example.com",
    password: "demo123456",
  }) as Parameters<typeof POST>[0]) as {
    status: number
    body: { user?: { email?: string }; fallback?: string }
    demoSessionCookieApplied?: boolean
  }

  assert.equal(response.status, 200)
  assert.equal(response.body?.user?.email, "demo@example.com")
  assert.equal(response.body?.fallback, "stateless_demo_login")
  assert.equal(response.demoSessionCookieApplied, true)
  assert.equal(createUserSessionCalls, 0)
})

test("login falls back to demo session when demo credentials do not have a stored user row", async () => {
  currentUserRows = []

  const response = await POST(buildRequest({
    email: "demo@example.com",
    password: "demo123456",
  }) as Parameters<typeof POST>[0]) as {
    status: number
    body: { user?: { email?: string }; fallback?: string }
    demoSessionCookieApplied?: boolean
  }

  assert.equal(response.status, 200)
  assert.equal(response.body?.user?.email, "demo@example.com")
  assert.equal(response.body?.fallback, "stateless_demo_login")
  assert.equal(response.demoSessionCookieApplied, true)
  assert.equal(createUserSessionCalls, 0)
})

test("login falls back to demo session when auth table bootstrap fails before user lookup", async () => {
  shouldThrowEnterpriseAuthTableError = true

  const response = await POST(buildRequest({
    email: "demo@example.com",
    password: "demo123456",
  }) as Parameters<typeof POST>[0]) as {
    status: number
    body: { user?: { email?: string }; fallback?: string }
    demoSessionCookieApplied?: boolean
  }

  assert.equal(response.status, 200)
  assert.equal(response.body?.user?.email, "demo@example.com")
  assert.equal(response.body?.fallback, "stateless_demo_login")
  assert.equal(response.demoSessionCookieApplied, true)
  assert.equal(createUserSessionCalls, 0)
})

test("login returns database_unavailable for non-demo credentials when the database is unavailable", async () => {
  shouldThrowSessionDbError = true

  const response = await POST(buildRequest({
    email: "person@example.com",
    password: "correct-password",
  }) as Parameters<typeof POST>[0])

  assert.equal(response.status, 503)
  assert.equal(response.body?.error, "database_unavailable")
  assert.equal(createUserSessionCalls, 0)
})

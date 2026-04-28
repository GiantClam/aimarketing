import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: { id: number; isDemo: boolean } | null = { id: 7, isDemo: false }
let currentPasswordRow: { password: string | null } | null = { password: "hashed-password" }
let getUserAuthPayloadResult: Record<string, unknown> | null = {
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
let createUserSessionCalls = 0
let deleteUserSessionsCalls = 0
let verifyPasswordCalls = 0

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
  if (request === "@/lib/auth/session") {
    return {
      applySessionCookie: (response: { status: number; body: unknown }) => ({
        ...response,
        sessionCookieApplied: true,
      }),
      createUserSession: async () => {
        createUserSessionCalls += 1
        return {
          sessionToken: "session-token",
          expiresAt: new Date(),
        }
      },
      deleteUserSessions: async () => {
        deleteUserSessionsCalls += 1
      },
      getSessionUser: async () => currentUser,
    }
  }
  if (request === "@/lib/db") {
    return {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => (currentPasswordRow ? [currentPasswordRow] : []),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [{ id: 7 }],
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
      },
    }
  }
  if (request === "@/lib/enterprise/server") {
    return {
      ensureEnterpriseAuthTables: async () => {},
      getUserAuthPayload: async () => getUserAuthPayloadResult,
      hashPassword: (value: string) => `hashed:${value}`,
      verifyPassword: (input: string, hashed?: string | null) => {
        verifyPasswordCalls += 1
        return input === "current-password" && hashed === "hashed-password"
      },
    }
  }
  if (request === "@/lib/server/rate-limit") {
    return {
      checkRateLimit: async () => ({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 }),
      createRateLimitResponse: () => ({ status: 429, body: { error: "rate_limited" } }),
      getRequestIp: () => "127.0.0.1",
    }
  }
  if (request === "@/lib/server/audit") {
    return {
      logAuditEvent: () => {},
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: (req: { json: () => Promise<Record<string, unknown>>; headers: { get: (name: string) => string | null } }) => Promise<{ status: number; body: any; sessionCookieApplied?: boolean }>

function buildRequest(body: Record<string, unknown>) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "user-agent" ? "test-agent" : null),
    },
    json: async () => body,
  }
}

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as unknown as typeof POST
})

test.beforeEach(() => {
  currentUser = { id: 7, isDemo: false }
  currentPasswordRow = { password: "hashed-password" }
  getUserAuthPayloadResult = {
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
  createUserSessionCalls = 0
  deleteUserSessionsCalls = 0
  verifyPasswordCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("change password rotates the session after a successful password update", async () => {
  const response = await POST(buildRequest({
    currentPassword: "current-password",
    newPassword: "new-password-123",
    confirmPassword: "new-password-123",
  }))

  assert.equal(response.status, 200)
  assert.equal(response.body?.success, true)
  assert.equal(verifyPasswordCalls, 1)
  assert.equal(deleteUserSessionsCalls, 1)
  assert.equal(createUserSessionCalls, 1)
  assert.equal(response.sessionCookieApplied, true)
})


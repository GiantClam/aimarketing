import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let consumeTokenCalls = 0
let deleteUserSessionsCalls = 0
let createUserSessionCalls = 0

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
    }
  }
  if (request === "@/lib/db") {
    return {
      db: {
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
      },
    }
  }
  if (request === "@/lib/enterprise/server") {
    return {
      ensureEnterpriseAuthTables: async () => {},
      getUserAuthPayload: async () => ({
        id: 7,
        email: "cf_x@qq.com",
        name: "User",
        enterpriseId: 1,
        enterpriseCode: "enterprise",
        enterpriseName: "Enterprise",
        enterpriseRole: "admin",
        enterpriseStatus: "active",
        permissions: {},
      }),
      hashPassword: (value: string) => `hashed:${value}`,
    }
  }
  if (request === "@/lib/auth/password-reset") {
    return {
      consumePasswordResetToken: async () => {
        consumeTokenCalls += 1
        return {
          userId: 7,
          email: "cf_x@qq.com",
          name: "User",
          emailVerified: false,
          enterpriseStatus: "active",
        }
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
  consumeTokenCalls = 0
  deleteUserSessionsCalls = 0
  createUserSessionCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("reset password consumes token, rotates sessions, and logs the user in", async () => {
  const response = await POST(buildRequest({
    token: "reset-token",
    newPassword: "new-password-123",
    confirmPassword: "new-password-123",
  }))

  assert.equal(response.status, 200)
  assert.equal(response.body?.success, true)
  assert.equal(consumeTokenCalls, 1)
  assert.equal(deleteUserSessionsCalls, 1)
  assert.equal(createUserSessionCalls, 1)
  assert.equal(response.sessionCookieApplied, true)
})


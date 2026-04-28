import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUserRows: Array<{ id: number; name: string }> = []
let sendPasswordResetEmailCalls = 0

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
        name: "name",
        email: "email",
      },
    }
  }
  if (request === "@/lib/enterprise/server") {
    return {
      ensureEnterpriseAuthTables: async () => {},
    }
  }
  if (request === "@/lib/auth/password-reset") {
    return {
      buildPasswordResetUrl: (_baseUrl: string, token: string) => `https://example.com/reset-password?token=${token}`,
      sendPasswordResetEmail: async () => {
        sendPasswordResetEmailCalls += 1
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

let POST: (req: { json: () => Promise<Record<string, unknown>>; headers: { get: (name: string) => string | null }; url: string }) => Promise<{ status: number; body: any }>

function buildRequest(body: Record<string, unknown>) {
  return {
    url: "http://localhost/api/auth/password/forgot",
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
  currentUserRows = []
  sendPasswordResetEmailCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("forgot password stays generic while sending reset email for existing users", async () => {
  currentUserRows = [{ id: 7, name: "User" }]

  const response = await POST(buildRequest({ email: "cf_x@qq.com" }))

  assert.equal(response.status, 200)
  assert.equal(response.body?.success, true)
  assert.equal(sendPasswordResetEmailCalls, 1)
})


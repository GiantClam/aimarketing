import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let capturedTaskPayload: Record<string, unknown> | null = null

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
      requireSessionUser: async () => ({
        user: { id: 96, enterpriseId: 151 },
      }),
    }
  }
  if (request === "@/lib/server/rate-limit") {
    return {
      checkRateLimit: async () => ({ ok: true }),
      createRateLimitResponse: () => ({ status: 429, body: { error: "rate_limited" } }),
      getRequestIp: () => "127.0.0.1",
    }
  }
  if (request === "@/lib/writer/config") {
    return {
      normalizeWriterLanguage: () => "zh",
      normalizeWriterMode: () => "article",
      normalizeWriterPlatform: () => "wechat",
    }
  }
  if (request === "@/lib/writer/repository") {
    return {
      listWriterMessages: async () => ({ data: [] }),
    }
  }
  if (request === "@/lib/assistant-async") {
    return {
      createPendingWriterConversation: async () => ({
        conversationId: "540",
        conversation: { id: "540", status: "drafting" },
      }),
      enqueueAssistantTask: async (input: { payload: Record<string, unknown> }) => {
        capturedTaskPayload = input.payload
        return { id: 1235 }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: (request: { json: () => Promise<Record<string, unknown>> }) => Promise<any>

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as typeof POST
})

test.beforeEach(() => {
  capturedTaskPayload = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("writer chat resumes a failed conversation in drafting status for skill briefing", async () => {
  const response = await POST({
    json: async () => ({
      query: "继续",
      conversation_id: "540",
      platform: "wechat",
      mode: "article",
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(response.body?.task_id, "1235")
  assert.equal(capturedTaskPayload?.conversationStatus, "drafting")
})

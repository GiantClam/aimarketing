import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let capturedTaskPayload: Record<string, unknown> | null = null
let writerHistory: Array<Record<string, unknown>> = []
let capturedRevisionState: Record<string, unknown> | null = null

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
      listWriterMessages: async () => ({ data: writerHistory }),
    }
  }
  if (request === "@/lib/writer/revisions") {
    return { getWriterRevisionState: async () => capturedRevisionState }
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
  writerHistory = []
  capturedRevisionState = null
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

test("writer chat payload carries raw input without application-classified operation or URL intent", async () => {
  const query = "把第 3 节翻译成英文，并参考 https://example.com/source 改成小红书版本"
  const response = await POST({
    json: async () => ({
      query,
      conversation_id: "540",
      platform: "wechat",
      mode: "article",
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(capturedTaskPayload?.query, query)
  for (const forbidden of [
    "intent",
    "operation",
    "rewriteIntent",
    "researchIntent",
    "sourceUrls",
    "targetPlatformIntent",
  ]) {
    assert.equal(Object.hasOwn(capturedTaskPayload || {}, forbidden), false, forbidden)
  }
})

test("writer chat does not synthesize an active revision from a clarification message", async () => {
  writerHistory = [
    {
      id: "clarification-1",
      query: "Write a WeChat article about AI workflow systems.",
      answer: "Who is the target audience and what outcome should the article drive?",
      content: "Who is the target audience and what outcome should the article drive?",
      role: "assistant",
      inputs: { contents: "Write a WeChat article about AI workflow systems." },
    },
  ]
  capturedRevisionState = {
    activeRevision: 0,
    activeDraft: null,
  }

  const response = await POST({
    json: async () => ({
      query: "The audience is B2B SaaS founders and the goal is to drive demo requests.",
      conversation_id: "540",
      platform: "wechat",
      mode: "article",
    }),
  })

  assert.equal(response.status, 200)
  const writerContext = capturedTaskPayload?.writerContext as { activeDraft?: unknown } | undefined
  assert.equal(writerContext?.activeDraft, null)
})

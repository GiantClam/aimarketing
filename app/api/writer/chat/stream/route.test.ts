import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let reserveShouldThrow = false
let finalizeCalls = 0
let releaseCalls = 0
let emitLateProgressAfterResolve = false
let lastWriterRunInput: Record<string, unknown> | null = null

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
        user: { id: 7, enterpriseId: 11 },
      }),
    }
  }
  if (request === "@/lib/billing/runtime") {
    return {
      reserveFeatureCredits: async () => {
        if (reserveShouldThrow) throw new Error("insufficient_credits")
        return { creditAccountId: 1, reserveIdempotencyKey: "reserve-1", amount: 10 }
      },
      finalizeReservedCredits: async () => {
        finalizeCalls += 1
      },
      releaseReservedCredits: async () => {
        releaseCalls += 1
      },
    }
  }
  if (request === "@/lib/billing/costing") {
    return {
      estimateTextCredits: () => ({
        featureKey: "writer_copy",
        credits: 10,
        source: "estimate",
        provider: "writer",
        model: "writer-skills",
        officialCostUsd: 0.01,
        costBasisUsd: 0.01,
        metadata: {},
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
  if (request === "@/lib/assistant-async") {
    return {
      createPendingWriterConversation: async () => ({
        conversationId: "conv-1",
        conversation: { id: "conv-1" },
      }),
    }
  }
  if (request === "@/lib/skills/runtime/registry") {
    return {
      loadWriterSkillRunner: () => ({
        runBlocking: async (input?: { onProgress?: (event: { type: string; label: string; status: string }) => Promise<void> | void }) => {
          lastWriterRunInput = (input || null) as Record<string, unknown> | null
          if (emitLateProgressAfterResolve) {
            setTimeout(() => {
              void input?.onProgress?.({
                type: "draft_ready",
                label: "Draft ready",
                status: "completed",
              })
            }, 0)
          }

          return {
            answer: "Generated draft",
            outcome: "draft_ready",
            routing: { renderPlatform: "wechat", renderMode: "article" },
            diagnostics: { ok: true },
          }
        },
      }),
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
      getWriterConversation: async () => null,
      listWriterMessages: async (_userId: number, _conversationId: string, limit: number) =>
        limit === 1 ? { conversation: { id: "conv-1" }, data: [] } : { data: [] },
      updateWriterLatestAssistantMessage: async () => {},
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
  reserveShouldThrow = false
  finalizeCalls = 0
  releaseCalls = 0
  emitLateProgressAfterResolve = false
  lastWriterRunInput = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("writer chat stream route returns 402 when credits are insufficient", async () => {
  reserveShouldThrow = true

  const response = await POST({
    json: async () => ({
      query: "write a launch post",
    }),
  })

  assert.equal(response.status, 402)
  assert.equal(response.body?.error, "insufficient_credits")
})

test("writer chat stream route finalizes credits on success", async () => {
  const response = await POST({
    json: async () => ({
      query: "write a launch post",
    }),
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  const text = await new Response(response.body).text()
  assert.match(text, /conversation_init/)
  assert.match(text, /message_end/)
  assert.equal(finalizeCalls, 1)
  assert.equal(releaseCalls, 0)
})

test("writer chat stream route ignores late progress events after the stream closes", async () => {
  emitLateProgressAfterResolve = true

  const response = await POST({
    json: async () => ({
      query: "write a launch post",
    }),
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  const text = await new Response(response.body).text()
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.match(text, /message_end/)
  assert.doesNotMatch(text, /"event":"error"/)
  assert.equal(finalizeCalls, 1)
  assert.equal(releaseCalls, 0)
})

test("writer chat stream route forwards workflow model preferences to the runner", async () => {
  const response = await POST({
    json: async () => ({
      query: "write a launch post",
      modelConfig: {
        providerId: "pptoken",
        modelId: "gpt-5.4",
      },
    }),
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  assert.equal(lastWriterRunInput?.selectedProviderId, "pptoken")
  assert.equal(lastWriterRunInput?.selectedModelId, "gpt-5.4")
})

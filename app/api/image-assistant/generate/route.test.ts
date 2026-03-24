import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

type ConversationTurnParams = {
  userId: number
  enterpriseId?: number | null
  requestIp: string
  sessionId?: string | null
  prompt: string
  taskType: "generate" | "edit"
  referenceAssetIds?: string[]
  candidateCount?: number
  sizePreset?: string | null
  resolution?: string | null
  parentVersionId?: string | null
  guidedSelection?: {
    source_message_id?: string | null
    question_id?: string | null
    option_id?: string | null
  } | null
}

let runTurnCalls: ConversationTurnParams[] = []
let enqueueCalls = 0
let shouldFailSessionDetail = false

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
        user: { id: 7, enterpriseId: null },
      }),
    }
  }
  if (request === "@/lib/assistant-async") {
    return {
      ensureImageAssistantSessionForTask: async () => ({
        sessionId: "s-1",
        session: { current_version_id: "v-current" },
      }),
      enqueueAssistantTask: async () => {
        enqueueCalls += 1
        return { id: "task-1" }
      },
    }
  }
  if (request === "@/lib/image-assistant/service") {
    return {
      runImageAssistantConversationTurn: async (params: ConversationTurnParams) => {
        runTurnCalls.push(params)
        return {
          outcome: "generated",
          version_id: "v-2",
          follow_up_message_id: null,
        }
      },
    }
  }
  if (request === "@/lib/image-assistant/repository") {
    return {
      listImageAssistantVersions: async () => [],
      getImageAssistantSessionDetail: async () => {
        if (shouldFailSessionDetail) {
          throw new Error("Failed query: timeout exceeded when trying to connect")
        }
        return {
          session: { id: "s-1", current_version_id: "v-2" },
          messages: [],
          versions: [],
          assets: [],
          canvas_document: null,
          meta: {
            messages_total: 0,
            messages_loaded: 0,
            messages_has_more: false,
            messages_next_cursor: null,
            versions_total: 0,
            versions_loaded: 0,
            versions_has_more: false,
            versions_next_cursor: null,
          },
        }
      },
    }
  }
  if (request === "@/lib/server/rate-limit") {
    return {
      createRateLimitResponse: () => ({
        status: 429,
        body: { error: "rate_limited" },
      }),
      getRequestIp: () => "127.0.0.1",
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: (req: { json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any }>

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as unknown as (req: { json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any }>
})

test.beforeEach(() => {
  runTurnCalls = []
  enqueueCalls = 0
  shouldFailSessionDetail = false
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("generate route defaults to async queue execution when preferAsync is omitted", async () => {
  const response = await POST({
    json: async () => ({
      prompt: "Generate a product hero image with orange gradient lighting",
      sessionId: "s-1",
      candidateCount: 1,
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(runTurnCalls.length, 0)
  assert.equal(enqueueCalls, 1)
  assert.equal(response.body?.data?.accepted, true)
  assert.equal(typeof response.body?.data?.task_id, "string")
})

test("generate route promotes explicit reference upscale prompt to edit mode", async () => {
  const response = await POST({
    json: async () => ({
      prompt: "upscale this image to 4k",
      sessionId: "s-1",
      referenceAssetIds: ["asset-1"],
      candidateCount: 1,
      preferAsync: false,
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(runTurnCalls.length, 1)
  assert.equal(runTurnCalls[0].taskType, "edit")
  assert.deepEqual(runTurnCalls[0].referenceAssetIds, ["asset-1"])
  assert.equal(enqueueCalls, 0)
})

test("generate route keeps generate mode for explicit reference prompt without edit intent", async () => {
  const response = await POST({
    json: async () => ({
      prompt: "Use this image as style reference and generate a new campaign poster",
      sessionId: "s-1",
      referenceAssetIds: ["asset-1"],
      candidateCount: 1,
      preferAsync: false,
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(runTurnCalls.length, 1)
  assert.equal(runTurnCalls[0].taskType, "generate")
  assert.deepEqual(runTurnCalls[0].referenceAssetIds, ["asset-1"])
  assert.equal(enqueueCalls, 0)
})

test("generate route keeps direct success when detail read is temporarily unavailable", async () => {
  shouldFailSessionDetail = true
  const response = await POST({
    json: async () => ({
      prompt: "upscale this image to 4k",
      sessionId: "s-1",
      referenceAssetIds: ["asset-1"],
      candidateCount: 1,
      preferAsync: false,
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(runTurnCalls.length, 1)
  assert.equal(runTurnCalls[0].taskType, "edit")
  assert.equal(response.body?.data?.accepted, true)
  assert.equal(response.body?.data?.direct, true)
  assert.equal(response.body?.data?.detail_snapshot, null)
  assert.equal(enqueueCalls, 0)
})

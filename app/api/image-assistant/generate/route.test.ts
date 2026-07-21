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
  enterpriseRole?: string | null
  enterpriseStatus?: string | null
  requestIp: string
  sessionId?: string | null
  prompt: string
  taskType: "generate" | "edit"
  invocationMode?: "assistant" | "workflow_runtime" | null
  referenceAssetIds?: string[]
  modelOptionId?: string | null
  providerLock?: "pptoken" | "aiberm" | "crazyroute" | null
  model?: string | null
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
let enqueueCalls: Array<{ workflowName: string; payload: ConversationTurnParams & { kind: string } }> = []
let shouldFailSessionDetail = false
let shouldFailSessionValidation = false
let listVersionsCalls = 0

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
      ensureImageAssistantSessionForTask: async () => {
        if (shouldFailSessionValidation) {
          throw new Error("image_assistant_session_not_found")
        }
        return {
          sessionId: "s-1",
          session: { current_version_id: "v-current" },
        }
      },
      enqueueAssistantTask: async (input: { workflowName: string; payload: ConversationTurnParams & { kind: string } }) => {
        enqueueCalls.push(input)
        return { id: "task-1" }
      },
    }
  }
  if (request === "@/lib/platform/model-governance") {
    return {
      resolveGovernedImageAssistantSelectionForUser: async (input: {
        modelOptionId?: string | null
        model?: string | null
      }) => {
        const optionId = input.modelOptionId || "workspace:pptoken:gpt-image-2"
        const providerId = optionId.includes(":aiberm:") ? "aiberm" : optionId.includes(":crazyroute:") ? "crazyroute" : "pptoken"
        return {
          source: "workspace",
          modelOptionId: optionId,
          providerId,
          providerLabel: providerId,
          providerLock: providerId,
          model: input.model || "gpt-image-2",
          modelOptions: [],
          providerOptions: [],
          enterpriseRuntime: null,
        }
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
      listImageAssistantVersions: async () => {
        listVersionsCalls += 1
        return []
      },
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
  enqueueCalls = []
  shouldFailSessionDetail = false
  shouldFailSessionValidation = false
  listVersionsCalls = 0
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
  assert.equal(enqueueCalls.length, 1)
  assert.equal(response.body?.data?.accepted, true)
  assert.equal(typeof response.body?.data?.task_id, "string")
})

test("generate route rejects a missing session instead of creating a replacement", async () => {
  shouldFailSessionValidation = true

  const response = await POST({
    json: async () => ({
      prompt: "继续生成",
      sessionId: "492",
    }),
  })

  assert.equal(response.status, 404)
  assert.equal(response.body?.error, "Not found")
  assert.equal(enqueueCalls.length, 0)
})

test("generate route syncs explicit prompt resolution and ratio into async payload", async () => {
  const response = await POST({
    json: async () => ({
      prompt: "生成一张3D植物细胞图，纯色背景，可用于tripo3d生成模型，1k，16：9",
      sessionId: "s-1",
      candidateCount: 1,
      sizePreset: "4:5",
      resolution: "2K",
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(runTurnCalls.length, 0)
  assert.equal(enqueueCalls.length, 1)
  assert.equal(enqueueCalls[0].payload.sizePreset, "16:9")
  assert.equal(enqueueCalls[0].payload.resolution, "1K")
})

test("generate route forwards workflow runtime invocation mode into async payload", async () => {
  const response = await POST({
    json: async () => ({
      prompt: "生成一张沙滩日落海报",
      sessionId: "s-1",
      candidateCount: 1,
      invocationMode: "workflow_runtime",
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(enqueueCalls.length, 1)
  assert.equal(enqueueCalls[0].payload.invocationMode, "workflow_runtime")
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
  assert.equal(enqueueCalls.length, 0)
})

test("generate route keeps generate mode for explicit reference prompt without edit intent", async () => {
  const response = await POST({
    json: async () => ({
      prompt: "Use this image as style reference and generate a new campaign poster",
      sessionId: "s-1",
      referenceAssetIds: ["asset-1"],
      modelOptionId: "workspace:aiberm:gpt-image-2",
      model: "gpt-image-2",
      candidateCount: 1,
      preferAsync: false,
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(runTurnCalls.length, 1)
  assert.equal(runTurnCalls[0].taskType, "generate")
  assert.deepEqual(runTurnCalls[0].referenceAssetIds, ["asset-1"])
  assert.equal(runTurnCalls[0].modelOptionId, "workspace:aiberm:gpt-image-2")
  assert.equal(runTurnCalls[0].providerLock, "aiberm")
  assert.equal(runTurnCalls[0].model, "gpt-image-2")
  assert.equal(enqueueCalls.length, 0)
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
  assert.equal(enqueueCalls.length, 0)
})

test("generate route skips implicit history references when disableReferenceCarryover is true", async () => {
  const response = await POST({
    json: async () => ({
      prompt: "upscale this image to 4k",
      sessionId: "s-1",
      disableReferenceCarryover: true,
      preferAsync: false,
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(runTurnCalls.length, 1)
  assert.equal(runTurnCalls[0].taskType, "generate")
  assert.deepEqual(runTurnCalls[0].referenceAssetIds || [], [])
  assert.equal(listVersionsCalls, 0)
  assert.equal(enqueueCalls.length, 0)
})

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

type RunningHubConfigLike = {
  baseUrl: string
  apiKey: string
  queryPath: string
  uploadPath: string
  workflowCreatePath: string
  seedanceTextToVideoEndpoint: string | null
  seedanceImageToVideoEndpoint: string | null
  seedanceMiniTextToVideoEndpoint: string | null
  seedanceMiniImageToVideoEndpoint: string | null
  digitalHumanWorkflowId: string | null
  videoEnhanceWorkflowId: string | null
  image: {
    configured: boolean
    endpoint: string | null
  }
  video: {
    configured: boolean
    endpoint: string | null
  }
}

let governedImageSelectionCalls: Array<Record<string, unknown>> = []
let submitRunningHubTaskCalls: Array<{ mediaTarget: string; payload: Record<string, unknown>; config?: RunningHubConfigLike }> = []
let executeMediaCapabilityCalls: Array<Record<string, unknown>> = []
let reserveFeatureCreditsCalls: Array<Record<string, unknown>> = []
let finalizeReservedCreditsCalls: Array<Record<string, unknown>> = []
let releaseReservedCreditsCalls: Array<Record<string, unknown>> = []
let attachPendingVideoBillingToRunCalls: Array<Record<string, unknown>> = []
let settleVideoBillingForRunIdCalls: Array<Record<string, unknown>> = []
let reserveCreditsShouldThrow = false
let executeMediaCapabilityShouldThrow = false
let attachPendingVideoBillingShouldThrow = false

const baseRunningHubConfig: RunningHubConfigLike = {
  baseUrl: "https://www.runninghub.cn",
  apiKey: "runninghub-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: null,
  seedanceImageToVideoEndpoint: null,
  seedanceMiniTextToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/text-to-video",
  seedanceMiniImageToVideoEndpoint: "/openapi/v2/rhart-video/sparkvideo-2.0-mini/image-to-video",
  digitalHumanWorkflowId: null,
  videoEnhanceWorkflowId: null,
  image: {
    configured: true,
    endpoint: "/default-image",
  },
  video: {
    configured: true,
    endpoint: "/default-video",
  },
}

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    class MockNextResponse {
      status: number
      body: unknown

      constructor(body: unknown, init?: { status?: number }) {
        this.status = init?.status || 200
        this.body = body
      }

      static json(body: unknown, init?: { status?: number }) {
        return new MockNextResponse(body, init)
      }
    }

    return {
      NextResponse: MockNextResponse,
    }
  }

  if (request === "@/lib/auth/session") {
    return {
      getSessionUser: async () => ({
        id: 7,
        enterpriseId: 11,
        enterpriseStatus: "active",
      }),
    }
  }

  if (request === "@/lib/auth/guards") {
    return {
      hasFeatureAccess: () => true,
      hasFeatureAccessWithFallback: () => true,
    }
  }

  if (request === "@/lib/billing/costing") {
    return {
      estimateVideoGenerationCredits: (input: Record<string, unknown>) => ({
        featureKey: "video_generation",
        provider: input.provider || null,
        model: input.model || null,
        officialCostUsd: 0.24,
        costBasisUsd: 0.24,
        credits: 240,
        multiplier: 2,
        source: "estimate",
        metadata: input,
      }),
    }
  }

  if (request === "@/lib/billing/runtime") {
    return {
      reserveFeatureCredits: async (input: Record<string, unknown>) => {
        reserveFeatureCreditsCalls.push(input)
        if (reserveCreditsShouldThrow) throw new Error("insufficient_credits")
        return {
          creditAccountId: 1,
          reserveIdempotencyKey: String(input.idempotencyKey || "reserve"),
          amount: Number(input.amount || 0),
        }
      },
      finalizeReservedCredits: async (input: Record<string, unknown>) => {
        finalizeReservedCreditsCalls.push(input)
        return { id: 2 }
      },
      releaseReservedCredits: async (input: Record<string, unknown>) => {
        releaseReservedCreditsCalls.push(input)
        return { id: 3 }
      },
    }
  }

  if (request === "@/lib/platform/execute") {
    return {
      normalizePlatformMediaExecutionPayload: ({ data }: { data: Record<string, unknown> }) => ({ data }),
    }
  }

  if (request === "@/lib/platform/enterprise-runtime-config") {
    return {
      resolveEnterpriseVideoRuntimeForUser: async () => ({
        kind: "minimax",
        providerId: "minimax_official",
        label: "MiniMax",
        model: "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
        config: {
          ...baseRunningHubConfig,
        },
      }),
      resolveEnterpriseAudioRuntimeForUser: async () => null,
    }
  }

  if (request === "@/lib/platform/model-governance") {
    return {
      canUserAccessGovernedMediaRoute: async () => true,
      resolveGovernedImageAssistantSelectionForUser: async (input: Record<string, unknown>) => {
        governedImageSelectionCalls.push(input)
        const routeMode = input.taskType === "edit" ? "img2img" : "txt2img"
        const endpoint = routeMode === "img2img" ? "/enterprise-img2img" : "/enterprise-txt2img"
        return {
          source: "enterprise",
          modelOptionId:
            routeMode === "img2img"
              ? "enterprise:runninghub:runninghub%3Aimg2img%3Amain"
              : "enterprise:runninghub:runninghub%3Atxt2img%3Amain",
          model: routeMode === "img2img" ? "wf-img2img" : "wf-txt2img",
          providerId: "runninghub",
          providerLabel: "RunningHub",
          providerLock: null,
          modelOptions: [],
          providerOptions: [],
          enterpriseRuntime: {
            kind: "runninghub",
            providerId: "runninghub",
            providerLabel: "RunningHub",
            label: routeMode === "img2img" ? "Enterprise IMG2IMG" : "Enterprise TXT2IMG",
            model: routeMode === "img2img" ? "wf-img2img" : "wf-txt2img",
            routeId:
              routeMode === "img2img" ? "runninghub:img2img:main" : "runninghub:txt2img:main",
            routeMode,
            endpoint,
            config: {
              ...baseRunningHubConfig,
              image: {
                configured: true,
                endpoint,
              },
            },
          },
        }
      },
    }
  }

  if (request === "@/lib/platform/minimax-audio") {
    return {
      executeMiniMaxAudioFeature: async () => ({ ok: true }),
      isMiniMaxAudioConfigured: () => false,
      resolveMiniMaxFeatureId: () => null,
    }
  }

  if (request === "@/lib/platform/minimax-video") {
    return {
      isMiniMaxVideoConfigured: () => false,
    }
  }

  if (request === "@/lib/platform/model-runtime") {
    return {
      resolveMediaFeatureId: (_target: string, value: unknown) =>
        value === "image-to-video" ? "image-to-video" : value === "voice-synthesis" ? "voice-synthesis" : "text-to-video",
      resolveMediaModelId: ({ requestedModelId, requestedModel }: { requestedModelId?: unknown; requestedModel?: unknown }) =>
        (typeof requestedModelId === "string" && requestedModelId) ||
        (typeof requestedModel === "string" && requestedModel) ||
        "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
      executeMediaCapability: async (input: Record<string, unknown>) => {
        executeMediaCapabilityCalls.push(input)
        if (executeMediaCapabilityShouldThrow) throw new Error("provider_failed")
        return {
          mode: "async",
          status: "queued",
          provider: "minimax",
          modelId: typeof input.modelId === "string" ? input.modelId : "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
          outputs: [],
          payload: {
            taskId: "runtime-task-1",
            provider: "minimax",
            requestedTarget: input.featureId,
            status: "QUEUED",
            results: [],
          },
          task: {
            localRunId: 1,
            provider: "minimax",
            providerTaskId: "provider-task-1",
            detailPath: "/api/platform/media/tasks/1?target=ai-video",
          },
        }
      },
    }
  }

  if (request === "@/lib/platform/runninghub") {
    return {
      hasRunningHubMediaTarget: (value: string) =>
        value === "ai-image" || value === "ai-video" || value === "visual-ad-pipeline",
      isRunningHubConfiguredForTarget: (mediaTarget: string, config?: RunningHubConfigLike) =>
        mediaTarget === "ai-image"
          ? Boolean(config?.apiKey && config?.image.configured && config?.image.endpoint)
          : Boolean(config?.apiKey && config?.video.configured && config?.video.endpoint),
      submitRunningHubTask: async (input: {
        mediaTarget: string
        payload: Record<string, unknown>
        config?: RunningHubConfigLike
      }) => {
        submitRunningHubTaskCalls.push(input)
        return {
          provider: "runninghub",
          mediaTarget: input.mediaTarget,
          requestedTarget: input.mediaTarget,
          endpoint: input.config?.image.endpoint || null,
          taskId: "mock-task-1",
          status: "QUEUED",
          raw: {
            taskId: "mock-task-1",
            status: "QUEUED",
          },
        }
      },
    }
  }

  if (request === "@/lib/platform/runninghub-video") {
    return {
      executeRunningHubVideoFeature: async () => ({
        taskId: "video-task-1",
        provider: "runninghub",
        requestedTarget: "text-to-video",
        status: "QUEUED",
        results: [],
      }),
      resolveRunningHubVideoFeatureId: () => "text-to-video",
    }
  }

  if (request === "@/lib/platform/video-billing-settlement") {
    return {
      attachPendingVideoBillingToRun: async (input: Record<string, unknown>) => {
        attachPendingVideoBillingToRunCalls.push(input)
        if (attachPendingVideoBillingShouldThrow) throw new Error("attach_failed")
        return { status: "pending" }
      },
      settleVideoBillingForRunId: async (runId: number | null | undefined) => {
        settleVideoBillingForRunIdCalls.push({ runId })
        return null
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: (req: { url: string; json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any }>

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as unknown as (req: { url: string; json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any }>
})

test.beforeEach(() => {
  governedImageSelectionCalls = []
  submitRunningHubTaskCalls = []
  executeMediaCapabilityCalls = []
  reserveFeatureCreditsCalls = []
  finalizeReservedCreditsCalls = []
  releaseReservedCreditsCalls = []
  attachPendingVideoBillingToRunCalls = []
  settleVideoBillingForRunIdCalls = []
  reserveCreditsShouldThrow = false
  executeMediaCapabilityShouldThrow = false
  attachPendingVideoBillingShouldThrow = false
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("platform media image generate uses enterprise txt2img runtime config", async () => {
  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-image&action=generate",
    json: async () => ({
      prompt: "Generate a product hero image",
    }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(governedImageSelectionCalls, [
    {
      user: {
        id: 7,
        enterpriseId: 11,
        enterpriseStatus: "active",
      },
      modelOptionId: null,
      providerLock: null,
      model: null,
      taskType: "generate",
      hasReferenceInput: false,
    },
  ])
  assert.equal(submitRunningHubTaskCalls.length, 1)
  assert.equal(submitRunningHubTaskCalls[0]?.config?.image.endpoint, "/enterprise-txt2img")
  assert.equal(response.body?.data?.endpoint, "/enterprise-txt2img")
})

test("platform media image edit uses enterprise img2img runtime config", async () => {
  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-image&action=edit",
    json: async () => ({
      prompt: "Retouch the reference image",
    }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(governedImageSelectionCalls, [
    {
      user: {
        id: 7,
        enterpriseId: 11,
        enterpriseStatus: "active",
      },
      modelOptionId: null,
      providerLock: null,
      model: null,
      taskType: "edit",
      hasReferenceInput: false,
    },
  ])
  assert.equal(submitRunningHubTaskCalls.length, 1)
  assert.equal(submitRunningHubTaskCalls[0]?.config?.image.endpoint, "/enterprise-img2img")
  assert.equal(response.body?.data?.endpoint, "/enterprise-img2img")
})

test("platform media image generate honors explicit model selection and reference context", async () => {
  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-image&action=generate",
    json: async () => ({
      prompt: "Generate a branded poster",
      modelOptionId: "enterprise:runninghub:runninghub%3Aimg2img%3Amain",
      providerLock: "pptoken",
      model: "seedream-v5-image-to-image",
      referenceUrls: ["https://example.com/reference.png"],
    }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(governedImageSelectionCalls, [
    {
      user: {
        id: 7,
        enterpriseId: 11,
        enterpriseStatus: "active",
      },
      modelOptionId: "enterprise:runninghub:runninghub%3Aimg2img%3Amain",
      providerLock: "pptoken",
      model: "seedream-v5-image-to-image",
      taskType: "generate",
      hasReferenceInput: true,
    },
  ])
  assert.equal(submitRunningHubTaskCalls[0]?.payload?.modelOptionId, "enterprise:runninghub:runninghub%3Aimg2img%3Amain")
})

test("platform media text-to-video submits through the unified runtime facade", async () => {
  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-video&action=generate",
    json: async () => ({
      featureId: "text-to-video",
      params: {
        prompt: "Launch film",
        model: "minimax:video:text-to-video:MiniMax-Hailuo-02-Pro",
      },
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(executeMediaCapabilityCalls.length, 1)
  assert.equal(executeMediaCapabilityCalls[0]?.featureId, "text-to-video")
  assert.equal(executeMediaCapabilityCalls[0]?.modelId, "minimax:video:text-to-video:MiniMax-Hailuo-02-Pro")
  assert.equal(reserveFeatureCreditsCalls.length, 1)
  assert.equal(reserveFeatureCreditsCalls[0]?.featureKey, "video_generation")
  assert.equal(reserveFeatureCreditsCalls[0]?.amount, 240)
  assert.equal(finalizeReservedCreditsCalls.length, 0)
  assert.equal(releaseReservedCreditsCalls.length, 0)
  assert.equal(attachPendingVideoBillingToRunCalls.length, 1)
  assert.equal(attachPendingVideoBillingToRunCalls[0]?.runId, 1)
  assert.equal(attachPendingVideoBillingToRunCalls[0]?.featureId, "text-to-video")
  assert.equal(settleVideoBillingForRunIdCalls.length, 0)
  assert.equal(response.body?.data?.taskId, "runtime-task-1")
})

test("platform media image-to-video submits through the unified runtime facade", async () => {
  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-video&action=generate",
    json: async () => ({
      featureId: "image-to-video",
      params: {
        firstFrameUrl: "https://example.com/frame.png",
        model: "minimax:video:image-to-video:MiniMax-Hailuo-2.3-Fast",
      },
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(executeMediaCapabilityCalls.length, 1)
  assert.equal(executeMediaCapabilityCalls[0]?.featureId, "image-to-video")
  assert.equal(executeMediaCapabilityCalls[0]?.modelId, "minimax:video:image-to-video:MiniMax-Hailuo-2.3-Fast")
  assert.equal(reserveFeatureCreditsCalls.length, 1)
  assert.equal(finalizeReservedCreditsCalls.length, 0)
  assert.equal(attachPendingVideoBillingToRunCalls.length, 1)
  assert.equal(attachPendingVideoBillingToRunCalls[0]?.featureId, "image-to-video")
})

test("platform media video rejects when shared credits are insufficient", async () => {
  reserveCreditsShouldThrow = true

  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-video&action=generate",
    json: async () => ({
      featureId: "text-to-video",
      params: {
        prompt: "Launch film",
      },
    }),
  })

  assert.equal(response.status, 402)
  assert.equal(response.body?.error, "insufficient_credits")
  assert.equal(executeMediaCapabilityCalls.length, 0)
  assert.equal(finalizeReservedCreditsCalls.length, 0)
  assert.equal(releaseReservedCreditsCalls.length, 0)
})

test("platform media video releases reserved credits when provider submit fails", async () => {
  executeMediaCapabilityShouldThrow = true

  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-video&action=generate",
    json: async () => ({
      featureId: "text-to-video",
      params: {
        prompt: "Launch film",
      },
    }),
  })

  assert.equal(response.status, 502)
  assert.equal(response.body?.error, "provider_failed")
  assert.equal(reserveFeatureCreditsCalls.length, 1)
  assert.equal(finalizeReservedCreditsCalls.length, 0)
  assert.equal(releaseReservedCreditsCalls.length, 1)
})

test("platform media video releases reserved credits when billing attach fails after submit", async () => {
  attachPendingVideoBillingShouldThrow = true

  const response = await POST({
    url: "http://localhost:3000/api/platform/media/run?target=ai-video&action=generate",
    json: async () => ({
      featureId: "text-to-video",
      params: {
        prompt: "Launch film",
      },
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(reserveFeatureCreditsCalls.length, 1)
  assert.equal(attachPendingVideoBillingToRunCalls.length, 1)
  assert.equal(finalizeReservedCreditsCalls.length, 0)
  assert.equal(releaseReservedCreditsCalls.length, 1)
  assert.equal(releaseReservedCreditsCalls[0]?.reason, "video_billing_attach_failed")
})

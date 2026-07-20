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
let queryRunningHubTaskCalls: Array<{ taskId: string; config?: RunningHubConfigLike }> = []
let queryMediaCapabilityTaskCalls: Array<Record<string, unknown>> = []

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
    endpoint: "/enterprise-txt2img",
  },
  video: {
    configured: true,
    endpoint: "/enterprise-video",
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
        enterpriseRole: "admin",
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
          baseUrl: "https://api.minimaxi.com/v1",
          apiKey: "minimax-key",
        },
      }),
      resolveEnterpriseAudioRuntimeForUser: async () => null,
    }
  }

  if (request === "@/lib/platform/model-governance") {
    return {
      resolveGovernedImageAssistantSelectionForUser: async (input: Record<string, unknown>) => {
        governedImageSelectionCalls.push(input)
        return {
          source: "enterprise",
          modelOptionId: "enterprise:runninghub:runninghub%3Atxt2img%3Amain",
          model: "seedream-v5-text-to-image",
          providerId: "runninghub",
          providerLabel: "RunningHub",
          providerLock: null,
          modelOptions: [],
          providerOptions: [],
          enterpriseRuntime: {
            kind: "runninghub",
            providerId: "runninghub",
            providerLabel: "RunningHub",
            label: "Enterprise TXT2IMG",
            model: "seedream-v5-text-to-image",
            routeId: "runninghub:txt2img:main",
            routeMode: "txt2img",
            endpoint: "/enterprise-txt2img",
            config: {
              ...baseRunningHubConfig,
              image: {
                configured: true,
                endpoint: "/enterprise-txt2img",
              },
            },
          },
        }
      },
    }
  }

  if (request === "@/lib/platform/minimax-audio") {
    return {
      isMiniMaxAudioConfigured: () => true,
      queryMiniMaxAudioTask: async () => ({ taskId: "1", status: "SUCCESS", results: [] }),
    }
  }

  if (request === "@/lib/platform/minimax-video") {
    return {
      isMiniMaxVideoConfigured: () => false,
    }
  }

  if (request === "@/lib/platform/model-runtime") {
    return {
      resolveModelIdFromRun: (input: { run?: { itemSlug?: string } }) =>
        input.run?.itemSlug === "voice-synthesis"
          ? "minimax:audio:speech-2.8-hd"
          : "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
      queryMediaCapabilityTask: async (input: Record<string, unknown>) => {
        queryMediaCapabilityTaskCalls.push(input)
        return {
          status: "succeeded",
          provider: "minimax",
          modelId: input.modelId,
          outputs: [],
          payload: {
            taskId: String(input.runId),
            provider: "minimax",
            requestedTarget: String(input.modelId).startsWith("minimax:audio:") ? "voice-synthesis" : "text-to-video",
            status: "SUCCESS",
            results: [],
          },
        }
      },
    }
  }

  if (request === "@/lib/platform/task-run-store") {
    return {
      getPlatformTaskRun: async (runId: number) =>
        runId === 7
          ? ({
              id: 7,
              itemSlug: "text-to-video",
              externalSystem: "minimax",
              inputPayload: {
                model: "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
              },
              normalizedResult: null,
            })
          : runId === 8
            ? ({
                id: 8,
                itemSlug: "voice-synthesis",
                externalSystem: "minimax",
                inputPayload: {
                  model: "minimax:audio:speech-2.8-hd",
                },
                normalizedResult: null,
              })
          : null,
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
      queryRunningHubTask: async (taskId: string, config?: RunningHubConfigLike) => {
        queryRunningHubTaskCalls.push({ taskId, config })
        return {
          taskId,
          status: "SUCCESS",
          results: [],
        }
      },
    }
  }

  if (request === "@/lib/platform/runninghub-video") {
    return {
      queryRunningHubVideoTask: async () => ({
        taskId: "video-task-1",
        provider: "runninghub",
        requestedTarget: "text-to-video",
        status: "SUCCESS",
        results: [],
      }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: (
  req: { url: string },
  context: { params: Promise<{ taskId: string }> },
) => Promise<{ status: number; body: any }>

test.before(async () => {
  const route = await import("./tasks/[taskId]/route")
  GET = route.GET as unknown as (
    req: { url: string },
    context: { params: Promise<{ taskId: string }> },
  ) => Promise<{ status: number; body: any }>
})

test.beforeEach(() => {
  governedImageSelectionCalls = []
  queryRunningHubTaskCalls = []
  queryMediaCapabilityTaskCalls = []
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("platform media image task query uses enterprise governed runninghub config", async () => {
  const response = await GET(
    {
      url: "http://localhost:3000/api/platform/media/tasks/mock-task-1?target=ai-image",
    },
    {
      params: Promise.resolve({ taskId: "mock-task-1" }),
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(governedImageSelectionCalls, [
    {
      user: {
        id: 7,
        enterpriseId: 11,
        enterpriseRole: "admin",
        enterpriseStatus: "active",
      },
      taskType: "generate",
    },
  ])
  assert.equal(queryRunningHubTaskCalls.length, 1)
  assert.equal(queryRunningHubTaskCalls[0]?.taskId, "mock-task-1")
  assert.equal(queryRunningHubTaskCalls[0]?.config?.image.endpoint, "/enterprise-txt2img")
})

test("platform media video task query uses the unified runtime facade", async () => {
  const response = await GET(
    {
      url: "http://localhost:3000/api/platform/media/tasks/7?target=ai-video",
    },
    {
      params: Promise.resolve({ taskId: "7" }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(queryMediaCapabilityTaskCalls.length, 1)
  assert.equal(queryMediaCapabilityTaskCalls[0]?.runId, 7)
  assert.equal(queryMediaCapabilityTaskCalls[0]?.modelId, "minimax:video:text-to-video:MiniMax-Hailuo-2.3")
  assert.equal(response.body?.data?.taskId, "7")
})

test("platform media audio task query falls back to the shared MiniMax audio config", async () => {
  const response = await GET(
    {
      url: "http://localhost:3000/api/platform/media/tasks/8?target=ai-music",
    },
    {
      params: Promise.resolve({ taskId: "8" }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(queryMediaCapabilityTaskCalls.length, 1)
  assert.equal(queryMediaCapabilityTaskCalls[0]?.runId, 8)
  assert.equal(queryMediaCapabilityTaskCalls[0]?.modelId, "minimax:audio:speech-2.8-hd")
  assert.equal(response.body?.data?.taskId, "8")
})

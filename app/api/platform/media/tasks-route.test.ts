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

const baseRunningHubConfig: RunningHubConfigLike = {
  baseUrl: "https://www.runninghub.cn",
  apiKey: "runninghub-key",
  queryPath: "/openapi/v2/query",
  uploadPath: "/openapi/v2/media/upload/binary",
  workflowCreatePath: "/task/openapi/create",
  seedanceTextToVideoEndpoint: null,
  seedanceImageToVideoEndpoint: null,
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
      resolveEnterpriseVideoRuntimeForUser: async () => null,
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
      queryMiniMaxAudioTask: async () => ({ taskId: "1", status: "SUCCESS", results: [] }),
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

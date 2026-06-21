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

let enterpriseImageRuntimeCalls: Array<{ enterpriseId?: number | null; routeMode?: string | null }> = []
let submitRunningHubTaskCalls: Array<{ mediaTarget: string; payload: Record<string, unknown>; config?: RunningHubConfigLike }> = []

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

  if (request === "@/lib/platform/execute") {
    return {
      normalizePlatformMediaExecutionPayload: ({ data }: { data: Record<string, unknown> }) => ({ data }),
    }
  }

  if (request === "@/lib/platform/enterprise-runtime-config") {
    return {
      resolveEnterpriseImageRuntimeForEnterprise: async (input: { enterpriseId?: number | null; routeMode?: string | null }) => {
        enterpriseImageRuntimeCalls.push(input)
        const endpoint = input.routeMode === "img2img" ? "/enterprise-img2img" : "/enterprise-txt2img"
        return {
          kind: "runninghub",
          providerId: "runninghub",
          providerLabel: "RunningHub",
          label: input.routeMode === "img2img" ? "Enterprise IMG2IMG" : "Enterprise TXT2IMG",
          model: input.routeMode === "img2img" ? "wf-img2img" : "wf-txt2img",
          routeId: input.routeMode === "img2img" ? "runninghub:img2img:main" : "runninghub:txt2img:main",
          routeMode: input.routeMode === "img2img" ? "img2img" : "txt2img",
          endpoint,
          config: {
            ...baseRunningHubConfig,
            image: {
              configured: true,
              endpoint,
            },
          },
        }
      },
      resolveEnterpriseVideoRuntimeForEnterprise: async () => null,
      resolveEnterpriseAudioRuntimeForEnterprise: async () => null,
    }
  }

  if (request === "@/lib/platform/model-governance") {
    return {
      canUserAccessGovernedMediaRoute: async () => true,
    }
  }

  if (request === "@/lib/platform/minimax-audio") {
    return {
      executeMiniMaxAudioFeature: async () => ({ ok: true }),
      isMiniMaxAudioConfigured: () => false,
      resolveMiniMaxFeatureId: () => null,
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

  return originalLoad.call(this, request, parent, isMain)
}

let POST: (req: { url: string; json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any }>

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as unknown as (req: { url: string; json: () => Promise<Record<string, unknown>> }) => Promise<{ status: number; body: any }>
})

test.beforeEach(() => {
  enterpriseImageRuntimeCalls = []
  submitRunningHubTaskCalls = []
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
  assert.deepEqual(enterpriseImageRuntimeCalls, [{ enterpriseId: 11, routeMode: "txt2img" }])
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
  assert.deepEqual(enterpriseImageRuntimeCalls, [{ enterpriseId: 11, routeMode: "img2img" }])
  assert.equal(submitRunningHubTaskCalls.length, 1)
  assert.equal(submitRunningHubTaskCalls[0]?.config?.image.endpoint, "/enterprise-img2img")
  assert.equal(response.body?.data?.endpoint, "/enterprise-img2img")
})

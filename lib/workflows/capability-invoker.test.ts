import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import {
  buildWorkflowImageAssistantReferenceAssetIds,
  buildWorkflowImageAssistantReferenceUrls,
  buildWorkflowImageGenerateRequestBody,
} from "@/lib/workflows/image-capability-request"
import type { WorkflowCapabilityInvokeParams } from "@/lib/workflows/node-executors"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let workflowImageGenerateBodies: Record<string, unknown>[] = []
let leadToolPreviewBodies: Record<string, unknown>[] = []
let leadToolDownloadBodies: Record<string, unknown>[] = []
let taskPollCount = 0
let taskPollResponses: Array<Record<string, unknown>> = []
let sessionDetailCount = 0
let sessionDetailResponses: Record<string, unknown>[] = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only" || request === "client-only") {
    return {}
  }

  if (request === "next/server") {
    class TestNextRequest {
      url: string
      headers: Headers
      method: string
      nextUrl: URL
      #body: string | null

      constructor(url: string | URL, init?: { method?: string; headers?: HeadersInit; body?: string }) {
        this.url = String(url)
        this.method = init?.method || "GET"
        this.headers = new Headers(init?.headers)
        this.nextUrl = new URL(this.url)
        this.#body = init?.body || null
      }

      async json() {
        return this.#body ? JSON.parse(this.#body) : {}
      }
    }

    return { NextRequest: TestNextRequest }
  }

  if (request === "@/app/api/image-assistant/generate/route") {
    return {
      POST: async (req: { json: () => Promise<Record<string, unknown>> }) => {
        workflowImageGenerateBodies.push(await req.json())
        return new Response(
          JSON.stringify({
            data: {
              accepted: true,
              task_id: "task-42",
              session_id: "session-9",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    }
  }

  if (request === "@/app/api/tasks/[taskId]/route") {
    return {
      GET: async () => {
        taskPollCount += 1
        const payload =
          taskPollResponses.shift() || {
            data: {
              status: "success",
              result: {
                session_id: "session-9",
                outcome: "generated",
                version_id: "version-3",
              },
            },
          }
        return new Response(
          JSON.stringify(payload),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    }
  }

  if (request === "@/app/api/image-assistant/sessions/[sessionId]/route") {
    return {
      GET: async () => {
        sessionDetailCount += 1
        const payload =
          sessionDetailResponses.shift() || {
            data: {
              session: { id: "session-9", current_version_id: "version-3" },
              versions: [{
                id: "version-3",
                candidates: [{
                  asset_id: "asset-final",
                  url: "https://example.com/final.png",
                }],
              }],
            },
          }
        return new Response(
          JSON.stringify(payload),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    }
  }

  if (request === "@/lib/platform/execution") {
    return {
      getPlatformCapabilityExecutionState: async () => ({
        runtimeStatus: "available",
        accessState: "granted",
        usesSharedCredits: false,
        billing: { canSpendCredits: true },
      }),
      getPlatformBindingTargetExecutionState: async () => ({
        runtimeStatus: "available",
        accessState: "granted",
        usesSharedCredits: false,
        billing: { canSpendCredits: true },
      }),
    }
  }

  if (request === "@/lib/platform/execute") {
    return {
      evaluatePlatformExecutionGate: () => ({ ok: true }),
      resolvePlatformCapabilityExecutionProxyTarget: (capabilitySlug: string) =>
        capabilitySlug === "ai-ppt"
          ? {
              downstreamPath: "/api/tools/ai-ppt-preview/download",
              requiresLogin: true,
            }
          : {
              downstreamPath: "/api/image-assistant/generate",
              requiresLogin: true,
            },
      resolvePlatformBindingExecutionProxyTarget: () => ({
        downstreamPath: "/api/image-assistant/generate",
        requiresLogin: true,
      }),
    }
  }

  if (request === "@/lib/auth/session") {
    return {
      applyInternalServiceAuthHeader: (headers: Headers) => {
        headers.set("x-aimarketing-internal-auth", "test-token")
      },
    }
  }

  if (request === "@/app/api/tools/[slug]/preview/route") {
    return {
      POST: async (req: { json: () => Promise<Record<string, unknown>> }) => {
        leadToolPreviewBodies.push(await req.json())
        return new Response(
          JSON.stringify({
            previewSessionId: "preview-session-9",
            deck: {
              title: "Workflow deck",
              variants: [{ key: "variant-a" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    }
  }

  if (request === "@/app/api/tools/[slug]/download/route") {
    return {
      POST: async (req: { json: () => Promise<Record<string, unknown>> }) => {
        leadToolDownloadBodies.push(await req.json())
        return new Response("<html>deck</html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-disposition": `attachment; filename="workflow-deck.html"; filename*=UTF-8''workflow-deck.html`,
            "x-platform-artifact-id": "36",
            "x-platform-work-item-id": "6",
          },
        })
      },
    }
  }

  if (
    request === "@/app/api/ai/chat/route" ||
    request === "@/app/api/platform/media/run/route" ||
    request === "@/app/api/platform/media/tasks/[taskId]/route" ||
    request === "@/app/api/video-agent/workflow/route" ||
    request === "@/app/api/writer/chat/stream/route"
  ) {
    return {
      POST: async () =>
        new Response(JSON.stringify({ error: "unexpected_test_call" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      GET: async () =>
        new Response(JSON.stringify({ error: "unexpected_test_call" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let createWorkflowCapabilityInvoker: typeof import("./capability-invoker").createWorkflowCapabilityInvoker
let resolveWorkflowCapabilityCallTimeoutMs: typeof import("./capability-invoker").resolveWorkflowCapabilityCallTimeoutMs

function createImageParams(overrides?: Partial<WorkflowCapabilityInvokeParams>): WorkflowCapabilityInvokeParams {
  return {
    nodeType: "image_generate",
    capabilitySlug: "ai-image",
    action: "generate",
    node: {
      nodeKey: "image-4",
      type: "image_generate",
      title: "图片生成",
      positionX: 0,
      positionY: 0,
      config: {
        selectedProviderId: "pptoken",
        selectedModelId: "gpt-image-2",
        imageSize: "1536x1024",
        imageQuality: "high",
        imageBackground: "opaque",
        imageOutputFormat: "png",
        imageModeration: "auto",
        imageResponseFormat: "url",
        imagePromptReferences: [
          { sourceNodeKey: "image-2", alias: "图2" },
          { sourceNodeKey: "image-3", alias: "图3" },
        ],
      },
    },
    input: {
      text: ["将{{图2}} 中人物替换{{图3}}中的人物"],
      asset: [],
      image: [
        { url: "https://example.com/a.png", assetId: "asset-2", title: "788" },
        { url: "https://example.com/b.png", title: "789" },
      ],
      video: [],
      audio: [],
      ppt: [],
    },
    ...overrides,
  }
}

function createPptParams(overrides?: Partial<WorkflowCapabilityInvokeParams>): WorkflowCapabilityInvokeParams {
  return {
    nodeType: "ppt_generate",
    capabilitySlug: "ai-ppt",
    action: "generate",
    node: {
      nodeKey: "ppt-1",
      type: "ppt_generate",
      title: "PPT",
      positionX: 0,
      positionY: 0,
      config: {
        scenario: "marketing-campaign",
        language: "zh-CN",
      },
    },
    input: {
      text: ["做一份增长复盘幻灯片"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
    ...overrides,
  }
}

function createDigitalHumanParams(overrides?: Partial<WorkflowCapabilityInvokeParams>): WorkflowCapabilityInvokeParams {
  return {
    nodeType: "digital_human",
    capabilitySlug: "ai-video",
    action: "generate",
    node: {
      nodeKey: "digital-human-1",
      type: "digital_human",
      title: "口播数字人",
      positionX: 0,
      positionY: 0,
      config: {
        featureId: "digital-human",
        durationSeconds: "10",
      },
    },
    input: {
      text: ["介绍新品卖点"],
      asset: [],
      image: [{ url: "https://example.com/avatar.png", title: "Avatar" }],
      video: [],
      audio: [{ url: "https://example.com/audio.mp3", title: "Voice" }],
      ppt: [],
    },
    ...overrides,
  }
}

test("image capability request derives reference asset ids from upstream image outputs", () => {
  const ids = buildWorkflowImageAssistantReferenceAssetIds(createImageParams().input)
  assert.deepEqual(ids, ["asset-2", "789"])
})

test("image capability request injects a complete default brief for workflow execution", () => {
  const body = buildWorkflowImageGenerateRequestBody(
    createImageParams(),
    "将{{图2}} 中人物替换{{图3}}中的人物",
    "zh",
  )

  assert.equal(body.preferAsync, true)
  assert.equal(body.providerLock, "pptoken")
  assert.equal(body.model, "gpt-image-2")
  assert.equal(body.candidateCount, 1)
  assert.equal(body.imageSize, "1536x1024")
  assert.equal(body.imageQuality, "high")
  assert.equal(body.imageBackground, "opaque")
  assert.equal(body.imageOutputFormat, "png")
  assert.equal(body.imageModeration, "auto")
  assert.equal(body.imageResponseFormat, "url")
  assert.equal(body.invocationMode, "workflow_runtime")
  assert.deepEqual(body.referenceAssetIds, ["asset-2", "789"])
  assert.deepEqual(body.referenceUrls, [])
  assert.equal(body.prompt, "将第一张输入图 中人物替换第二张输入图中的人物")
  assert.equal(body.sizePreset, "4:3")
  assert.equal(body.resolution, "2K")
  assert.equal(body.brief.size_preset, "4:3")
  assert.equal(body.brief.usage_preset, "ad_poster")
  assert.equal(body.brief.ratio_confirmed, true)
  assert.equal(typeof body.brief.style, "string")
  assert.equal(body.brief.style.length > 0, true)
})

test("image capability request falls back to all upstream image urls when no alias token is used", () => {
  const params = createImageParams({
    input: {
      text: ["生成一张新的海报"],
      asset: [],
      image: [
        { url: "https://example.com/a.png", assetId: "asset-2", title: "788" },
        { url: "https://example.com/b.png", title: "789" },
      ],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  const urls = buildWorkflowImageAssistantReferenceUrls(params, "生成一张新的海报", "zh")
  assert.deepEqual(urls, [])
})

test("image capability request avoids embedding data urls in prompt and reference urls", () => {
  const body = buildWorkflowImageGenerateRequestBody(
    createImageParams({
      input: {
        text: ["将{{图2}} 中人物替换{{图3}}中的人物"],
        asset: [],
        image: [
          { url: "https://example.com/a.png", assetId: "asset-2", title: "788" },
          { url: "data:image/png;base64,abc123", assetId: "asset-3", title: "789" },
        ],
        video: [],
        audio: [],
        ppt: [],
      },
    }),
    "将{{图2}} 中人物替换{{图3}}中的人物",
    "zh",
  )

  assert.deepEqual(body.referenceAssetIds, ["asset-2", "asset-3"])
  assert.deepEqual(body.referenceUrls, [])
  assert.equal(body.prompt, "将第一张输入图 中人物替换第二张输入图中的人物")
})

test("image capability request honors explicit workflow image provider selection without fallback", () => {
  const body = buildWorkflowImageGenerateRequestBody(
    createImageParams({
      node: {
        nodeKey: "image-3",
        title: "图片生成",
        type: "image_generate",
        positionX: 0,
        positionY: 0,
        config: {
          prompt: "",
          selectedProviderId: "crazyroute",
          selectedModelId: "gpt-image-2",
          imageSize: "1024x1024",
          imagePromptReferences: [
            { sourceNodeKey: "image-2", alias: "图2" },
            { sourceNodeKey: "image-3", alias: "图3" },
          ],
        },
      },
    }),
    "将{{图2}} 中人物替换{{图3}}中的人物",
    "zh",
  )

  assert.equal(body.providerLock, "crazyroute")
})

test.before(async () => {
  const module = await import("./capability-invoker")
  const resolvedModule = ("default" in module ? module.default : module) as typeof import("./capability-invoker")
  createWorkflowCapabilityInvoker = resolvedModule.createWorkflowCapabilityInvoker
  resolveWorkflowCapabilityCallTimeoutMs = resolvedModule.resolveWorkflowCapabilityCallTimeoutMs
})

test.beforeEach(() => {
  workflowImageGenerateBodies = []
  leadToolPreviewBodies = []
  leadToolDownloadBodies = []
  taskPollCount = 0
  taskPollResponses = []
  sessionDetailCount = 0
  sessionDetailResponses = [{
    data: {
      session: { id: "session-9", current_version_id: "version-3" },
      versions: [{
        id: "version-3",
        candidates: [{
          asset_id: "asset-final",
          url: "https://example.com/final.png",
        }],
      }],
    },
  }]
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("workflow image capability submits async image task and resolves final session images", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
    maxPollAttempts: 2,
    pollIntervalMs: 1,
  })

  const result = await invoke(createImageParams())

  assert.equal(workflowImageGenerateBodies.length, 1)
  assert.equal(workflowImageGenerateBodies[0]?.preferAsync, true)
  assert.equal(workflowImageGenerateBodies[0]?.providerLock, "pptoken")
  assert.equal(
    workflowImageGenerateBodies[0]?.prompt,
    "将第一张输入图 中人物替换第二张输入图中的人物",
  )
  assert.equal(String(workflowImageGenerateBodies[0]?.prompt).includes("图片引用"), false)
  assert.equal(String(workflowImageGenerateBodies[0]?.prompt).includes("https://"), false)
  assert.equal(taskPollCount, 1)
  assert.equal(sessionDetailCount, 1)
  assert.deepEqual(result.output.image, [{
    url: "https://example.com/final.png",
    title: "asset-final",
    assetId: "asset-final",
    mimeType: "image/png",
  }])
  assert.deepEqual(result.metadata, {
    sessionId: "session-9",
    outcome: "generated",
    taskId: "task-42",
  })
})

test("workflow image capability refetches session detail when candidates are still inline data urls", async () => {
  sessionDetailResponses = [
    {
      data: {
        session: { id: "session-9", current_version_id: "version-3" },
        versions: [{
          id: "version-3",
          candidates: [{
            asset_id: "asset-final",
            url: "data:image/png;base64,abc123",
          }],
        }],
      },
    },
    {
      data: {
        session: { id: "session-9", current_version_id: "version-3" },
        versions: [{
          id: "version-3",
          candidates: [{
            asset_id: "asset-final",
            url: "https://example.com/final.png",
          }],
        }],
      },
    },
  ]

  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
    maxPollAttempts: 2,
    pollIntervalMs: 1,
  })

  const result = await invoke(createImageParams())

  assert.equal(sessionDetailCount, 2)
  assert.deepEqual(result.output.image, [{
    url: "https://example.com/final.png",
    title: "asset-final",
    assetId: "asset-final",
    mimeType: "image/png",
  }])
})

test("workflow image capability waits for terminal task state and surfaces node failure reason", async () => {
  taskPollResponses = [
    {
      data: {
        status: "running",
        result: null,
      },
    },
    {
      data: {
        status: "running",
        result: null,
      },
    },
    {
      data: {
        status: "failed",
        result: {
          error: "image_assistant_provider_timeout",
        },
      },
    },
  ]

  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
    maxPollAttempts: 5,
    pollIntervalMs: 1,
  })

  await assert.rejects(
    () => invoke(createImageParams()),
    /image_assistant_provider_timeout/,
  )
  assert.equal(taskPollCount, 3)
})

test("workflow image capability timeout covers async task polling for the whole node execution", async () => {
  taskPollResponses = Array.from({ length: 50 }, () => ({
    data: {
      status: "running",
      result: null,
    },
  }))

  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
    maxPollAttempts: 50,
    pollIntervalMs: 20,
    callTimeoutMs: 10,
  })

  await assert.rejects(
    () => invoke(createImageParams()),
    /workflow_image_timeout/,
  )
  assert.equal(taskPollCount > 0, true)
})

test("workflow capability invoker enforces call timeout for stuck ai chat calls", async () => {
  const module = await import("./capability-invoker")
  const resolvedModule = ("default" in module ? module.default : module) as typeof import("./capability-invoker")

  await assert.rejects(
    () => resolvedModule.withTimeout(new Promise<string>(() => {}), 10, "workflow_ai_chat_timeout"),
    /workflow_ai_chat_timeout/,
  )
})

test("workflow capability timeout defaults use capability-level execution budgets", () => {
  const chatTimeoutMs = resolveWorkflowCapabilityCallTimeoutMs("ai-chat")
  const pptTimeoutMs = resolveWorkflowCapabilityCallTimeoutMs("ai-ppt")
  const imageTimeoutMs = resolveWorkflowCapabilityCallTimeoutMs("ai-image")
  const videoTimeoutMs = resolveWorkflowCapabilityCallTimeoutMs("ai-video")

  assert.equal(chatTimeoutMs, 120_000)
  assert.equal(pptTimeoutMs, 300_000)
  assert.equal(imageTimeoutMs, 300_000)
  assert.equal(videoTimeoutMs, 1_800_000)
  assert.equal(pptTimeoutMs > chatTimeoutMs, true)
  assert.equal(imageTimeoutMs > chatTimeoutMs, true)
  assert.equal(videoTimeoutMs > chatTimeoutMs, true)
})

test("workflow digital human timeout follows the configured video-duration ratio", () => {
  const tenSecondTimeoutMs = resolveWorkflowCapabilityCallTimeoutMs(
    "ai-video",
    undefined,
    createDigitalHumanParams(),
  )
  const twentySecondTimeoutMs = resolveWorkflowCapabilityCallTimeoutMs(
    "ai-video",
    undefined,
    createDigitalHumanParams({
      node: {
        nodeKey: "digital-human-2",
        type: "digital_human",
        title: "口播数字人",
        positionX: 0,
        positionY: 0,
        config: {
          featureId: "digital-human",
          durationSeconds: "20",
        },
      },
    }),
  )

  assert.equal(tenSecondTimeoutMs, 600_000)
  assert.equal(twentySecondTimeoutMs, 1_200_000)
})

test("workflow capability timeout override still wins over capability defaults", () => {
  assert.equal(resolveWorkflowCapabilityCallTimeoutMs("ai-image", 15_000), 15_000)
  assert.equal(resolveWorkflowCapabilityCallTimeoutMs("ai-ppt", 18_000), 18_000)
  assert.equal(resolveWorkflowCapabilityCallTimeoutMs("ai-video", 21_000), 21_000)
  assert.equal(resolveWorkflowCapabilityCallTimeoutMs("ai-chat", 9_000), 9_000)
})

test("workflow ppt capability returns preview and download urls that point at the persisted artifact", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
  })

  const result = await invoke(createPptParams())

  assert.equal(leadToolPreviewBodies.length, 1)
  assert.equal(leadToolDownloadBodies.length, 1)
  assert.deepEqual(result.output.ppt, [{
    artifactId: 36,
    title: "workflow-deck.html",
    mimeType: "text/html; charset=utf-8",
    url: "/api/platform/artifacts/36/download",
    downloadUrl: "/api/platform/artifacts/36/download?download=1",
  }])
  assert.deepEqual(result.metadata, {
    selectedVariantKey: "variant-a",
    previewSessionId: "preview-session-9",
    workItemId: 6,
  })
})

test("workflow ppt capability forwards structured image inputs to preview generation", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
  })

  await invoke(createPptParams({
    input: {
      text: ["做一份品牌提案"],
      asset: [
        {
          source: "upload",
          fileName: "brand-board.png",
          mimeType: "image/png",
          url: "https://example.com/brand-board.png",
        },
      ],
      image: [
        {
          url: "https://example.com/hero.png",
          title: "主视觉",
          sourceNodeKey: "image-2",
        },
      ],
      video: [],
      audio: [],
      ppt: [],
    },
  }))

  assert.equal(leadToolPreviewBodies.length, 1)
  assert.deepEqual(leadToolPreviewBodies[0]?.images, [
    {
      url: "https://example.com/hero.png",
      title: "主视觉",
      mimeType: null,
      sourceNodeKey: "image-2",
      role: "cover",
    },
    {
      url: "https://example.com/brand-board.png",
      title: "brand-board.png",
      mimeType: "image/png",
      sourceNodeKey: null,
      role: "content",
    },
  ])
})

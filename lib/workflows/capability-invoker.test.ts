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
let aiChatBodies: Record<string, unknown>[] = []
let writerChatBodies: Record<string, unknown>[] = []
let taskPollCount = 0
let taskPollResponses: Array<Record<string, unknown>> = []
let sessionDetailCount = 0
let sessionDetailResponses: Record<string, unknown>[] = []
let enterpriseKnowledgeLoadCount = 0
let personalKnowledgeLoadCount = 0
let artifactDownloadTextById = new Map<number, string>()

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

  if (request === "@/app/api/ai/chat/route") {
    return {
      POST: async (req: { json: () => Promise<Record<string, unknown>> }) => {
        const body = await req.json()
        aiChatBodies.push(body)
        return new Response(
          JSON.stringify({
            message: `agent:${String(body.message || "")}`,
            provider: "openai",
            providerModel: "gpt-5-mini",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    }
  }

  if (request === "@/app/api/platform/artifacts/[artifactId]/download/route") {
    return {
      GET: async (
        _req: unknown,
        context: { params: Promise<{ artifactId: string }> },
      ) => {
        const { artifactId } = await context.params
        const numericArtifactId = Number(artifactId)
        const text = artifactDownloadTextById.get(numericArtifactId)
        if (!text) {
          return new Response(JSON.stringify({ error: "artifact_not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          })
        }
        return new Response(text, {
          status: 200,
          headers: { "content-type": "text/markdown; charset=utf-8" },
        })
      },
    }
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

  if (request === "@/lib/platform/custom-agents") {
    return {
      getCustomAgentForUser: async ({ agentId }: { agentId: number }) => {
        if (agentId === 41) {
          return {
            id: 41,
            name: "Brand Agent",
            summary: "Brand-safe writing agent",
            status: "draft",
            systemPrompt: "Stay on brand.",
            goal: "Write concise launch messaging.",
            scope: "Marketing only.",
            guardrails: "Do not mention pricing.",
            knowledgeBindings: [17],
            knowledgeRetrievalPolicy: {
              enterpriseDatasetIds: [81],
            },
            executionMode: "direct_agent",
            linkedWorkflowId: null,
          }
        }

        if (agentId === 42) {
          return {
            id: 42,
            name: "Workflow Agent",
            summary: "Delegates into a linked workflow",
            status: "published",
            systemPrompt: "Use the linked workflow.",
            goal: null,
            scope: null,
            guardrails: null,
            executionMode: "workflow_backed",
            linkedWorkflowId: 501,
          }
        }

        if (agentId === 43) {
          return {
            id: 43,
            name: "Disabled Agent",
            summary: "Should not execute.",
            status: "disabled",
            systemPrompt: "Do not execute.",
            goal: null,
            scope: null,
            guardrails: null,
            executionMode: "direct_agent",
            linkedWorkflowId: null,
          }
        }

        if (agentId === 44) {
          return {
            id: 44,
            name: "Archived Workflow Agent",
            summary: "Links to an archived workflow.",
            status: "published",
            systemPrompt: "Use the archived workflow.",
            goal: null,
            scope: null,
            guardrails: null,
            executionMode: "workflow_backed",
            linkedWorkflowId: 502,
          }
        }

        return null
      },
    }
  }

  if (request === "@/lib/workflows/store") {
    return {
      getWorkflowDefinition: async (workflowId: number) =>
        workflowId === 501
          ? {
              id: 501,
              enterpriseId: 151,
              ownerUserId: 96,
              title: "Delegated workflow",
              slug: "delegated-workflow",
              status: "draft",
              triggerType: "manual",
              description: null,
              metadata: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              nodes: [
                {
                  nodeKey: "delegate-text",
                  type: "text_input",
                  title: "Delegate text",
                  positionX: 0,
                  positionY: 0,
                  config: { text: "" },
                },
              ],
              edges: [],
            }
          : workflowId === 502
            ? {
                id: 502,
                enterpriseId: 151,
                ownerUserId: 96,
                title: "Archived delegated workflow",
                slug: "archived-delegated-workflow",
                status: "archived",
                triggerType: "manual",
                description: null,
                metadata: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                nodes: [],
                edges: [],
              }
          : null,
    }
  }

  if (request === "@/lib/workflows/execution") {
    return {
      runWorkflowDefinition: async ({ nodes }: { nodes: Array<{ nodeKey: string; type: string; config: Record<string, unknown> }> }) => {
        const syntheticTextNode = nodes.find((node) => node.nodeKey.includes("agent-42-input-text"))
        return {
          status: "succeeded",
          finalNodeKeys: ["delegate-result"],
          nodeStates: {
            "delegate-result": {
              output: {
                text: [String(syntheticTextNode?.config?.text || "delegated")],
              },
            },
          },
        }
      },
    }
  }

  if (request === "@/lib/auth/session") {
    return {
      applyInternalServiceAuthHeader: (headers: Headers) => {
        headers.set("x-aimarketing-internal-auth", "test-token")
      },
    }
  }

  if (request === "@/lib/knowledge/service") {
    return {
      loadEnterpriseKnowledgeContext: async () => {
        enterpriseKnowledgeLoadCount += 1
        return {
          datasetsUsed: [],
          snippets: [],
        }
      },
    }
  }

  if (request === "@/lib/knowledge/personal-datasets") {
    return {
      loadPersonalKnowledgeContext: async () => {
        personalKnowledgeLoadCount += 1
        return {
          datasetsUsed: [],
          snippets: [],
        }
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

  if (request === "@/app/api/writer/chat/stream/route") {
    return {
      POST: async (req: { json: () => Promise<Record<string, unknown>> }) => {
        writerChatBodies.push(await req.json())
        return new Response(
          [
            `data: ${JSON.stringify({ event: "message", answer: "Writer draft" })}`,
            "",
            `data: ${JSON.stringify({ event: "message_end", answer: "Writer draft" })}`,
            "",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream; charset=utf-8" },
          },
        )
      },
    }
  }

  if (
    request === "@/app/api/platform/media/run/route" ||
    request === "@/app/api/platform/media/tasks/[taskId]/route" ||
    request === "@/app/api/video-agent/workflow/route"
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
let buildVideoGenerateRequestBody: typeof import("./capability-invoker").buildVideoGenerateRequestBody
let buildAudioGenerateRequestBody: typeof import("./capability-invoker").buildAudioGenerateRequestBody

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
        previewRuntime: "frontend-slides-agent",
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

function createWriterParams(overrides?: Partial<WorkflowCapabilityInvokeParams>): WorkflowCapabilityInvokeParams {
  return {
    nodeType: "writer",
    capabilitySlug: "content-repurpose",
    action: "generate",
    node: {
      nodeKey: "writer-1",
      type: "writer",
      title: "内容改写",
      positionX: 0,
      positionY: 0,
      config: {
        platform: "wechat",
        mode: "article",
        language: "zh",
      },
    },
    input: {
      text: ["把这段研究整理成公众号文章"],
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

function createVideoParams(overrides?: Partial<WorkflowCapabilityInvokeParams>): WorkflowCapabilityInvokeParams {
  return {
    nodeType: "video_generate",
    capabilitySlug: "ai-video",
    action: "workflow-plan",
    node: {
      nodeKey: "video-1",
      type: "video_generate",
      title: "视频生成",
      positionX: 0,
      positionY: 0,
      config: {
        model: "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
        featureId: "image-to-video",
        duration: "6",
      },
    },
    input: {
      text: ["生成品牌宣传短片"],
      asset: [],
      image: [],
      video: [],
      audio: [],
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

test("video capability request automatically uses text-to-video when there is no image input", () => {
  const body = buildVideoGenerateRequestBody(createVideoParams(), "生成品牌宣传短片")

  assert.equal(body.featureId, "text-to-video")
  assert.equal(body.params.prompt, "生成品牌宣传短片")
  assert.equal(body.params.firstFrameUrl, undefined)
  assert.equal(body.params.modelId, "minimax:video:text-to-video:MiniMax-Hailuo-2.3")
})

test("video capability request automatically uses image-to-video when image input exists", () => {
  const body = buildVideoGenerateRequestBody(
    createVideoParams({
      node: {
        nodeKey: "video-1",
        type: "video_generate",
        title: "视频生成",
        positionX: 0,
        positionY: 0,
        config: {
          model: "minimax:video:text-to-video:MiniMax-Hailuo-2.3",
          featureId: "text-to-video",
        },
      },
      input: {
        text: ["让这张图动起来"],
        asset: [],
        image: [{ url: "https://example.com/frame.png", title: "首帧" }],
        video: [],
        audio: [],
        ppt: [],
      },
    }),
    "让这张图动起来",
  )

  assert.equal(body.featureId, "image-to-video")
  assert.equal(body.params.firstFrameUrl, "https://example.com/frame.png")
  assert.equal(body.params.modelId, "minimax:video:image-to-video:MiniMax-Hailuo-2.3")
})

test("audio capability request resolves the selected music model id", () => {
  const body = buildAudioGenerateRequestBody({
    nodeType: "music_generate",
    capabilitySlug: "ai-music",
    action: "generate",
    node: {
      nodeKey: "music-1",
      type: "music_generate",
      title: "音乐生成",
      positionX: 0,
      positionY: 0,
      config: {
        model: "minimax:audio:music-2.6",
        genre: "electronic-pop",
      },
    },
    input: {
      text: ["生成品牌主题曲"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  }, "生成品牌主题曲")

  assert.equal(body.featureId, "ai-music")
  assert.equal(body.modelId, "minimax:audio:music-2.6")
  assert.equal(body.params.model, "minimax:audio:music-2.6")
})

test("audio capability request resolves the selected voice synthesis model id", () => {
  const body = buildAudioGenerateRequestBody({
    nodeType: "voice_synthesis",
    capabilitySlug: "ai-music",
    action: "voice-synthesis",
    node: {
      nodeKey: "voice-1",
      type: "voice_synthesis",
      title: "语音合成",
      positionX: 0,
      positionY: 0,
      config: {
        model: "speech-2.8-turbo",
        voiceId: "voice-123",
      },
    },
    input: {
      text: ["请播报这段文案"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  }, "请播报这段文案")

  assert.equal(body.featureId, "voice-synthesis")
  assert.equal(body.modelId, "minimax:audio:speech-2.8-turbo")
  assert.equal(body.params.model, "minimax:audio:speech-2.8-turbo")
})

test.before(async () => {
  const module = await import("./capability-invoker")
  const resolvedModule = ("default" in module ? module.default : module) as typeof import("./capability-invoker")
  createWorkflowCapabilityInvoker = resolvedModule.createWorkflowCapabilityInvoker
  resolveWorkflowCapabilityCallTimeoutMs = resolvedModule.resolveWorkflowCapabilityCallTimeoutMs
  buildVideoGenerateRequestBody = resolvedModule.buildVideoGenerateRequestBody
  buildAudioGenerateRequestBody = resolvedModule.buildAudioGenerateRequestBody
})

test.beforeEach(() => {
  workflowImageGenerateBodies = []
  leadToolPreviewBodies = []
  leadToolDownloadBodies = []
  aiChatBodies = []
  writerChatBodies = []
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
  enterpriseKnowledgeLoadCount = 0
  personalKnowledgeLoadCount = 0
  artifactDownloadTextById = new Map([
    [141, "# 屿算智能\n主卖点：企业级 AI 营销工作台。\n核心任务：提炼 SEO 关键词和复用结构。"],
  ])
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

test("workflow ppt capability forwards the selected preview model", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
  })

  await invoke(createPptParams({
    node: {
      nodeKey: "ppt-1",
      type: "ppt_generate",
      title: "PPT",
      positionX: 0,
      positionY: 0,
      config: {
        scenario: "marketing-campaign",
        language: "zh-CN",
        previewRuntime: "ppt-master-agent",
        model: "step-3.7-flash",
      },
    },
  }))

  assert.equal(leadToolPreviewBodies.length, 1)
  assert.equal(leadToolPreviewBodies[0]?.model, "step-3.7-flash")
  assert.equal(leadToolPreviewBodies[0]?.previewRuntime, "ppt-master-agent")
})

test("workflow writer capability forwards the selected model config", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
  })

  const result = await invoke(createWriterParams({
    node: {
      nodeKey: "writer-1",
      type: "writer",
      title: "内容改写",
      positionX: 0,
      positionY: 0,
      config: {
        platform: "wechat",
        mode: "article",
        language: "zh",
        selectedProviderId: "pptoken",
        selectedModelId: "gpt-5.4",
      },
    },
  }))

  assert.equal(writerChatBodies.length, 1)
  assert.deepEqual(writerChatBodies[0]?.modelConfig, {
    providerId: "pptoken",
    modelId: "gpt-5.4",
  })
  assert.deepEqual(result.output.text, ["Writer draft"])
  assert.equal(result.providerId, "pptoken")
  assert.equal(result.modelId, "gpt-5.4")
})

test("agent-platform direct agent forwards composed system prompt to ai chat", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
  })

  const result = await invoke({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    node: {
      nodeKey: "agent-1",
      type: "agent_execute",
      title: "Brand Agent",
      positionX: 0,
      positionY: 0,
      config: {
        customAgentId: 41,
        systemPrompt: "Append compliance footer.",
      },
    },
    input: {
      text: ["Write a launch headline"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(aiChatBodies.length, 1)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Stay on brand."), true)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Do not mention pricing."), true)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Append compliance footer."), true)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Do not ask follow-up questions"), true)
  assert.deepEqual(
    (aiChatBodies[0]?.skillConfig as { enabledToolNames?: string[] } | undefined)?.enabledToolNames,
    ["preview_ppt_deck", "export_ppt_deck"],
  )
  assert.deepEqual(result.output.text, ["agent:Write a launch headline"])
  assert.equal(result.metadata?.customAgentId, 41)
})

test("agent-platform direct agent injects readable asset text into the chat message", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 17,
  })

  await invoke({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    node: {
      nodeKey: "seo-agent",
      type: "agent_execute",
      title: "SEO 复用智能体",
      positionX: 0,
      positionY: 0,
      config: {
        agentId: "business-seo-repurpose",
        prompt: "抽取关键词、问题簇、文章结构改写建议和复用方向。",
      },
    },
    input: {
      text: ["说明你要复用到 X、小红书、linkedin、facebook。"],
      asset: [
        {
          source: "upload",
          artifactId: 141,
          fileName: "屿算智能_ppt信息提取.md",
          mimeType: "text/markdown",
          url: "/api/platform/artifacts/141/download",
        },
      ],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(aiChatBodies.length, 1)
  assert.match(String(aiChatBodies[0]?.message), /抽取关键词、问题簇、文章结构改写建议和复用方向。/)
  assert.match(String(aiChatBodies[0]?.message), /Attached file content:/)
  assert.match(String(aiChatBodies[0]?.message), /屿算智能_ppt信息提取\.md/)
  assert.match(String(aiChatBodies[0]?.message), /企业级 AI 营销工作台/)
  assert.match(String(aiChatBodies[0]?.message), /提炼 SEO 关键词和复用结构/)
})

test("agent-platform direct agent does not auto-query knowledge when no knowledge_retrieve node exists", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
  })

  await invoke({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    node: {
      nodeKey: "agent-no-knowledge-1",
      type: "agent_execute",
      title: "Brand Agent",
      positionX: 0,
      positionY: 0,
      config: {
        customAgentId: 41,
      },
    },
    input: {
      text: ["Write a launch summary"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(enterpriseKnowledgeLoadCount, 0)
  assert.equal(personalKnowledgeLoadCount, 0)
})

test("agent-platform builtin ai-entry agent routes through ai chat with agent config", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
  })

  const result = await invoke({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    node: {
      nodeKey: "agent-builtin-1",
      type: "agent_execute",
      title: "Brand Strategy Advisor",
      positionX: 0,
      positionY: 0,
      config: {
        agentId: "executive-brand",
        systemPrompt: "Use a concise executive tone.",
      },
    },
    input: {
      text: ["Position our spring launch"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(aiChatBodies.length, 1)
  assert.equal((aiChatBodies[0]?.agentConfig as { agentId?: string } | undefined)?.agentId, "executive-brand")
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Use a concise executive tone."), true)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Do not ask follow-up questions"), true)
  assert.deepEqual(
    (aiChatBodies[0]?.skillConfig as { enabledToolNames?: string[] } | undefined)?.enabledToolNames,
    ["preview_ppt_deck", "export_ppt_deck"],
  )
  assert.deepEqual(result.output.text, ["agent:Position our spring launch"])
  assert.equal(result.metadata?.builtinAgentId, "executive-brand")
  assert.equal(result.metadata?.executionMode, "ai_entry_agent")
})

test("agent-platform forwards the selected model config for builtin agents", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
  })

  await invoke({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    node: {
      nodeKey: "agent-builtin-model-1",
      type: "agent_execute",
      title: "Brand Strategy Advisor",
      positionX: 0,
      positionY: 0,
      config: {
        agentId: "executive-brand",
        selectedProviderId: "openrouter",
        selectedModelId: "gpt-5.4",
      },
    },
    input: {
      text: ["Position our spring launch"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(aiChatBodies.length, 1)
  assert.deepEqual(aiChatBodies[0]?.modelConfig, {
    providerId: "openrouter",
    modelId: "gpt-5.4",
  })
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Do not ask follow-up questions"), true)
})

test("ai-chat workflow nodes default to single-turn direct answers", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "zh",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 17,
  })

  await invoke({
    nodeType: "llm_generate",
    capabilitySlug: "ai-chat",
    action: "chat",
    node: {
      nodeKey: "ai-chat-1",
      type: "llm_generate",
      title: "通用问答",
      positionX: 0,
      positionY: 0,
      config: {
        systemPrompt: "请用中文输出，并优先给出可执行方案。",
      },
    },
    input: {
      text: ["给我一个下周上线的 SEO 内容复用执行计划。"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(aiChatBodies.length, 1)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("请用中文输出，并优先给出可执行方案。"), true)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("Do not ask follow-up questions"), true)
  assert.equal(String(aiChatBodies[0]?.systemPrompt).includes("single response"), true)
})

test("agent-platform builtin ai-entry agent only enables web_search when selected in node config", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
  })

  const result = await invoke({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    node: {
      nodeKey: "agent-builtin-search-1",
      type: "agent_execute",
      title: "Brand Strategy Advisor",
      positionX: 0,
      positionY: 0,
      config: {
        agentId: "executive-brand",
        webSearchEnabled: true,
      },
    },
    input: {
      text: ["Position our spring launch with current market signals"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(aiChatBodies.length, 1)
  assert.deepEqual(
    (aiChatBodies[0]?.skillConfig as { enabledToolNames?: string[] } | undefined)?.enabledToolNames,
    ["web_search", "preview_ppt_deck", "export_ppt_deck"],
  )
  assert.deepEqual(result.output.text, ["agent:Position our spring launch with current market signals"])
})

test("agent-platform workflow-backed agent delegates into the linked workflow graph", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
    workflowRecursionPath: [9],
  })

  const result = await invoke({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    node: {
      nodeKey: "agent-2",
      type: "agent_execute",
      title: "Workflow Agent",
      positionX: 0,
      positionY: 0,
      config: {
        customAgentId: 42,
        prompt: "Summarize the workflow input",
      },
    },
    input: {
      text: ["Use upstream brief"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.deepEqual(result.output.text, ["Summarize the workflow input\n\nUse upstream brief"])
  assert.equal(result.metadata?.linkedWorkflowId, 501)
})

test("agent-platform rejects disabled custom agents before execution", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
  })

  await assert.rejects(
    () =>
      invoke({
        nodeType: "agent_execute",
        capabilitySlug: "agent-platform",
        action: "chat",
        node: {
          nodeKey: "agent-disabled-1",
          type: "agent_execute",
          title: "Disabled agent",
          positionX: 0,
          positionY: 0,
          config: {
            customAgentId: 43,
          },
        },
        input: {
          text: ["Should not run"],
          asset: [],
          image: [],
          video: [],
          audio: [],
          ppt: [],
        },
      }),
    /workflow_custom_agent_disabled/,
  )
})

test("agent-platform rejects workflow-backed agents when the linked workflow is archived", async () => {
  const invoke = createWorkflowCapabilityInvoker({
    currentUser: {
      id: 96,
      enterpriseId: 151,
      enterpriseRole: "admin",
      enterpriseStatus: "active",
    } as never,
    locale: "en",
    requestOrigin: "http://127.0.0.1:3000",
    activeWorkflowId: 9,
  })

  await assert.rejects(
    () =>
      invoke({
        nodeType: "agent_execute",
        capabilitySlug: "agent-platform",
        action: "chat",
        node: {
          nodeKey: "agent-archived-workflow-1",
          type: "agent_execute",
          title: "Archived workflow agent",
          positionX: 0,
          positionY: 0,
          config: {
            customAgentId: 44,
          },
        },
        input: {
          text: ["Should not run"],
          asset: [],
          image: [],
          video: [],
          audio: [],
          ppt: [],
        },
      }),
    /workflow_custom_agent_linked_workflow_archived/,
  )
})

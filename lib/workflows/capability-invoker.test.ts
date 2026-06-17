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
let taskPollCount = 0
let sessionDetailCount = 0
let sessionDetailResponses: Record<string, unknown>[] = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
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
        return new Response(
          JSON.stringify({
            data: {
              status: "success",
              result: {
                session_id: "session-9",
                outcome: "generated",
                version_id: "version-3",
              },
            },
          }),
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
      resolvePlatformCapabilityExecutionProxyTarget: () => ({
        downstreamPath: "/api/image-assistant/generate",
        requiresLogin: true,
      }),
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

  if (
    request === "@/app/api/ai/chat/route" ||
    request === "@/app/api/platform/media/run/route" ||
    request === "@/app/api/platform/media/tasks/[taskId]/route" ||
    request === "@/app/api/tools/[slug]/download/route" ||
    request === "@/app/api/tools/[slug]/preview/route" ||
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
        sizePreset: "16:9",
        resolution: "2K",
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
  assert.equal(body.providerLock, null)
  assert.equal(body.candidateCount, 1)
  assert.equal(body.sizePreset, "16:9")
  assert.equal(body.resolution, "2K")
  assert.deepEqual(body.referenceAssetIds, ["asset-2", "789"])
  assert.deepEqual(body.referenceUrls, [])
  assert.equal(body.prompt, "将图2 中人物替换图3中的人物")
  assert.equal(body.brief.size_preset, "16:9")
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

  const urls = buildWorkflowImageAssistantReferenceUrls(params, "生成一张新的海报")
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
  assert.equal(body.prompt, "将图2 中人物替换{{图3}}中的人物")
})

test.before(async () => {
  const module = await import("./capability-invoker")
  createWorkflowCapabilityInvoker = module.createWorkflowCapabilityInvoker
})

test.beforeEach(() => {
  workflowImageGenerateBodies = []
  taskPollCount = 0
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
  assert.equal(workflowImageGenerateBodies[0]?.providerLock, null)
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

test("workflow capability invoker enforces call timeout for stuck ai chat calls", async () => {
  const module = await import("./capability-invoker")

  await assert.rejects(
    () => module.withTimeout(new Promise<string>(() => {}), 10, "workflow_ai_chat_timeout"),
    /workflow_ai_chat_timeout/,
  )
})

import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

const updateCalls: Array<{ userId: number; conversationId: string; meta: Record<string, unknown> }> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    class MockNextResponse {
      body: unknown
      status: number
      headers: Record<string, string>

      constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
        this.body = body
        this.status = init?.status || 200
        this.headers = init?.headers || {}
      }

      static json(body: unknown, init?: { status?: number }) {
        return {
          status: init?.status || 200,
          body,
        }
      }
    }

    return {
      NextResponse: MockNextResponse,
    }
  }

  if (request === "@/lib/auth/guards") {
    return {
      requireSessionUser: async () => ({
        user: {
          id: 7,
          enterpriseId: 11,
          isDemo: false,
        },
      }),
    }
  }

  if (request === "@/lib/billing/costing") {
    return {
      estimateGptImage2Credits: () => ({
        featureKey: "writer_image",
        credits: 80,
        provider: "aiberm",
        model: "gpt-image-2",
        source: "test",
        metadata: {},
      }),
    }
  }

  if (request === "@/lib/billing/runtime") {
    return {
      reserveFeatureCredits: async () => {
        throw new Error("insufficient_credits")
      },
      finalizeReservedCredits: async () => null,
      releaseReservedCredits: async () => null,
    }
  }

  if (request === "@/lib/image-assistant/openai-compatible-image") {
    return {
      generateImagesWithOpenAiCompatibleProvider: async () => ({ images: [] }),
      getOpenAiCompatibleImageProviderConfig: () => ({ model: "gpt-image-2" }),
    }
  }

  if (request === "@/lib/image-assistant/aiberm") {
    return {
      buildImageAssistantProviderPlan: () => ["aiberm"],
    }
  }

  if (request === "@/lib/image-generation/provider-orchestration") {
    return {
      executeImageProviderPlan: async () => {
        throw new Error("should_not_generate_images_when_credit_reserve_fails")
      },
    }
  }

  if (request === "@/lib/writer/assets") {
    return {
      buildPendingWriterAssets: () => [
        {
          id: "cover",
          prompt: "cover prompt",
          aspectRatio: "1:1",
          section: "cover",
        },
      ],
      ensureWriterAssetOrder: (assets: unknown[]) => assets,
      markWriterAssetsFailed: (assets: Array<Record<string, unknown>>, error: string) =>
        assets.map((asset) => ({
          ...asset,
          url: "",
          status: "failed",
          provider: "error",
          error,
        })),
    }
  }

  if (request === "@/lib/writer/config") {
    return {
      normalizeWriterPlatform: () => "xiaohongshu",
      normalizeWriterMode: () => "standard",
      WRITER_PLATFORM_CONFIG: {},
    }
  }

  if (request === "@/lib/writer/prompt-similarity") {
    return {
      ensureWriterPromptDiversity: () => ({ prompt: "cover prompt", attemptCount: 1 }),
      extractWriterPromptFocus: () => "focus",
    }
  }

  if (request === "@/lib/writer/repository") {
    return {
      updateWriterConversationMeta: async (userId: number, conversationId: string, meta: Record<string, unknown>) => {
        updateCalls.push({ userId, conversationId, meta })
      },
    }
  }

  if (request === "@/lib/writer/r2") {
    return {
      isWriterR2Available: () => true,
      uploadWriterImageToR2: async () => {
        throw new Error("should_not_upload_when_credit_reserve_fails")
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

function buildRequest(body: Record<string, unknown>) {
  return {
    method: "POST",
    json: async () => body,
  } as Parameters<typeof POST>[0]
}

async function readStreamBody(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    output += decoder.decode(value, { stream: true })
  }

  output += decoder.decode()
  return output
}

test.before(async () => {
  const route = await import("./route")
  POST = route.POST
})

test.beforeEach(() => {
  updateCalls.length = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("writer assets marks conversation failed when non-stream credit reservation is insufficient", async () => {
  const response = await POST(buildRequest({
    markdown: "![cover](writer-asset://cover)",
    conversationId: "conv-1",
  }))

  assert.ok(response)
  assert.equal(response.status, 402)
  assert.deepEqual(response.body, { error: "insufficient_credits" })
  assert.deepEqual(updateCalls, [
    { userId: 7, conversationId: "conv-1", meta: { status: "image_generating", imagesRequested: true } },
    { userId: 7, conversationId: "conv-1", meta: { status: "failed", imagesRequested: true } },
  ])
})

test("writer assets stream reports insufficient credits and marks conversation failed", async () => {
  const response = await POST(buildRequest({
    markdown: "![cover](writer-asset://cover)",
    conversationId: "conv-2",
    stream: true,
  })) as {
    status: number
    body: ReadableStream<Uint8Array>
  }

  assert.ok(response)
  assert.equal(response.status, 200)
  const streamBody = await readStreamBody(response.body)

  assert.match(streamBody, /"event":"done"/)
  assert.match(streamBody, /"error":"insufficient_credits"/)
  assert.deepEqual(updateCalls, [
    { userId: 7, conversationId: "conv-2", meta: { status: "image_generating", imagesRequested: true } },
    { userId: 7, conversationId: "conv-2", meta: { status: "failed", imagesRequested: true } },
  ])
})

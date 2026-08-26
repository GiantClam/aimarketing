import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import type { WriterSubmitResult } from "./writer-result"
import { resolveWriterPlatformBinding } from "./platform-registry"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

const statuses: string[] = []
const reservations: Array<Record<string, unknown>> = []
const finalizations: Array<Record<string, unknown>> = []
const releases: Array<Record<string, unknown>> = []
const progress: string[] = []
const generatedPrompts: string[] = []
const requestTimeouts: number[] = []
const failedPrompts = new Set<string>()

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/billing/costing") {
    return {
      estimateGptImage2Credits: ({ imageCount }: { imageCount: number }) => ({
        featureKey: "writer_image",
        credits: Math.max(1, imageCount) * 10,
        provider: "aiberm",
        model: "gpt-image-2",
        source: "test",
        metadata: { imageCount },
      }),
    }
  }

  if (request === "@/lib/billing/runtime") {
    return {
      reserveFeatureCredits: async (input: Record<string, unknown>) => {
        reservations.push(input)
        return { creditAccountId: 1, reserveIdempotencyKey: String(input.idempotencyKey), amount: Number(input.amount) }
      },
      finalizeReservedCredits: async (input: Record<string, unknown>) => {
        finalizations.push(input)
        return null
      },
      releaseReservedCredits: async (input: Record<string, unknown>) => {
        releases.push(input)
        return null
      },
    }
  }

  if (request === "@/lib/image-assistant/openai-compatible-image") {
    return {
      generateImagesWithOpenAiCompatibleProvider: async (input: { prompt: string; timeoutMs: number }) => {
        generatedPrompts.push(input.prompt)
        requestTimeouts.push(input.timeoutMs)
        for (const failedPrompt of failedPrompts) {
          if (input.prompt.includes(failedPrompt)) throw new Error("provider timeout")
        }
        return { images: ["data:image/png;base64,AAAA"], model: "gpt-image-2" }
      },
      getOpenAiCompatibleImageProviderConfig: () => ({ model: "gpt-image-2" }),
    }
  }

  if (request === "@/lib/image-assistant/aiberm") {
    return { buildImageAssistantProviderPlan: () => ["aiberm"] }
  }

  if (request === "@/lib/image-generation/provider-orchestration") {
    return {
      executeImageProviderPlan: async (input: { providerPlan: string[]; handlers: Record<string, () => Promise<unknown>> }) => {
        const provider = input.providerPlan[0]
        if (!provider || !input.handlers[provider]) throw new Error("provider_plan_empty")
        return { provider, result: await input.handlers[provider]() }
      },
    }
  }

  if (request === "@/lib/writer/repository") {
    return {
      updateWriterConversationMeta: async (_userId: number, _conversationId: string, meta: { assetStatus?: string; status?: string }) => {
        statuses.push(meta.status || meta.assetStatus || "")
      },
    }
  }

  if (request === "@/lib/writer/revisions") {
    return {
      persistWriterAssetProgress: async (input: { content: string }) => {
        progress.push(input.content)
        return true
      },
    }
  }

  if (request === "@/lib/writer/platform-artifacts") {
    return {
      persistWriterGeneratedImage: async (input: { assetId: string }) => ({
        artifactId: input.assetId === "cover" ? 101 : 102,
        url: `https://cdn.example.com/${input.assetId}.png`,
        storageKey: `platform/${input.assetId}`,
        contentType: "image/png",
      }),
    }
  }

  if (request === "@/lib/writer/r2") {
    return {
      isWriterR2Available: () => true,
      parseWriterDataUrl: () => ({ contentType: "image/png", buffer: Buffer.from("png") }),
      uploadWriterImageToR2: async (input: { assetId: string }) => ({
        url: `https://cdn.example.com/${input.assetId}.png`,
        storageKey: `writer/${input.assetId}`,
        contentType: "image/png",
      }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let generateWriterAssetsForTask: typeof import("./assets-runtime").generateWriterAssetsForTask

function intents(ids: string[]): WriterSubmitResult["assetIntents"] {
  return ids.map((id) => ({
    id,
    kind: id === "cover" ? "cover" : "inline",
    prompt: `${id} distinct editorial scene`,
    placement: id === "cover" ? "after_title" : `after_section_${id.replace("inline-", "")}`,
    aspectRatio: "16:9",
  })) as WriterSubmitResult["assetIntents"]
}

function resetFixtures() {
  statuses.length = 0
  reservations.length = 0
  finalizations.length = 0
  releases.length = 0
  progress.length = 0
  generatedPrompts.length = 0
  requestTimeouts.length = 0
  failedPrompts.clear()
}

test.before(async () => {
  ;({ generateWriterAssetsForTask } = await import("./assets-runtime"))
})

test.beforeEach(resetFixtures)

test.after(() => {
  nodeModule._load = originalLoad
})

test("platform asset limits remain explicit for governed Writer plans", () => {
  assert.equal(resolveWriterPlatformBinding("wechat").assets.maxCount, 6)
  assert.equal(resolveWriterPlatformBinding("douyin").assets.maxCount, 1)
  assert.equal(resolveWriterPlatformBinding("reddit").assets.maxCount, 2)
})

test("multi-image runs allow cumulative near-timeout execution and settle billing once", async () => {
  const result = await generateWriterAssetsForTask({
    markdown: "# Multi-image article\n\nBody",
    platform: "wechat",
    mode: "article",
    userId: 7,
    enterpriseId: 42,
    conversationId: "conversation-near-timeout",
    taskId: "task-near-timeout",
    expectedRevision: 3,
    assetIntents: intents(["cover", "inline-1", "inline-2"]),
  })

  assert.equal(result.status, "ready")
  assert.equal(result.assets.length, 3)
  assert.equal(finalizations.length, 1)
  assert.equal(releases.length, 0)
  assert.equal(reservations[0]?.amount, 30)
  assert.equal(requestTimeouts.length, 3)
  assert.ok(requestTimeouts.every((timeout) => timeout >= 60_000))
  assert.ok(generatedPrompts.length === 3)
  assert.equal(progress.length, 3)
  assert.ok(progress.every((markdown) => markdown.includes("https://cdn.example.com/")))
  assert.deepEqual(result.assets.map((asset) => asset.artifactId), [101, 102, 102])
})

test("inline-capable platform plans generate cover and inline images through the same runtime", async () => {
  const platforms = ["wechat", "xiaohongshu", "instagram", "facebook"] as const

  for (const platform of platforms) {
    const result = await generateWriterAssetsForTask({
      markdown: `# ${platform} article\n\nBody`,
      platform,
      mode: "article",
      userId: 7,
      enterpriseId: 42,
      conversationId: `conversation-inline-${platform}`,
      taskId: `task-inline-${platform}`,
      expectedRevision: 1,
      assetIntents: intents(["cover", "inline-1"]),
    })

    assert.equal(result.status, "ready", platform)
    assert.equal(result.assets.length, 2, platform)
    assert.equal(result.assets.find((asset) => asset.id === "cover")?.status, "ready", platform)
    assert.equal(result.assets.find((asset) => asset.id === "inline-1")?.status, "ready", platform)
    assert.match(result.assets.find((asset) => asset.id === "inline-1")?.url || "", /cdn\.example\.com\/inline-1\.png/u, platform)
  }

  assert.equal(finalizations.length, platforms.length)
  assert.equal(releases.length, 0)
})

test("partial success preserves stored URLs and reports partial status", async () => {
  failedPrompts.add("inline-2")

  const result = await generateWriterAssetsForTask({
    markdown: "# Partial article\n\nBody",
    platform: "wechat",
    mode: "article",
    userId: 7,
    enterpriseId: 42,
    conversationId: "conversation-partial",
    taskId: "task-partial",
    expectedRevision: 4,
    assetIntents: intents(["cover", "inline-1", "inline-2"]),
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, "partial")
  assert.equal(result.assets.find((asset) => asset.id === "cover")?.url, "https://cdn.example.com/cover.png")
  assert.equal(result.assets.find((asset) => asset.id === "inline-2")?.status, "failed")
  assert.equal(statuses.at(-1), "partial")
  assert.equal(finalizations.length, 1)
  assert.equal(finalizations[0]?.metadata && (finalizations[0].metadata as { successCount?: number }).successCount, 2)
  assert.equal(releases.length, 0)
})

test("worker restart skips ready cover and resumes only unfinished assets", async () => {
  const markdown = [
    "# Restart article",
    "",
    "Body",
    "",
    "<!-- writer-asset-slot:start:cover -->",
    "![Cover](https://cdn.example.com/cover.png)",
    "<!-- writer-asset-slot:end:cover -->",
    "",
    "<!-- writer-asset-slot:start:inline-1 -->",
    "![Inline Image 1](writer-asset://inline-1)",
    "<!-- writer-asset-slot:end:inline-1 -->",
  ].join("\n")

  const result = await generateWriterAssetsForTask({
    markdown,
    platform: "wechat",
    mode: "article",
    userId: 7,
    enterpriseId: 42,
    conversationId: "conversation-restart",
    taskId: "task-restart",
    expectedRevision: 5,
    assetIntents: intents(["cover", "inline-1"]),
  })

  assert.equal(result.status, "ready")
  assert.deepEqual(generatedPrompts.map((prompt) => prompt.includes("inline-1")), [true])
  assert.equal(reservations[0]?.amount, 10)
  assert.equal(result.assets.find((asset) => asset.id === "cover")?.url, "https://cdn.example.com/cover.png")
  assert.equal(result.assets.find((asset) => asset.id === "inline-1")?.url, "https://cdn.example.com/inline-1.png")
})

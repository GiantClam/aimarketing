import assert from "node:assert/strict"
import test from "node:test"

import {
  buildOpenAiCompatibleImageRequestParts,
  generateImagesWithOpenAiCompatibleProvider,
  getOpenAiCompatibleImageProviderConfig,
  mapGptImage2Quality,
  mapGptImage2Size,
  type OpenAiCompatibleInlineImage,
} from "./openai-compatible-image"

const image = (assetId: string, base64Data = "aW1hZ2U="): OpenAiCompatibleInlineImage => ({
  kind: "inline",
  assetId,
  mimeType: "image/png",
  base64Data,
})

test("gpt-image-2 request parts: text-to-image uses generations endpoint", () => {
  const parts = buildOpenAiCompatibleImageRequestParts({
    model: "gpt-image-2",
    prompt: "Create a clean product hero image",
    taskType: "generate",
    sizePreset: "1:1",
    resolution: "1K",
  })

  assert.equal(parts.endpoint, "/images/generations")
  assert.equal(parts.model, "gpt-image-2")
  assert.equal(parts.size, "1024x1024")
  assert.equal(parts.quality, "medium")
  assert.deepEqual(parts.images, [])
  assert.equal(parts.mask, null)
})

test("gpt-image-2 request parts: image edit uses edits endpoint and excludes mask from references", () => {
  const parts = buildOpenAiCompatibleImageRequestParts({
    model: "openai/gpt-image-2",
    prompt: "Improve the layout",
    taskType: "edit",
    sizePreset: "16:9",
    resolution: "2K",
    referenceImages: [image("ref-1"), image("mask-1")],
    maskAssetId: "mask-1",
  })

  assert.equal(parts.endpoint, "/images/edits")
  assert.equal(parts.size, "2048x1152")
  assert.deepEqual(
    parts.images.map((item) => item.assetId),
    ["ref-1"],
  )
  assert.equal(parts.mask?.assetId, "mask-1")
})

test("gpt-image-2 request parts: generate with style references stays on generations endpoint", () => {
  const parts = buildOpenAiCompatibleImageRequestParts({
    model: "gpt-image-2",
    prompt: "Use this image as style reference and generate a new campaign poster",
    taskType: "generate",
    sizePreset: "16:9",
    resolution: "2K",
    referenceImages: [image("style-ref")],
  })

  assert.equal(parts.endpoint, "/images/generations")
  assert.deepEqual(
    parts.images.map((item) => item.assetId),
    ["style-ref"],
  )
  assert.equal(parts.mask, null)
})

test("gpt-image-2 request parts: mask edit puts snapshot first and passes mask separately", () => {
  const parts = buildOpenAiCompatibleImageRequestParts({
    model: "gpt-image-2",
    prompt: "Replace the selected area with a seasonal product badge",
    taskType: "mask_edit",
    sizePreset: "3:4",
    resolution: "1K",
    referenceImages: [image("style-ref"), image("mask-asset"), image("snapshot-asset")],
    snapshotAssetId: "snapshot-asset",
    maskAssetId: "mask-asset",
  })

  assert.equal(parts.endpoint, "/images/edits")
  assert.equal(parts.size, "1024x1536")
  assert.deepEqual(
    parts.images.map((item) => item.assetId),
    ["snapshot-asset", "style-ref"],
  )
  assert.equal(parts.mask?.assetId, "mask-asset")
})

test("gpt-image-2 size and quality mapping covers high and low tiers", () => {
  assert.equal(mapGptImage2Size("9:16", "4K"), "2160x3840")
  assert.equal(mapGptImage2Size("4:5", "1K"), "1024x1280")
  assert.equal(mapGptImage2Quality("512"), "low")
  assert.equal(mapGptImage2Quality("4K"), "high")
})

test("gpt-image-2 mask edit requires a mask asset", () => {
  assert.throws(
    () =>
      buildOpenAiCompatibleImageRequestParts({
        model: "gpt-image-2",
        prompt: "Edit selected area",
        taskType: "mask_edit",
        referenceImages: [image("snapshot-asset")],
        snapshotAssetId: "snapshot-asset",
        maskAssetId: "missing-mask",
      }),
    /image_assistant_mask_missing/,
  )
})

test("gpt-image-2 provider request forwards n=9 for text-to-image generation", async () => {
  const originalFetch = globalThis.fetch
  let requestedN: unknown = null

  globalThis.fetch = (async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    requestedN = requestBody.n
    return {
      ok: true,
      json: async () => ({
        data: Array.from({ length: 9 }, (_, index) => ({
          b64_json: Buffer.from(`image-${index + 1}`).toString("base64"),
        })),
      }),
    } as Response
  }) as typeof fetch

  try {
    const result = await generateImagesWithOpenAiCompatibleProvider({
      config: {
        provider: "pptoken",
        baseUrl: "https://api.pptoken.org/v1",
        apiKey: "test-key",
        model: "gpt-image-2",
      },
      prompt: "Generate nine related campaign concepts",
      taskType: "generate",
      sizePreset: "1:1",
      resolution: "2K",
      candidateCount: 9,
    })

    assert.equal(requestedN, 9)
    assert.equal(result.images.length, 9)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("gpt-image-2 provider request retries transient fetch failures before succeeding", async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0

  globalThis.fetch = (async () => {
    attempts += 1
    if (attempts < 3) {
      const error = new Error("fetch failed")
      ;(error as Error & { cause?: { code: string } }).cause = { code: "UND_ERR_SOCKET" }
      throw error
    }
    return {
      ok: true,
      json: async () => ({
        data: [{ b64_json: Buffer.from("image-success").toString("base64") }],
      }),
    } as Response
  }) as typeof fetch

  try {
    const result = await generateImagesWithOpenAiCompatibleProvider({
      config: {
        provider: "pptoken",
        baseUrl: "https://api.pptoken.cc/v1",
        apiKey: "test-key",
        model: "gpt-image-2",
      },
      prompt: "Generate a stable retry test image",
      taskType: "generate",
      sizePreset: "1:1",
      resolution: "512",
      attempts: 3,
      timeoutMs: 5_000,
    })

    assert.equal(attempts, 3)
    assert.equal(result.images.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("gpt-image-2 provider request aborts timed out attempts and retries", async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0

  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    attempts += 1
    if (attempts === 1) {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            const error = new Error("fetch failed")
            ;(error as Error & { cause?: { code: string } }).cause = { code: "UND_ERR_CONNECT_TIMEOUT" }
            reject(error)
          },
          { once: true },
        )
      })
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({
        data: [{ b64_json: Buffer.from("image-after-timeout").toString("base64") }],
      }),
    } as Response)
  }) as typeof fetch

  try {
    const result = await generateImagesWithOpenAiCompatibleProvider({
      config: {
        provider: "pptoken",
        baseUrl: "https://api.pptoken.cc/v1",
        apiKey: "test-key",
        model: "gpt-image-2",
      },
      prompt: "Generate after timeout retry",
      taskType: "generate",
      sizePreset: "1:1",
      resolution: "512",
      attempts: 2,
      timeoutMs: 10,
    })

    assert.equal(attempts, 2)
    assert.equal(result.images.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("pptoken image provider config requires dedicated image assistant api key", () => {
  const originalImageKey = process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY
  const originalSharedKey = process.env.PPTOKEN_API_KEY
  const originalImageBaseUrl = process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL

  delete process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY
  process.env.PPTOKEN_API_KEY = "shared-text-key"
  delete process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL

  try {
    assert.equal(getOpenAiCompatibleImageProviderConfig("pptoken"), null)
  } finally {
    if (typeof originalImageKey === "string") process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY = originalImageKey
    else delete process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY

    if (typeof originalSharedKey === "string") process.env.PPTOKEN_API_KEY = originalSharedKey
    else delete process.env.PPTOKEN_API_KEY

    if (typeof originalImageBaseUrl === "string") process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL = originalImageBaseUrl
    else delete process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL
  }
})

test("pptoken image provider config uses dedicated image assistant base url default", () => {
  const originalImageKey = process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY
  const originalImageBaseUrl = process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL
  const originalSharedBaseUrl = process.env.PPTOKEN_BASE_URL

  process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY = "dedicated-image-key"
  delete process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL
  process.env.PPTOKEN_BASE_URL = "https://shared-text.example/v1"

  try {
    const config = getOpenAiCompatibleImageProviderConfig("pptoken")
    assert.equal(config?.apiKey, "dedicated-image-key")
    assert.equal(config?.baseUrl, "https://api.pptoken.cc/v1")
  } finally {
    if (typeof originalImageKey === "string") process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY = originalImageKey
    else delete process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY

    if (typeof originalImageBaseUrl === "string") process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL = originalImageBaseUrl
    else delete process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL

    if (typeof originalSharedBaseUrl === "string") process.env.PPTOKEN_BASE_URL = originalSharedBaseUrl
    else delete process.env.PPTOKEN_BASE_URL
  }
})

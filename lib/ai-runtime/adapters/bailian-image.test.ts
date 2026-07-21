import assert from "node:assert/strict"
import test from "node:test"

import { generateBailianImages } from "./bailian-image"

test("Bailian Qwen Image maps text-to-image and image-to-image content", async () => {
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | null = null
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    return {
      ok: true,
      status: 200,
      json: async () => ({ output: { choices: [{ message: { content: [{ image: "https://cdn.example.test/result.png" }] } }] } }),
    } as Response
  }) as typeof fetch

  try {
    const result = await generateBailianImages({
      config: { baseUrl: "https://dashscope.example.test", apiKey: "test-key" },
      model: "qwen-image-3.0-pro",
      prompt: "Turn this into a studio product photo.",
      referenceImages: [{ mimeType: "image/png", base64Data: "aW1hZ2U=" }],
      size: "1024x1536",
      candidateCount: 2,
      modelParameters: {
        negativePrompt: "blurry",
        promptExtend: "false",
        watermark: "true",
      },
    })

    assert.deepEqual(result.images, ["https://cdn.example.test/result.png"])
    const capturedBody = requestBody as Record<string, unknown> | null
    assert.equal(capturedBody?.model, "qwen-image-3.0-pro")
    const messages = (capturedBody?.input as Record<string, unknown>).messages as Array<Record<string, unknown>>
    const content = messages[0]?.content as Array<Record<string, string>>
    assert.deepEqual(content[0], { image: "data:image/png;base64,aW1hZ2U=" })
    assert.deepEqual(content[1], { text: "Turn this into a studio product photo." })
    assert.deepEqual(capturedBody?.parameters, {
      size: "1024*1536",
      n: 2,
      negative_prompt: "blurry",
      prompt_extend: false,
      watermark: true,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

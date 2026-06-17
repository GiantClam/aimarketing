import assert from "node:assert/strict"
import test from "node:test"

import {
  createWorkflowNodeInputBundle,
  mergeWorkflowNodeOutputBundles,
  resolveWorkflowNodeExecutor,
} from "@/lib/workflows/node-executors"

test("image_generate resolves to the existing image capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("image_generate")
  assert.equal(executor.capabilitySlug, "ai-image")
  assert.equal(executor.action, "generate")
})

test("writer resolves to the existing writer capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("writer")
  assert.equal(executor.capabilitySlug, "content-repurpose")
  assert.equal(executor.action, "chat")
})

test("music_generate resolves to the music capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("music_generate")
  assert.equal(executor.capabilitySlug, "ai-music")
  assert.equal(executor.action, "generate")
})

test("voice_synthesis resolves to the speech synthesis capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("voice_synthesis")
  assert.equal(executor.capabilitySlug, "ai-music")
  assert.equal(executor.action, "voice-synthesis")
})

test("audio_generate stays available as the legacy audio capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("audio_generate")
  assert.equal(executor.capabilitySlug, "ai-music")
  assert.equal(executor.action, "generate")
})

test("product_store echoes upstream output for preview and marks work library persistence", async () => {
  const executor = resolveWorkflowNodeExecutor("product_store")
  assert.equal(executor.action, "store-output")

  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 1,
    node: {
      nodeKey: "product-store-1",
      type: "product_store",
      title: "Work Library",
      positionX: 0,
      positionY: 0,
      config: {},
    },
    input: {
      text: ["Stored text"],
      asset: [],
      image: [{ url: "https://example.com/result.png", title: "Result image" }],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.deepEqual(result.output, {
    text: ["Stored text"],
    asset: [],
    image: [{ url: "https://example.com/result.png", title: "Result image" }],
    video: [],
    audio: [],
    ppt: [],
  })
  assert.equal(result.metadata?.persistenceTarget, "work_library")
})

test("upload executor returns canonical asset output", async () => {
  const executor = resolveWorkflowNodeExecutor("upload")
  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 1,
    node: {
      nodeKey: "upload-1",
      type: "upload",
      title: "Upload",
      positionX: 0,
      positionY: 0,
      config: {
        uploadedFiles: [{ fileName: "brand.png", mimeType: "image/png", storageKey: "tmp/brand.png" }],
      },
    },
    input: createWorkflowNodeInputBundle(),
  })

  assert.equal(result.output.asset?.length, 1)
  assert.equal(result.output.asset?.[0]?.storageKey, "tmp/brand.png")
})

test("text_input emits configured text and merged bundles append by kind", async () => {
  const executor = resolveWorkflowNodeExecutor("text_input")
  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 1,
    node: {
      nodeKey: "text-1",
      type: "text_input",
      title: "Text input",
      positionX: 0,
      positionY: 0,
      config: {
        text: "Generate a launch visual",
      },
    },
    input: createWorkflowNodeInputBundle(),
  })

  assert.deepEqual(result.output.text, ["Generate a launch visual"])

  const merged = mergeWorkflowNodeOutputBundles(createWorkflowNodeInputBundle(), result.output)
  assert.deepEqual(merged.text, ["Generate a launch visual"])
})

test("merged bundles preserve audio outputs", () => {
  const merged = mergeWorkflowNodeOutputBundles(createWorkflowNodeInputBundle(), {
    audio: [{ url: "https://example.com/theme.mp3", title: "Theme" }],
  })

  assert.equal(merged.audio.length, 1)
  assert.equal(merged.audio[0]?.url, "https://example.com/theme.mp3")
})

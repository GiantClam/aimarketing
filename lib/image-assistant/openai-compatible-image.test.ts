import assert from "node:assert/strict"
import test from "node:test"

import {
  buildOpenAiCompatibleImageRequestParts,
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

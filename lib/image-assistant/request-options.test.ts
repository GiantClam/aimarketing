import assert from "node:assert/strict"
import test from "node:test"

import { inferImageAssistantRequestOptionsFromPrompt, resolveImageAssistantRequestOptions } from "./request-options"

test("infers normalized ratio and resolution from natural language prompt", () => {
  const result = inferImageAssistantRequestOptionsFromPrompt(
    "生成一张3D植物细胞图，纯色背景，可用于tripo3d生成模型，1k，16：9",
  )

  assert.equal(result.sizePreset, "16:9")
  assert.equal(result.resolution, "1K")
})

test("prompt options override stale UI defaults", () => {
  const result = resolveImageAssistantRequestOptions({
    prompt: "make a clean 4k launch visual in 9:16",
    sizePreset: "4:5",
    resolution: "2K",
  })

  assert.equal(result.sizePreset, "9:16")
  assert.equal(result.resolution, "4K")
})

test("keeps explicit UI options when prompt has no size hints", () => {
  const result = resolveImageAssistantRequestOptions({
    prompt: "make a clean product visual",
    sizePreset: "4:5",
    resolution: "2K",
  })

  assert.equal(result.sizePreset, "4:5")
  assert.equal(result.resolution, "2K")
})

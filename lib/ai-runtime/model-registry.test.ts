import assert from "node:assert/strict"
import test from "node:test"

import {
  getDefaultModelId,
  getModelDefinition,
  listModels,
  validateAndNormalizeModelInput,
} from "@/lib/ai-runtime/model-registry"
import { MODEL_CAPABILITIES } from "@/lib/ai-runtime/capabilities"
import { getProviderAdapter } from "@/lib/ai-runtime/provider-registry"

test("listModels exposes every capability with unique model ids", () => {
  const allModels = listModels()
  const ids = new Set(allModels.map((model) => model.id))
  assert.equal(ids.size, allModels.length)

  for (const capability of MODEL_CAPABILITIES) {
    assert.ok(listModels({ capability }).length > 0, `missing models for ${capability}`)
    assert.ok(getDefaultModelId(capability), `missing default model for ${capability}`)
  }
})

test("every model default value is valid for its parameter schema", () => {
  for (const model of listModels()) {
    const defaults = Object.fromEntries(
      model.parameterSchema.map((field) => [
        field.id,
        field.defaultValue ??
          (field.type === "number"
            ? 1
            : field.type === "url"
              ? "https://example.com/input"
              : field.type === "select"
                ? field.options?.[0]?.value ?? "default"
                : "placeholder"),
      ]),
    )

    assert.doesNotThrow(() => validateAndNormalizeModelInput(model, defaults))
  }
})

test("every provider in the registry resolves to an adapter", () => {
  for (const model of listModels()) {
    assert.ok(getProviderAdapter(model.provider), `missing provider adapter for ${model.provider}`)
  }
})

test("shared MiniMax provider selects the adapter by model capability", () => {
  const audioAdapter = getProviderAdapter("minimax", "audio.generate")
  const videoAdapter = getProviderAdapter("minimax", "video.text_to_video")

  assert.equal(audioAdapter?.capabilities?.includes("audio.generate"), true)
  assert.equal(videoAdapter?.capabilities?.includes("video.text_to_video"), true)
  assert.notEqual(audioAdapter, videoAdapter)
})

test("validateAndNormalizeModelInput drops unsupported parameters", () => {
  const model = getModelDefinition("minimax:video:text-to-video:MiniMax-Hailuo-2.3")
  assert.ok(model)

  const normalized = validateAndNormalizeModelInput(model!, {
    prompt: "Launch film",
    resolution: "1080P",
    duration: "10",
    unknownField: "should-be-dropped",
  })

  assert.equal("unknownField" in normalized, false)
  assert.equal(normalized.resolution, "1080P")
})

test("model registry exposes RunningHub seedance mini video models", () => {
  const textModel = getModelDefinition("runninghub:video:seedance-mini-text-to-video")
  const imageModel = getModelDefinition("runninghub:video:seedance-mini-image-to-video")

  assert.equal(textModel?.provider, "runninghub")
  assert.equal(textModel?.capability, "video.text_to_video")
  assert.equal(textModel?.providerMetadata?.nativeModel, "seedance-mini-text-to-video")

  assert.equal(imageModel?.provider, "runninghub")
  assert.equal(imageModel?.capability, "video.image_to_video")
  assert.equal(imageModel?.providerMetadata?.nativeModel, "seedance-mini-image-to-video")
})

test("OpenAI image model and adapter are opt-in behind the workflow feature flag", async () => {
  const previous = process.env.WORKFLOW_OPENAI_IMAGE_ADAPTER_V1
  try {
    delete process.env.WORKFLOW_OPENAI_IMAGE_ADAPTER_V1
    assert.equal(getModelDefinition("openai:image:gpt-image-2"), null)
    assert.equal(
      getProviderAdapter("openai_compatible", "image.text_to_image"),
      null,
    )

    process.env.WORKFLOW_OPENAI_IMAGE_ADAPTER_V1 = "1"
    assert.equal(getModelDefinition("openai:image:gpt-image-2")?.id, "openai:image:gpt-image-2")
    assert.ok(getProviderAdapter("openai_compatible", "image.text_to_image"))
  } finally {
    if (previous === undefined) delete process.env.WORKFLOW_OPENAI_IMAGE_ADAPTER_V1
    else process.env.WORKFLOW_OPENAI_IMAGE_ADAPTER_V1 = previous
  }
})

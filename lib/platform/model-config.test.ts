import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDefaultEnterpriseModelConfiguration,
  getSupportedModelCards,
  mergeEnterpriseModelConfigurationSecrets,
  normalizeEnterpriseModelConfiguration,
  redactEnterpriseModelConfigurationSecrets,
} from "@/lib/platform/model-config"

test("default enterprise model configuration covers text image and video categories", () => {
  const config = buildDefaultEnterpriseModelConfiguration()
  assert.equal(config.text_generation.selectedProviderId, "openai_compatible")
  assert.equal(config.image_generation.selectedProviderId, "openai_official")
  assert.equal(config.video_generation.selectedProviderId, "runninghub")
  assert.equal(config.text_generation.providers.length > 0, true)
  assert.equal(config.image_generation.providers.length > 0, true)
  assert.equal(config.video_generation.providers.length > 0, true)
})

test("normalizeEnterpriseModelConfiguration trims values and falls back to allowed providers", () => {
  const normalized = normalizeEnterpriseModelConfiguration({
    text_generation: {
      selectedProviderId: "qwen_official",
      selectedModelId: "  qwen-max  ",
      providers: [
        {
          providerId: "qwen_official",
          label: "  Qwen Official  ",
          modelId: "  qwen-max  ",
          baseUrl: " https://dashscope.aliyuncs.com/compatible-mode/v1 ",
          apiKey: "  secret  ",
          enabled: true,
        },
      ],
    },
  })

  assert.equal(normalized.text_generation.selectedProviderId, "qwen_official")
  assert.equal(normalized.text_generation.selectedModelId, "qwen-max")
  assert.equal(normalized.text_generation.providers.find((item) => item.providerId === "qwen_official")?.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1")
  assert.equal(normalized.text_generation.providers.find((item) => item.providerId === "qwen_official")?.apiKey, "secret")
  assert.equal(normalized.image_generation.selectedProviderId, "openai_official")
})

test("supported model cards expose requested provider families", () => {
  const textCards = getSupportedModelCards("text_generation")
  const imageCards = getSupportedModelCards("image_generation")
  const videoCards = getSupportedModelCards("video_generation")

  assert.equal(textCards.some((item) => item.providerId === "openai_compatible"), true)
  assert.equal(textCards.some((item) => item.providerId === "qwen_official"), true)
  assert.equal(imageCards.some((item) => item.models.includes("Nanobanana2")), true)
  assert.equal(imageCards.some((item) => item.models.includes("gpt-image-2")), true)
  assert.equal(videoCards.some((item) => item.models.includes("Veo 3.1")), true)
  assert.equal(videoCards.some((item) => item.providerId === "runninghub"), true)
})

test("mergeEnterpriseModelConfigurationSecrets keeps existing api key when incoming value is blank", () => {
  const existing = buildDefaultEnterpriseModelConfiguration()
  existing.text_generation.providers[0] = {
    ...existing.text_generation.providers[0],
    apiKey: "secret-existing",
    apiKeyConfigured: true,
  }

  const incoming = buildDefaultEnterpriseModelConfiguration()
  incoming.text_generation.providers[0] = {
    ...incoming.text_generation.providers[0],
    label: "Updated Label",
    apiKey: null,
    apiKeyConfigured: false,
  }

  const merged = mergeEnterpriseModelConfigurationSecrets({ existing, incoming })
  assert.equal(merged.text_generation.providers[0].apiKey, "secret-existing")
  assert.equal(merged.text_generation.providers[0].apiKeyConfigured, true)
  assert.equal(merged.text_generation.providers[0].label, "Updated Label")
})

test("redactEnterpriseModelConfigurationSecrets removes api key while preserving configured state", () => {
  const config = buildDefaultEnterpriseModelConfiguration()
  config.video_generation.providers[0] = {
    ...config.video_generation.providers[0],
    apiKey: "secret-video",
    apiKeyConfigured: true,
  }

  const redacted = redactEnterpriseModelConfigurationSecrets(config)
  assert.equal(redacted.video_generation.providers[0].apiKey, null)
  assert.equal(redacted.video_generation.providers[0].apiKeyConfigured, true)
})

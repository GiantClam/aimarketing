import assert from "node:assert/strict"
import test from "node:test"

import {
  buildRunningHubImageRouteId,
  buildDefaultEnterpriseModelConfiguration,
  getDefaultRunningHubImageRoute,
  getSupportedModelCards,
  mergeEnterpriseModelConfigurationSecrets,
  normalizeEnterpriseModelConfiguration,
  redactEnterpriseModelConfigurationSecrets,
  validateEnterpriseModelConfiguration,
} from "@/lib/platform/model-config"

test("default enterprise model configuration covers text image video and audio categories", () => {
  const config = buildDefaultEnterpriseModelConfiguration()
  assert.equal(config.text_generation.selectedProviderId, "openai_compatible")
  assert.equal(config.image_generation.selectedProviderId, "runninghub")
  assert.equal(config.video_generation.selectedProviderId, "minimax_official")
  assert.equal(config.audio_generation.selectedProviderId, "minimax_official")
  assert.equal(config.text_generation.providers.length > 0, true)
  assert.equal(config.image_generation.providers.length > 0, true)
  assert.equal(config.video_generation.providers.length > 0, true)
  assert.equal(config.audio_generation.providers.length > 0, true)
  assert.equal(config.image_generation.defaultTxt2imgRouteId, buildRunningHubImageRouteId("txt2img"))
  assert.equal(config.image_generation.defaultImg2imgRouteId, buildRunningHubImageRouteId("img2img"))
  assert.deepEqual(config.text_generation.providers[0].assignedUserIds, [])
  assert.deepEqual(config.text_generation.routeAssignments, [])
  assert.equal(
    config.image_generation.providers.find((item) => item.providerId === "runninghub")?.routes?.length,
    2,
  )
  const runningHubProvider = config.image_generation.providers.find((item) => item.providerId === "runninghub")
  const txt2img = runningHubProvider?.routes?.find((route) => route.mode === "txt2img")
  const img2img = runningHubProvider?.routes?.find((route) => route.mode === "img2img")
  assert.equal(txt2img?.modelId, "seedream-v5-text-to-image")
  assert.equal(txt2img?.endpoint, "/openapi/v2/seedream-v5-lite/text-to-image")
  assert.equal(img2img?.modelId, "seedream-v5-image-to-image")
  assert.equal(img2img?.endpoint, "/openapi/v2/seedream-v5-lite/image-to-image")
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
  assert.deepEqual(normalized.text_generation.providers.find((item) => item.providerId === "qwen_official")?.assignedUserIds, [])
  assert.deepEqual(normalized.text_generation.routeAssignments, [])
  assert.equal(normalized.image_generation.selectedProviderId, "runninghub")
  assert.equal(normalized.audio_generation.selectedProviderId, "minimax_official")
})

test("normalizeEnterpriseModelConfiguration backfills runninghub image routes for legacy provider configs", () => {
  const normalized = normalizeEnterpriseModelConfiguration({
    image_generation: {
      selectedProviderId: "runninghub",
      providers: [
        {
          providerId: "runninghub",
          label: "RunningHub",
          modelId: "legacy-runninghub-model",
          enabled: true,
        },
      ],
    },
  })

  const provider = normalized.image_generation.providers.find((item) => item.providerId === "runninghub")
  assert.equal(provider?.routes?.length, 2)
  assert.equal(provider?.routes?.[0].modelId, "legacy-runninghub-model")
  assert.equal(provider?.routes?.[1].modelId, "legacy-runninghub-model")
  assert.equal(normalized.image_generation.defaultTxt2imgRouteId, buildRunningHubImageRouteId("txt2img"))
  assert.equal(normalized.image_generation.defaultImg2imgRouteId, buildRunningHubImageRouteId("img2img"))
})

test("normalizeEnterpriseModelConfiguration keeps runninghub route fields and mode-specific defaults", () => {
  const normalized = normalizeEnterpriseModelConfiguration({
    image_generation: {
      selectedProviderId: "runninghub",
      defaultTxt2imgRouteId: "enterprise-txt2img",
      defaultImg2imgRouteId: "enterprise-img2img",
      providers: [
        {
          providerId: "runninghub",
          routes: [
            {
              routeId: "enterprise-txt2img",
              mode: "txt2img",
              label: "  Brand poster  ",
              endpoint: " /txt2img ",
              modelId: " workflow-a ",
              enabled: true,
            },
            {
              routeId: "enterprise-img2img",
              mode: "img2img",
              label: "  Product retouch  ",
              endpoint: " /img2img ",
              modelId: " workflow-b ",
              enabled: false,
            },
          ],
        },
      ],
    },
  })

  const txt2img = getDefaultRunningHubImageRoute(normalized.image_generation, "txt2img")
  const img2img = getDefaultRunningHubImageRoute(normalized.image_generation, "img2img")
  assert.equal(txt2img?.label, "Brand poster")
  assert.equal(txt2img?.endpoint, "/txt2img")
  assert.equal(txt2img?.modelId, "workflow-a")
  assert.equal(img2img?.label, "Product retouch")
  assert.equal(img2img?.endpoint, "/img2img")
  assert.equal(img2img?.modelId, "workflow-b")
  assert.equal(img2img?.enabled, false)
})

test("normalizeEnterpriseModelConfiguration keeps unique positive assigned user ids", () => {
  const normalized = normalizeEnterpriseModelConfiguration({
    text_generation: {
      selectedProviderId: "qwen_official",
      providers: [
        {
          providerId: "qwen_official",
          assignedUserIds: [12, "12", 18, 0, -2, "x"],
        },
      ],
    },
  })

  assert.deepEqual(
    normalized.text_generation.providers.find((item) => item.providerId === "qwen_official")?.assignedUserIds,
    [12, 18],
  )
})

test("normalizeEnterpriseModelConfiguration keeps unique route assignments for system providers", () => {
  const normalized = normalizeEnterpriseModelConfiguration({
    image_generation: {
      routeAssignments: [
        { routeId: " pptoken ", assignedUserIds: [2, "2", 5] },
        { routeId: "pptoken", assignedUserIds: [8] },
        { routeId: "runninghub-image", assignedUserIds: [11] },
      ],
    },
  })

  assert.deepEqual(normalized.image_generation.routeAssignments, [
    {
      routeId: "pptoken",
      assignedUserIds: [8],
    },
    {
      routeId: "runninghub-image",
      assignedUserIds: [11],
    },
  ])
})

test("supported model cards expose requested provider families", () => {
  const textCards = getSupportedModelCards("text_generation")
  const imageCards = getSupportedModelCards("image_generation")
  const videoCards = getSupportedModelCards("video_generation")
  const audioCards = getSupportedModelCards("audio_generation")

  assert.equal(textCards.some((item) => item.providerId === "openai_compatible"), true)
  assert.equal(textCards.some((item) => item.providerId === "qwen_official"), true)
  assert.equal(imageCards.some((item) => item.models.includes("Nanobanana2")), true)
  assert.equal(imageCards.some((item) => item.models.includes("gpt-image-2")), true)
  assert.equal(imageCards.some((item) => item.providerId === "runninghub"), true)
  assert.equal(imageCards.some((item) => item.models.includes("seedream-v5-image-to-image")), true)
  assert.equal(videoCards.some((item) => item.models.includes("Veo 3.1")), true)
  assert.equal(videoCards.some((item) => item.providerId === "runninghub"), true)
  assert.equal(audioCards.some((item) => item.models.includes("speech-2.8")), true)
  assert.equal(audioCards.some((item) => item.providerId === "minimax_official"), true)
})

test("mergeEnterpriseModelConfigurationSecrets keeps existing api key when incoming value is blank", () => {
  const existing = buildDefaultEnterpriseModelConfiguration()
  existing.text_generation.providers[0] = {
    ...existing.text_generation.providers[0],
    apiKey: "secret-existing",
    apiKeyConfigured: true,
    assignedUserIds: [7, 9],
  }

  const incoming = buildDefaultEnterpriseModelConfiguration()
  incoming.text_generation.providers[0] = {
    ...incoming.text_generation.providers[0],
    label: "Updated Label",
    apiKey: null,
    apiKeyConfigured: false,
    assignedUserIds: [18],
  }
  incoming.text_generation.routeAssignments = [
    {
      routeId: "pptoken",
      assignedUserIds: [22],
    },
  ]

  const merged = mergeEnterpriseModelConfigurationSecrets({ existing, incoming })
  assert.equal(merged.text_generation.providers[0].apiKey, "secret-existing")
  assert.equal(merged.text_generation.providers[0].apiKeyConfigured, true)
  assert.equal(merged.text_generation.providers[0].label, "Updated Label")
  assert.deepEqual(merged.text_generation.providers[0].assignedUserIds, [18])
  assert.deepEqual(merged.text_generation.routeAssignments, [
    {
      routeId: "pptoken",
      assignedUserIds: [22],
    },
  ])
})

test("mergeEnterpriseModelConfigurationSecrets preserves runninghub route definitions", () => {
  const existing = buildDefaultEnterpriseModelConfiguration()
  const incoming = buildDefaultEnterpriseModelConfiguration()
  const provider = incoming.image_generation.providers.find((item) => item.providerId === "runninghub")
  if (!provider?.routes) throw new Error("runninghub routes missing in defaults")
  provider.routes[0] = {
    ...provider.routes[0],
    label: "Campaign txt2img",
    endpoint: "/txt2img",
    modelId: "workflow-a",
  }

  const merged = mergeEnterpriseModelConfigurationSecrets({ existing, incoming })
  const mergedProvider = merged.image_generation.providers.find((item) => item.providerId === "runninghub")
  assert.equal(mergedProvider?.routes?.[0].label, "Campaign txt2img")
  assert.equal(mergedProvider?.routes?.[0].endpoint, "/txt2img")
  assert.equal(mergedProvider?.routes?.[0].modelId, "workflow-a")
})

test("mergeEnterpriseModelConfigurationSecrets clears existing api key when requested", () => {
  const existing = buildDefaultEnterpriseModelConfiguration()
  existing.text_generation.providers[0] = {
    ...existing.text_generation.providers[0],
    apiKey: "secret-existing",
    apiKeyConfigured: true,
  }

  const incoming = buildDefaultEnterpriseModelConfiguration()
  incoming.text_generation.providers[0] = {
    ...incoming.text_generation.providers[0],
    apiKey: null,
    apiKeyConfigured: false,
    clearApiKey: true,
  }

  const merged = mergeEnterpriseModelConfigurationSecrets({ existing, incoming })
  assert.equal(merged.text_generation.providers[0].apiKey, null)
  assert.equal(merged.text_generation.providers[0].apiKeyConfigured, false)
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
  assert.deepEqual(redacted.video_generation.providers[0].assignedUserIds, [])
  assert.deepEqual(redacted.video_generation.routeAssignments, [])
  assert.equal(
    redacted.image_generation.providers.find((item) => item.providerId === "runninghub")?.routes?.length,
    2,
  )
})

test("validateEnterpriseModelConfiguration requires base url for selected OpenAI compatible providers", () => {
  const config = buildDefaultEnterpriseModelConfiguration()
  config.text_generation.selectedProviderId = "openai_compatible"
  config.text_generation.providers[0] = {
    ...config.text_generation.providers[0],
    modelId: "gpt-4.1-mini",
    baseUrl: null,
  }

  assert.throws(
    () => validateEnterpriseModelConfiguration(config),
    /base_url_required:text_generation:openai_compatible/,
  )

  config.text_generation.providers[0] = {
    ...config.text_generation.providers[0],
    baseUrl: "https://openrouter.ai/api/v1",
  }

  assert.doesNotThrow(() => validateEnterpriseModelConfiguration(config))
})

test("validateEnterpriseModelConfiguration requires runninghub image defaults when runninghub is selected", () => {
  const config = buildDefaultEnterpriseModelConfiguration()
  config.text_generation.providers[0] = {
    ...config.text_generation.providers[0],
    baseUrl: "https://openrouter.ai/api/v1",
  }
  config.image_generation.selectedProviderId = "runninghub"
  const runningHubProvider = config.image_generation.providers.find((item) => item.providerId === "runninghub")
  if (!runningHubProvider?.routes) throw new Error("runninghub routes missing in defaults")
  runningHubProvider.routes = runningHubProvider.routes.filter((route) => route.mode !== "txt2img")

  assert.throws(
    () => validateEnterpriseModelConfiguration(config),
    /runninghub_default_txt2img_route_required/,
  )
})

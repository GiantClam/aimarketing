import type { WorkflowCapabilityInvokeParams } from "@/lib/workflows/node-executors"
import { normalizeWorkflowImageConfig } from "@/lib/image-assistant/model-options"
import type {
  ImageAssistantResolution,
  ImageAssistantSizePreset,
  ImageAssistantUsagePresetId,
} from "@/lib/image-assistant/types"
import { buildGovernedImageAssistantModelOptionId } from "@/lib/platform/governed-image-model-option-id"
import {
  isEmbeddableWorkflowImagePromptUrl,
  resolveWorkflowImagePromptRuntimeReferences,
} from "@/lib/workflows/image-prompt-references"

const MAX_WORKFLOW_IMAGE_PROMPT_LENGTH = 2000

function boundWorkflowImagePrompt(prompt: string) {
  const normalized = prompt.trim()
  if (normalized.length <= MAX_WORKFLOW_IMAGE_PROMPT_LENGTH) return normalized
  return `${normalized.slice(0, MAX_WORKFLOW_IMAGE_PROMPT_LENGTH - 3).trimEnd()}...`
}

function extractWorkflowImageAssistantReferenceId(item: WorkflowCapabilityInvokeParams["input"]["image"][number]) {
  if (typeof item.assetId === "string" && item.assetId.trim()) {
    return item.assetId.trim()
  }

  if (typeof item.title === "string" && /^\d+$/.test(item.title.trim())) {
    return item.title.trim()
  }

  return null
}

function inferOrientationFromImageSize(size: string) {
  const normalized = size.trim().toLowerCase()
  if (normalized === "auto") return "landscape"
  const matched = normalized.match(/^(\d{2,4})x(\d{2,4})$/u)
  if (!matched) return "landscape"
  const width = Number.parseInt(matched[1], 10)
  const height = Number.parseInt(matched[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "landscape"
  if (width === height) return ""
  return width > height ? "landscape" : "portrait"
}

function inferSizePresetFromImageSize(size: string): ImageAssistantSizePreset | "" {
  const normalized = size.trim().toLowerCase()
  const matched = normalized.match(/^(\d{2,4})x(\d{2,4})$/u)
  if (!matched) return ""

  const width = Number.parseInt(matched[1], 10)
  const height = Number.parseInt(matched[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return ""

  if (width === height) return "1:1"
  const ratio = width / height
  const candidates: Array<{ preset: ImageAssistantSizePreset; ratio: number }> = [
    { preset: "16:9", ratio: 16 / 9 },
    { preset: "9:16", ratio: 9 / 16 },
    { preset: "4:5", ratio: 4 / 5 },
    { preset: "3:4", ratio: 3 / 4 },
    { preset: "4:3", ratio: 4 / 3 },
  ]

  let best: ImageAssistantSizePreset | "" = ""
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.ratio - ratio)
    if (distance < bestDistance) {
      best = candidate.preset
      bestDistance = distance
    }
  }

  return best
}

function inferResolutionFromImageSize(size: string): ImageAssistantResolution | "" {
  const normalized = size.trim().toLowerCase()
  const matched = normalized.match(/^(\d{2,4})x(\d{2,4})$/u)
  if (!matched) return ""
  const width = Number.parseInt(matched[1], 10)
  const height = Number.parseInt(matched[2], 10)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return ""

  const longestEdge = Math.max(width, height)
  if (longestEdge >= 3000) return "4K"
  if (longestEdge >= 1500) return "2K"
  if (longestEdge >= 1024) return "1K"
  return "512"
}

function inferWorkflowUsagePreset(sizePreset: ImageAssistantSizePreset): ImageAssistantUsagePresetId {
  if (sizePreset === "16:9") return "website_banner"
  if (sizePreset === "4:5" || sizePreset === "3:4" || sizePreset === "9:16") return "social_cover"
  if (sizePreset === "1:1") return "avatar"
  return "ad_poster"
}

function getWorkflowUsageLabel(usagePreset: ImageAssistantUsagePresetId, locale: "zh" | "en") {
  if (locale === "zh") {
    if (usagePreset === "website_banner") return "官网横幅 16:9"
    if (usagePreset === "social_cover") return "社媒封面"
    if (usagePreset === "avatar") return "头像图片 1:1"
    return "广告海报"
  }

  if (usagePreset === "website_banner") return "Website banner 16:9"
  if (usagePreset === "social_cover") return "Social cover"
  if (usagePreset === "avatar") return "Avatar image 1:1"
  return "Ad poster"
}

function buildDefaultImageComposition(size: string, locale: "zh" | "en") {
  if (locale === "zh") {
    return `按 ${size} 规格组织画面，主体明确，保留自然留白，整体适合直接生成成品图。`
  }

  return `Use a ${size} composition with a clear focal subject, clean negative space, and production-ready framing.`
}

function buildDefaultImageStyle(locale: "zh" | "en") {
  if (locale === "zh") {
    return "商业级质感，主体明确，画面干净，高质量光影与细节，直接可用于正式视觉产出。"
  }

  return "Commercial-grade visual quality, clear focal subject, clean composition, and polished lighting and detail."
}

export function buildWorkflowImageAssistantReferenceAssetIds(input: WorkflowCapabilityInvokeParams["input"]) {
  const collected = new Set<string>()

  for (const item of input.image) {
    const referenceId = extractWorkflowImageAssistantReferenceId(item)
    if (referenceId) collected.add(referenceId)
  }

  return [...collected]
}

export function buildWorkflowImageAssistantReferenceUrls(
  params: Pick<WorkflowCapabilityInvokeParams, "node" | "input">,
  prompt: string,
  locale: "zh" | "en",
) {
  const fallbackUrls = [
    ...new Set(
      params.input.image
        .filter((item) => !extractWorkflowImageAssistantReferenceId(item))
        .map((item) => item.url?.trim() || "")
        .filter((url) => isEmbeddableWorkflowImagePromptUrl(url)),
    ),
  ]
  const resolved = resolveWorkflowImagePromptRuntimeReferences({
    prompt,
    references: params.node.config.imagePromptReferences,
    inputImages: params.input.image,
    locale,
  })

  if (resolved.referenceUrls.length > 0) {
    return resolved.referenceUrls.filter((url) => fallbackUrls.includes(url))
  }

  return fallbackUrls
}

export function buildWorkflowImageGenerateRequestBody(
  params: WorkflowCapabilityInvokeParams,
  prompt: string,
  locale: "zh" | "en",
) {
  const normalizedConfig = normalizeWorkflowImageConfig(params.node.config)
  const selectedProviderId =
    typeof params.node.config.selectedProviderId === "string" ? params.node.config.selectedProviderId.trim() : ""
  const selectedModelId =
    typeof params.node.config.selectedModelId === "string" ? params.node.config.selectedModelId.trim() : ""
  const selectedModelOptionId =
    (typeof params.node.config.selectedModelOptionId === "string" && params.node.config.selectedModelOptionId.trim()
      ? params.node.config.selectedModelOptionId.trim()
      : null) ||
    (selectedProviderId && selectedModelId && selectedProviderId !== "runninghub"
      ? buildGovernedImageAssistantModelOptionId({
          providerId: selectedProviderId,
          modelId: selectedModelId,
        })
      : null)
  const referenceAssetIds = buildWorkflowImageAssistantReferenceAssetIds(params.input)
  const resolvedReferences = resolveWorkflowImagePromptRuntimeReferences({
    prompt,
    references: params.node.config.imagePromptReferences,
    inputImages: params.input.image,
    locale,
  })
  const inferredSizePreset = normalizedConfig.sizePreset || inferSizePresetFromImageSize(normalizedConfig.imageSize) || "1:1"
  const inferredResolution = normalizedConfig.resolution || inferResolutionFromImageSize(normalizedConfig.imageSize) || "2K"
  const usagePreset = inferWorkflowUsagePreset(inferredSizePreset)
  const boundedPrompt = boundWorkflowImagePrompt(resolvedReferences.prompt)

  return {
    prompt: boundedPrompt,
    preferAsync: true,
    invocationMode: "workflow_runtime",
    modelOptionId: selectedModelOptionId,
    providerLock: normalizedConfig.providerLock,
    model: normalizedConfig.modelId,
    candidateCount: 1,
    sizePreset: inferredSizePreset,
    resolution: inferredResolution,
    imageSize: normalizedConfig.imageSize,
    imageQuality: normalizedConfig.imageQuality,
    imageBackground: normalizedConfig.imageBackground,
    imageOutputFormat: normalizedConfig.imageOutputFormat,
    imageOutputCompression: normalizedConfig.imageOutputCompression,
    imageModeration: normalizedConfig.imageModeration,
    imageResponseFormat: "url",
    referenceAssetIds,
    referenceUrls:
      referenceAssetIds.length === 0 && resolvedReferences.referenceUrls.length > 0
        ? resolvedReferences.referenceUrls
        : buildWorkflowImageAssistantReferenceUrls(params, prompt, locale),
    brief: {
      goal: boundedPrompt,
      subject: boundedPrompt,
      style: buildDefaultImageStyle(locale),
      composition: buildDefaultImageComposition(normalizedConfig.imageSize, locale),
      constraints: "",
      orientation: inferOrientationFromImageSize(normalizedConfig.imageSize),
      size_preset: inferredSizePreset,
      resolution: inferredResolution,
      usage_preset: usagePreset,
      usage_label: getWorkflowUsageLabel(usagePreset, locale),
      ratio_confirmed: true,
    },
  }
}

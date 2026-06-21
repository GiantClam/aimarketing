import type { WorkflowCapabilityInvokeParams } from "@/lib/workflows/node-executors"
import { normalizeWorkflowImageConfig } from "@/lib/image-assistant/model-options"
import { buildGovernedImageAssistantModelOptionId } from "@/lib/platform/governed-image-model-option-id"
import {
  isEmbeddableWorkflowImagePromptUrl,
  resolveWorkflowImagePromptRuntimeReferences,
} from "@/lib/workflows/image-prompt-references"

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

  return {
    prompt: resolvedReferences.prompt,
    preferAsync: true,
    modelOptionId: selectedModelOptionId,
    providerLock: normalizedConfig.providerLock,
    model: normalizedConfig.modelId,
    candidateCount: 1,
    sizePreset: normalizedConfig.sizePreset,
    resolution: normalizedConfig.resolution,
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
      goal: resolvedReferences.prompt,
      subject: resolvedReferences.prompt,
      style: buildDefaultImageStyle(locale),
      composition: buildDefaultImageComposition(normalizedConfig.imageSize, locale),
      constraints: "",
      orientation: inferOrientationFromImageSize(normalizedConfig.imageSize),
      size_preset: normalizedConfig.sizePreset || "",
      resolution: normalizedConfig.resolution || "",
      usage_preset: "workflow_node",
      usage_label: locale === "zh" ? "工作流节点生成" : "Workflow node generation",
      ratio_confirmed: true,
    },
  }
}

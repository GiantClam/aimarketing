import type { WorkflowCapabilityInvokeParams } from "@/lib/workflows/node-executors"
import {
  isEmbeddableWorkflowImagePromptUrl,
  resolveWorkflowImagePromptRuntimeReferences,
} from "@/lib/workflows/image-prompt-references"

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
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

function inferOrientationFromSizePreset(sizePreset: string | null) {
  if (sizePreset === "9:16") return "portrait"
  if (sizePreset === "1:1") return "square"
  return "landscape"
}

function buildDefaultImageComposition(sizePreset: string | null, locale: "zh" | "en") {
  const preset = sizePreset || "16:9"
  if (locale === "zh") {
    return `按 ${preset} 画幅组织画面，主体明确，保留自然留白，整体适合直接生成成品图。`
  }

  return `Use a ${preset} composition with a clear focal subject, clean negative space, and production-ready framing.`
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
  const sizePreset = normalizeOptionalText(params.node.config.sizePreset) || "16:9"
  const resolution = normalizeOptionalText(params.node.config.resolution) || "512"
  const referenceAssetIds = buildWorkflowImageAssistantReferenceAssetIds(params.input)
  const resolvedReferences = resolveWorkflowImagePromptRuntimeReferences({
    prompt,
    references: params.node.config.imagePromptReferences,
    inputImages: params.input.image,
  })

  return {
    prompt: resolvedReferences.prompt,
    preferAsync: true,
    providerLock: null,
    sizePreset,
    resolution,
    candidateCount: 1,
    referenceAssetIds,
    referenceUrls:
      referenceAssetIds.length === 0 && resolvedReferences.referenceUrls.length > 0
        ? resolvedReferences.referenceUrls
        : buildWorkflowImageAssistantReferenceUrls(params, prompt),
    brief: {
      goal: resolvedReferences.prompt,
      subject: resolvedReferences.prompt,
      style: buildDefaultImageStyle(locale),
      composition: buildDefaultImageComposition(sizePreset, locale),
      constraints: "",
      orientation: inferOrientationFromSizePreset(sizePreset),
      size_preset: sizePreset,
      resolution,
      usage_preset: "workflow_node",
      usage_label: locale === "zh" ? "工作流节点生成" : "Workflow node generation",
      ratio_confirmed: true,
    },
  }
}

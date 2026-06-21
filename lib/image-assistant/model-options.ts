import type { ImageAssistantResolution, ImageAssistantSizePreset } from "@/lib/image-assistant/types"

export type WorkflowImageProviderId = "pptoken" | "aiberm" | "crazyroute"
export type WorkflowImageModelKind = "gpt-image-2" | "unknown"
export type GptImage2Quality = "auto" | "low" | "medium" | "high"
export type GptImage2Background = "auto" | "transparent" | "opaque"
export type GptImage2OutputFormat = "png" | "jpeg" | "webp"
export type GptImage2Moderation = "auto" | "low"
export type GptImage2ResponseFormat = "b64_json" | "url"

export type NormalizedWorkflowImageConfig = {
  providerLock: WorkflowImageProviderId | null
  modelId: string
  modelKind: WorkflowImageModelKind
  candidateCount: number
  sizePreset: ImageAssistantSizePreset | null
  resolution: ImageAssistantResolution | null
  imageSize: string
  imageQuality: GptImage2Quality
  imageBackground: GptImage2Background
  imageOutputFormat: GptImage2OutputFormat
  imageOutputCompression: number | null
  imageModeration: GptImage2Moderation
  imageResponseFormat: GptImage2ResponseFormat
}

export type WorkflowImageModelOption = {
  modelId: string
  label: string
}

export type WorkflowImageProviderOption = {
  providerId: WorkflowImageProviderId
  label: string
  models: WorkflowImageModelOption[]
}

const DEFAULT_GPT_IMAGE_2_MODEL = "gpt-image-2"
const DEFAULT_GPT_IMAGE_2_SIZE = "1024x1024"
const DEFAULT_GPT_IMAGE_2_QUALITY: GptImage2Quality = "auto"
const DEFAULT_GPT_IMAGE_2_BACKGROUND: GptImage2Background = "auto"
const DEFAULT_GPT_IMAGE_2_OUTPUT_FORMAT: GptImage2OutputFormat = "png"
const DEFAULT_GPT_IMAGE_2_MODERATION: GptImage2Moderation = "auto"
const DEFAULT_GPT_IMAGE_2_RESPONSE_FORMAT: GptImage2ResponseFormat = "url"
const MAX_GPT_IMAGE_2_CANDIDATES = 10
const SIZE_PRESETS = new Set<ImageAssistantSizePreset>(["1:1", "4:5", "3:4", "4:3", "16:9", "9:16"])
const GPT_IMAGE_2_STANDARD_SIZES = new Set(["auto", "1024x1024", "1536x1024", "1024x1536"])

const WORKFLOW_IMAGE_PROVIDER_OPTIONS: WorkflowImageProviderOption[] = [
  {
    providerId: "pptoken",
    label: "PPTOKEN",
    models: [{ modelId: DEFAULT_GPT_IMAGE_2_MODEL, label: DEFAULT_GPT_IMAGE_2_MODEL }],
  },
  {
    providerId: "aiberm",
    label: "Aiberm",
    models: [{ modelId: DEFAULT_GPT_IMAGE_2_MODEL, label: DEFAULT_GPT_IMAGE_2_MODEL }],
  },
  {
    providerId: "crazyroute",
    label: "CrazyRouter",
    models: [{ modelId: DEFAULT_GPT_IMAGE_2_MODEL, label: DEFAULT_GPT_IMAGE_2_MODEL }],
  },
]

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

function parseInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function resolveWorkflowImageProviderLock(value: unknown): WorkflowImageProviderId | null {
  const normalized = normalizeOptionalText(value)
  if (normalized === "pptoken" || normalized === "aiberm" || normalized === "crazyroute") {
    return normalized
  }
  return null
}

export function normalizeWorkflowImageModelId(value: unknown) {
  return normalizeOptionalText(value) || DEFAULT_GPT_IMAGE_2_MODEL
}

export function resolveWorkflowImageModelKind(value: unknown): WorkflowImageModelKind {
  const normalized = normalizeWorkflowImageModelId(value).toLowerCase()
  if (normalized === "gpt-image-2" || normalized.endsWith("/gpt-image-2")) {
    return "gpt-image-2"
  }
  return "unknown"
}

export function normalizeWorkflowImageCandidateCount(value: unknown) {
  const parsed = parseInteger(value)
  if (!parsed) return 1
  return Math.max(1, Math.min(MAX_GPT_IMAGE_2_CANDIDATES, parsed))
}

export function normalizeIncomingSizePreset(value: unknown): ImageAssistantSizePreset | null {
  return SIZE_PRESETS.has(value as ImageAssistantSizePreset) ? (value as ImageAssistantSizePreset) : null
}

export function normalizeIncomingResolution(value: unknown): ImageAssistantResolution | null {
  return value === "512" || value === "1K" || value === "2K" || value === "4K" ? value : null
}

export function mapGptImage2Size(
  sizePreset?: ImageAssistantSizePreset | null,
  resolution?: ImageAssistantResolution | null,
) {
  const preset = sizePreset || "1:1"
  const tier = resolution || "2K"

  if (preset === "1:1") {
    if (tier === "4K") return "4096x4096"
    if (tier === "2K") return "2048x2048"
    return "1024x1024"
  }
  if (preset === "4:5") return tier === "4K" ? "2048x2560" : "1024x1280"
  if (preset === "3:4") return tier === "4K" ? "2048x3072" : "1024x1536"
  if (preset === "4:3") return tier === "4K" ? "3072x2048" : "1536x1024"
  if (preset === "16:9") return tier === "4K" ? "3840x2160" : "2048x1152"
  if (preset === "9:16") return tier === "4K" ? "2160x3840" : "1152x2048"
  return DEFAULT_GPT_IMAGE_2_SIZE
}

export function mapGptImage2Quality(resolution?: ImageAssistantResolution | null): Exclude<GptImage2Quality, "auto"> {
  if (resolution === "512") return "low"
  if (resolution === "4K") return "high"
  return "medium"
}

export function normalizeGptImage2BillingQuality(value: GptImage2Quality): Exclude<GptImage2Quality, "auto"> {
  return value === "auto" ? "medium" : value
}

function normalizeCustomGptImage2Size(value: string) {
  const normalized = value.toLowerCase()
  if (!/^\d{2,4}x\d{2,4}$/u.test(normalized)) return null
  const [widthRaw, heightRaw] = normalized.split("x")
  const width = Number.parseInt(widthRaw, 10)
  const height = Number.parseInt(heightRaw, 10)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  if (width % 16 !== 0 || height % 16 !== 0) return null
  if (width > 3840 || height > 2160) return null
  const ratio = width / height
  if (ratio < 1 / 3 || ratio > 3) return null
  return `${width}x${height}`
}

export function normalizeGptImage2Size(
  value: unknown,
) {
  const normalized = normalizeOptionalText(value)?.toLowerCase() || ""
  if (GPT_IMAGE_2_STANDARD_SIZES.has(normalized)) return normalized
  const custom = normalizeCustomGptImage2Size(normalized)
  if (custom) return custom
  return DEFAULT_GPT_IMAGE_2_SIZE
}

export function normalizeGptImage2Quality(
  value: unknown,
): GptImage2Quality {
  if (value === "auto" || value === "low" || value === "medium" || value === "high") {
    return value
  }
  return DEFAULT_GPT_IMAGE_2_QUALITY
}

export function normalizeGptImage2Background(value: unknown): GptImage2Background {
  return value === "transparent" || value === "opaque" || value === "auto"
    ? value
    : DEFAULT_GPT_IMAGE_2_BACKGROUND
}

export function normalizeGptImage2OutputFormat(value: unknown): GptImage2OutputFormat {
  return value === "jpeg" || value === "webp" || value === "png" ? value : DEFAULT_GPT_IMAGE_2_OUTPUT_FORMAT
}

export function normalizeGptImage2OutputCompression(
  value: unknown,
  outputFormat: GptImage2OutputFormat,
) {
  if (outputFormat !== "jpeg" && outputFormat !== "webp") return null
  const parsed = parseInteger(value)
  if (parsed === null) return null
  return Math.max(0, Math.min(100, parsed))
}

export function normalizeGptImage2Moderation(value: unknown): GptImage2Moderation {
  return value === "low" || value === "auto" ? value : DEFAULT_GPT_IMAGE_2_MODERATION
}

export function normalizeGptImage2ResponseFormat(value: unknown): GptImage2ResponseFormat {
  return value === "url" || value === "b64_json" ? value : DEFAULT_GPT_IMAGE_2_RESPONSE_FORMAT
}

export function normalizeWorkflowImageConfig(input: Record<string, unknown>): NormalizedWorkflowImageConfig {
  const providerLock = resolveWorkflowImageProviderLock(input.selectedProviderId)
  const modelId = normalizeWorkflowImageModelId(input.selectedModelId)
  const modelKind = resolveWorkflowImageModelKind(modelId)
  const sizePreset = normalizeIncomingSizePreset(input.sizePreset)
  const resolution = normalizeIncomingResolution(input.resolution)
  const imageOutputFormat = normalizeGptImage2OutputFormat(input.imageOutputFormat)
  const hasExplicitImageQuality = normalizeOptionalText(input.imageQuality) !== null

  return {
    providerLock,
    modelId,
    modelKind,
    candidateCount: normalizeWorkflowImageCandidateCount(input.candidateCount),
    sizePreset,
    resolution,
    imageSize:
      modelKind === "gpt-image-2"
        ? normalizeGptImage2Size(input.imageSize)
        : DEFAULT_GPT_IMAGE_2_SIZE,
    imageQuality:
      modelKind === "gpt-image-2"
        ? hasExplicitImageQuality
          ? normalizeGptImage2Quality(input.imageQuality)
          : mapGptImage2Quality(resolution)
        : DEFAULT_GPT_IMAGE_2_QUALITY,
    imageBackground: normalizeGptImage2Background(input.imageBackground),
    imageOutputFormat,
    imageOutputCompression: normalizeGptImage2OutputCompression(
      input.imageOutputCompression,
      imageOutputFormat,
    ),
    imageModeration: normalizeGptImage2Moderation(input.imageModeration),
    imageResponseFormat: normalizeGptImage2ResponseFormat(input.imageResponseFormat),
  }
}

export function getWorkflowImageProviderOptions() {
  return WORKFLOW_IMAGE_PROVIDER_OPTIONS.map((provider) => ({
    ...provider,
    models: provider.models.map((model) => ({ ...model })),
  }))
}

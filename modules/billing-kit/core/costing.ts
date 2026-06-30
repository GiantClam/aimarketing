export type BillingFeatureKey =
  | "ai_entry_chat"
  | "writer_copy"
  | "writer_image"
  | "image_design_generate"
  | "image_design_edit"
  | "image_design_mask_edit"
  | "image_export"
  | "video_generation"

export type GptImage2Quality = "low" | "medium" | "high"
export type VideoBillingFeatureId = "text-to-video" | "image-to-video" | "digital-human" | "video-enhance"

export type CostEstimate = {
  featureKey: BillingFeatureKey
  provider?: string | null
  model?: string | null
  officialCostUsd: number
  costBasisUsd: number
  credits: number
  multiplier: number
  source: "usage" | "estimate"
  metadata?: Record<string, unknown>
}

export const CREDIT_USD_VALUE = 0.001
export const OFFICIAL_COST_DISCOUNT = 0.5

const FEATURE_MULTIPLIERS: Record<BillingFeatureKey, number> = {
  ai_entry_chat: 1,
  writer_copy: 1.2,
  writer_image: 1,
  image_design_generate: 1,
  image_design_edit: 1.5,
  image_design_mask_edit: 1.5,
  image_export: 1,
  video_generation: 2,
}

const GPT_IMAGE_2_OUTPUT_COSTS_USD: Record<string, Partial<Record<GptImage2Quality, number>>> = {
  "1024x1024": {
    low: 0.006,
    medium: 0.053,
    high: 0.211,
  },
  "1024x1536": {
    medium: 0.041,
    high: 0.165,
  },
  "1536x1024": {
    medium: 0.041,
    high: 0.165,
  },
}

const DEFAULT_VIDEO_USD_PER_SECOND: Record<VideoBillingFeatureId, number> = {
  "text-to-video": 0.08,
  "image-to-video": 0.08,
  "digital-human": 0.12,
  "video-enhance": 0.04,
}

function readPositiveNumberEnv(name: string, fallback: number) {
  const value = Number.parseFloat(String(process.env[name] || ""))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeVideoFeatureId(value: unknown): VideoBillingFeatureId {
  if (value === "image-to-video" || value === "digital-human" || value === "video-enhance") return value
  return "text-to-video"
}

function normalizeVideoDurationSeconds(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value || ""))
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 6
}

function getVideoResolutionMultiplier(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized.includes("4k")) return 5
  if (normalized.includes("2k")) return 2.5
  if (normalized.includes("1080")) return 1.5
  if (normalized.includes("480")) return 0.7
  return 1
}

function getVideoUsdPerSecond(featureId: VideoBillingFeatureId) {
  const envName = `BILLING_VIDEO_${featureId.replaceAll("-", "_").toUpperCase()}_USD_PER_SECOND`
  return readPositiveNumberEnv(envName, DEFAULT_VIDEO_USD_PER_SECOND[featureId])
}

export function creditsFromOfficialCostUsd(input: {
  featureKey: BillingFeatureKey
  officialCostUsd: number
  provider?: string | null
  model?: string | null
  multiplier?: number | null
  source?: "usage" | "estimate"
  metadata?: Record<string, unknown>
}): CostEstimate {
  const officialCostUsd = Math.max(0, input.officialCostUsd)
  const multiplier = Math.max(0, input.multiplier ?? FEATURE_MULTIPLIERS[input.featureKey] ?? 1)
  const costBasisUsd = officialCostUsd * OFFICIAL_COST_DISCOUNT * multiplier
  const creditBasisUsd = Math.max(0, costBasisUsd - 1e-12)

  return {
    featureKey: input.featureKey,
    provider: input.provider || null,
    model: input.model || null,
    officialCostUsd,
    costBasisUsd,
    credits: Math.max(0, Math.ceil(creditBasisUsd / CREDIT_USD_VALUE)),
    multiplier,
    source: input.source || "estimate",
    metadata: input.metadata,
  }
}

export function estimateGptImage2Credits(input: {
  featureKey: Extract<
    BillingFeatureKey,
    "image_design_generate" | "image_design_edit" | "image_design_mask_edit" | "writer_image"
  >
  size: string
  quality: GptImage2Quality
  provider?: string | null
  model?: string | null
  imageCount?: number | null
  inputImageCostUsd?: number | null
}) {
  const normalizedSize = input.size.trim().toLowerCase()
  const outputCost =
    GPT_IMAGE_2_OUTPUT_COSTS_USD[normalizedSize]?.[input.quality] ??
    GPT_IMAGE_2_OUTPUT_COSTS_USD["1024x1024"].medium!
  const imageCount = Math.max(1, Math.floor(input.imageCount || 1))
  const officialCostUsd = outputCost * imageCount + Math.max(0, input.inputImageCostUsd || 0)

  return creditsFromOfficialCostUsd({
    featureKey: input.featureKey,
    officialCostUsd,
    provider: input.provider,
    model: input.model || "gpt-image-2",
    source: "estimate",
    metadata: {
      size: input.size,
      quality: input.quality,
      imageCount,
      inputImageCostUsd: input.inputImageCostUsd || 0,
    },
  })
}

export function estimateVideoGenerationCredits(input: {
  featureId?: VideoBillingFeatureId | string | null
  durationSeconds?: number | string | null
  resolution?: string | null
  provider?: string | null
  model?: string | null
}) {
  const featureId = normalizeVideoFeatureId(input.featureId)
  const durationSeconds = normalizeVideoDurationSeconds(input.durationSeconds)
  const resolutionMultiplier = getVideoResolutionMultiplier(input.resolution)
  const usdPerSecond = getVideoUsdPerSecond(featureId)
  const officialCostUsd = usdPerSecond * durationSeconds * resolutionMultiplier

  return creditsFromOfficialCostUsd({
    featureKey: "video_generation",
    officialCostUsd,
    provider: input.provider,
    model: input.model,
    source: "estimate",
    metadata: {
      featureId,
      durationSeconds,
      resolution: input.resolution || null,
      resolutionMultiplier,
      usdPerSecond,
    },
  })
}

export function estimateTextCredits(input: {
  featureKey: Extract<BillingFeatureKey, "ai_entry_chat" | "writer_copy">
  inputTokens?: number | null
  outputTokens?: number | null
  inputUsdPerMillion?: number | null
  outputUsdPerMillion?: number | null
  provider?: string | null
  model?: string | null
}) {
  const inputTokens = Math.max(0, input.inputTokens || 0)
  const outputTokens = Math.max(0, input.outputTokens || 0)
  const inputUsdPerMillion = input.inputUsdPerMillion ?? 5
  const outputUsdPerMillion = input.outputUsdPerMillion ?? 15
  const officialCostUsd =
    (inputTokens / 1_000_000) * inputUsdPerMillion +
    (outputTokens / 1_000_000) * outputUsdPerMillion

  return creditsFromOfficialCostUsd({
    featureKey: input.featureKey,
    officialCostUsd,
    provider: input.provider,
    model: input.model,
    source: "usage",
    metadata: {
      inputTokens,
      outputTokens,
      inputUsdPerMillion,
      outputUsdPerMillion,
    },
  })
}

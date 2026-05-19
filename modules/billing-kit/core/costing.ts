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

  return {
    featureKey: input.featureKey,
    provider: input.provider || null,
    model: input.model || null,
    officialCostUsd,
    costBasisUsd,
    credits: Math.max(0, Math.ceil(costBasisUsd / CREDIT_USD_VALUE)),
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

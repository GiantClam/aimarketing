import { getBailianConfig, isBailianConfigured, buildBailianUrl } from "@/lib/platform/bailian"

import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityOutput,
  ModelDefinition,
  ProviderAdapter,
  ProviderConfigContext,
} from "@/lib/ai-runtime/types"
import type { BailianConfig } from "@/lib/platform/bailian"

type BailianImageContent = { image: string } | { text: string }

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeSize(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) return undefined
  return normalized.replace(/x/gi, "*")
}

function toImageValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.url === "string" && record.url.trim()) return record.url.trim()
  if (typeof record.base64Data === "string" && record.base64Data.trim()) {
    const mimeType = typeof record.mimeType === "string" && record.mimeType.trim() ? record.mimeType.trim() : "image/png"
    return `data:${mimeType};base64,${record.base64Data.trim()}`
  }
  return null
}

function resolveReferenceImages(input: Record<string, unknown>) {
  const values: unknown[] = Array.isArray(input.referenceImages) ? input.referenceImages : []
  if (typeof input.inputImageUrl === "string") values.unshift(input.inputImageUrl)
  return values.map(toImageValue).filter((value): value is string => Boolean(value)).slice(0, 3)
}

function readImageUrls(payload: Record<string, unknown>) {
  const urls: string[] = []
  const choices = payload.output && typeof payload.output === "object" ? (payload.output as Record<string, unknown>).choices : null
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      const message = choice && typeof choice === "object" ? (choice as Record<string, unknown>).message : null
      const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : null
      if (!Array.isArray(content)) continue
      for (const item of content) {
        if (item && typeof item === "object" && typeof (item as Record<string, unknown>).image === "string") {
          urls.push((item as Record<string, string>).image)
        }
      }
    }
  }

  const results = payload.output && typeof payload.output === "object" ? (payload.output as Record<string, unknown>).results : null
  if (Array.isArray(results)) {
    for (const item of results) {
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string") {
        urls.push((item as Record<string, string>).url)
      }
    }
  }
  return [...new Set(urls.filter(Boolean))]
}

async function requestImage(input: CapabilityExecutionRequest, model: ModelDefinition) {
  const config = input.runtimeContext?.bailianConfig || getBailianConfig()
  if (!isBailianConfigured(config)) throw new Error("bailian_not_configured")

  const values = input.input
  if (model.capability === "image.image_to_image" && resolveReferenceImages(values).length === 0) {
    throw new Error("image_reference_required")
  }
  const content: BailianImageContent[] = resolveReferenceImages(values).map((image) => ({ image }))
  content.push({ text: normalizeText(values.prompt) })
  const parameters: Record<string, unknown> = {}
  const size = normalizeSize(values.size)
  if (size) parameters.size = size
  if (values.promptExtend !== undefined) parameters.prompt_extend = values.promptExtend === true || values.promptExtend === "true"
  if (values.n !== undefined) parameters.n = Number(values.n)
  if (normalizeText(values.negativePrompt)) parameters.negative_prompt = normalizeText(values.negativePrompt)
  if (values.seed !== undefined) parameters.seed = Number(values.seed)
  if (values.watermark !== undefined) parameters.watermark = values.watermark === true || values.watermark === "true"

  const response = await fetch(buildBailianUrl(config.baseUrl, "/api/v1/services/aigc/multimodal-generation/generation"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.providerMetadata?.nativeModel,
      input: { messages: [{ role: "user", content }] },
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    }),
    cache: "no-store",
    signal: input.signal,
  })
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const message = normalizeText(payload?.message) || normalizeText(payload?.code) || "bailian_image_request_failed"
    throw new Error(message)
  }
  return payload || {}
}

export async function generateBailianImages(input: {
  config?: BailianConfig
  model: string
  prompt: string
  referenceImages?: Array<{ mimeType?: string | null; base64Data?: string | null; url?: string | null }>
  size?: string | null
  candidateCount?: number
  modelParameters?: Record<string, unknown> | null
  signal?: AbortSignal
}) {
  const payload = await requestImage(
    {
      currentUser: { id: 0, enterpriseId: null },
      capability: input.referenceImages?.length ? "image.image_to_image" : "image.text_to_image",
      modelId: input.model,
      source: "api",
      input: {
        ...(input.modelParameters || {}),
        prompt: input.prompt,
        referenceImages: input.referenceImages || [],
        size: input.size || "auto",
        n: input.candidateCount || 1,
      },
      runtimeContext: { bailianConfig: input.config },
      signal: input.signal,
    },
    { id: input.model, provider: "bailian", capability: input.referenceImages?.length ? "image.image_to_image" : "image.text_to_image", label: input.model, async: false, outputKind: "image", parameterSchema: [], providerMetadata: { nativeModel: input.model } },
  )
  return { model: input.model, images: readImageUrls(payload) }
}

export const bailianImageAdapter: ProviderAdapter = {
  provider: "bailian",
  capabilities: ["image.text_to_image", "image.image_to_image"],
  isConfigured(input: ProviderConfigContext) {
    return isBailianConfigured(input.runtimeContext?.bailianConfig)
  },
  async execute(input: CapabilityExecutionRequest, model: ModelDefinition): Promise<CapabilityExecutionResult> {
    const payload = await requestImage(input, model)
    const outputs: CapabilityOutput[] = readImageUrls(payload).map((url, index) => ({
      kind: "image",
      url,
      mimeType: "image/png",
      metadata: { candidateIndex: index },
    }))
    if (outputs.length === 0) throw new Error("bailian_image_empty_output")
    return {
      mode: "completed",
      status: "succeeded",
      provider: "bailian",
      modelId: model.id,
      outputs,
      payload: { provider: "bailian", model: model.providerMetadata?.nativeModel, outputCount: outputs.length },
    }
  },
}

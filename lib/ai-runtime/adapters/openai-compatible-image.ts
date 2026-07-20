import {
  generateImagesWithOpenAiCompatibleProvider,
  getOpenAiCompatibleImageProviderConfig,
  type OpenAiCompatibleImageProviderId,
  type OpenAiCompatibleInlineImage,
} from "@/lib/image-assistant/openai-compatible-image"

import type {
  CapabilityExecutionRequestV2,
  CapabilityExecutionResult,
  CapabilityOutput,
  CapabilityTaskCancelRequest,
  CapabilityTaskCancelResult,
  ModelDefinition,
  ProviderAdapterV2,
  ProviderConfigContext,
} from "@/lib/ai-runtime/types"

const IMAGE_PROVIDER_IDS: readonly OpenAiCompatibleImageProviderId[] = ["pptoken", "aiberm", "crazyroute"]

function isImageProviderId(value: unknown): value is OpenAiCompatibleImageProviderId {
  return typeof value === "string" && IMAGE_PROVIDER_IDS.includes(value as OpenAiCompatibleImageProviderId)
}

function resolveProviderId(input: CapabilityExecutionRequestV2) {
  const requested = input.input.provider
  if (typeof requested === "string" && requested.trim()) {
    // An explicit provider selection is an execution contract. Never silently
    // route it to a different configured provider, which would make a retry
    // produce a different model/provider result than the saved workflow.
    return { provider: isImageProviderId(requested) ? requested : null, explicit: true }
  }
  return {
    provider: IMAGE_PROVIDER_IDS.find((provider) => Boolean(getOpenAiCompatibleImageProviderConfig(provider))) || null,
    explicit: false,
  }
}

function asInlineImages(value: unknown): OpenAiCompatibleInlineImage[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is OpenAiCompatibleInlineImage => {
    if (!item || typeof item !== "object") return false
    const candidate = item as Record<string, unknown>
    return candidate.kind === "inline" && typeof candidate.mimeType === "string" && typeof candidate.base64Data === "string" && Boolean(candidate.base64Data)
  })
}

function outputMimeType(url: string) {
  const match = /^data:([^;,]+)/u.exec(url)
  return match?.[1] || "image/png"
}

function toOutputs(images: string[]): CapabilityOutput[] {
  return images.map((url, index) => ({
    kind: "image",
    url,
    mimeType: outputMimeType(url),
    metadata: { candidateIndex: index },
  }))
}

export const openAiCompatibleImageAdapter: ProviderAdapterV2 = {
  provider: "openai_compatible",
  capabilities: ["image.text_to_image", "image.image_to_image"],
  upstreamCancelSupported: false,
  isConfigured(_input: ProviderConfigContext) {
    return IMAGE_PROVIDER_IDS.some((provider) => Boolean(getOpenAiCompatibleImageProviderConfig(provider)))
  },
  async execute(input: CapabilityExecutionRequestV2, model: ModelDefinition): Promise<CapabilityExecutionResult> {
    const resolved = resolveProviderId(input)
    const provider = resolved.provider
    if (!provider) {
      throw new Error(resolved.explicit ? "provider_not_configured" : "openai_compatible_not_configured")
    }
    const config = getOpenAiCompatibleImageProviderConfig(provider)
    if (!config) {
      throw new Error(resolved.explicit ? "provider_not_configured" : "openai_compatible_not_configured")
    }

    const values = input.input
    const taskType = model.capability === "image.image_to_image" ? "edit" : "generate"
    const result = await generateImagesWithOpenAiCompatibleProvider({
      config,
      prompt: String(values.prompt || ""),
      taskType,
      model: String(model.providerMetadata?.nativeModel || config.model),
      imageSize: typeof values.size === "string" ? values.size : typeof values.imageSize === "string" ? values.imageSize : null,
      imageQuality: typeof values.quality === "string" ? (values.quality as "auto" | "low" | "medium" | "high") : null,
      imageBackground: typeof values.background === "string" ? (values.background as "auto" | "transparent" | "opaque") : null,
      imageOutputFormat: typeof values.outputFormat === "string" ? (values.outputFormat as "png" | "jpeg" | "webp") : null,
      imageOutputCompression: typeof values.outputCompression === "number" ? values.outputCompression : null,
      imageModeration: typeof values.moderation === "string" ? (values.moderation as "auto" | "low") : null,
      imageResponseFormat: typeof values.responseFormat === "string" ? (values.responseFormat as "b64_json" | "url") : null,
      referenceImages: asInlineImages(values.referenceImages),
      snapshotAssetId: typeof values.snapshotAssetId === "string" ? values.snapshotAssetId : null,
      maskAssetId: typeof values.maskAssetId === "string" ? values.maskAssetId : null,
      candidateCount: typeof values.candidateCount === "number" ? values.candidateCount : 1,
      idempotencyKey: input.idempotencyKey || input.requestId || null,
      signal: input.signal,
    })

    const outputs = toOutputs(result.images)
    if (outputs.length === 0) {
      throw new Error("empty_output")
    }
    return {
      mode: "completed",
      status: "succeeded",
      provider: "openai_compatible",
      modelId: model.id,
      outputs,
      // Deliberately exclude request input, API credentials, and upstream raw
      // payloads from the runtime payload/logging boundary.
      payload: {
        provider,
        model: result.model,
        outputCount: outputs.length,
      },
    }
  },
  async cancel(_input: CapabilityTaskCancelRequest, _model: ModelDefinition): Promise<CapabilityTaskCancelResult> {
    return { status: "not_supported" }
  },
}

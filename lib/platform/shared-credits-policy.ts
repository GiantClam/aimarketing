function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function hasCustomAiChatModelSelection(input: unknown) {
  const record = getRecord(input)
  if (!record) return false
  return Boolean(
    normalizeOptionalText(record.providerId) ||
      normalizeOptionalText(record.modelId),
  )
}

export function hasCustomImageModelSelection(input: {
  providerLock?: unknown
  model?: unknown
}) {
  return Boolean(
    normalizeOptionalText(input.providerLock) ||
      normalizeOptionalText(input.model),
  )
}

export function hasCustomMediaModelSelection(input: unknown) {
  const record = getRecord(input)
  if (!record) return false

  const params = getRecord(record.params)
  return Boolean(
    normalizeOptionalText(record.model) ||
      normalizeOptionalText(params?.model),
  )
}

export function shouldChargeSharedCreditsForCapability(params: {
  capabilitySlug: string
  body: unknown
  usesSharedCredits: boolean
}) {
  if (!params.usesSharedCredits) return false

  if (params.capabilitySlug === "ai-chat" || params.capabilitySlug === "agent-platform") {
    const bodyRecord = getRecord(params.body)
    return !hasCustomAiChatModelSelection(bodyRecord?.modelConfig)
  }

  if (params.capabilitySlug === "ai-image") {
    const bodyRecord = getRecord(params.body)
    return !hasCustomImageModelSelection({
      providerLock: bodyRecord?.providerLock,
      model: bodyRecord?.model,
    })
  }

  if (params.capabilitySlug === "ai-video" || params.capabilitySlug === "ai-music") {
    return !hasCustomMediaModelSelection(params.body)
  }

  return true
}


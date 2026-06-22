export const AI_ENTRY_MODEL_SELECTION_SEPARATOR = "::"

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function serializeAiEntryModelSelection(params: {
  providerId: string
  modelId: string
}) {
  const providerId = normalizeText(params.providerId).toLowerCase()
  const modelId = normalizeText(params.modelId)
  if (!providerId || !modelId) return null
  return `${providerId}${AI_ENTRY_MODEL_SELECTION_SEPARATOR}${encodeURIComponent(modelId)}`
}

export function parseAiEntryModelSelection(value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const separatorIndex = normalized.indexOf(AI_ENTRY_MODEL_SELECTION_SEPARATOR)
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - AI_ENTRY_MODEL_SELECTION_SEPARATOR.length) {
    return null
  }

  const providerId = normalized.slice(0, separatorIndex).trim().toLowerCase()
  const encodedModelId = normalized.slice(separatorIndex + AI_ENTRY_MODEL_SELECTION_SEPARATOR.length).trim()
  if (!providerId || !encodedModelId) return null

  try {
    const modelId = decodeURIComponent(encodedModelId).trim()
    if (!modelId) return null
    return {
      selectionId: serializeAiEntryModelSelection({ providerId, modelId })!,
      providerId,
      modelId,
    }
  } catch {
    return null
  }
}

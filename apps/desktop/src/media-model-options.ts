import type { WorkbenchMediaFeature } from "@aimarketing/workbench-ui"

function normalizedModels(models: readonly string[] | undefined, fallback: readonly string[]) {
  const configured = (models || []).map((value) => value.trim()).filter(Boolean)
  const values = (configured.length ? configured : fallback)
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(values)]
}

/** Keep feature-level media model fields on the configured capability catalog. */
export function applyConfiguredMediaModels(
  feature: WorkbenchMediaFeature,
  models: readonly string[] | undefined,
  selectedModel: string | undefined,
): WorkbenchMediaFeature {
  const modelField = feature.fields.find((field) => field.id === "model")
  if (!modelField) return feature

  const fallback = modelField.options?.map((option) => option.value) || []
  const candidateModels = models?.length ? [...models] : [...(models || []), ...(selectedModel ? [selectedModel] : [])];
  const mediaModels = candidateModels.filter((value) => {
    const identity = value.toLowerCase()
    if (feature.id === "ai-music") return /music/iu.test(identity)
    return feature.group === "video"
      ? /video|hailuo|seedance|wanx|digital[-_ ]?human|happyhorse|h3/iu.test(identity)
      : /audio|speech|music|voice|tts|minimax/iu.test(identity)
  })
  const available = normalizedModels(mediaModels, fallback)
  if (!available.length) return feature

  const requested = selectedModel?.trim() || modelField.defaultValue?.trim() || ""
  const resolved = available.includes(requested) ? requested : available[0]
  return {
    ...feature,
    fields: feature.fields.map((field) =>
      field.id === "model"
        ? { ...field, defaultValue: resolved, options: available.map((value) => ({ value, label: value })) }
        : field,
    ),
  }
}

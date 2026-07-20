const GENERAL_RUNTIME_ARTIFACT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".csv",
  ".html",
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const

// Native Dashi exports commonly contain embedded fonts and images. A valid
// PPTX can therefore be larger than the generic runtime artifact limit.
export const DASHI_PPT_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024
export const DASHI_PPT_MAX_ARTIFACT_TOTAL_BYTES = 32 * 1024 * 1024

export function isDashiPptRuntime(agentId: unknown, selectedSkillIds: unknown) {
  return agentId === "executive-presentation-ppt" ||
    (Array.isArray(selectedSkillIds) && selectedSkillIds.includes("dashiai-ppt"))
}

export function runtimeArtifactExtensions(agentId: unknown, selectedSkillIds: unknown) {
  return isDashiPptRuntime(agentId, selectedSkillIds)
    ? [".pptx", ".html"]
    : [...GENERAL_RUNTIME_ARTIFACT_EXTENSIONS]
}

export function resolveRuntimeArtifactLimits(input: {
  agentId: unknown
  selectedSkillIds: unknown
  maxArtifacts: number
  maxArtifactBytes: number
  maxArtifactTotalBytes: number
}) {
  if (!isDashiPptRuntime(input.agentId, input.selectedSkillIds)) return input

  return {
    ...input,
    maxArtifactBytes: Math.max(input.maxArtifactBytes, DASHI_PPT_MAX_ARTIFACT_BYTES),
    maxArtifactTotalBytes: Math.max(input.maxArtifactTotalBytes, DASHI_PPT_MAX_ARTIFACT_TOTAL_BYTES),
  }
}

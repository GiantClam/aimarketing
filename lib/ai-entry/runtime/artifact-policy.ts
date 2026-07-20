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

export function isDashiPptRuntime(agentId: unknown, selectedSkillIds: unknown) {
  return agentId === "executive-presentation-ppt" ||
    (Array.isArray(selectedSkillIds) && selectedSkillIds.includes("dashiai-ppt"))
}

export function runtimeArtifactExtensions(agentId: unknown, selectedSkillIds: unknown) {
  return isDashiPptRuntime(agentId, selectedSkillIds)
    ? [".pptx", ".html"]
    : [...GENERAL_RUNTIME_ARTIFACT_EXTENSIONS]
}

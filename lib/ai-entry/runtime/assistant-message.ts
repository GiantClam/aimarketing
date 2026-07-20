type RuntimeArtifactSummary = {
  title?: unknown
  fileName?: unknown
}

export function buildRuntimeAssistantMessage(
  text: string,
  artifacts: RuntimeArtifactSummary[],
): string | null {
  const normalizedText = text.trim()
  if (normalizedText) return normalizedText

  const titles = artifacts
    .map((artifact) => {
      if (typeof artifact.title === "string" && artifact.title.trim()) return artifact.title.trim()
      if (typeof artifact.fileName === "string" && artifact.fileName.trim()) return artifact.fileName.trim()
      return null
    })
    .filter((title): title is string => Boolean(title))
    .slice(0, 8)

  if (titles.length === 0) return null
  return `任务已完成，已生成以下文件：\n${titles.map((title) => `- ${title}`).join("\n")}`
}

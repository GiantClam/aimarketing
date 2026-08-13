import { selectFinalRuntimeArtifacts } from "./artifact-detector"

import type { ArtifactPart } from "@/lib/ai-entry/message-parts/types"

type RuntimeArtifactSummary = {
  artifactId?: unknown
  publicUrl?: unknown
  title?: unknown
  fileName?: unknown
  path?: unknown
  summary?: unknown
  kind?: unknown
  mimeType?: unknown
  artifactType?: unknown
  sizeBytes?: unknown
}

export function buildRuntimeAssistantMessage(
  text: string,
  artifacts: RuntimeArtifactSummary[],
): string | null {
  const normalizedText = text.trim()
  if (normalizedText) return normalizedText

  const titles = selectFinalRuntimeArtifacts(artifacts)
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

export function buildRuntimeAssistantArtifactParts(artifacts: RuntimeArtifactSummary[]): ArtifactPart[] {
  return selectFinalRuntimeArtifacts(artifacts).map((artifact, index) => {
    const artifactId = typeof artifact.artifactId === "number" && Number.isInteger(artifact.artifactId)
      ? artifact.artifactId
      : null
    const fileName = typeof artifact.fileName === "string" && artifact.fileName.trim()
      ? artifact.fileName.trim()
      : typeof artifact.path === "string" && artifact.path.trim()
        ? artifact.path.trim().split("/").at(-1) || null
        : null
    const title = typeof artifact.title === "string" && artifact.title.trim()
      ? artifact.title.trim()
      : fileName
    const kind = typeof artifact.kind === "string" ? artifact.kind.toLowerCase() : ""
    const artifactType: ArtifactPart["artifactType"] = kind.includes("ppt") || fileName?.toLowerCase().endsWith(".pptx")
      ? "pptx"
      : kind.includes("html") || fileName?.toLowerCase().endsWith(".html")
        ? "html"
        : kind.includes("image") || /\.(png|jpe?g|gif|webp)$/iu.test(fileName || "")
          ? "image"
          : "generic"

    return {
      type: "artifact",
      id: `runtime-artifact:${artifactId ?? fileName ?? index}`,
      artifactType,
      artifactId,
      title,
      fileName,
      previewUrl: null,
      downloadUrl: typeof artifact.publicUrl === "string" ? artifact.publicUrl : null,
      workHref: null,
      status: "created",
    }
  })
}

export function buildRuntimeAssistantParts(text: string, artifacts: RuntimeArtifactSummary[]) {
  const content = buildRuntimeAssistantMessage(text, artifacts)
  return [
    ...(content ? [{ type: "text" as const, text: content }] : []),
    ...buildRuntimeAssistantArtifactParts(artifacts),
  ]
}

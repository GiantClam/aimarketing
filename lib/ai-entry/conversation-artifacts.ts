import type { ArtifactPart } from "./message-parts/types"

export type AiEntryConversationArtifact = {
  artifactId: number
  title: string
  kind: string
  summary?: string
}

function artifactType(input: AiEntryConversationArtifact): ArtifactPart["artifactType"] {
  const source = `${input.kind} ${input.title} ${input.summary || ""}`.toLowerCase()
  if (source.includes("pptx") || source.includes("powerpoint")) return "pptx"
  if (source.includes("html")) return "html"
  if (source.includes("image") || /\.(?:png|jpe?g|webp|svg)$/u.test(source)) return "image"
  return "generic"
}

function artifactFileName(input: AiEntryConversationArtifact) {
  const summaryFileName = input.summary?.match(/^(.+?)\s+\([^)]*\)$/u)?.[1]?.trim()
  return summaryFileName || input.title
}

export function buildConversationArtifactParts(value: unknown): ArtifactPart[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<number>()
  return value.reduce<ArtifactPart[]>((parts, item) => {
    if (!item || typeof item !== "object") return parts
    const record = item as Partial<AiEntryConversationArtifact>
    const artifactId = typeof record.artifactId === "number" && Number.isInteger(record.artifactId) && record.artifactId > 0 ? record.artifactId : null
    const title = typeof record.title === "string" ? record.title.trim() : ""
    if (!artifactId || !title || seen.has(artifactId)) return parts
    seen.add(artifactId)
    const kind = typeof record.kind === "string" ? record.kind : ""
    if (/^(?:svg|json)$/iu.test(kind) || /\.(?:svg|json)$/iu.test(title)) return parts
    const summary = typeof record.summary === "string" ? record.summary : undefined
    const type = artifactType({ artifactId, title, kind, summary })
    parts.push({
      type: "artifact",
      id: `artifact:${artifactId}`,
      artifactType: type,
      artifactId,
      title,
      fileName: artifactFileName({ artifactId, title, kind, summary }),
      // The artifact detail route returns JSON metadata. Use the content route
      // for previews so HTML artifacts render instead of displaying metadata.
      previewUrl: `/api/platform/artifacts/${artifactId}/download`,
      downloadUrl: `/api/platform/artifacts/${artifactId}/download?download=1`,
      workHref: null,
      status: "created",
    })
    return parts
  }, [])
}

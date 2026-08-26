import { uploadAssetLibraryArtifactBuffer } from "@/lib/platform/asset-library-ingest"
import type { AuthUser } from "@/lib/auth/session"
import { parseWriterDataUrl } from "@/lib/writer/r2"

function extensionFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase().split(";", 1)[0]?.trim() || "image/png"
  if (normalized === "image/jpeg") return "jpg"
  if (normalized === "image/webp") return "webp"
  if (normalized === "image/gif") return "gif"
  return "png"
}

export async function persistWriterGeneratedImage(input: {
  userId: number
  enterpriseId: number
  conversationId?: string | null
  runId: string | number
  assetId: string
  title: string
  prompt: string
  provider: string
  dataUrl: string
}) {
  const parsed = parseWriterDataUrl(input.dataUrl)
  const fileName = `${input.assetId}.${extensionFromContentType(parsed.contentType)}`

  const artifact = await uploadAssetLibraryArtifactBuffer({
    currentUser: { id: input.userId, enterpriseId: input.enterpriseId } as AuthUser,
    runKind: "agent",
    itemType: "writer_asset",
    itemSlug: input.conversationId || String(input.runId),
    provider: "writer",
    fileName,
    mimeType: parsed.contentType,
    buffer: parsed.buffer,
    source: "generated",
    payload: {
      title: input.title || fileName,
      provider: input.provider,
      conversationId: input.conversationId ?? null,
      assetId: input.assetId,
      runId: String(input.runId),
      prompt: input.prompt.slice(0, 4_000),
    },
  })
  if (!artifact) throw new Error("writer_asset_artifact_persist_failed")

  return {
    artifactId: artifact.id,
    url: artifact.externalUrl || `/api/platform/artifacts/${artifact.id}/download`,
    storageKey: artifact.storageKey || undefined,
    contentType: artifact.mimeType || parsed.contentType,
  }
}

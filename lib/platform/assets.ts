import "server-only"

import {
  getPlatformArtifactPreviewKind,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import {
  listRecentPlatformArtifactsForEnterprise,
  type PlatformArtifactRecord,
} from "@/lib/platform/task-run-store"

export type EnterpriseAssetLibraryCandidate = {
  id: number
  title: string
  kind: PlatformArtifactRecord["kind"]
  mimeType: string | null
  runId: number
  createdAt: string | null
  previewKind: ReturnType<typeof getPlatformArtifactPreviewKind>
  sourceUrl: string | null
  previewUrl: string
  downloadUrl: string
}

function isUploadSourceArtifact(artifact: PlatformArtifactRecord) {
  const payload = artifact.payload
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>).source : null
  if (source === "upload" || source === "chat" || source === "assistant" || source === "import") {
    return true
  }

  const storageKey = artifact.storageKey?.toLowerCase() || ""
  return storageKey.startsWith("workflow-inputs/")
}

function buildPlatformArtifactDownloadUrl(artifactId: number, download = false) {
  const search = download ? "?download=1" : ""
  return `/api/platform/artifacts/${artifactId}/download${search}`
}

export function mapArtifactToEnterpriseAssetLibraryCandidate(
  artifact: PlatformArtifactRecord,
): EnterpriseAssetLibraryCandidate {
  const sourceUrl = resolvePlatformArtifactSourceUrl(artifact)

  return {
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    mimeType: artifact.mimeType,
    runId: artifact.runId,
    createdAt: artifact.createdAt instanceof Date ? artifact.createdAt.toISOString() : null,
    previewKind: getPlatformArtifactPreviewKind(artifact),
    sourceUrl,
    previewUrl: sourceUrl || buildPlatformArtifactDownloadUrl(artifact.id),
    downloadUrl: sourceUrl || buildPlatformArtifactDownloadUrl(artifact.id, true),
  }
}

export async function listEnterpriseAssetLibraryCandidates(
  enterpriseId: number,
): Promise<EnterpriseAssetLibraryCandidate[]> {
  const artifacts = await listRecentPlatformArtifactsForEnterprise(enterpriseId, 120)
  return artifacts.filter(isUploadSourceArtifact).map(mapArtifactToEnterpriseAssetLibraryCandidate)
}

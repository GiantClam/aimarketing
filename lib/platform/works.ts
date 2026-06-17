import {
  getPlatformArtifactFormatGroup,
  getPlatformArtifactPreviewKind,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import type { EnterpriseWorkLibraryCandidate, EnterpriseWorkLibraryPreviewKind } from "@/lib/platform/work-library-shared"
import { groupWorkLibraryCandidates, filterWorkLibraryCandidates } from "@/lib/platform/work-library-shared"
import {
  listPlatformWorkLibraryItemsForEnterprise,
  type PlatformWorkLibraryItemRecord,
} from "@/lib/platform/task-run-store"

function buildPlatformArtifactDownloadUrl(artifactId: number, download = false) {
  const search = download ? "?download=1" : ""
  return `/api/platform/artifacts/${artifactId}/download${search}`
}

function readSource(workItem: PlatformWorkLibraryItemRecord["workItem"], artifact: PlatformWorkLibraryItemRecord["artifact"]) {
  const metadataSource =
    workItem.metadata && typeof workItem.metadata === "object"
      ? (workItem.metadata as Record<string, unknown>).source
      : null
  const payloadSource =
    artifact.payload && typeof artifact.payload === "object"
      ? (artifact.payload as Record<string, unknown>).source
      : null

  return typeof metadataSource === "string"
    ? metadataSource
    : typeof payloadSource === "string"
      ? payloadSource
      : null
}

export function mapWorkLibraryItemToCandidate(record: PlatformWorkLibraryItemRecord): EnterpriseWorkLibraryCandidate {
  const sourceUrl = resolvePlatformArtifactSourceUrl(record.artifact)
  const basePreviewKind = getPlatformArtifactPreviewKind(record.artifact)
  const previewKind: EnterpriseWorkLibraryPreviewKind =
    record.artifact.mimeType?.toLowerCase() === "application/pdf" ? "pdf" : basePreviewKind

  return {
    workId: record.workItem.id,
    artifactId: record.artifact.id,
    title: record.workItem.title || record.artifact.title,
    type: record.workItem.type,
    source: readSource(record.workItem, record.artifact),
    mimeType: record.artifact.mimeType,
    artifactKind: record.artifact.kind,
    createdAt: record.workItem.createdAt instanceof Date ? record.workItem.createdAt.toISOString() : null,
    previewKind,
    formatGroup: getPlatformArtifactFormatGroup(record.artifact),
    sourceUrl,
    previewUrl: sourceUrl || buildPlatformArtifactDownloadUrl(record.artifact.id),
    downloadUrl: buildPlatformArtifactDownloadUrl(record.artifact.id, true),
    referenceCount: record.referenceCount,
  }
}

export async function listEnterpriseWorkLibraryCandidates(
  enterpriseId: number,
): Promise<EnterpriseWorkLibraryCandidate[]> {
  const rows = await listPlatformWorkLibraryItemsForEnterprise(enterpriseId)
  return groupWorkLibraryCandidates(rows.map(mapWorkLibraryItemToCandidate)).flatMap((group) => group.items)
}

export { filterWorkLibraryCandidates, groupWorkLibraryCandidates }

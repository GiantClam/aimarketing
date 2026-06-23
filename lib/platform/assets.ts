import "server-only"

import {
  getPlatformArtifactFormatGroup,
  getPlatformArtifactPreviewKind,
  resolvePlatformArtifactSourceUrl,
} from "@/lib/platform/artifact-actions"
import {
  listPlatformArtifactsForEnterprise,
  listPlatformWorkLibraryItemsForEnterprise,
  listRecentPlatformArtifactsForEnterprise,
  type PlatformArtifactRecord,
  type PlatformWorkLibraryItemRecord,
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

export type EnterpriseUnifiedAssetLibraryItem = {
  artifactId: number
  workId: number | null
  title: string
  kind: PlatformArtifactRecord["kind"]
  mimeType: string | null
  runId: number
  createdAt: string | null
  previewKind: ReturnType<typeof getPlatformArtifactPreviewKind>
  formatGroup: ReturnType<typeof getPlatformArtifactFormatGroup>
  sourceType: string | null
  sourceUrl: string | null
  previewUrl: string
  downloadUrl: string
  referenceCount: number
  hasWorkItem: boolean
  storageKey: string | null
  status: "ready"
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

function readWorkRecordSource(record: PlatformWorkLibraryItemRecord | null | undefined) {
  if (!record) return null

  const metadataSource =
    record.workItem.metadata && typeof record.workItem.metadata === "object"
      ? (record.workItem.metadata as Record<string, unknown>).source
      : null
  const payloadSource =
    record.artifact.payload && typeof record.artifact.payload === "object"
      ? (record.artifact.payload as Record<string, unknown>).source
      : null

  return typeof metadataSource === "string"
    ? metadataSource
    : typeof payloadSource === "string"
      ? payloadSource
      : null
}

function readArtifactSource(artifact: PlatformArtifactRecord) {
  const payloadSource =
    artifact.payload && typeof artifact.payload === "object"
      ? (artifact.payload as Record<string, unknown>).source
      : null
  return typeof payloadSource === "string" ? payloadSource : null
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

export function mapArtifactToEnterpriseUnifiedAssetLibraryItem(
  artifact: PlatformArtifactRecord,
  workRecord?: PlatformWorkLibraryItemRecord | null,
): EnterpriseUnifiedAssetLibraryItem {
  const sourceUrl = resolvePlatformArtifactSourceUrl(artifact)

  return {
    artifactId: artifact.id,
    workId: workRecord?.workItem.id ?? null,
    title: workRecord?.workItem.title || artifact.title,
    kind: artifact.kind,
    mimeType: artifact.mimeType,
    runId: artifact.runId,
    createdAt: artifact.createdAt instanceof Date ? artifact.createdAt.toISOString() : null,
    previewKind: getPlatformArtifactPreviewKind(artifact),
    formatGroup: getPlatformArtifactFormatGroup(artifact),
    sourceType: readWorkRecordSource(workRecord) || readArtifactSource(artifact),
    sourceUrl,
    previewUrl: sourceUrl || buildPlatformArtifactDownloadUrl(artifact.id),
    downloadUrl: sourceUrl || buildPlatformArtifactDownloadUrl(artifact.id, true),
    referenceCount: workRecord?.referenceCount ?? 0,
    hasWorkItem: Boolean(workRecord),
    storageKey: artifact.storageKey,
    status: "ready",
  }
}

export async function listEnterpriseAssetLibraryCandidates(
  enterpriseId: number,
): Promise<EnterpriseAssetLibraryCandidate[]> {
  const artifacts = await listRecentPlatformArtifactsForEnterprise(enterpriseId, 120)
  return artifacts.filter(isUploadSourceArtifact).map(mapArtifactToEnterpriseAssetLibraryCandidate)
}

export async function listEnterpriseUnifiedAssetLibraryItems(
  enterpriseId: number,
): Promise<EnterpriseUnifiedAssetLibraryItem[]> {
  const [artifacts, workRecords] = await Promise.all([
    listPlatformArtifactsForEnterprise(enterpriseId),
    listPlatformWorkLibraryItemsForEnterprise(enterpriseId),
  ])

  const latestWorkRecordByArtifactId = new Map<number, PlatformWorkLibraryItemRecord>()

  for (const record of [...workRecords].sort((left, right) => {
    const leftTime = left.workItem.createdAt instanceof Date ? left.workItem.createdAt.getTime() : 0
    const rightTime = right.workItem.createdAt instanceof Date ? right.workItem.createdAt.getTime() : 0
    return rightTime - leftTime || right.workItem.id - left.workItem.id
  })) {
    if (!latestWorkRecordByArtifactId.has(record.artifact.id)) {
      latestWorkRecordByArtifactId.set(record.artifact.id, record)
    }
  }

  return artifacts.map((artifact) =>
    mapArtifactToEnterpriseUnifiedAssetLibraryItem(artifact, latestWorkRecordByArtifactId.get(artifact.id)),
  )
}

import "server-only"

import {
  getPlatformArtifactFormatGroup,
  getPlatformArtifactPreviewKind,
  hasPlatformArtifactAccessibleContent,
  isPlatformArtifactTextPreviewable,
  isPlatformArtifactAssetLibraryEligible,
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
  status: "ready" | "unavailable"
  hasAccessibleContent: boolean
  inlinePreviewText: string | null
}

const INLINE_PREVIEW_TEXT_LIMIT = 20_000

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

function shouldProxyPlatformArtifactAccess(artifact: Pick<PlatformArtifactRecord, "mimeType" | "title">) {
  return isPlatformArtifactTextPreviewable(artifact)
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

function readInlinePreviewText(artifact: PlatformArtifactRecord) {
  if (!artifact.payload || typeof artifact.payload !== "object") return null
  const payload = artifact.payload as Record<string, unknown>
  const text = typeof payload.text === "string" ? payload.text.trim() : ""
  if (!text) return null
  return text.slice(0, INLINE_PREVIEW_TEXT_LIMIT)
}

export function mapArtifactToEnterpriseAssetLibraryCandidate(
  artifact: PlatformArtifactRecord,
): EnterpriseAssetLibraryCandidate {
  const sourceUrl = resolvePlatformArtifactSourceUrl(artifact)
  const proxiedUrl = buildPlatformArtifactDownloadUrl(artifact.id)
  const proxiedDownloadUrl = buildPlatformArtifactDownloadUrl(artifact.id, true)
  const shouldProxy = shouldProxyPlatformArtifactAccess(artifact)

  return {
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    mimeType: artifact.mimeType,
    runId: artifact.runId,
    createdAt: artifact.createdAt instanceof Date ? artifact.createdAt.toISOString() : null,
    previewKind: getPlatformArtifactPreviewKind(artifact),
    sourceUrl,
    previewUrl: shouldProxy ? proxiedUrl : sourceUrl || proxiedUrl,
    downloadUrl: shouldProxy ? proxiedDownloadUrl : sourceUrl || proxiedDownloadUrl,
  }
}

export function mapArtifactToEnterpriseUnifiedAssetLibraryItem(
  artifact: PlatformArtifactRecord,
  workRecord?: PlatformWorkLibraryItemRecord | null,
): EnterpriseUnifiedAssetLibraryItem {
  const sourceUrl = resolvePlatformArtifactSourceUrl(artifact)
  const proxiedUrl = buildPlatformArtifactDownloadUrl(artifact.id)
  const proxiedDownloadUrl = buildPlatformArtifactDownloadUrl(artifact.id, true)
  const shouldProxy = shouldProxyPlatformArtifactAccess(artifact)
  const hasAccessibleContent = hasPlatformArtifactAccessibleContent(artifact)

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
    previewUrl: shouldProxy ? proxiedUrl : sourceUrl || proxiedUrl,
    downloadUrl: shouldProxy ? proxiedDownloadUrl : sourceUrl || proxiedDownloadUrl,
    referenceCount: workRecord?.referenceCount ?? 0,
    hasWorkItem: Boolean(workRecord),
    storageKey: artifact.storageKey,
    status: hasAccessibleContent ? "ready" : "unavailable",
    hasAccessibleContent,
    inlinePreviewText: readInlinePreviewText(artifact),
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

  return artifacts
    .filter((artifact) => isPlatformArtifactAssetLibraryEligible(artifact))
    .map((artifact) => mapArtifactToEnterpriseUnifiedAssetLibraryItem(artifact, latestWorkRecordByArtifactId.get(artifact.id)))
}

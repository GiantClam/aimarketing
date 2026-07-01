import { resolvePlatformArtifactSourceUrl } from "@/lib/platform/artifact-actions"
import { getPlatformArtifact, type PlatformArtifactRecord } from "@/lib/platform/task-run-store"

export type WorkflowAssetRef = {
  source: "upload" | "library"
  artifactId?: number
  storageKey?: string
  fileName: string
  mimeType: string
  url?: string | null
  embeddedContentBase64?: string
  inlinePreviewText?: string | null
}

export type WorkflowUploadedFileInput = {
  fileName: string
  mimeType: string
  artifactId?: number
  storageKey?: string
  url?: string | null
}

export type ResolveUploadNodeOutputsInput = {
  enterpriseId: number
  ownerUserId: number
  uploadedFiles?: WorkflowUploadedFileInput[]
  referencedArtifactIds?: number[]
}

export type ResolveUploadNodeOutputsDependencies = {
  loadArtifact?: (artifactId: number) => Promise<PlatformArtifactRecord | null>
}

function normalizeFileName(value: string, fallback: string) {
  const normalized = value.trim()
  return (normalized || fallback).slice(0, 255)
}

function normalizeMimeType(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  return normalized || "application/octet-stream"
}

function buildWorkflowAssetRefFromArtifact(artifact: PlatformArtifactRecord): WorkflowAssetRef {
  return {
    source: "library",
    artifactId: artifact.id,
    storageKey: artifact.storageKey ?? undefined,
    fileName: normalizeFileName(artifact.title, `artifact-${artifact.id}`),
    mimeType: normalizeMimeType(artifact.mimeType),
    url: resolvePlatformArtifactSourceUrl(artifact),
  }
}

function buildWorkflowAssetRefFromUpload(file: WorkflowUploadedFileInput, index: number): WorkflowAssetRef {
  return {
    source: "upload",
    artifactId: Number.isInteger(file.artifactId) && file.artifactId && file.artifactId > 0 ? file.artifactId : undefined,
    storageKey: typeof file.storageKey === "string" && file.storageKey.trim() ? file.storageKey.trim() : undefined,
    fileName: normalizeFileName(file.fileName, `upload-${index + 1}`),
    mimeType: normalizeMimeType(file.mimeType),
    url: typeof file.url === "string" && file.url.trim() ? file.url.trim() : null,
  }
}

export async function resolveUploadNodeOutputs(
  input: ResolveUploadNodeOutputsInput,
  deps: ResolveUploadNodeOutputsDependencies = {},
) {
  const loadArtifact = deps.loadArtifact ?? getPlatformArtifact
  const assets: WorkflowAssetRef[] = []
  const seenKeys = new Set<string>()

  for (const [index, file] of (input.uploadedFiles ?? []).entries()) {
    const asset = buildWorkflowAssetRefFromUpload(file, index)
    const dedupeKey = `${asset.source}:${asset.artifactId || asset.storageKey || asset.fileName}:${asset.mimeType}`
    if (seenKeys.has(dedupeKey)) continue
    seenKeys.add(dedupeKey)
    assets.push(asset)
  }

  for (const artifactId of input.referencedArtifactIds ?? []) {
    const artifact = await loadArtifact(artifactId)
    if (!artifact || artifact.enterpriseId !== input.enterpriseId) {
      throw new Error("workflow_upload_artifact_not_found")
    }

    const asset = buildWorkflowAssetRefFromArtifact(artifact)
    const dedupeKey = `${asset.source}:${asset.artifactId}`
    if (seenKeys.has(dedupeKey)) continue
    seenKeys.add(dedupeKey)
    assets.push(asset)
  }

  return { assets }
}

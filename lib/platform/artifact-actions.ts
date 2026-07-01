import type { AuthUser } from "@/lib/auth/session"
import { getR2PublicUrl } from "@/lib/r2"
import type { PlatformArtifactRecord } from "@/lib/platform/task-run-store"

type EnterpriseWorkspaceUser = AuthUser & { enterpriseId: number }

export function assertEnterpriseWorkspaceUser(
  currentUser: AuthUser | null | undefined,
): asserts currentUser is EnterpriseWorkspaceUser {
  if (!currentUser) {
    throw new Error("authentication_required")
  }

  if (!currentUser.enterpriseId) {
    throw new Error("enterprise_context_required")
  }
}

export function assertArtifactEnterpriseAccess(
  currentUser: AuthUser | null | undefined,
  artifact: PlatformArtifactRecord | null,
) {
  assertEnterpriseWorkspaceUser(currentUser)

  if (!artifact || artifact.enterpriseId !== currentUser.enterpriseId) {
    throw new Error("artifact_not_found")
  }

  return artifact
}

export function inferWorkItemTypeFromArtifact(artifact: PlatformArtifactRecord) {
  const mimeType = artifact.mimeType?.toLowerCase() || ""
  const title = artifact.title.toLowerCase()

  if (mimeType.includes("presentation") || title.includes("ppt") || title.includes("deck")) return "deck" as const
  if (mimeType.startsWith("image/")) return "image_set" as const
  if (mimeType.startsWith("video/")) return "video" as const
  if (mimeType.startsWith("audio/")) return "audio" as const
  if (mimeType.includes("markdown") || mimeType.includes("html") || mimeType.startsWith("text/")) return "article" as const
  return "document" as const
}

export function serializePlatformArtifact(artifact: PlatformArtifactRecord) {
  return {
    ...artifact,
    createdAt: artifact.createdAt instanceof Date ? artifact.createdAt.toISOString() : null,
  }
}

export function resolvePlatformArtifactSourceUrl(artifact: PlatformArtifactRecord) {
  if (artifact.storageKey) {
    try {
      return getR2PublicUrl(artifact.storageKey)
    } catch {
      // fall through to externalUrl when R2 public URL is unavailable
    }
  }
  if (artifact.externalUrl) return artifact.externalUrl
  return null
}

export function hasPlatformArtifactAccessibleContent(
  artifact: Pick<PlatformArtifactRecord, "externalUrl" | "storageKey" | "payload">,
) {
  if (resolvePlatformArtifactSourceUrl(artifact as PlatformArtifactRecord)) {
    return true
  }

  if (!artifact.payload || typeof artifact.payload !== "object") {
    return false
  }

  const payload = artifact.payload as Record<string, unknown>
  if (typeof payload.embeddedContentBase64 === "string" && payload.embeddedContentBase64.trim()) {
    return true
  }

  return typeof payload.text === "string" && payload.text.trim().length > 0
}

export function isPlatformArtifactAssetLibraryEligible(
  artifact: Pick<PlatformArtifactRecord, "externalUrl" | "storageKey" | "payload">,
) {
  if (resolvePlatformArtifactSourceUrl(artifact as PlatformArtifactRecord)) {
    return true
  }

  if (!artifact.payload || typeof artifact.payload !== "object") {
    return false
  }

  const payload = artifact.payload as Record<string, unknown>
  return typeof payload.embeddedContentBase64 === "string" && payload.embeddedContentBase64.trim().length > 0
}

export function getPlatformArtifactPreviewKind(artifact: Pick<PlatformArtifactRecord, "mimeType" | "kind">) {
  const mimeType = artifact.mimeType?.toLowerCase() || ""
  if (mimeType.startsWith("image/")) return "image" as const
  if (mimeType.startsWith("video/")) return "video" as const
  if (mimeType.startsWith("audio/")) return "audio" as const
  return "file" as const
}

export function isPlatformArtifactTextPreviewable(artifact: Pick<PlatformArtifactRecord, "mimeType" | "title">) {
  const mimeType = artifact.mimeType?.toLowerCase() || ""
  const title = artifact.title.toLowerCase()
  return mimeType.startsWith("text/") || mimeType.includes("json") || /\.(md|markdown|txt|json|csv|log)$/i.test(title)
}

export function normalizePlatformArtifactContentType(contentType: string | null | undefined) {
  const normalized = typeof contentType === "string" ? contentType.trim() : ""
  if (!normalized) return "application/octet-stream"

  const lower = normalized.toLowerCase()
  if (lower.includes("charset=")) return normalized

  if (
    lower.startsWith("text/") ||
    lower === "application/json" ||
    lower.endsWith("+json") ||
    lower === "application/xml" ||
    lower.endsWith("+xml") ||
    lower === "image/svg+xml"
  ) {
    return `${normalized}; charset=utf-8`
  }

  return normalized
}

export function getPlatformArtifactFormatGroup(artifact: Pick<PlatformArtifactRecord, "mimeType" | "title">) {
  const mimeType = artifact.mimeType?.toLowerCase() || ""
  const title = artifact.title.toLowerCase()

  if (mimeType.startsWith("image/")) return "image" as const
  if (mimeType.startsWith("video/")) return "video" as const
  if (mimeType.startsWith("audio/")) return "audio" as const
  if (
    mimeType === "application/pdf" ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("msword") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("json") ||
    mimeType.startsWith("text/") ||
    /\.(pdf|ppt|pptx|doc|docx|xls|xlsx|json|txt|md)$/i.test(title)
  ) {
    return "document" as const
  }

  return "other" as const
}

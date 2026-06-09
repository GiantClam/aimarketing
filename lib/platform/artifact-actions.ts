import type { AuthUser } from "@/lib/auth/session"
import type { PlatformArtifactRecord } from "@/lib/platform/task-run-store"

export function assertEnterpriseWorkspaceUser(currentUser: AuthUser | null | undefined) {
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

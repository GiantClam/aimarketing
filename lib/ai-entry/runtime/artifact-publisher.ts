import type { AuthUser } from "@/lib/auth/session"
import type { RuntimeArtifactPayload } from "@/lib/ai-runtime/contracts"
import type { AiEntryArtifactKind } from "@/lib/ai-entry/artifact-runtime"
import { createPlatformTaskRun, savePlatformArtifact } from "@/lib/platform/task-run-store"
import type { AiEntryConversationScope } from "@/lib/ai-entry/repository"
import { isPlatformArtifactR2Available, uploadPlatformArtifactBufferToR2 } from "@/lib/platform/artifact-storage"
import { recordAiEntryRuntimeArtifactContext } from "@/lib/ai-entry/repository"
import { validateRuntimeArtifactPayload, type ArtifactValidationLimits } from "./artifact-detector"

export type PublishedRuntimeArtifact = {
  kind: AiEntryArtifactKind
  title: string
  fileName: string
  mimeType: string
  artifactId: number
  previewUrl: string
  downloadUrl: string
  workItemId: null
  toolRunId: number
}

function descriptorKind(extension: string): AiEntryArtifactKind {
  if (extension === "md" || extension === "markdown") return "markdown"
  if (extension === "html") return "html"
  if (extension === "pdf") return "pdf"
  if (extension === "pptx") return "pptx"
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(extension)) return "image"
  return "report"
}

export async function publishRuntimeArtifact(input: {
  currentUser: AuthUser
  conversationId: string
  runId: string
  artifact: RuntimeArtifactPayload
  limits: ArtifactValidationLimits
  currentTotalBytes?: number
  conversationScope?: AiEntryConversationScope
  agentId?: string | null
}) {
  if (!input.currentUser.enterpriseId) throw new Error("runtime_artifact_enterprise_required")
  const validated = validateRuntimeArtifactPayload(input.artifact, input.limits, input.currentTotalBytes || 0)
  const run = await createPlatformTaskRun({
    enterpriseId: input.currentUser.enterpriseId,
    userId: input.currentUser.id,
    kind: "agent",
    itemType: "ai_entry_opencode",
    itemSlug: input.conversationId || input.runId,
    status: "succeeded",
    externalSystem: "opencode",
    externalRunId: input.runId,
    inputPayload: { conversationId: input.conversationId, runtimeRunId: input.runId },
    normalizedResult: { provider: "opencode" },
    startedAt: new Date(),
    finishedAt: new Date(),
  })
  const buffer = Buffer.from(validated.contentBase64, "base64")
  let storageKey: string | null = null
  let externalUrl: string | null = null
  let payload: Record<string, unknown> | null = null
  if (isPlatformArtifactR2Available()) {
    const uploaded = await uploadPlatformArtifactBufferToR2({
      buffer,
      enterpriseId: input.currentUser.enterpriseId,
      runId: run.id,
      provider: "opencode",
      fileName: validated.fileName,
      contentType: validated.mimeType,
    })
    storageKey = uploaded.storageKey
    externalUrl = uploaded.publicUrl
  } else {
    payload = {
      embeddedContentBase64: validated.contentBase64,
      fileName: validated.fileName,
      source: "opencode",
    }
  }
  const artifact = await savePlatformArtifact({
    runId: run.id,
    enterpriseId: input.currentUser.enterpriseId,
    ownerUserId: input.currentUser.id,
    kind: "file",
    title: validated.title,
    mimeType: validated.mimeType,
    storageKey,
    externalUrl,
    payload,
    source: "chat",
  })
  const downloadUrl = `/api/platform/artifacts/${artifact.id}/download?download=1`
  const published = {
    kind: descriptorKind(validated.extension),
    title: artifact.title,
    fileName: validated.fileName,
    mimeType: artifact.mimeType || validated.mimeType,
    artifactId: artifact.id,
    previewUrl: `/api/platform/artifacts/${artifact.id}`,
    downloadUrl,
    workItemId: null,
    toolRunId: run.id,
  } satisfies PublishedRuntimeArtifact
  await recordAiEntryRuntimeArtifactContext({
    userId: input.currentUser.id,
    conversationId: input.conversationId,
    scope: input.conversationScope,
    agentId: input.agentId,
    artifact: {
      artifactId: artifact.id,
      title: artifact.title,
      kind: validated.kind,
      summary: `${validated.fileName} (${validated.mimeType})`,
    },
  }).catch((error) => {
    console.warn("ai-entry.opencode.artifact_context.persist_failed", {
      conversationId: input.conversationId,
      artifactId: artifact.id,
      message: error instanceof Error ? error.message : String(error),
    })
  })
  return published
}

import { ensureWriterAssetOrder, markWriterAssetsFailed, type WriterAsset } from "@/lib/writer/assets"
import type { WriterConversationStatus } from "@/lib/writer/types"
import { listWriterRevisionHistory, selectLatestWriterRevision } from "@/lib/writer/revision-history"
import type { WriterMode, WriterPlatform } from "@/lib/writer/config"

type WriterDraftMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  revision?: number | null
  is_active_draft?: boolean
  isActiveDraft?: boolean
}

/**
 * Keep the last validated article visible while an optimistic assistant turn
 * is pending. A pending placeholder is not a draft and must never become the
 * source for the preview, asset generation, or the next edit.
 */
export function resolveWriterDraftForDisplay(
  messages: readonly WriterDraftMessage[],
  activeRevision: number | null | undefined,
  pendingContent = "",
) {
  const active = selectLatestWriterRevision(
    messages.map((message) => ({
      ...message,
      isActiveDraft: message.isActiveDraft ?? message.is_active_draft,
    })),
    activeRevision,
  )
  if (active?.content.trim()) return active.content

  const normalizedPendingContent = pendingContent.trim()
  return [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        message.content.trim() &&
        message.content.trim() !== normalizedPendingContent,
    )?.content || ""
}

export function mergeWriterAssetProgress(
  current: readonly WriterAsset[],
  incoming: WriterAsset,
  platform: WriterPlatform,
  mode: WriterMode,
) {
  const merged = [...current]
  const existingIndex = merged.findIndex((asset) => asset.id === incoming.id)
  if (existingIndex >= 0) {
    merged[existingIndex] = { ...merged[existingIndex], ...incoming }
  } else {
    merged.push(incoming)
  }
  return ensureWriterAssetOrder(merged, platform, mode)
}

export function buildWriterManualSavePayload(input: {
  conversationId: string
  content: string
  expectedRevision: number
  imagesRequested: boolean
}) {
  return {
    conversation_id: input.conversationId,
    content: input.content,
    expectedRevision: input.expectedRevision,
    status: input.imagesRequested ? "ready" : "text_ready",
    imagesRequested: input.imagesRequested,
  } as const
}

export function resolveWriterTaskFailureState(assets: readonly WriterAsset[], error: string) {
  return {
    conversationStatus: "failed" as const satisfies WriterConversationStatus,
    assets: markWriterAssetsFailed([...assets], error),
    assetsError: error,
    assetsLoading: false,
  }
}

export { listWriterRevisionHistory }

import {
  extractLatestPptPreviewContext,
  isQueuedPptBackgroundStatusMessage,
} from "@/lib/ai-entry/ppt-tool-result-message"

type RestorableMessage = {
  role?: "user" | "assistant" | null
  content?: string | null
  parts?: unknown[] | null
  attachments?: unknown[] | null
}

type PreviewAwareConversationState = {
  ppt?: {
    phase?: "idle" | "preview-ready" | "preview-invalidated" | "exported"
    latestPreview?: {
      previewSessionId?: string | null
    } | null
  } | null
}

function hasMeaningfulMessageContent(message: RestorableMessage) {
  const content = typeof message.content === "string" ? message.content.trim() : ""
  const partCount = Array.isArray(message.parts) ? message.parts.length : 0
  const attachmentCount = Array.isArray(message.attachments) ? message.attachments.length : 0
  return Boolean(content || partCount > 0 || attachmentCount > 0)
}

function getMeaningfulMessageCount(messages: RestorableMessage[]) {
  return messages.filter((message) => hasMeaningfulMessageContent(message)).length
}

function getLastMeaningfulMessage(messages: RestorableMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message && hasMeaningfulMessageContent(message)) {
      return message
    }
  }
  return null
}

function mergeBackgroundAssistantMessage<T extends RestorableMessage>(
  existing: T,
  backgroundAssistantMessage: T,
) {
  const existingParts = Array.isArray(existing.parts) ? existing.parts : []
  const backgroundParts = Array.isArray(backgroundAssistantMessage.parts)
    ? backgroundAssistantMessage.parts
    : []
  const existingAttachments = Array.isArray(existing.attachments) ? existing.attachments : []
  const backgroundAttachments = Array.isArray(backgroundAssistantMessage.attachments)
    ? backgroundAssistantMessage.attachments
    : []
  const existingContent = typeof existing.content === "string" ? existing.content.trim() : ""
  const backgroundContent =
    typeof backgroundAssistantMessage.content === "string"
      ? backgroundAssistantMessage.content.trim()
      : ""

  const needsPartsMerge = existingParts.length === 0 && backgroundParts.length > 0
  const needsAttachmentMerge = existingAttachments.length === 0 && backgroundAttachments.length > 0
  const needsContentMerge = !existingContent && Boolean(backgroundContent)

  if (!needsPartsMerge && !needsAttachmentMerge && !needsContentMerge) {
    return existing
  }

  return {
    ...existing,
    ...(needsContentMerge ? { content: backgroundAssistantMessage.content } : {}),
    ...(needsPartsMerge ? { parts: backgroundAssistantMessage.parts } : {}),
    ...(needsAttachmentMerge ? { attachments: backgroundAssistantMessage.attachments } : {}),
  }
}

export function resolveAiEntryBootstrapMessages<T extends RestorableMessage>(input: {
  conversationId: string | null
  pendingMessages: T[]
}) {
  const conversationId =
    typeof input.conversationId === "string" && input.conversationId.trim()
      ? input.conversationId.trim()
      : null

  if (!conversationId) return []
  return Array.isArray(input.pendingMessages) ? input.pendingMessages : []
}

export function shouldShowAiEntryConversationRestore<T extends RestorableMessage>(input: {
  isConversationLoading: boolean
  messages: T[]
}) {
  if (!input.isConversationLoading) return false
  const messages = Array.isArray(input.messages) ? input.messages : []
  return getMeaningfulMessageCount(messages) === 0
}

export function resolveAiEntryRestoredMessages<T extends RestorableMessage>(input: {
  pendingMessages: T[]
  persistedMessages: T[]
}) {
  const pendingMessages = Array.isArray(input.pendingMessages) ? input.pendingMessages : []
  const persistedMessages = Array.isArray(input.persistedMessages) ? input.persistedMessages : []

  if (persistedMessages.length === 0) return pendingMessages

  const lastPersistedMessage = getLastMeaningfulMessage(persistedMessages)
  if (lastPersistedMessage?.role === "assistant") {
    return persistedMessages
  }

  const pendingMeaningfulCount = getMeaningfulMessageCount(pendingMessages)
  const persistedMeaningfulCount = getMeaningfulMessageCount(persistedMessages)

  if (pendingMeaningfulCount > persistedMeaningfulCount) {
    return pendingMessages
  }

  return persistedMessages
}

export function resolveAiEntryCompletedConversationMessages<T extends RestorableMessage>(input: {
  currentMessages: T[]
  persistedMessages: T[]
  backgroundAssistantMessage?: T | null
  matchesBackgroundAssistantMessage?: (message: T) => boolean
}) {
  const currentMessages = Array.isArray(input.currentMessages) ? input.currentMessages : []
  const persistedMessages = Array.isArray(input.persistedMessages) ? input.persistedMessages : []
  const backgroundAssistantMessage = input.backgroundAssistantMessage || null

  const resolvedMessages =
    getMeaningfulMessageCount(persistedMessages) > 0 ? persistedMessages : currentMessages

  if (!backgroundAssistantMessage || !hasMeaningfulMessageContent(backgroundAssistantMessage)) {
    return resolvedMessages
  }

  const backgroundContent =
    typeof backgroundAssistantMessage.content === "string"
      ? backgroundAssistantMessage.content.trim()
      : ""
  const matchesBackgroundAssistantMessage =
    typeof input.matchesBackgroundAssistantMessage === "function"
      ? input.matchesBackgroundAssistantMessage
      : null

  const existingIndex = resolvedMessages.findIndex((message) => {
    if (message?.role !== "assistant") return false
    if (matchesBackgroundAssistantMessage?.(message)) return true
    const messageContent = typeof message.content === "string" ? message.content.trim() : ""
    return Boolean(backgroundContent && messageContent === backgroundContent)
  })

  if (existingIndex >= 0) {
    const mergedMessage = mergeBackgroundAssistantMessage(
      resolvedMessages[existingIndex] as T,
      backgroundAssistantMessage,
    )
    if (mergedMessage === resolvedMessages[existingIndex]) {
      return resolvedMessages
    }

    return resolvedMessages.map((message, index) =>
      index === existingIndex ? mergedMessage : message,
    )
  }

  return [...resolvedMessages, backgroundAssistantMessage]
}

export function hasAiEntryCompletedAssistantMessage<T extends RestorableMessage>(messages: T[]) {
  return [...(Array.isArray(messages) ? messages : [])].reverse().some((message) => {
    if (message?.role !== "assistant") return false
    const content = typeof message.content === "string" ? message.content.trim() : ""
    const hasParts = Array.isArray(message.parts) && message.parts.length > 0

    if (!content && !hasParts) return false
    if (content && isQueuedPptBackgroundStatusMessage(content)) return false

    return true
  })
}

export function hasAiEntryPptPreviewMaterialized<T extends RestorableMessage>(input: {
  persistedMessages: T[]
  conversationState?: PreviewAwareConversationState | null
  previousPreviewSessionId?: string | null
}) {
  const latestPreviewSessionIdFromState =
    typeof input.conversationState?.ppt?.latestPreview?.previewSessionId === "string" &&
    input.conversationState.ppt.latestPreview.previewSessionId.trim()
      ? input.conversationState.ppt.latestPreview.previewSessionId.trim()
      : null
  const latestPreviewSessionIdFromMessages = [...(input.persistedMessages || [])]
    .reverse()
    .map((message) =>
      message?.role === "assistant" && typeof message.content === "string"
        ? extractLatestPptPreviewContext(message.content)?.previewSessionId ?? null
        : null,
    )
    .find((previewSessionId): previewSessionId is string => Boolean(previewSessionId))
  const latestPreviewSessionId =
    latestPreviewSessionIdFromState || latestPreviewSessionIdFromMessages || null

  if (!latestPreviewSessionId) return false

  const previousPreviewSessionId =
    typeof input.previousPreviewSessionId === "string" && input.previousPreviewSessionId.trim()
      ? input.previousPreviewSessionId.trim()
      : null

  if (previousPreviewSessionId && latestPreviewSessionId === previousPreviewSessionId) {
    return false
  }

  return true
}

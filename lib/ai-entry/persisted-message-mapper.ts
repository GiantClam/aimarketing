import { buildTemplateRecommendationPartFromContext } from "@/lib/ai-entry/message-parts/reducer"
import type { MessagePart } from "@/lib/ai-entry/message-parts/types"
import { normalizeConversationMessageOrder } from "@/lib/ai-entry/message-restore"
import {
  collapsePptTemplateRecommendationMessageBlocks,
  extractLatestPptPreviewContext,
  extractLatestPptExportContext,
  extractPptTemplateRecommendationContexts,
  isFailedPptBackgroundStatusMessage,
  stripPptHiddenContextMarkers,
} from "@/lib/ai-entry/ppt-tool-result-message"

import { extractEmbeddedAttachmentSummaries } from "@/lib/ai-entry/chat-attachments"

export type PersistedAiEntryMessageRecord = {
  id?: string
  role?: "user" | "assistant"
  content?: string
  created_at?: number
}

export type PersistedAiEntryMappedMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  rawContent?: string
  parts?: MessagePart[]
  attachments?: Array<{
    id: string
    name: string
    mediaType: string
    size: number
  }>
  createdAt?: number
}

export function mapPersistedAiEntryMessages(
  records: PersistedAiEntryMessageRecord[] | null | undefined,
) {
  const mappedMessages = normalizeConversationMessageOrder<PersistedAiEntryMappedMessage>(
    (records || [])
      .map((item) => {
        const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null
        const content = typeof item.content === "string" ? item.content : ""
        const embeddedAttachmentDisplay =
          role === "user" ? extractEmbeddedAttachmentSummaries(content) : null
        const displayContent = embeddedAttachmentDisplay?.content ?? content
        const normalizedContent =
          role === "assistant"
            ? collapsePptTemplateRecommendationMessageBlocks(displayContent)
            : displayContent
        const id = typeof item.id === "string" ? item.id : `${role || "msg"}-${Math.random()}`
        const createdAt =
          typeof item.created_at === "number" && Number.isFinite(item.created_at)
            ? item.created_at
            : undefined
        if (!role) return null

        const templateRecommendationParts: MessagePart[] =
          role === "assistant"
            ? extractPptTemplateRecommendationContexts(normalizedContent)
                .map((context, index) =>
                  buildTemplateRecommendationPartFromContext(context, `template-recommendation:${id}:${index}`),
                )
                .filter((part): part is NonNullable<typeof part> => Boolean(part))
            : []
        const visibleContent =
          role === "assistant" ? stripPptHiddenContextMarkers(normalizedContent) : normalizedContent

        const embeddedAttachments =
          embeddedAttachmentDisplay?.attachments.map((attachment, index) => ({
            id: `embedded-attachment:${id}:${index}`,
            name: attachment.name,
            mediaType: attachment.mediaType,
            size: 0,
          })) ?? []

        if (
          !visibleContent.trim() &&
          templateRecommendationParts.length === 0 &&
          embeddedAttachments.length === 0
        ) {
          return null
        }

        return {
          id,
          role,
          content: normalizedContent,
          ...(content !== normalizedContent ? { rawContent: content } : {}),
          createdAt,
          ...(embeddedAttachments.length ? { attachments: embeddedAttachments } : {}),
          ...(templateRecommendationParts.length ? { parts: templateRecommendationParts } : {}),
        } as PersistedAiEntryMappedMessage
      })
      .filter((item): item is PersistedAiEntryMappedMessage => Boolean(item)),
  )

  const seenPptAssistantContent = new Set<string>()
  const dedupedPptMessages = mappedMessages.filter((message) => {
    if (message.role !== "assistant") return true
    const hasPptContext = Boolean(
      extractLatestPptPreviewContext(message.content) || extractLatestPptExportContext(message.content),
    )
    if (!hasPptContext) return true

    const contentKey = message.content.trim()
    if (seenPptAssistantContent.has(contentKey)) return false
    seenPptAssistantContent.add(contentKey)
    return true
  })

  const latestPreviewMessageIndex = [...dedupedPptMessages]
    .reverse()
    .findIndex(
      (message) =>
        message.role === "assistant" &&
        Boolean(extractLatestPptPreviewContext(message.content)),
    )

  if (latestPreviewMessageIndex < 0) {
    return dedupedPptMessages
  }

  const latestPreviewAbsoluteIndex = dedupedPptMessages.length - 1 - latestPreviewMessageIndex
  return dedupedPptMessages.filter((message, index) => {
    if (index >= latestPreviewAbsoluteIndex) return true
    if (message.role !== "assistant") return true
    return !isFailedPptBackgroundStatusMessage(message.content)
  })
}

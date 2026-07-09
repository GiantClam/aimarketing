"use client"

export const AI_ENTRY_NEW_CONVERSATION_EVENT = "ai-entry-new-conversation"

export type AiEntryNewConversationDetail = {
  agentId?: string | null
  entryMode?: string | null
}

export function dispatchAiEntryNewConversation(detail: AiEntryNewConversationDetail = {}) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<AiEntryNewConversationDetail>(AI_ENTRY_NEW_CONVERSATION_EVENT, {
      detail,
    }),
  )
}

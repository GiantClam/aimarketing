"use client"

export const AI_ENTRY_SIDEBAR_REFRESH_EVENT = "ai-entry-sidebar-refresh"

export type AiEntrySidebarRefreshDetail = {
  conversationId?: string | null
  agentId?: string | null
  entryMode?: string | null
}

export function dispatchAiEntrySidebarRefresh(detail: AiEntrySidebarRefreshDetail = {}) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<AiEntrySidebarRefreshDetail>(AI_ENTRY_SIDEBAR_REFRESH_EVENT, {
      detail,
    }),
  )
}

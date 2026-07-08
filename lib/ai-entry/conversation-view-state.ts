function normalizeConversationId(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function shouldReuseLoadedConversation(input: {
  targetConversationId: string | null | undefined
  latestConversationId: string | null | undefined
  hasMessages: boolean
  pendingFirstConversationRoute: boolean
}) {
  const targetConversationId = normalizeConversationId(input.targetConversationId)
  if (!targetConversationId || !input.hasMessages) return false

  const latestConversationId = normalizeConversationId(input.latestConversationId)
  return latestConversationId === targetConversationId || (
    input.pendingFirstConversationRoute && latestConversationId === targetConversationId
  )
}

export function shouldDeferSyntheticTaskRunMessages(input: {
  isConversationLoading: boolean
  messageCount: number
}) {
  return input.isConversationLoading && input.messageCount === 0
}

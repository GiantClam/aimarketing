export function resolveAiEntryTargetConversationId(input: {
  initialConversationId: string | null
  localConversationId: string | null
  pendingFirstConversationRoute: boolean
}) {
  if (input.pendingFirstConversationRoute) {
    return input.localConversationId
  }
  return input.initialConversationId
}

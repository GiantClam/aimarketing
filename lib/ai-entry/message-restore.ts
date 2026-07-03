type RestorableMessage = {
  role?: "user" | "assistant" | null
  content?: string | null
  parts?: unknown[] | null
  attachments?: unknown[] | null
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

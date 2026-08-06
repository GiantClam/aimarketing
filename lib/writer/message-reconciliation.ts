export type PendingWriterMessageLike = {
  id: string
  role: "user" | "assistant"
  content: string
}

export type PendingWriterMessageReconciliation = {
  prompt: string
  generatingContent: string
  optimisticUserMessageId?: string | null
  optimisticAssistantMessageId?: string | null
}

const normalizeMessageContent = (content: string) => content.trim()

const findLastIndex = <T>(items: T[], predicate: (item: T, index: number) => boolean) => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index
  }
  return -1
}

/**
 * Keep the optimistic turn visible while the async writer task is pending.
 * The API may briefly return the previous history (or a stale answer for the
 * same prompt) before the task result is persisted.
 */
export const reconcilePendingWriterMessages = <T extends PendingWriterMessageLike>(
  serverMessages: T[],
  currentMessages: T[],
  pending: PendingWriterMessageReconciliation,
) => {
  const prompt = normalizeMessageContent(pending.prompt)
  const generatingContent = normalizeMessageContent(pending.generatingContent)
  if (!prompt) return serverMessages

  const currentUserIndex = pending.optimisticUserMessageId
    ? currentMessages.findIndex((message) => message.id === pending.optimisticUserMessageId && message.role === "user")
    : findLastIndex(
        currentMessages,
        (message) => message.role === "user" && normalizeMessageContent(message.content) === prompt,
      )
  const currentAssistant =
    (pending.optimisticAssistantMessageId
      ? currentMessages.find(
          (message) => message.id === pending.optimisticAssistantMessageId && message.role === "assistant",
        )
      : null) ||
    (currentUserIndex >= 0 && currentMessages[currentUserIndex + 1]?.role === "assistant"
      ? currentMessages[currentUserIndex + 1]
      : null)

  if (!currentAssistant || normalizeMessageContent(currentAssistant.content) !== generatingContent) {
    return serverMessages
  }

  const currentUser = currentUserIndex >= 0 ? currentMessages[currentUserIndex] : null
  const serverUserIndex = findLastIndex(
    serverMessages,
    (message) => message.role === "user" && normalizeMessageContent(message.content) === prompt,
  )

  if (serverUserIndex >= 0) {
    const nextMessages = [...serverMessages]
    const serverAssistantIndex = serverUserIndex + 1
    if (nextMessages[serverAssistantIndex]?.role === "assistant") {
      nextMessages[serverAssistantIndex] = currentAssistant
    } else {
      nextMessages.splice(serverAssistantIndex, 0, currentAssistant)
    }
    return nextMessages
  }

  if (currentUser) {
    return [...serverMessages, currentUser, currentAssistant]
  }

  return serverMessages
}

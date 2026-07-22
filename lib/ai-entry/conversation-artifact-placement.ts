import type { ArtifactPart, MessagePart } from "./message-parts/types"
import { normalizeConversationMessageOrder } from "./message-restore"

type ArtifactMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  parts?: MessagePart[]
  createdAt?: number
}

function normalizeArtifactToken(value: string | null | undefined) {
  if (!value) return ""
  const normalized = value.replaceAll("\\", "/").split("/").at(-1)?.trim().toLowerCase() || ""
  return normalized.length >= 4 ? normalized : ""
}

function findArtifactMessageIndex(messages: ArtifactMessage[], artifact: ArtifactPart) {
  const fileNameToken = normalizeArtifactToken(artifact.fileName)
  const titleToken = normalizeArtifactToken(artifact.title)
  if (!fileNameToken && !titleToken) return -1

  let bestIndex = -1
  let bestScore = 0
  messages.forEach((message, index) => {
    if (message.role !== "assistant") return
    const content = message.content.toLowerCase()
    const score =
      (fileNameToken && content.includes(fileNameToken) ? 2 : 0) +
      (titleToken && titleToken !== fileNameToken && content.includes(titleToken) ? 1 : 0)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

function getStableFallbackCreatedAt(artifacts: ArtifactPart[]) {
  const timestamps = artifacts
    .map((artifact) => artifact.createdAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  return timestamps.length > 0 ? Math.min(...timestamps) : 0
}

export function attachConversationArtifacts<T extends ArtifactMessage>(messages: T[], artifacts: ArtifactPart[]) {
  if (artifacts.length === 0) return messages

  const mappedMessages: T[] = messages.map((message): T => ({
    ...message,
    parts: message.parts ? [...message.parts] : undefined,
  }))
  const attachedArtifactIds = new Set(
    mappedMessages.flatMap((message) =>
      (message.parts || [])
        .filter((part): part is ArtifactPart => part.type === "artifact" && part.artifactId !== null)
        .map((part) => part.artifactId),
    ),
  )
  const unplacedArtifacts: ArtifactPart[] = []

  for (const artifact of artifacts) {
    if (artifact.artifactId !== null && attachedArtifactIds.has(artifact.artifactId)) continue
    const messageIndex = findArtifactMessageIndex(mappedMessages, artifact)
    if (messageIndex >= 0) {
      const message = mappedMessages[messageIndex]
      message.parts = [...(message.parts || []), artifact]
      if (artifact.artifactId !== null) attachedArtifactIds.add(artifact.artifactId)
    } else {
      unplacedArtifacts.push(artifact)
    }
  }

  if (unplacedArtifacts.length > 0) {
    mappedMessages.push({
      id: "conversation-artifacts",
      role: "assistant",
      content: "",
      createdAt: getStableFallbackCreatedAt(unplacedArtifacts),
      parts: unplacedArtifacts,
    } as T)
  }

  return normalizeConversationMessageOrder(mappedMessages)
}

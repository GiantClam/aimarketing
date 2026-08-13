import type { ModelMessage, UIMessage } from "ai"

import type {
  ArtifactPart,
  MessagePart,
  ReportPart,
  SourcePart,
  TaskProgressPart,
  TaskRunPart,
  TemplateRecommendationPart,
  ToolCallPart,
  ValidationPart,
  WorkflowStatusPart,
} from "@/lib/ai-entry/message-parts/types"

export type AiEntryMessageMetadata = {
  conversationId?: string
  turnId?: string
  idempotencyKey?: string
  createdAt?: number
  provider?: string
  providerModel?: string
  agentId?: string | null
  traceId?: string
  finishReason?: string
}

export type AiEntryDataParts = {
  "task-progress": Omit<TaskProgressPart, "type" | "id">
  "task-run": Omit<TaskRunPart, "type" | "id">
  artifact: Omit<ArtifactPart, "type" | "id">
  report: Omit<ReportPart, "type" | "id">
  "template-recommendation": Omit<TemplateRecommendationPart, "type" | "id">
  validation: Omit<ValidationPart, "type" | "id">
  "workflow-status": Omit<WorkflowStatusPart, "type" | "id">
  "tool-call": Omit<ToolCallPart, "type" | "id">
  source: Omit<SourcePart, "type" | "id">
  "runtime-status": {
    status: "queued" | "running" | "completed" | "failed"
    message?: string
    stage?: string
    conversationId?: string
  }
}

export type AiEntryUIToolSet = Record<string, { input: unknown; output: unknown }>

export type AiEntryUIMessage = UIMessage<AiEntryMessageMetadata, AiEntryDataParts, AiEntryUIToolSet>

export type AiEntryUIMessagePart = AiEntryUIMessage["parts"][number]

export function getAiEntryUIMessageTurnId(message: Pick<AiEntryUIMessage, "metadata">) {
  const metadata = asRecord(message.metadata)
  return typeof metadata?.turnId === "string" && metadata.turnId.trim() ? metadata.turnId.trim() : null
}

function getAiEntryUIMessageIdempotencyKey(message: Pick<AiEntryUIMessage, "metadata">) {
  const metadata = asRecord(message.metadata)
  return typeof metadata?.idempotencyKey === "string" && metadata.idempotencyKey.trim()
    ? metadata.idempotencyKey.trim()
    : null
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function mergeText(existing: string, incoming: string) {
  if (!existing) return incoming
  if (!incoming || existing === incoming || existing.startsWith(incoming)) return existing
  if (incoming.startsWith(existing)) return incoming
  return `${existing}\n\n${incoming}`
}

function partKey(part: AiEntryUIMessagePart, index: number) {
  const record = asRecord(part)
  const type = typeof record?.type === "string" ? record.type : "part"
  if (type === "text" || type === "reasoning") return type
  const id = typeof record?.id === "string" ? record.id : typeof record?.toolCallId === "string" ? record.toolCallId : ""
  return `${type}:${id || JSON.stringify(part) || index}`
}

function mergeParts(
  existing: AiEntryUIMessagePart[],
  incoming: AiEntryUIMessagePart[],
  options: { appendCompletedText?: boolean } = {},
) {
  const merged = [...existing]
  const indexes = new Map(merged.map((part, index) => [partKey(part, index), index]))

  incoming.forEach((part, incomingIndex) => {
    const key = partKey(part, incomingIndex)
    const existingIndex = indexes.get(key)
    if (existingIndex === undefined) {
      indexes.set(key, merged.length)
      merged.push(part)
      return
    }

    const current = merged[existingIndex]
    const currentRecord = asRecord(current)
    const incomingRecord = asRecord(part)
    if ((currentRecord?.type === "text" || currentRecord?.type === "reasoning") && typeof incomingRecord?.text === "string") {
      const shouldReplaceCompletedText =
        !options.appendCompletedText && currentRecord.state === "done" && incomingRecord.state === "done"
      merged[existingIndex] = {
        ...currentRecord,
        text: shouldReplaceCompletedText
          ? incomingRecord.text
          : mergeText(typeof currentRecord.text === "string" ? currentRecord.text : "", incomingRecord.text),
        ...(currentRecord.state === "streaming" || incomingRecord.state === "streaming" ? { state: "streaming" } : {}),
      } as AiEntryUIMessagePart
      return
    }

    // Runtime parts become richer as the task progresses; the later part is
    // authoritative for the same part identity.
    merged[existingIndex] = part
  })

  return merged
}

function mergeMessages(
  existing: AiEntryUIMessage,
  incoming: AiEntryUIMessage,
  options: { appendCompletedText?: boolean } = {},
) {
  return {
    ...existing,
    metadata: {
      ...(asRecord(existing.metadata) || {}),
      ...(asRecord(incoming.metadata) || {}),
    },
    parts: mergeParts(existing.parts, incoming.parts, options),
  }
}

/**
 * Collapse duplicate UI messages by stable identity while preserving their order.
 * Older async runs may not have persisted one shared turn id on every assistant
 * row, so every consecutive assistant block forms one response block. A user row
 * always resets the block and therefore keeps separate turns separate.
 */
export function mergeAiEntryUIMessageDuplicates(messages: AiEntryUIMessage[]) {
  const merged: AiEntryUIMessage[] = []
  const indexes = new Map<string, number>()
  let previousRole: AiEntryUIMessage["role"] | null = null
  let previousAssistantIndex = -1

  for (const message of messages) {
    const turnId = message.role === "assistant" ? getAiEntryUIMessageTurnId(message) : null
    const idempotencyKey = message.role === "assistant" ? getAiEntryUIMessageIdempotencyKey(message) : null
    const messageKey = turnId
      ? `turn:${turnId}`
      : idempotencyKey
        ? `idempotency:${idempotencyKey}`
        : `id:${message.id}`
    const existingIndex = indexes.get(messageKey)
    if (existingIndex !== undefined) {
      merged[existingIndex] = mergeMessages(merged[existingIndex], message)
      previousRole = message.role
      previousAssistantIndex = message.role === "assistant" ? existingIndex : -1
      continue
    }

    if (
      message.role === "assistant" &&
      previousRole === "assistant" &&
      previousAssistantIndex >= 0
    ) {
      merged[previousAssistantIndex] = mergeMessages(
        merged[previousAssistantIndex],
        message,
        { appendCompletedText: true },
      )
      indexes.set(messageKey, previousAssistantIndex)
      continue
    }

    {
      indexes.set(messageKey, merged.length)
      merged.push(message)
      previousRole = message.role
      previousAssistantIndex = message.role === "assistant" ? merged.length - 1 : -1
    }
  }

  return merged
}

export function getAiEntryUIMessageText(message: Pick<AiEntryUIMessage, "parts">) {
  return message.parts
    .filter((part): part is Extract<AiEntryUIMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
}

export function createAiEntryTextMessage(params: {
  id: string
  role: "user" | "assistant"
  text: string
  createdAt?: number
  metadata?: AiEntryMessageMetadata
}): AiEntryUIMessage {
  return {
    id: params.id,
    role: params.role,
    metadata: {
      createdAt: params.createdAt,
      ...params.metadata,
    },
    parts: [{ type: "text", text: params.text, state: "done" }],
  }
}

export function messagePartsToAiEntryUIMessageParts(parts: MessagePart[]): AiEntryUIMessage["parts"] {
  return parts.flatMap((part) => {
    if (part.type === "text") {
      return [{ type: "text", text: part.text, state: "done" as const }]
    }
    if (part.type === "reasoning") {
      return [{ type: "reasoning", text: part.text, state: part.status === "running" ? "streaming" as const : "done" as const }]
    }

    const dataPart = {
      type: `data-${part.type}`,
      id: part.id,
      data: Object.fromEntries(Object.entries(part).filter(([key]) => key !== "type" && key !== "id")),
    }
    return [dataPart] as AiEntryUIMessage["parts"]
  })
}

export function createAiEntryUIMessageFromParts(params: {
  id: string
  role: "user" | "assistant"
  text: string
  parts?: MessagePart[]
  createdAt?: number
  metadata?: AiEntryMessageMetadata
}): AiEntryUIMessage {
  const parts: AiEntryUIMessage["parts"] = params.parts?.length
    ? messagePartsToAiEntryUIMessageParts(params.parts)
    : [{ type: "text", text: params.text, state: "done" as const }]

  return {
    id: params.id,
    role: params.role,
    metadata: {
      createdAt: params.createdAt,
      ...params.metadata,
    },
    parts,
  }
}

function getFileAttachments(message: AiEntryUIMessage) {
  if (message.role !== "user") return []

  return message.parts.flatMap((part) => {
    const file = part as { type?: string; url?: string; mediaType?: string; filename?: string }
    if (file.type !== "file" || !file.url || !file.mediaType) return []
    return [{
      name: file.filename || "attachment",
      mediaType: file.mediaType,
      dataUrl: file.url,
      size: 0,
    }]
  })
}

export function uiMessagesToLegacyChatMessages(
  messages: AiEntryUIMessage[],
  modelMessages?: ModelMessage[],
) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message, index) => {
      const text = getAiEntryUIMessageText(message)
      const convertedContent = modelMessages?.[index]?.content
      const attachments = getFileAttachments(message)
      return {
        role: message.role,
        content: text || (typeof convertedContent === "string" ? convertedContent : ""),
        ...(attachments.length > 0 ? { attachments } : {}),
      }
    })
    .filter((message) => message.content.trim().length > 0 || "attachments" in message)
}

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

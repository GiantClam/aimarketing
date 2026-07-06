import type { MessagePart } from "@/lib/ai-entry/message-parts/types"
import { buildPptToolResultMessage } from "@/lib/ai-entry/ppt-tool-result-message"

export type BackgroundAssistantMessage = {
  id: string
  role: "assistant"
  content: string
  parts?: MessagePart[]
}

function shouldPreferStructuredToolMessage(toolName: string, toolResult: unknown) {
  if (!toolResult || typeof toolResult !== "object") return false

  if (toolName === "preview_ppt_deck") {
    const previewSessionId =
      typeof (toolResult as { previewSessionId?: unknown }).previewSessionId === "string"
        ? (toolResult as { previewSessionId: string }).previewSessionId.trim()
        : ""
    const variants = Array.isArray((toolResult as { variants?: unknown }).variants)
      ? (toolResult as { variants: unknown[] }).variants
      : []
    const recommendedTemplates = Array.isArray(
      (toolResult as { recommendedTemplates?: unknown }).recommendedTemplates,
    )
      ? (toolResult as { recommendedTemplates: unknown[] }).recommendedTemplates
      : []

    return Boolean(previewSessionId || variants.length > 0 || recommendedTemplates.length > 0)
  }

  if (toolName === "export_ppt_deck") {
    const artifactId =
      typeof (toolResult as { artifactId?: unknown }).artifactId === "number"
        ? (toolResult as { artifactId: number }).artifactId
        : null
    const downloadUrl =
      typeof (toolResult as { downloadUrl?: unknown }).downloadUrl === "string"
        ? (toolResult as { downloadUrl: string }).downloadUrl.trim()
        : ""

    return Boolean(artifactId || downloadUrl)
  }

  return false
}

export function buildBackgroundAssistantCompletionMessage(input: {
  pendingTaskId: string
  assistantText: string
  toolName: string
  toolResult: unknown
  resultParts: MessagePart[]
  isZh: boolean
}): BackgroundAssistantMessage | null {
  const toolDerivedContent =
    buildPptToolResultMessage({
      toolName: input.toolName,
      result: input.toolResult,
      isZh: input.isZh,
    })?.trim() || ""

  const fallbackContent = shouldPreferStructuredToolMessage(input.toolName, input.toolResult)
    ? toolDerivedContent || input.assistantText || ""
    : input.assistantText || toolDerivedContent || ""

  if (!fallbackContent && input.resultParts.length === 0) {
    return null
  }

  return {
    id: `assistant-background-${input.pendingTaskId}`,
    role: "assistant",
    content: fallbackContent,
    parts: input.resultParts.length > 0 ? input.resultParts : undefined,
  }
}

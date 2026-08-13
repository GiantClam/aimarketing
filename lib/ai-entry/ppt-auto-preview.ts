import {
  type PptBriefState,
  preparePptPreviewInput,
} from "@/lib/ai-entry/ppt-brief"
import {
  buildPptToolResultMessage,
  stripPptTemplateRecommendationMessageBlocks,
} from "@/lib/ai-entry/ppt-tool-result-message"

type PptPreviewToolLike = {
  execute?: (input: unknown, options?: unknown) => Promise<unknown> | unknown
}

type AutoPreviewResult = {
  assistantMessage: string
  autoPreviewExecuted: boolean
  previewResult: unknown | null
}

function readOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function buildPreviewFailureNotice(errorMessage: string | null, isZh: boolean) {
  if (isZh) {
    return [
      "注意：当前这次对话还没有实际生成 PPT 预览，上面的内容只能视为建议结构。",
      errorMessage ? `失败原因：${errorMessage}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n")
  }

  return [
    "Note: this turn did not generate a real PPT preview. The text above is only a suggested structure.",
    errorMessage ? `Failure reason: ${errorMessage}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
}

export function shouldAutoRunPptPreview(input: {
  agentId: string | null
  executionContext?: "chat" | "workflow"
  latestUserPrompt: string
  briefState: PptBriefState | null
  previewAlreadyExecuted: boolean
  messageContents?: string[]
}) {
  // PPT execution decisions belong to the OpenCode agent and its tools.
  // Never infer preview/export intent from user wording in the application layer.
  void input
  return false
}

export async function maybeAutoRunPptPreview(input: {
  agentId: string | null
  executionContext?: "chat" | "workflow"
  latestUserPrompt: string
  assistantMessage: string
  briefState: PptBriefState | null
  previewAlreadyExecuted: boolean
  previewTool: PptPreviewToolLike | null | undefined
  origin?: string | null
  isZh?: boolean
  messageContents?: string[]
}): Promise<AutoPreviewResult> {
  if (
    !shouldAutoRunPptPreview({
      agentId: input.agentId,
      executionContext: input.executionContext,
      latestUserPrompt: input.latestUserPrompt,
      briefState: input.briefState,
      previewAlreadyExecuted: input.previewAlreadyExecuted,
      messageContents: input.messageContents,
    })
  ) {
    return {
      assistantMessage: input.assistantMessage,
      autoPreviewExecuted: false,
      previewResult: null,
    }
  }

  if (typeof input.previewTool?.execute !== "function") {
    return {
      assistantMessage: input.assistantMessage,
      autoPreviewExecuted: false,
      previewResult: null,
    }
  }

  const basePreparedPreview = preparePptPreviewInput({
    rawInput: {
      prompt: input.latestUserPrompt,
    },
    briefState: input.briefState,
  })

  if (!basePreparedPreview.ok) {
    return {
      assistantMessage: input.assistantMessage,
      autoPreviewExecuted: false,
      previewResult: null,
    }
  }

  const previewResult = await Promise.resolve(input.previewTool.execute(basePreparedPreview.input))
  const isZh = input.isZh !== false

  if (previewResult && typeof previewResult === "object" && (previewResult as { ok?: unknown }).ok === false) {
    const previewToolMessage = buildPptToolResultMessage({
      toolName: "preview_ppt_deck",
      result: previewResult,
      origin: input.origin,
      isZh,
    })
    if (previewToolMessage) {
      return {
        assistantMessage: [
          stripPptTemplateRecommendationMessageBlocks(input.assistantMessage),
          previewToolMessage,
        ].filter(Boolean).join("\n\n").trim(),
        autoPreviewExecuted: false,
        previewResult,
      }
    }

    const errorMessage = readOptionalText(
      (previewResult as { error?: { message?: unknown } }).error?.message,
    )
    const failureNotice = buildPreviewFailureNotice(errorMessage, isZh)
    return {
      assistantMessage: [failureNotice, input.assistantMessage].filter(Boolean).join("\n\n").trim(),
      autoPreviewExecuted: true,
      previewResult,
    }
  }

  const previewToolMessage = buildPptToolResultMessage({
    toolName: "preview_ppt_deck",
    result: previewResult,
    origin: input.origin,
    isZh,
  })

  return {
    assistantMessage: previewToolMessage
      ? [
          stripPptTemplateRecommendationMessageBlocks(input.assistantMessage),
          previewToolMessage.trim(),
        ].filter(Boolean).join("\n\n").trim()
      : input.assistantMessage,
    autoPreviewExecuted: true,
    previewResult,
  }
}

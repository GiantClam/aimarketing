import {
  type PptBriefState,
  preparePptPreviewInput,
} from "@/lib/ai-entry/ppt-brief"
import {
  buildPptToolResultMessage,
  resolvePptCatalogTemplateSelectionFromUserText,
  extractLatestPptTemplateRecommendationContext,
  resolvePptTemplateSelectionFromUserText,
  stripPptTemplateRecommendationMessageBlocks,
} from "@/lib/ai-entry/ppt-tool-result-message"
import { isAiEntryPptAgentId } from "@/lib/ai-entry/model-policy"

type PptPreviewToolLike = {
  execute?: (input: unknown, options?: unknown) => Promise<unknown> | unknown
}

type AutoPreviewResult = {
  assistantMessage: string
  autoPreviewExecuted: boolean
  previewResult: unknown | null
}

const PPT_AUTO_PREVIEW_INTENT_PATTERN =
  /(?:生成|制作|输出|导出|预览|打开|继续|create|generate|build|export|preview|open)/iu

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
  if (!isAiEntryPptAgentId(input.agentId)) return false
  if (input.executionContext === "workflow") return false
  if (input.previewAlreadyExecuted) return false
  if (!input.briefState?.readyForPreview) return false
  return PPT_AUTO_PREVIEW_INTENT_PATTERN.test(input.latestUserPrompt.trim())
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
  const latestRecommendationContext = (input.messageContents || [])
    .map((content) => extractLatestPptTemplateRecommendationContext(content))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .at(-1) ?? null
  const rawSelectedTemplateId = resolvePptTemplateSelectionFromUserText(
    input.latestUserPrompt,
    latestRecommendationContext,
  )
  const selectedTemplateId =
    rawSelectedTemplateId || resolvePptCatalogTemplateSelectionFromUserText(input.latestUserPrompt)

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

  const preparedPreview = preparePptPreviewInput({
    rawInput: {
      prompt: input.latestUserPrompt,
      ...(selectedTemplateId
        ? {
            templateMode: "single-template",
            templateId: selectedTemplateId,
          }
        : {}),
    },
    briefState: input.briefState,
  })

  if (!preparedPreview.ok) {
    return {
      assistantMessage: input.assistantMessage,
      autoPreviewExecuted: false,
      previewResult: null,
    }
  }

  const previewResult = await Promise.resolve(input.previewTool.execute(preparedPreview.input))
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

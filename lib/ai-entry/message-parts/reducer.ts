import type {
  AiEntryStreamEvent,
  AiEntryStreamSourceResult,
  ArtifactPart,
  MessagePart,
  ReasoningPart,
  ReportPart,
  SourcePart,
  TaskProgressPart,
  TaskProgressStep,
  TemplateRecommendationPart,
  ToolCallPart,
  ValidationPart,
} from "./types"
import type { PptTemplateRecommendationContext } from "@/lib/ai-entry/ppt-tool-result-message"
import { isInternalRuntimeArtifact, normalizeRuntimeArtifactFileName, selectFinalRuntimeArtifacts } from "@/lib/ai-entry/runtime/artifact-detector"

const REASONING_PART_ID = "reasoning"
const TASK_PROGRESS_PART_ID = "task-progress"

function upsertPart(parts: MessagePart[], part: MessagePart): MessagePart[] {
  const index = parts.findIndex((current) => current.id === part.id)
  if (index < 0) return [...parts, part]
  const next = parts.slice()
  next[index] = part
  return next
}

function getPartById<T extends MessagePart>(parts: MessagePart[], id: string, type: T["type"]): T | undefined {
  return parts.find((part): part is T => part.id === id && part.type === type)
}

function getTaskProgressPart(parts: MessagePart[]): TaskProgressPart | undefined {
  return getPartById<TaskProgressPart>(parts, TASK_PROGRESS_PART_ID, "task-progress")
}

function markTaskProgressDone(parts: MessagePart[]): MessagePart[] {
  const existing = getTaskProgressPart(parts)
  if (!existing) return parts
  let changed = existing.status !== "done"
  const steps = existing.steps.map((step) => {
    if (step.status !== "running") return step
    changed = true
    return { ...step, status: "completed" as const }
  })
  if (!changed) return parts
  return upsertPart(parts, { ...existing, status: "done", steps })
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function inferArtifactType(fileName: string | null): ArtifactPart["artifactType"] {
  if (!fileName) return "generic"
  const normalized = fileName.trim().toLowerCase()
  if (normalized.endsWith(".html") || normalized.endsWith(".htm")) return "html"
  if (normalized.endsWith(".pptx") || normalized.endsWith(".ppt")) return "pptx"
  if (normalized.endsWith(".png") || normalized.endsWith(".jpg") || normalized.endsWith(".jpeg") || normalized.endsWith(".webp")) {
    return "image"
  }
  return "generic"
}

function artifactTypeFromKind(kind: string | null | undefined): ArtifactPart["artifactType"] {
  if (kind === "pptx") return "pptx"
  if (kind === "html") return "html"
  if (kind === "image") return "image"
  return "generic"
}

function artifactFileKey(part: Pick<ArtifactPart, "fileName" | "title">) {
  return normalizeRuntimeArtifactFileName(part.fileName || part.title || "")
}

function upsertArtifactPart(parts: MessagePart[], artifact: ArtifactPart): MessagePart[] {
  const artifactParts = parts.filter((part): part is ArtifactPart => part.type === "artifact")
  const selectedArtifacts = selectFinalRuntimeArtifacts([...artifactParts, artifact])
  if (selectedArtifacts.some((part) => part.artifactType === "pptx" || part.fileName?.toLowerCase().endsWith(".pptx"))) {
    const selectedIds = new Set(selectedArtifacts.map((part) => part.id))
    const next = parts.filter((part) => part.type !== "artifact" || selectedIds.has(part.id))
    const incomingKey = artifactFileKey(artifact)
    const matchingIndex = next.findIndex(
      (part) => part.type === "artifact" && artifactFileKey(part) === incomingKey,
    )
    if (matchingIndex >= 0) {
      next[matchingIndex] = artifact
      return next
    }
    if (selectedArtifacts.some((part) => part.id === artifact.id || artifactFileKey(part) === incomingKey)) {
      return [...next, artifact]
    }
    return next
  }
  const key = artifactFileKey(artifact)
  const incomingName = artifact.fileName || artifact.title || ""
  const incomingIsNamedPptx = incomingName.toLowerCase().endsWith(".pptx") && !isInternalRuntimeArtifact(incomingName)
  const withoutInternalPptx = incomingIsNamedPptx
    ? parts.filter((part) => part.type !== "artifact" || !isInternalRuntimeArtifact(part.fileName || part.title || ""))
    : parts
  const matching = parts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => part.type === "artifact" && artifactFileKey(part) === key)
  if (!key || !matching.length) return upsertPart(withoutInternalPptx, artifact)

  const existing = matching[0].part as ArtifactPart
  const existingName = existing.fileName || existing.title || ""
  if (isInternalRuntimeArtifact(artifact.fileName || artifact.title || "") && !isInternalRuntimeArtifact(existingName)) return parts

  const firstIndex = matching[0].index
  const next = parts.map((part, index) => index === firstIndex ? artifact : part)
  return next.filter((part, index) => part.type !== "artifact" || artifactFileKey(part) !== key || index === firstIndex)
}

function sourceIdForResult(namespace: string, index: number, result: AiEntryStreamSourceResult): string {
  const url = optionalString(result.url)
  if (url) return `source:url:${url}`
  const title = optionalString(result.title)
  if (title) return `source:${namespace}:${index}:${title}`
  const snippet = optionalString(result.snippet)
  if (snippet) return `source:${namespace}:${index}:${snippet}`
  return `source:${namespace}:${index}`
}

function upsertSourcesFromResults(
  parts: MessagePart[],
  namespace: string,
  results: AiEntryStreamSourceResult[],
): MessagePart[] {
  let next = parts
  results.forEach((result, index) => {
    const url = optionalString(result.url)
    const title = optionalString(result.title)
    const snippet = optionalString(result.snippet)
    if (!url && !title && !snippet) return
    next = upsertPart(next, {
      type: "source",
      id: sourceIdForResult(namespace, index, result),
      sourceType: url ? "url" : "document",
      title,
      url,
      snippet,
    } satisfies SourcePart)
  })
  return next
}

function summarizeSources(results: AiEntryStreamSourceResult[]): string | undefined {
  const labels = results
    .map((result) => optionalString(result.title) ?? optionalString(result.url) ?? optionalString(result.snippet))
    .filter((label): label is string => Boolean(label))

  if (!labels.length) return undefined
  const preview = labels.slice(0, 2).join(" / ")
  return `${labels.length} sources${preview ? `: ${preview}` : ""}`
}

function normalizeTemplateLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  return values
    .map((value) => optionalString(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function buildTemplateRecommendationPartFromContext(
  context: PptTemplateRecommendationContext | null | undefined,
  id = "template-recommendation",
): TemplateRecommendationPart | null {
  if (!context?.templateIds.length) return null

  const templateMap = new Map((context.templates || []).map((item) => [item.templateId, item.labels]))
  const templates = context.templateIds
    .map((templateId) => {
      const normalizedId = optionalString(templateId)
      if (!normalizedId) return null
      const labels = normalizeTemplateLabels([...(templateMap.get(normalizedId) || []), normalizedId])
      return {
        templateId: normalizedId,
        labels: labels.length ? labels : [normalizedId],
      }
    })
    .filter((item): item is { templateId: string; labels: string[] } => Boolean(item))

  if (!templates.length) return null

  return {
    type: "template-recommendation",
    id,
    defaultTemplateId: optionalString(context.defaultTemplateId) ?? templates[0]?.templateId ?? null,
    templates,
  }
}

export function buildTemplateRecommendationPartFromRecommendedTemplates(
  value: unknown,
  id = "template-recommendation",
): TemplateRecommendationPart | null {
  if (!Array.isArray(value)) return null

  const templates = value
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const record = item as { templateId?: unknown; templateLabel?: unknown; styleName?: unknown }
      const templateId = optionalString(record.templateId)
      if (!templateId) return null
      const labels = normalizeTemplateLabels([
        optionalString(record.templateLabel),
        optionalString(record.styleName),
        templateId,
      ])
      return {
        templateId,
        labels: labels.length ? labels : [templateId],
      }
    })
    .filter((item): item is { templateId: string; labels: string[] } => Boolean(item))

  if (!templates.length) return null

  return {
    type: "template-recommendation",
    id,
    defaultTemplateId: templates[0]?.templateId ?? null,
    templates,
  }
}

function startOrUpdateTaskProgress(
  parts: MessagePart[],
  step: TaskProgressStep,
  status: TaskProgressPart["status"] = "running",
): MessagePart[] {
  const existing = getTaskProgressPart(parts)
  const steps = existing?.steps ?? []
  const index = steps.findIndex((current) => current.type === step.type)
  const nextSteps =
    index < 0
      ? [...steps, step]
      : steps.map((current, currentIndex) => (currentIndex === index ? step : current))

  return upsertPart(parts, {
    type: "task-progress",
    id: TASK_PROGRESS_PART_ID,
    status: existing?.status ?? status,
    steps: nextSteps,
  })
}

function applyToolCall(
  parts: MessagePart[],
  event: AiEntryStreamEvent,
): MessagePart[] {
  const toolName = optionalString(event.data?.toolName) || "tool"
  const toolCallId = optionalString(event.data?.toolCallId) || toolName
  const args = event.data?.args ?? null
  const existing = getPartById<ToolCallPart>(parts, toolCallId, "tool-call")
  const nextParts = upsertPart(parts, {
    type: "tool-call",
    id: toolCallId,
    toolName,
    toolCallId,
    args: args ?? existing?.args ?? null,
    state: "input-streaming",
  })

  return startOrUpdateTaskProgress(
    nextParts,
    {
      type: `tool:${toolCallId}`,
      toolName,
      status: "running",
      detail:
        toolName === "web_search" ? optionalString(event.data?.args?.query) ?? undefined : undefined,
      at: Date.now(),
    },
    "running",
  )
}

function applyToolResult(parts: MessagePart[], event: AiEntryStreamEvent): MessagePart[] {
  const toolName = optionalString(event.data?.toolName) || "tool"
  const toolCallId = optionalString(event.data?.toolCallId) || toolName
  const result = event.data?.result ?? null
  const isFailure = result?.ok === false
  const errorCode = optionalString(result?.error?.code)
  const isActionRequired =
    toolName === "preview_ppt_deck" &&
    (errorCode === "ppt_template_selection_required" || errorCode === "ppt_brief_incomplete")
  const toolCallState = isActionRequired ? "output-blocked" : isFailure ? "output-error" : "output-available"
  const progressStatus = isActionRequired ? "waiting" : isFailure ? "failed" : "completed"

  const existing = getPartById<ToolCallPart>(parts, toolCallId, "tool-call")
  let nextParts = upsertPart(
    parts,
    existing
      ? {
          ...existing,
          args: existing.args ?? null,
          state: toolCallState,
          output: result,
        }
      : {
          type: "tool-call",
          id: toolCallId,
          toolName,
          toolCallId,
          args: null,
          state: toolCallState,
          output: result,
        },
  )

  const sourceResults = Array.isArray(result?.results) ? result.results : []
  if (toolName === "web_search" && sourceResults.length) {
    nextParts = upsertSourcesFromResults(nextParts, `web-search:${toolCallId}`, sourceResults)
  }

  if (toolName === "export_ppt_deck" && result?.ok !== false) {
    const fileName = optionalString(result?.fileName)
    const artifactId = typeof result?.artifactId === "number" ? result.artifactId : null
    nextParts = upsertArtifactPart(nextParts, {
      type: "artifact",
      id: `artifact:${artifactId ?? fileName ?? "ppt"}`,
      artifactType: inferArtifactType(fileName),
      artifactId,
      title: optionalString(result?.title),
      fileName,
      previewUrl: optionalString(result?.previewUrl),
      downloadUrl: optionalString(result?.downloadUrl),
      workHref: optionalString(result?.workLibraryHref) ?? "/dashboard/works",
      status: "created",
    } satisfies ArtifactPart)
  }

  if (toolName === "preview_ppt_deck" && result?.ok !== false) {
    const variants = Array.isArray(result?.variants)
      ? result.variants
          .map((variant) => ({
            key: optionalString(variant?.key) ?? "",
            name: optionalString(variant?.name) ?? "",
            summary: optionalString(variant?.summary),
          }))
          .filter((variant) => variant.key)
      : []
    nextParts = upsertPart(nextParts, {
      type: "report",
      id: `report:${optionalString(result?.previewSessionId) ?? toolCallId}`,
      reportType: "ppt-preview",
      previewSessionId: optionalString(result?.previewSessionId),
      defaultVariantKey: optionalString(result?.recommendedVariantKey) ?? variants[0]?.key ?? null,
      variantKeys: variants.map((variant) => variant.key),
      title: optionalString(result?.title),
      variants,
    } satisfies ReportPart)
  }

  if (toolName === "preview_ppt_deck" && result?.ok === false) {
    const recommendationPart = buildTemplateRecommendationPartFromRecommendedTemplates(
      result?.recommendedTemplates,
      `template-recommendation:${toolCallId}`,
    )
    if (recommendationPart) {
      nextParts = upsertPart(nextParts, recommendationPart)
    }
  }

  if (sourceResults.length && toolName === "web_search") {
    nextParts = startOrUpdateTaskProgress(
      nextParts,
      {
        type: `tool:${toolCallId}`,
        toolName,
        status: progressStatus,
        detail:
          isFailure
            ? optionalString(result?.error?.message) ?? undefined
            : summarizeSources(sourceResults),
        at: Date.now(),
      },
      getTaskProgressPart(nextParts)?.status ?? "running",
    )
    return nextParts
  }

  return startOrUpdateTaskProgress(
    nextParts,
      {
        type: `tool:${toolCallId}`,
        toolName,
        status: progressStatus,
        detail: isFailure ? optionalString(result?.error?.message) ?? undefined : undefined,
        at: Date.now(),
      },
    getTaskProgressPart(nextParts)?.status ?? "running",
  )
}

function applyToolCompletion(
  parts: MessagePart[],
  event: AiEntryStreamEvent,
  state: "output-available" | "output-error",
): MessagePart[] {
  const toolName = optionalString(event.data?.toolName) || "tool"
  const toolCallId = optionalString(event.data?.toolCallId) || toolName
  const existing = getPartById<ToolCallPart>(parts, toolCallId, "tool-call")

  const nextParts = upsertPart(
    parts,
    existing
      ? {
          ...existing,
          state,
          output: existing.output ?? event.data?.result ?? null,
        }
      : {
          type: "tool-call",
          id: toolCallId,
          toolName,
          toolCallId,
          args: event.data?.args ?? null,
          state,
          output: event.data?.result ?? null,
        },
  )

  return startOrUpdateTaskProgress(
    nextParts,
    {
      type: `tool:${toolCallId}`,
      toolName,
      status: state === "output-error" ? "failed" : "completed",
      detail:
        state === "output-error"
          ? optionalString(event.data?.message) ?? optionalString((event.data?.result as { error?: { message?: string } } | null)?.error?.message) ?? undefined
          : undefined,
      at: Date.now(),
    },
    getTaskProgressPart(nextParts)?.status ?? "running",
  )
}

/**
 * 把一条 SSE 事件折叠进 parts（按 part id 不可变 upsert）。
 * 不修改输入数组、无副作用（step 的 at 用 Date.now() 作为时间戳元数据）。
 */
export function applySseEvent(parts: MessagePart[], event: AiEntryStreamEvent): MessagePart[] {
  const type = event.event
  if (!type) return parts

  if (type === "message") return parts

  if (type === "reasoning") {
    const delta = typeof event.answer === "string" ? event.answer : ""
    const existing = getPartById<ReasoningPart>(parts, REASONING_PART_ID, "reasoning")
    return upsertPart(parts, {
      type: "reasoning",
      id: REASONING_PART_ID,
      text: `${existing?.text ?? ""}${delta}`,
      status: "running",
    })
  }

  if (type === "reasoning_end") {
    const existing = getPartById<ReasoningPart>(parts, REASONING_PART_ID, "reasoning")
    if (!existing) return parts
    return upsertPart(parts, { ...existing, status: "done" })
  }

  if (type === "conversation_init") {
    return startOrUpdateTaskProgress(parts, { type: "conversation_init", status: "completed", at: Date.now() })
  }

  if (type === "agent_resolved") {
    return startOrUpdateTaskProgress(parts, {
      type: "agent_resolved",
      status: "completed",
      detail: optionalString(event.agent_id) ?? undefined,
      at: Date.now(),
    })
  }

  if (type === "skill_selected" || type === "skill_activated" || type === "skill_completed" || type === "skill_failed") {
    const skillId = optionalString(event.skill_id) ?? "skill"
    return startOrUpdateTaskProgress(parts, {
      type: type === "skill_selected" ? `skill-resolved:${skillId}` : `skill-invocation:${skillId}`,
      status: type === "skill_activated" ? "running" : type === "skill_failed" ? "failed" : type === "skill_selected" ? "info" : "completed",
      detail: type === "skill_selected"
        ? "Resolved"
        : type === "skill_failed"
          ? optionalString(event.message) ?? "Skill invocation failed"
          : type === "skill_activated"
            ? "Invoked"
            : "Completed",
      at: Date.now(),
    })
  }

  if (type === "provider_selected" || type === "provider_fallback") {
    const fallbackReason = optionalString(event.fallback_reason)
    const reasonLabel = type === "provider_fallback"
      ? fallbackReason === "empty_response"
        ? "empty response"
        : fallbackReason === "timeout"
          ? "Provider connection timeout"
          : fallbackReason === "connection"
            ? "Provider network connection failed"
            : fallbackReason === "rate_limit"
              ? "Provider rate limited"
              : "Provider request failed"
      : null
    const detail = [optionalString(event.provider), optionalString(event.provider_model), reasonLabel].filter(Boolean).join(" / ")
    return startOrUpdateTaskProgress(parts, {
      type: "provider",
      status: type === "provider_fallback" ? "info" : "running",
      detail: detail || undefined,
      at: Date.now(),
    })
  }

  if (type === "knowledge_query_start") {
    return startOrUpdateTaskProgress(parts, { type: "knowledge_query", status: "running", at: Date.now() })
  }

  if (type === "knowledge_query_result") {
    const status = event.data?.status || "miss"
    const snippetCount = typeof event.data?.snippetCount === "number" ? event.data.snippetCount : 0
    const datasetCount = typeof event.data?.datasetCount === "number" ? event.data.datasetCount : 0
    const resultSources = Array.isArray(event.data?.result?.results) ? event.data.result.results : []
    let nextParts = parts

    if (resultSources.length) {
      nextParts = upsertSourcesFromResults(
        nextParts,
        `knowledge-query:${optionalString(event.data?.toolCallId) ?? optionalString(event.data?.toolName) ?? "knowledge"}`,
        resultSources,
      )
    }

    nextParts = startOrUpdateTaskProgress(
      nextParts,
      {
        type: "knowledge_query",
        status: status === "failed" ? "failed" : status === "hit" ? "completed" : "info",
        detail:
          status === "failed"
            ? event.data?.message || "failed"
            : resultSources.length
              ? summarizeSources(resultSources)
              : `${snippetCount} snippets / ${datasetCount} datasets`,
        at: Date.now(),
      },
      getTaskProgressPart(nextParts)?.status ?? "running",
    )
    return nextParts
  }

  if (type === "tool_call" || type === "tool_call_start") {
    return applyToolCall(parts, event)
  }

  if (type === "tool_result") {
    return applyToolResult(parts, event)
  }

  if (type === "tool_call_done") {
    return applyToolCompletion(parts, event, "output-available")
  }

  if (type === "tool_call_error") {
    return applyToolCompletion(parts, event, "output-error")
  }

  if (type === "artifact_created" && event.artifact) {
    const artifact = event.artifact
    const artifactId = typeof artifact.artifactId === "number" ? artifact.artifactId : null
    const id = `artifact:${artifactId ?? optionalString(artifact.fileName) ?? "artifact"}`
    const existing = getPartById<ArtifactPart>(parts, id, "artifact")
    const nextParts = upsertArtifactPart(parts, {
      type: "artifact",
      id,
      artifactType: artifactTypeFromKind(artifact.kind),
      artifactId,
      title: optionalString(artifact.title) ?? existing?.title ?? null,
      fileName: optionalString(artifact.fileName) ?? existing?.fileName ?? null,
      previewUrl: optionalString(artifact.previewUrl) ?? existing?.previewUrl ?? null,
      downloadUrl: optionalString(artifact.downloadUrl) ?? existing?.downloadUrl ?? null,
      workHref: existing?.workHref ?? optionalString(artifact.workLibraryHref) ?? "/dashboard/works",
      status: "created",
    } satisfies ArtifactPart)

    return startOrUpdateTaskProgress(
      nextParts,
      {
        type: `artifact:${artifactId ?? optionalString(artifact.fileName) ?? "artifact"}`,
        status: "completed",
        detail: optionalString(artifact.fileName) ?? undefined,
        at: Date.now(),
      },
      getTaskProgressPart(nextParts)?.status ?? "running",
    )
  }

  if (type === "validation_result" && event.data?.validation) {
    const validation = event.data.validation
    const validationId = `validation:${event.data.toolCallId ?? event.data.toolName ?? "tool"}`
    const status =
      validation.ok === false ? "failed" : validation.ok === true ? "passed" : "warning"
    const checks = Array.isArray(validation.checks)
      ? validation.checks.map((check) => ({
          code: optionalString(check?.code) ?? "validation_check",
          ok: check?.ok === true,
          message: optionalString(check?.message) ?? "",
        }))
      : []
    const nextParts = upsertPart(parts, {
      type: "validation",
      id: validationId,
      status,
      checks,
    } satisfies ValidationPart)

    return startOrUpdateTaskProgress(
      nextParts,
      {
        type: validationId,
        status: status === "failed" ? "failed" : "completed",
        detail: checks.find((check) => check.ok === false)?.message ?? undefined,
        at: Date.now(),
      },
      getTaskProgressPart(nextParts)?.status ?? "running",
    )
  }

  if (type === "message_end") {
    const nextParts = markTaskProgressDone(parts)
    const reasoning = getPartById<ReasoningPart>(nextParts, REASONING_PART_ID, "reasoning")
    if (reasoning && reasoning.status !== "done") {
      return upsertPart(nextParts, { ...reasoning, status: "done" })
    }
    return nextParts
  }

  return parts
}

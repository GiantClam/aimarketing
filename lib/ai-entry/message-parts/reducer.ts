import type {
  AiEntryStreamEvent,
  ArtifactPart,
  MessagePart,
  ReasoningPart,
  ReportPart,
  SourcePart,
  TaskProgressPart,
  TaskProgressStep,
  ToolCallPart,
  ValidationPart,
} from "./types"

const REASONING_PART_ID = "reasoning"
const TASK_PROGRESS_PART_ID = "task-progress"

function upsertPart(parts: MessagePart[], part: MessagePart): MessagePart[] {
  const index = parts.findIndex((p) => p.id === part.id)
  if (index < 0) return [...parts, part]
  const next = parts.slice()
  next[index] = part
  return next
}

function getPartById<T extends MessagePart>(parts: MessagePart[], id: string, type: T["type"]): T | undefined {
  return parts.find((p): p is T => p.id === id && p.type === type) as T | undefined
}

function getTaskProgressPart(parts: MessagePart[]): TaskProgressPart | undefined {
  return getPartById<TaskProgressPart>(parts, TASK_PROGRESS_PART_ID, "task-progress")
}

function upsertTaskStep(parts: MessagePart[], step: TaskProgressStep): MessagePart[] {
  const existing = getTaskProgressPart(parts)
  const steps = existing?.steps ?? []
  const index = steps.findIndex((s) => s.type === step.type)
  const nextSteps = index < 0 ? [...steps, step] : (() => {
    const copy = steps.slice()
    copy[index] = step
    return copy
  })()
  return upsertPart(parts, { type: "task-progress", id: TASK_PROGRESS_PART_ID, steps: nextSteps })
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function inferArtifactType(fileName: string | null): ArtifactPart["artifactType"] {
  if (!fileName) return "generic"
  const n = fileName.trim().toLowerCase()
  if (n.endsWith(".html") || n.endsWith(".htm")) return "html"
  if (n.endsWith(".pptx") || n.endsWith(".ppt")) return "pptx"
  if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp")) return "image"
  return "generic"
}

function artifactTypeFromKind(kind: string | null | undefined): ArtifactPart["artifactType"] {
  if (kind === "pptx") return "pptx"
  if (kind === "html") return "html"
  if (kind === "image") return "image"
  return "generic"
}

/**
 * 把一条 SSE 事件折叠进 parts（按 part id 不可变 upsert）。
 * 纯函数：相同输入→相同输出，无副作用，便于单测。
 */
export function applySseEvent(parts: MessagePart[], event: AiEntryStreamEvent): MessagePart[] {
  const type = event.event
  if (!type) return parts

  // 正文由 message.content 承载，reducer 不产 text part。
  if (type === "message") return parts

  if (type === "reasoning") {
    const delta = typeof event.answer === "string" ? event.answer : ""
    const existing = getPartById<ReasoningPart>(parts, REASONING_PART_ID, "reasoning")
    const next: ReasoningPart = {
      type: "reasoning",
      id: REASONING_PART_ID,
      text: (existing?.text ?? "") + delta,
      status: "running",
    }
    return upsertPart(parts, next)
  }

  if (type === "reasoning_end") {
    const existing = getPartById<ReasoningPart>(parts, REASONING_PART_ID, "reasoning")
    if (!existing) return parts
    return upsertPart(parts, { ...existing, status: "done" })
  }

  if (type === "conversation_init") {
    return upsertTaskStep(parts, { type: "conversation_init", status: "completed", at: Date.now() })
  }

  if (type === "provider_selected" || type === "provider_fallback") {
    const detail = [event.provider, event.provider_model].filter(Boolean).join(" / ") || undefined
    return upsertTaskStep(parts, {
      type: "provider",
      status: type === "provider_fallback" ? "info" : "running",
      detail,
      at: Date.now(),
    })
  }

  if (type === "knowledge_query_start") {
    return upsertTaskStep(parts, { type: "knowledge_query", status: "running", at: Date.now() })
  }

  if (type === "knowledge_query_result") {
    const status = event.data?.status || "miss"
    const snippetCount = typeof event.data?.snippetCount === "number" ? event.data.snippetCount : 0
    const datasetCount = typeof event.data?.datasetCount === "number" ? event.data.datasetCount : 0
    const detail = status === "failed" ? event.data?.message || "failed" : `${snippetCount} snippets / ${datasetCount} datasets`
    return upsertTaskStep(parts, {
      type: "knowledge_query",
      status: status === "failed" ? "failed" : status === "hit" ? "completed" : "info",
      detail,
      at: Date.now(),
    })
  }

  if (type === "tool_call") {
    const toolName = event.data?.toolName || "tool"
    const toolCallId = event.data?.toolCallId || toolName
    const args = event.data?.args ?? null
    const existing = getPartById<ToolCallPart>(parts, toolCallId, "tool-call")
    parts = upsertPart(parts, {
      type: "tool-call",
      id: toolCallId,
      toolName,
      toolCallId,
      args: existing?.args ?? args,
      state: "input-streaming",
    })
    return upsertTaskStep(parts, {
      type: `tool:${toolCallId}`,
      toolName,
      status: "running",
      detail: toolName === "web_search" ? optionalString(event.data?.args?.query) ?? undefined : undefined,
      at: Date.now(),
    })
  }

  if (type === "tool_result") {
    const toolName = event.data?.toolName || "tool"
    const toolCallId = event.data?.toolCallId || toolName
    const result = event.data?.result ?? null
    const isFailure = result?.ok === false

    const existingTc = getPartById<ToolCallPart>(parts, toolCallId, "tool-call")
    if (existingTc) {
      parts = upsertPart(parts, {
        ...existingTc,
        state: isFailure ? "output-error" : "output-available",
        output: result,
      })
    } else {
      parts = upsertPart(parts, {
        type: "tool-call",
        id: toolCallId,
        toolName,
        toolCallId,
        args: null,
        state: isFailure ? "output-error" : "output-available",
        output: result,
      })
    }

    // web_search → source parts
    if (toolName === "web_search" && Array.isArray(result?.results)) {
      for (const r of result.results) {
        const url = optionalString(r?.url)
        if (!url) continue
        parts = upsertPart(parts, {
          type: "source",
          id: `url:${url}`,
          sourceType: "url",
          title: optionalString(r?.title),
          url,
          snippet: optionalString(r?.snippet),
        } as SourcePart)
      }
    }

    // export_ppt_deck → artifact part
    if (toolName === "export_ppt_deck" && result?.ok !== false) {
      const fileName = optionalString(result?.fileName)
      const artifactId = typeof result?.artifactId === "number" ? result.artifactId : null
      parts = upsertPart(parts, {
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
      } as ArtifactPart)
    }

    // preview_ppt_deck → report part
    if (toolName === "preview_ppt_deck" && result?.ok !== false && Array.isArray(result?.variants)) {
      const variants = result.variants
        .map((v) => ({
          key: optionalString(v?.key) ?? "",
          name: optionalString(v?.name) ?? "",
          summary: optionalString(v?.summary),
        }))
        .filter((v) => v.key)
      if (variants.length) {
        parts = upsertPart(parts, {
          type: "report",
          id: `report:${optionalString(result?.previewSessionId) ?? toolCallId}`,
          reportType: "ppt-preview",
          title: optionalString(result?.title),
          variants,
        } as ReportPart)
      }
    }

    return upsertTaskStep(parts, {
      type: `tool:${toolCallId}`,
      toolName,
      status: isFailure ? "failed" : "completed",
      detail: isFailure ? optionalString(result?.error?.message) ?? undefined : undefined,
      at: Date.now(),
    })
  }

  if (type === "tool_call_done" || type === "tool_call_error") {
    const toolCallId = event.data?.toolCallId || event.data?.toolName || "tool"
    const existing = getPartById<ToolCallPart>(parts, toolCallId, "tool-call")
    if (existing) {
      parts = upsertPart(parts, {
        ...existing,
        state: type === "tool_call_error" ? "output-error" : "output-available",
        output: existing.output ?? event.data?.result ?? null,
      })
    }
    return parts
  }

  if (type === "artifact_created" && event.artifact) {
    const a = event.artifact
    const artifactId = typeof a.artifactId === "number" ? a.artifactId : null
    const id = `artifact:${artifactId ?? optionalString(a.fileName) ?? "artifact"}`
    const existing = getPartById<ArtifactPart>(parts, id, "artifact")
    parts = upsertPart(parts, {
      type: "artifact",
      id,
      artifactType: artifactTypeFromKind(a.kind),
      artifactId,
      title: existing?.title ?? optionalString(a.title),
      fileName: existing?.fileName ?? optionalString(a.fileName),
      previewUrl: existing?.previewUrl ?? optionalString(a.previewUrl),
      downloadUrl: existing?.downloadUrl ?? optionalString(a.downloadUrl),
      workHref: existing?.workHref ?? "/dashboard/works",
      status: "created",
    } as ArtifactPart)
    return upsertTaskStep(parts, {
      type: `artifact:${artifactId ?? optionalString(a.fileName) ?? "artifact"}`,
      status: "completed",
      detail: optionalString(a.fileName) ?? undefined,
      at: Date.now(),
    })
  }

  if (type === "validation_result" && event.data?.validation) {
    const v = event.data.validation
    const id = `validation:${event.data.toolCallId ?? event.data.toolName ?? "tool"}`
    parts = upsertPart(parts, {
      type: "validation",
      id,
      status: v.ok === false ? "failed" : "passed",
      checks: Array.isArray(v.checks)
        ? v.checks.map((c) => ({
            code: optionalString(c?.code) ?? "validation_check",
            ok: c?.ok === true,
            message: optionalString(c?.message) ?? "",
          }))
        : [],
    } as ValidationPart)
    return upsertTaskStep(parts, {
      type: `validation:${event.data.toolCallId ?? event.data.toolName ?? "tool"}`,
      status: v.ok === false ? "failed" : "completed",
      detail: Array.isArray(v.checks) ? v.checks.find((c) => c?.ok === false)?.message ?? undefined : undefined,
      at: Date.now(),
    })
  }

  if (type === "message_end") {
    const reasoning = getPartById<ReasoningPart>(parts, REASONING_PART_ID, "reasoning")
    if (reasoning && reasoning.status !== "done") {
      return upsertPart(parts, { ...reasoning, status: "done" })
    }
    return parts
  }

  return parts
}

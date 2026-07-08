type AiEntryTaskRunStatus = "pending" | "running" | "success" | "failed"
type AiEntryTaskRunEventStatus = "running" | "completed" | "failed" | "info"

export type AiEntryTaskRunStage =
  | "brief_validating"
  | "story_planning"
  | "variant_generating"
  | "preview_rendering"
  | "session_persisting"

export type AiEntryTaskRunEvent = {
  type: string
  label: string
  detail?: string
  status: AiEntryTaskRunEventStatus
  at: number
}

export type AiEntryTaskRunSummary = {
  task_id: string
  status: AiEntryTaskRunStatus
  task_type: "preview_ppt_deck"
  conversation_id: string | null
  agent_id: string | null
  created_at: number
  updated_at: number
  started_at: number | null
  stage: AiEntryTaskRunStage
  stage_label: string
  progress_current: number
  progress_total: number
  last_heartbeat_at: number
  finished_at: number | null
  preview_session_id: string | null
  request_label: string | null
  result_summary: string | null
  error_code: string | null
  error_message: string | null
  error: string | null
  events: AiEntryTaskRunEvent[]
}

type TaskRunSource = {
  id?: unknown
  status?: unknown
  payload?: unknown
  result?: unknown
  createdAt?: Date | string | number | null
  updatedAt?: Date | string | number | null
  startedAt?: Date | string | number | null
}

function safeParseRecord(value: unknown) {
  if (!value) return null
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : null
}

function parsePositiveInt(value: unknown) {
  const normalized =
    typeof value === "number" || typeof value === "string" ? Number.parseInt(String(value), 10) : Number.NaN
  if (!Number.isFinite(normalized) || normalized <= 0) return null
  return Math.floor(normalized)
}

function toEpochSeconds(value: Date | string | number | null | undefined) {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000)
  }
  if (typeof value === "number") {
    if (value > 1_000_000_000_000) return Math.floor(value / 1000)
    if (value > 1_000_000_000) return Math.floor(value)
    const parsedDate = new Date(value)
    if (!Number.isNaN(parsedDate.getTime())) {
      return Math.floor(parsedDate.getTime() / 1000)
    }
  }
  if (typeof value === "string") {
    const parsedDate = new Date(value)
    if (!Number.isNaN(parsedDate.getTime())) {
      return Math.floor(parsedDate.getTime() / 1000)
    }
  }
  return Math.floor(Date.now() / 1000)
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

function normalizeTaskStatus(value: unknown): AiEntryTaskRunStatus | null {
  return value === "pending" || value === "running" || value === "success" || value === "failed"
    ? value
    : null
}

function normalizeEventStatus(value: unknown): AiEntryTaskRunEventStatus {
  return value === "running" || value === "completed" || value === "failed" || value === "info"
    ? value
    : "running"
}

function normalizeEvents(value: unknown): AiEntryTaskRunEvent[] {
  if (!Array.isArray(value)) return []
  return value.reduce<AiEntryTaskRunEvent[]>((events, item) => {
      if (!item || typeof item !== "object") return events
      const event = item as Record<string, unknown>
      const type = normalizeText(event.type)
      const label = normalizeText(event.label)
      if (!type || !label) return events
      events.push({
        type,
        label,
        detail: normalizeText(event.detail) || undefined,
        status: normalizeEventStatus(event.status),
        at: toEpochSeconds(event.at as Date | string | number | null | undefined),
      } satisfies AiEntryTaskRunEvent)
      return events
    }, [])
}

function resolveRequestLabel(input: Record<string, unknown> | null) {
  if (!input) return null
  const explicit = [
    input.title,
    input.deckTitle,
    input.topic,
    input.subject,
    input.goal,
  ]
    .map((value) => normalizeText(value))
    .find(Boolean)
  if (explicit) return explicit

  const audience = normalizeText(input.audience)
  const scenario = normalizeText(input.scenario)
  if (audience && scenario) return `${audience} / ${scenario}`
  return audience || scenario || null
}

function resolveStageLabel(stage: AiEntryTaskRunStage, isZh: boolean) {
  if (stage === "brief_validating") return isZh ? "已排队，准备校验需求" : "Queued, validating brief"
  if (stage === "story_planning") return isZh ? "正在规划结构与故事线" : "Planning structure and storyline"
  if (stage === "variant_generating") return isZh ? "正在生成预览方向" : "Generating preview variants"
  if (stage === "preview_rendering") return isZh ? "正在渲染预览" : "Rendering preview"
  return isZh ? "正在保存预览会话" : "Persisting preview session"
}

function resolveStageProgress(stage: AiEntryTaskRunStage) {
  if (stage === "brief_validating") return { current: 0, total: 5 }
  if (stage === "story_planning") return { current: 1, total: 5 }
  if (stage === "variant_generating") return { current: 2, total: 5 }
  if (stage === "preview_rendering") return { current: 3, total: 5 }
  return { current: 4, total: 5 }
}

function normalizeLegacyStage(value: string | null) {
  if (!value) return null
  if (value === "brief_validating" || value === "story_planning" || value === "variant_generating" || value === "preview_rendering" || value === "session_persisting") {
    return value satisfies AiEntryTaskRunStage
  }
  if (value === "queued") return "brief_validating" satisfies AiEntryTaskRunStage
  if (value === "preparing") return "story_planning" satisfies AiEntryTaskRunStage
  if (value === "generating" || value === "retrying") return "variant_generating" satisfies AiEntryTaskRunStage
  if (value === "completed") return "session_persisting" satisfies AiEntryTaskRunStage
  if (value === "failed") return "variant_generating" satisfies AiEntryTaskRunStage
  return null
}

function resolveStage(input: {
  status: AiEntryTaskRunStatus
  result: Record<string, unknown> | null
  events: AiEntryTaskRunEvent[]
}) {
  const explicitStage = normalizeLegacyStage(normalizeText(input.result?.stage))
  if (explicitStage) return explicitStage

  const lastEventType = input.events.at(-1)?.type || null
  if (input.status === "success") return "session_persisting"
  if (lastEventType === "background_generation_finished") return "session_persisting"
  if (lastEventType === "background_preview_rendering") return "preview_rendering"
  if (lastEventType === "background_generation_retry" || lastEventType === "background_generation_running") {
    return "variant_generating"
  }
  if (lastEventType === "background_generation_preparing") return "story_planning"
  if (lastEventType === "background_task_queued") return "brief_validating"
  if (input.status === "failed") return "variant_generating"
  return input.status === "pending" ? "brief_validating" : "story_planning"
}

export function parseAiEntryTaskRunSummary(source: TaskRunSource): AiEntryTaskRunSummary | null {
  const taskId = parsePositiveInt(source.id)
  const status = normalizeTaskStatus(source.status)
  if (!taskId || !status) return null

  const payload = safeParseRecord(source.payload)
  if (normalizeText(payload?.kind) !== "ai_entry_ppt_preview") return null
  const result = safeParseRecord(source.result)
  const taskType = normalizeText(result?.toolName) === "preview_ppt_deck" ? "preview_ppt_deck" : "preview_ppt_deck"
  const events = normalizeEvents(result?.events)
  const stage = resolveStage({ status, result, events })
  const isZh = payload?.isZh === false ? false : true
  const progress = resolveStageProgress(stage)
  const previewSessionId =
    normalizeText(result?.previewSessionId) ||
    normalizeText((result?.toolResult as Record<string, unknown> | undefined)?.previewSessionId)
  const errorMessage =
    normalizeText(result?.errorMessage) ||
    normalizeText(result?.error) ||
    normalizeText((result?.toolResult as Record<string, unknown> | undefined)?.error) ||
    null
  const errorCode = normalizeText(result?.errorCode) || errorMessage || null
  const updatedAt = toEpochSeconds(source.updatedAt)
  const finishedAt = status === "success" || status === "failed" ? updatedAt : null
  const resultSummary =
    normalizeText(result?.resultSummary) ||
    normalizeText(result?.assistantMessage) ||
    normalizeText((result?.toolResult as Record<string, unknown> | undefined)?.title) ||
    null

  return {
    task_id: String(taskId),
    status,
    task_type: taskType,
    conversation_id: normalizeText(payload?.conversationId) || normalizeText(result?.conversation_id),
    agent_id: normalizeText(payload?.agentId),
    created_at: toEpochSeconds(source.createdAt),
    updated_at: updatedAt,
    started_at: source.startedAt ? toEpochSeconds(source.startedAt) : null,
    stage,
    stage_label:
      normalizeText(result?.stageLabel) ||
      (status === "failed"
        ? isZh
          ? "预览生成失败"
          : "Preview failed"
        : status === "success"
          ? isZh
            ? "预览已生成"
            : "Preview generated"
          : resolveStageLabel(stage, isZh)),
    progress_current:
      typeof result?.progressCurrent === "number" && Number.isFinite(result.progressCurrent)
        ? Math.max(0, Math.floor(result.progressCurrent))
        : progress.current,
    progress_total:
      typeof result?.progressTotal === "number" && Number.isFinite(result.progressTotal)
        ? Math.max(1, Math.floor(result.progressTotal))
        : status === "success"
          ? 5
          : progress.total,
    last_heartbeat_at:
      typeof result?.lastHeartbeatAt === "number" && Number.isFinite(result.lastHeartbeatAt)
        ? Math.floor(result.lastHeartbeatAt)
        : updatedAt,
    finished_at:
      typeof result?.finishedAt === "number" && Number.isFinite(result.finishedAt)
        ? Math.floor(result.finishedAt)
        : finishedAt,
    preview_session_id: previewSessionId || null,
    request_label: resolveRequestLabel(safeParseRecord(payload?.input)),
    result_summary: resultSummary,
    error_code: errorCode,
    error_message: errorMessage,
    error: errorMessage,
    events: events.sort((left, right) => left.at - right.at),
  }
}

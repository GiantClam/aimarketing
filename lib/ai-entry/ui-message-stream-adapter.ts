import type { UIMessageStreamWriter } from "ai"

import type { AiEntryUIMessage } from "@/lib/ai-entry/ui-message"

type LegacyStreamPayload = {
  event?: string
  answer?: string
  provider?: string
  provider_model?: string
  agent_id?: string | null
  message?: string
  artifact?: Record<string, unknown> | null
  data?: Record<string, unknown> | null
  error?: string
  [key: string]: unknown
}

export type AiEntryUIStreamAdapterState = {
  messageId: string
  textPartId: string
  reasoningPartId: string
  textStarted: boolean
  reasoningStarted: boolean
  toolCallIds: Set<string>
}

export function createAiEntryUIStreamAdapterState(messageId: string): AiEntryUIStreamAdapterState {
  return {
    messageId,
    textPartId: `text-${messageId}`,
    reasoningPartId: `reasoning-${messageId}`,
    textStarted: false,
    reasoningStarted: false,
    toolCallIds: new Set(),
  }
}

function writeChunk(writer: UIMessageStreamWriter<AiEntryUIMessage>, chunk: unknown) {
  writer.write(chunk as never)
}

function writeDataPart(
  writer: UIMessageStreamWriter<AiEntryUIMessage>,
  type: string,
  data: unknown,
  id?: string,
) {
  writeChunk(writer, {
    type: `data-${type}`,
    ...(id ? { id } : {}),
    data,
  })
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readToolData(payload: LegacyStreamPayload) {
  const data = asRecord(payload.data)
  return {
    data,
    toolName: asString(data?.toolName),
    toolCallId: asString(data?.toolCallId),
    args: data?.args,
    result: data?.result,
  }
}

export function writeLegacyEventToAiEntryUIStream(
  writer: UIMessageStreamWriter<AiEntryUIMessage>,
  payload: LegacyStreamPayload,
  state: AiEntryUIStreamAdapterState,
) {
  const event = asString(payload.event)
  if (!event) return

  if (event === "message" && payload.answer) {
    if (!state.textStarted) {
      state.textStarted = true
      writeChunk(writer, { type: "text-start", id: state.textPartId })
    }
    writeChunk(writer, { type: "text-delta", id: state.textPartId, delta: payload.answer })
    return
  }

  if (event === "reasoning" && payload.answer) {
    if (!state.reasoningStarted) {
      state.reasoningStarted = true
      writeChunk(writer, { type: "reasoning-start", id: state.reasoningPartId })
    }
    writeChunk(writer, { type: "reasoning-delta", id: state.reasoningPartId, delta: payload.answer })
    return
  }

  if (event === "reasoning_end" && state.reasoningStarted) {
    writeChunk(writer, { type: "reasoning-end", id: state.reasoningPartId })
    state.reasoningStarted = false
    return
  }

  if (event === "tool_call" || event === "tool_call_start") {
    const { toolName, toolCallId, args } = readToolData(payload)
    if (!toolName || !toolCallId || state.toolCallIds.has(toolCallId)) return
    state.toolCallIds.add(toolCallId)
    writeChunk(writer, {
      type: "tool-input-start",
      toolCallId,
      toolName,
    })
    if (args !== undefined) {
      writeChunk(writer, {
        type: "tool-input-available",
        toolCallId,
        toolName,
        input: args,
      })
    }
    return
  }

  if (event === "tool_result" || event === "tool_call_done" || event === "tool_call_error") {
    const { toolName, toolCallId, result } = readToolData(payload)
    if (!toolName || !toolCallId) return
    if (event === "tool_call_error") {
      writeChunk(writer, {
        type: "tool-output-error",
        toolCallId,
        errorText: asString(asRecord(result)?.error) || "tool_execution_failed",
      })
    } else {
      writeChunk(writer, {
        type: "tool-output-available",
        toolCallId,
        output: result ?? null,
      })
    }
    return
  }

  if (event === "knowledge_query_result") {
    const data = asRecord(payload.data)
    const result = asRecord(data?.result)
    const results = Array.isArray(result?.results) ? result.results : []
    results.forEach((source, index) => {
      const sourceRecord = asRecord(source)
      const url = asString(sourceRecord?.url)
      if (!url) return
      writeChunk(writer, {
        type: "source-url",
        sourceId: `source-${index}-${url}`,
        url,
        title: asString(sourceRecord?.title) || undefined,
      })
    })
    return
  }

  if (event === "artifact_created" && payload.artifact) {
    const artifact = payload.artifact
    writeDataPart(writer, "artifact", {
      artifactType: asString(artifact.kind) || "generic",
      artifactId: typeof artifact.artifactId === "number" ? artifact.artifactId : null,
      title: asString(artifact.title) || null,
      fileName: asString(artifact.fileName) || null,
      previewUrl: asString(artifact.previewUrl) || null,
      downloadUrl: asString(artifact.downloadUrl) || null,
      workHref: asString(artifact.workLibraryHref) || null,
      status: "created",
    }, asString(artifact.artifactId) || undefined)
    return
  }

  if (event === "validation_result") {
    const data = asRecord(payload.data)
    const validation = asRecord(data?.validation)
    if (validation) {
      writeDataPart(writer, "validation", {
        status: validation.ok === true ? "passed" : validation.ok === false ? "failed" : "warning",
        checks: Array.isArray(validation.checks) ? validation.checks : [],
      }, asString(data?.toolCallId) || undefined)
    }
    return
  }

  if (event === "task_progress" || event === "task_run" || event === "workflow_status") {
    writeDataPart(writer, event === "task_run" ? "task-run" : event === "workflow_status" ? "workflow-status" : "task-progress", payload.data || payload, `${event}-${Date.now()}`)
    return
  }

  if (["conversation_init", "provider_selected", "provider_fallback", "runtime_stage", "runtime_warning", "skill_selected", "skill_activated", "skill_completed", "agent_resolved"].includes(event)) {
    writeDataPart(writer, "runtime-status", {
      status: event === "runtime_warning" ? "failed" : "completed",
      stage: event,
      message: payload.message || asString(asRecord(payload.data)?.message),
      conversationId: asString(payload.conversation_id) || undefined,
    }, `${event}-${Date.now()}`)
    return
  }

  if (event === "message_end") {
    if (state.textStarted) {
      writeChunk(writer, { type: "text-end", id: state.textPartId })
      state.textStarted = false
    }
    if (state.reasoningStarted) {
      writeChunk(writer, { type: "reasoning-end", id: state.reasoningPartId })
      state.reasoningStarted = false
    }
    return
  }

  if (event === "error") {
    writeChunk(writer, { type: "error", errorText: payload.error || "An error occurred." })
  }
}
